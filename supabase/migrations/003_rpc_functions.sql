-- ============================================================
-- MIGRACIÓN 003: Funciones RPC del sistema
-- Ejecutar DESPUÉS de 002_rls_policies.sql
-- ============================================================

-- ============================================================
-- RPC: reserve_tickets
-- Reserva boletos temporalmente para un usuario (5 min por defecto)
-- ============================================================
CREATE OR REPLACE FUNCTION reserve_tickets(
  p_user_id         UUID,
  p_raffle_id       UUID,
  p_ticket_numbers  INT[],
  p_duration_seconds INT DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_expires_at      TIMESTAMPTZ;
  v_reserved        INT[] := '{}';
  v_failed          INT[] := '{}';
  v_ticket_num      INT;
  v_rows_affected   INT;
BEGIN
  v_expires_at := NOW() + (p_duration_seconds || ' seconds')::INTERVAL;

  -- Limpiar reservas expiradas del mismo usuario en esta rifa
  UPDATE tickets
  SET status = 'available', reserved_by = NULL, reserved_at = NULL, reserved_until = NULL
  WHERE raffle_id = p_raffle_id
    AND reserved_by = p_user_id
    AND reserved_until < NOW()
    AND status = 'reserved';

  -- Reservar cada boleto
  FOREACH v_ticket_num IN ARRAY p_ticket_numbers LOOP
    UPDATE tickets
    SET
      status        = 'reserved',
      reserved_by   = p_user_id,
      reserved_at   = NOW(),
      reserved_until = v_expires_at
    WHERE raffle_id     = p_raffle_id
      AND ticket_number = v_ticket_num
      AND status        = 'available';

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    IF v_rows_affected > 0 THEN
      v_reserved := array_append(v_reserved, v_ticket_num);
    ELSE
      v_failed := array_append(v_failed, v_ticket_num);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'reserved',    to_jsonb(v_reserved),
    'failed',      to_jsonb(v_failed),
    'expires_at',  v_expires_at
  );
END;
$$;

