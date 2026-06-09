-- ============================================================
-- MIGRACIÓN 005: Función atómica para decrementar contadores de rifa
-- Reemplaza el uso incorrecto de supabase.rpc("greatest",...) dentro
-- de .update() en la Edge Function process-refund.
-- ============================================================

CREATE OR REPLACE FUNCTION decrement_raffle_counters(
  p_raffle_id      UUID,
  p_ticket_count   INT     DEFAULT 1,
  p_revenue_amount NUMERIC DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE raffles
  SET
    tickets_sold = GREATEST(tickets_sold - p_ticket_count, 0),
    revenue      = GREATEST(revenue      - p_revenue_amount, 0::NUMERIC),
    updated_at   = NOW()
  WHERE id = p_raffle_id;
END;
$$;
