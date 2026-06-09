-- ============================================================
-- MIGRACIÓN 007: ticket_start_number + corrección finalize_draw
-- ticket_start_number = 1 para Mayor/Superior/etc (00001–N)
-- ticket_start_number = 0 para Zodiaco y sorteos personalizados (00–N-1)
-- ============================================================

ALTER TABLE raffles
  ADD COLUMN IF NOT EXISTS ticket_start_number INT NOT NULL DEFAULT 1;

-- Reemplaza la validación hardcodeada (1..total_tickets) por una
-- basada en ticket_start_number (start..start+total-1).
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
  v_start       INT;
  v_max         INT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_raffle FROM raffles WHERE id = p_raffle_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'RAFFLE_NOT_FOUND');
  END IF;

  IF get_my_role() != 'admin' AND v_raffle.organizer_id != auth.uid() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_raffle.status != 'locked' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS', 'current_status', v_raffle.status);
  END IF;

  IF v_raffle.winning_number IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'WINNER_ALREADY_DECLARED');
  END IF;

  -- Validar rango respetando ticket_start_number (0-based o 1-based)
  v_start := COALESCE(v_raffle.ticket_start_number, 1);
  v_max   := v_start + v_raffle.total_tickets - 1;

  IF p_winning_number < v_start OR p_winning_number > v_max THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'INVALID_NUMBER',
      'min',     v_start,
      'max',     v_max
    );
  END IF;

  -- Hash SHA-256 generado en BD (no en cliente)
  v_timestamp  := NOW()::TEXT;
  v_hash_input := p_raffle_id::TEXT || '|' || p_winning_number::TEXT || '|' ||
                  COALESCE(v_raffle.lottery_type,'') || '|' ||
                  COALESCE(v_raffle.lottery_draw_number,'') || '|' ||
                  p_user_id::TEXT || '|' || v_timestamp;
  v_result_hash := encode(digest(v_hash_input, 'sha256'), 'hex');

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

  SELECT p.full_name, p.email, t.ticket_number
  INTO v_winner
  FROM tickets t
  LEFT JOIN profiles p ON p.id = t.participant_id
  WHERE t.raffle_id = p_raffle_id AND t.ticket_number = p_winning_number
  LIMIT 1;

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
