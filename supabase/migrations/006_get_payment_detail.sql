-- ============================================================
-- MIGRACIÓN 006: Columnas bancarias en profiles + RPC get_payment_detail
-- ============================================================

-- Agregar columnas bancarias faltantes en profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bank_name    TEXT,
  ADD COLUMN IF NOT EXISTS bank_account TEXT,
  ADD COLUMN IF NOT EXISTS bank_holder  TEXT;

-- ============================================================
-- RPC: get_payment_detail
-- Retorna instrucciones de pago para un boleto del participante.
-- SECURITY DEFINER permite leer datos bancarios del organizador
-- sin violar la política RLS de profiles.
-- Valida que el boleto pertenezca al usuario autenticado.
-- ============================================================
CREATE OR REPLACE FUNCTION get_payment_detail(
  p_raffle_id     UUID,
  p_ticket_number INT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ticket    RECORD;
  v_organizer RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('found', false, 'error', 'No autenticado');
  END IF;

  SELECT t.id, t.status, t.purchased_at, t.stripe_payment_id,
         r.organizer_id, r.price_per_ticket
  INTO v_ticket
  FROM tickets t
  JOIN raffles r ON r.id = t.raffle_id
  WHERE t.raffle_id      = p_raffle_id
    AND t.ticket_number  = p_ticket_number
    AND t.participant_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT bank_name, bank_account, bank_holder, payment_instructions
  INTO v_organizer
  FROM profiles
  WHERE id = v_ticket.organizer_id;

  RETURN jsonb_build_object(
    'found',             true,
    'system_reference',  COALESCE(
                           v_ticket.stripe_payment_id,
                           'REF-' || UPPER(SUBSTRING(v_ticket.id::TEXT, 1, 8))
                         ),
    'amount_total',      v_ticket.price_per_ticket,
    'status',            v_ticket.status,
    'created_at',        v_ticket.purchased_at,
    'organizer_notes',   NULL,
    'bank_name',         COALESCE(v_organizer.bank_name, ''),
    'bank_account',      COALESCE(v_organizer.bank_account, ''),
    'bank_holder',       COALESCE(v_organizer.bank_holder, ''),
    'bank_instructions', COALESCE(v_organizer.payment_instructions, '')
  );
END;
$$;