-- ============================================================
-- RPC: release_tickets
-- Libera boletos reservados por un usuario
-- ============================================================
CREATE OR REPLACE FUNCTION release_tickets(
  p_user_id         UUID,
  p_raffle_id       UUID,
  p_ticket_numbers  INT[]
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE tickets
  SET status = 'available', reserved_by = NULL, reserved_at = NULL, reserved_until = NULL
  WHERE raffle_id     = p_raffle_id
    AND reserved_by   = p_user_id
    AND ticket_number = ANY(p_ticket_numbers)
    AND status        = 'reserved';
END;
$$;

-- ============================================================
-- RPC: cleanup_expired_reservations
-- Libera todas las reservas expiradas (llamar periódicamente)
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_expired_reservations()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE tickets
  SET status = 'available', reserved_by = NULL, reserved_at = NULL, reserved_until = NULL
  WHERE status = 'reserved'
    AND reserved_until IS NOT NULL
    AND reserved_until < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================
-- RPC: atomic_purchase_tickets
-- Compra atómica de boletos con ledger financiero
-- ============================================================
CREATE OR REPLACE FUNCTION atomic_purchase_tickets(
  p_user_id         UUID,
  p_user_email      TEXT,
  p_raffle_id       UUID,
  p_ticket_numbers  INT[],
  p_payment_method  TEXT,
  p_commission_rate NUMERIC,
  p_price_per_ticket NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ticket_num      INT;
  v_ticket_id       UUID;
  v_rows_affected   INT;
  v_purchased       INT[] := '{}';
  v_errors          TEXT[] := '{}';
  v_now             TIMESTAMPTZ := NOW();
  v_commission_amt  NUMERIC;
  v_organizer_amt   NUMERIC;
  v_raffle          RECORD;
BEGIN
  -- Validar que la rifa existe y está activa
  SELECT id, organizer_id, status, tickets_sold, revenue
  INTO v_raffle
  FROM raffles
  WHERE id = p_raffle_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('purchased', '[]'::jsonb, 'errors', jsonb_build_array('Rifa no encontrada'));
  END IF;

  IF v_raffle.status != 'active' THEN
    RETURN jsonb_build_object('purchased', '[]'::jsonb, 'errors', jsonb_build_array('La rifa no está activa'));
  END IF;

  -- Procesar cada boleto
  FOREACH v_ticket_num IN ARRAY p_ticket_numbers LOOP
    -- Intentar marcar como vendido (acepta available o reserved por este usuario)
    UPDATE tickets
    SET
      participant_id    = p_user_id,
      status            = 'sold',
      purchased_at      = v_now,
      payment_method    = p_payment_method,
      commission_rate   = p_commission_rate,
      commission_amount = p_price_per_ticket * (p_commission_rate / 100),
      reserved_by       = NULL,
      reserved_until    = NULL
    WHERE raffle_id     = p_raffle_id
      AND ticket_number = v_ticket_num
      AND (
        status = 'available'
        OR (status = 'reserved' AND reserved_by = p_user_id)
      )
    RETURNING id INTO v_ticket_id;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    IF v_rows_affected > 0 THEN
      v_purchased := array_append(v_purchased, v_ticket_num);

      v_commission_amt := p_price_per_ticket * (p_commission_rate / 100);
      v_organizer_amt  := p_price_per_ticket - v_commission_amt;

      -- Ledger: venta total
      INSERT INTO financial_ledger (entry_type, amount, currency, description, raffle_id, ticket_id, payer_id, commission_rate_applied, commission_amount_calculated)
      VALUES ('ticket_sale', p_price_per_ticket, 'MXN', 'Venta boleto #' || v_ticket_num, p_raffle_id, v_ticket_id, p_user_id, p_commission_rate, v_commission_amt);

      -- Ledger: comisión plataforma
      IF v_commission_amt > 0 THEN
        INSERT INTO financial_ledger (entry_type, amount, currency, description, raffle_id, ticket_id, payer_id, commission_rate_applied, commission_amount_calculated)
        VALUES ('platform_commission', v_commission_amt, 'MXN', 'Comisión ' || p_commission_rate || '% boleto #' || v_ticket_num, p_raffle_id, v_ticket_id, p_user_id, p_commission_rate, v_commission_amt);
      END IF;

      -- Ledger: ingreso organizador
      INSERT INTO financial_ledger (entry_type, amount, currency, description, raffle_id, ticket_id, payer_id, receiver_id)
      VALUES ('organizer_income', v_organizer_amt, 'MXN', 'Ingreso organizador boleto #' || v_ticket_num, p_raffle_id, v_ticket_id, p_user_id, v_raffle.organizer_id);
    ELSE
      v_errors := array_append(v_errors, 'Boleto #' || v_ticket_num || ' no disponible');
    END IF;
  END LOOP;

  -- Actualizar contadores de la rifa
  IF array_length(v_purchased, 1) > 0 THEN
    UPDATE raffles
    SET
      tickets_sold = tickets_sold + array_length(v_purchased, 1),
      revenue      = revenue + (array_length(v_purchased, 1) * p_price_per_ticket),
      updated_at   = v_now
    WHERE id = p_raffle_id;

    -- Audit log
    INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, new_value, details)
    VALUES (p_user_id, p_user_email, 'ticket_purchase', 'ticket', p_raffle_id,
      jsonb_build_object('ticket_numbers', to_jsonb(v_purchased), 'amount', array_length(v_purchased,1) * p_price_per_ticket),
      jsonb_build_object('raffle_id', p_raffle_id, 'payment_method', p_payment_method, 'commission_rate', p_commission_rate)
    );
  END IF;

  RETURN jsonb_build_object(
    'purchased', to_jsonb(v_purchased),
    'errors',    to_jsonb(v_errors)
  );
END;
$$;

-- ============================================================
-- RPC: buy_ticket
-- Compra de un solo boleto (versión simplificada)
-- ============================================================
CREATE OR REPLACE FUNCTION buy_ticket(
  p_raffle_id     UUID,
  p_ticket_number INT,
  p_user_id       UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_rows INT;
BEGIN
  UPDATE tickets
  SET participant_id = p_user_id, status = 'sold', purchased_at = NOW(),
      reserved_by = NULL, reserved_until = NULL
  WHERE raffle_id = p_raffle_id
    AND ticket_number = p_ticket_number
    AND (status = 'available' OR (status = 'reserved' AND reserved_by = p_user_id));

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    UPDATE raffles SET tickets_sold = tickets_sold + 1, updated_at = NOW() WHERE id = p_raffle_id;
  END IF;

  RETURN jsonb_build_object('success', v_rows > 0);
END;
$$;

-- ============================================================
-- RPC: get_raffle_closing_summary
-- Resumen completo de una rifa para el flujo de cierre
-- ============================================================
CREATE OR REPLACE FUNCTION get_raffle_closing_summary(p_raffle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_raffle    RECORD;
  v_summary   JSONB;
  v_winner    RECORD;
BEGIN
  SELECT r.*, p.full_name AS organizer_name
  INTO v_raffle
  FROM raffles r
  LEFT JOIN profiles p ON p.id = r.organizer_id
  WHERE r.id = p_raffle_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rifa no encontrada');
  END IF;

  -- Datos del ganador si aplica
  IF v_raffle.winning_number IS NOT NULL THEN
    SELECT p.full_name, p.email
    INTO v_winner
    FROM tickets t
    LEFT JOIN profiles p ON p.id = t.participant_id
    WHERE t.raffle_id = p_raffle_id AND t.ticket_number = v_raffle.winning_number
    LIMIT 1;
  END IF;

  v_summary := jsonb_build_object(
    'raffle_name',          v_raffle.name,
    'status',               v_raffle.status,
    'total_tickets',        v_raffle.total_tickets,
    'price_per_ticket',     v_raffle.price_per_ticket,
    'draw_date',            v_raffle.draw_date,
    'lottery_type',         v_raffle.lottery_type,
    'lottery_draw_date',    v_raffle.lottery_draw_date,
    'lottery_draw_number',  v_raffle.lottery_draw_number,
    'unsold_policy',        v_raffle.unsold_winner_policy,
    'paid_tickets',   (SELECT COUNT(*) FROM tickets WHERE raffle_id = p_raffle_id AND status = 'paid'),
    'sold_tickets',   (SELECT COUNT(*) FROM tickets WHERE raffle_id = p_raffle_id AND status = 'sold'),
    'available_tickets', (SELECT COUNT(*) FROM tickets WHERE raffle_id = p_raffle_id AND status = 'available'),
    'reserved_tickets',  (SELECT COUNT(*) FROM tickets WHERE raffle_id = p_raffle_id AND status = 'reserved'),
    'total_sold',         v_raffle.tickets_sold,
    'revenue',            v_raffle.revenue,
    'winning_number',     v_raffle.winning_number,
    'winner_name',        COALESCE(v_winner.full_name, NULL),
    'winner_email',       COALESCE(v_winner.email, NULL),
    'result_hash',        (SELECT result_hash FROM raffle_results_log WHERE raffle_id = p_raffle_id AND is_official = TRUE ORDER BY registered_at DESC LIMIT 1)
  );

  RETURN jsonb_build_object('success', true, 'data', v_summary);
END;
$$;

-- ============================================================
-- RPC: close_raffle
-- Cierra la venta de una rifa (active → closed)
-- ============================================================
CREATE OR REPLACE FUNCTION close_raffle(p_raffle_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_raffle RECORD;
BEGIN
  SELECT * INTO v_raffle FROM raffles WHERE id = p_raffle_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'RAFFLE_NOT_FOUND');
  END IF;

  IF v_raffle.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS', 'current_status', v_raffle.status);
  END IF;

  IF v_raffle.tickets_sold = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_TICKETS_SOLD');
  END IF;

  -- Liberar boletos reservados no comprados
  UPDATE tickets
  SET status = 'available', reserved_by = NULL, reserved_at = NULL, reserved_until = NULL
  WHERE raffle_id = p_raffle_id AND status = 'reserved';

  UPDATE raffles SET status = 'closed', updated_at = NOW() WHERE id = p_raffle_id;

  INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (p_user_id, 'raffle_status_change', 'raffle', p_raffle_id,
    jsonb_build_object('status', 'active'),
    jsonb_build_object('status', 'closed'));

  RETURN jsonb_build_object('success', true,
    'summary', (SELECT get_raffle_closing_summary(p_raffle_id)));
END;
$$;

-- ============================================================
-- RPC: validate_raffle
-- Valida pagos y conteos (closed → validated)
-- ============================================================
CREATE OR REPLACE FUNCTION validate_raffle(p_raffle_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_raffle RECORD;
BEGIN
  SELECT * INTO v_raffle FROM raffles WHERE id = p_raffle_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'RAFFLE_NOT_FOUND');
  END IF;

  IF v_raffle.status != 'closed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS', 'current_status', v_raffle.status);
  END IF;

  UPDATE raffles SET status = 'validated', updated_at = NOW() WHERE id = p_raffle_id;

  INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (p_user_id, 'raffle_status_change', 'raffle', p_raffle_id,
    jsonb_build_object('status', 'closed'),
    jsonb_build_object('status', 'validated'));

  RETURN jsonb_build_object('success', true,
    'summary', (SELECT get_raffle_closing_summary(p_raffle_id)));
END;
$$;

-- ============================================================
-- RPC: lock_raffle
-- Bloquea el resultado (validated → locked)
-- ============================================================
CREATE OR REPLACE FUNCTION lock_raffle(p_raffle_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_raffle RECORD;
BEGIN
  SELECT * INTO v_raffle FROM raffles WHERE id = p_raffle_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'RAFFLE_NOT_FOUND');
  END IF;

  IF v_raffle.status != 'validated' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS', 'current_status', v_raffle.status);
  END IF;

  UPDATE raffles
  SET status = 'locked', result_locked = TRUE,
      result_locked_at = NOW(), result_locked_by = p_user_id, updated_at = NOW()
  WHERE id = p_raffle_id;

  INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (p_user_id, 'raffle_locked', 'raffle', p_raffle_id,
    jsonb_build_object('status', 'validated'),
    jsonb_build_object('status', 'locked', 'result_locked', true));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================
-- RPC: finalize_draw
-- Declara el ganador (locked → winner_declared) — IRREVERSIBLE
-- ============================================================
CREATE OR REPLACE FUNCTION finalize_draw(
  p_raffle_id      UUID,
  p_user_id        UUID,
  p_winning_number INT,
  p_evidence_url   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_raffle      RECORD;
  v_winner      RECORD;
  v_result_hash TEXT;
  v_timestamp   TEXT;
  v_hash_input  TEXT;
BEGIN
  SELECT * INTO v_raffle FROM raffles WHERE id = p_raffle_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'RAFFLE_NOT_FOUND');
  END IF;

  IF v_raffle.status != 'locked' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS', 'current_status', v_raffle.status);
  END IF;

  IF v_raffle.winning_number IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'WINNER_ALREADY_DECLARED');
  END IF;

  IF p_winning_number < 1 OR p_winning_number > v_raffle.total_tickets THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_NUMBER', 'max', v_raffle.total_tickets);
  END IF;

  -- Generar hash SHA-256 del resultado
  v_timestamp  := NOW()::TEXT;
  v_hash_input := p_raffle_id::TEXT || '|' || p_winning_number::TEXT || '|' ||
                  COALESCE(v_raffle.lottery_type,'') || '|' ||
                  COALESCE(v_raffle.lottery_draw_number,'') || '|' ||
                  p_user_id::TEXT || '|' || v_timestamp;
  v_result_hash := encode(digest(v_hash_input, 'sha256'), 'hex');

  -- Registrar en log inmutable
  INSERT INTO raffle_results_log (
    raffle_id, winning_number, lottery_type, lottery_draw_number, lottery_draw_date,
    registered_by, result_hash, evidence_url, is_official
  ) VALUES (
    p_raffle_id, p_winning_number,
    COALESCE(v_raffle.lottery_type, ''),
    COALESCE(v_raffle.lottery_draw_number, ''),
    COALESCE(v_raffle.lottery_draw_date, NOW()),
    p_user_id, v_result_hash, p_evidence_url, TRUE
  );

  -- Actualizar rifa (estado terminal)
  UPDATE raffles
  SET
    winning_number      = p_winning_number,
    status              = 'winner_declared',
    winner_declared_at  = NOW(),
    winner_evidence_url = p_evidence_url,
    result_locked       = TRUE,
    result_locked_at    = NOW(),
    result_locked_by    = p_user_id,
    updated_at          = NOW()
  WHERE id = p_raffle_id;

  -- Obtener datos del ganador si existe
  SELECT p.full_name, p.email, t.ticket_number
  INTO v_winner
  FROM tickets t
  LEFT JOIN profiles p ON p.id = t.participant_id
  WHERE t.raffle_id = p_raffle_id AND t.ticket_number = p_winning_number
  LIMIT 1;

  -- Audit log
  INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_value, details)
  VALUES (p_user_id, 'winner_declared', 'raffle', p_raffle_id,
    jsonb_build_object('winning_number', p_winning_number, 'result_hash', v_result_hash),
    jsonb_build_object('raffle_name', v_raffle.name, 'lottery_type', v_raffle.lottery_type,
                       'winner_name', v_winner.full_name, 'winner_email', v_winner.email));

  RETURN jsonb_build_object(
    'success', true,
    'result', jsonb_build_object(
      'winning_number', p_winning_number,
      'result_hash',    v_result_hash,
      'winner_name',    v_winner.full_name,
      'winner_email',   v_winner.email,
      'declared_at',    NOW()
    )
  );
END;
$$;
