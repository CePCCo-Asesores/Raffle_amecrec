-- ============================================================
-- MIGRACIÓN 002: Row Level Security (RLS)
-- Ejecutar DESPUÉS de 001_core_tables.sql
-- ============================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizer_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE raffles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_ledger          ENABLE ROW LEVEL SECURITY;
ALTER TABLE raffle_results_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_log                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_requests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute_messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_checkout_sessions  ENABLE ROW LEVEL SECURITY;

-- Helper: obtener el rol del usuario autenticado
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

-- ============================================================
-- PROFILES
-- ============================================================
CREATE POLICY "profiles_select_own"    ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_select_admin"  ON profiles FOR SELECT USING (get_my_role() = 'admin');
-- Organizadores pueden ver participantes (para sus rifas)
CREATE POLICY "profiles_select_org"    ON profiles FOR SELECT USING (get_my_role() = 'organizer');
CREATE POLICY "profiles_update_own"    ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_insert_own"    ON profiles FOR INSERT WITH CHECK (id = auth.uid());

-- ============================================================
-- SUBSCRIPTION PLANS (solo lectura para todos)
-- ============================================================
CREATE POLICY "plans_select_all"   ON subscription_plans FOR SELECT USING (TRUE);
CREATE POLICY "plans_manage_admin" ON subscription_plans FOR ALL USING (get_my_role() = 'admin');

-- ============================================================
-- ORGANIZER SUBSCRIPTIONS
-- ============================================================
CREATE POLICY "subs_select_own"   ON organizer_subscriptions FOR SELECT USING (organizer_id = auth.uid());
CREATE POLICY "subs_select_admin" ON organizer_subscriptions FOR SELECT USING (get_my_role() = 'admin');
CREATE POLICY "subs_manage_admin" ON organizer_subscriptions FOR ALL USING (get_my_role() = 'admin');

-- ============================================================
-- RAFFLES
-- ============================================================
-- Lectura: públicas para todos, privadas solo para su organizador o admin
CREATE POLICY "raffles_select_public"    ON raffles FOR SELECT USING (is_public = TRUE);
CREATE POLICY "raffles_select_organizer" ON raffles FOR SELECT USING (organizer_id = auth.uid());
CREATE POLICY "raffles_select_admin"     ON raffles FOR SELECT USING (get_my_role() = 'admin');
-- Escritura: organizadores gestionan las suyas, admin gestiona todas
CREATE POLICY "raffles_insert_organizer" ON raffles FOR INSERT WITH CHECK (organizer_id = auth.uid() AND get_my_role() = 'organizer');
CREATE POLICY "raffles_update_organizer" ON raffles FOR UPDATE USING (organizer_id = auth.uid() AND get_my_role() = 'organizer');
CREATE POLICY "raffles_manage_admin"     ON raffles FOR ALL USING (get_my_role() = 'admin');

-- ============================================================
-- TICKETS
-- ============================================================
-- Ver boletos: participante ve los suyos, organizador ve los de sus rifas, admin ve todo
CREATE POLICY "tickets_select_participant" ON tickets FOR SELECT
  USING (participant_id = auth.uid() OR reserved_by = auth.uid());
CREATE POLICY "tickets_select_organizer"   ON tickets FOR SELECT
  USING (raffle_id IN (SELECT id FROM raffles WHERE organizer_id = auth.uid()));
CREATE POLICY "tickets_select_admin"       ON tickets FOR SELECT USING (get_my_role() = 'admin');
-- Ver disponibles (para comprar)
CREATE POLICY "tickets_select_available"   ON tickets FOR SELECT USING (status = 'available');
-- Actualizaciones: manejadas por RPCs con SECURITY DEFINER
CREATE POLICY "tickets_update_system"      ON tickets FOR UPDATE USING (get_my_role() IN ('admin','organizer') OR participant_id = auth.uid());

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE POLICY "notifs_select_own"   ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notifs_update_own"   ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "notifs_insert_system" ON notifications FOR INSERT WITH CHECK (TRUE); -- edge functions insertan

-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE POLICY "tx_select_payer"    ON transactions FOR SELECT USING (payer_id = auth.uid());
CREATE POLICY "tx_select_receiver" ON transactions FOR SELECT USING (receiver_id = auth.uid());
CREATE POLICY "tx_select_admin"    ON transactions FOR SELECT USING (get_my_role() = 'admin');

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE POLICY "audit_select_admin" ON audit_log FOR SELECT USING (get_my_role() = 'admin');
CREATE POLICY "audit_insert_all"   ON audit_log FOR INSERT WITH CHECK (TRUE);

-- ============================================================
-- FINANCIAL LEDGER (inmutable: no UPDATE, no DELETE)
-- ============================================================
CREATE POLICY "ledger_select_admin"     ON financial_ledger FOR SELECT USING (get_my_role() = 'admin');
CREATE POLICY "ledger_select_organizer" ON financial_ledger FOR SELECT
  USING (raffle_id IN (SELECT id FROM raffles WHERE organizer_id = auth.uid()));
CREATE POLICY "ledger_insert_all"       ON financial_ledger FOR INSERT WITH CHECK (TRUE);
-- Sin UPDATE ni DELETE por diseño

-- ============================================================
-- RAFFLE RESULTS LOG (inmutable)
-- ============================================================
CREATE POLICY "results_select_public"    ON raffle_results_log FOR SELECT
  USING (raffle_id IN (SELECT id FROM raffles WHERE is_public = TRUE));
CREATE POLICY "results_select_organizer" ON raffle_results_log FOR SELECT
  USING (raffle_id IN (SELECT id FROM raffles WHERE organizer_id = auth.uid()));
CREATE POLICY "results_select_admin"     ON raffle_results_log FOR SELECT USING (get_my_role() = 'admin');
CREATE POLICY "results_insert_organizer" ON raffle_results_log FOR INSERT
  WITH CHECK (raffle_id IN (SELECT id FROM raffles WHERE organizer_id = auth.uid()) OR get_my_role() = 'admin');

-- ============================================================
-- PLATFORM CONFIG
-- ============================================================
CREATE POLICY "config_select_all"    ON platform_config FOR SELECT USING (TRUE);
CREATE POLICY "config_manage_admin"  ON platform_config FOR ALL USING (get_my_role() = 'admin');

-- ============================================================
-- NOTIFICATION PREFERENCES
-- ============================================================
CREATE POLICY "notif_prefs_own"   ON notification_preferences FOR ALL USING (user_id = auth.uid());
CREATE POLICY "notif_prefs_admin" ON notification_preferences FOR SELECT USING (get_my_role() = 'admin');

-- ============================================================
-- EMAIL LOG
-- ============================================================
CREATE POLICY "email_log_admin"  ON email_log FOR SELECT USING (get_my_role() = 'admin');
CREATE POLICY "email_log_insert" ON email_log FOR INSERT WITH CHECK (TRUE);

-- ============================================================
-- REFUND REQUESTS
-- ============================================================
CREATE POLICY "refunds_select_participant" ON refund_requests FOR SELECT USING (participant_id = auth.uid());
CREATE POLICY "refunds_select_organizer"   ON refund_requests FOR SELECT USING (organizer_id = auth.uid());
CREATE POLICY "refunds_select_admin"       ON refund_requests FOR SELECT USING (get_my_role() = 'admin');
CREATE POLICY "refunds_insert_participant" ON refund_requests FOR INSERT WITH CHECK (participant_id = auth.uid());
CREATE POLICY "refunds_update_organizer"   ON refund_requests FOR UPDATE USING (organizer_id = auth.uid());
CREATE POLICY "refunds_manage_admin"       ON refund_requests FOR ALL USING (get_my_role() = 'admin');

-- ============================================================
-- DISPUTES
-- ============================================================
CREATE POLICY "disputes_select_participant" ON disputes FOR SELECT USING (participant_id = auth.uid());
CREATE POLICY "disputes_select_organizer"   ON disputes FOR SELECT USING (organizer_id = auth.uid());
CREATE POLICY "disputes_select_admin"       ON disputes FOR SELECT USING (get_my_role() = 'admin');
CREATE POLICY "disputes_insert_participant" ON disputes FOR INSERT WITH CHECK (participant_id = auth.uid());
CREATE POLICY "disputes_manage_admin"       ON disputes FOR ALL USING (get_my_role() = 'admin');

-- ============================================================
-- DISPUTE MESSAGES
-- ============================================================
CREATE POLICY "dmsg_select_participant" ON dispute_messages FOR SELECT
  USING (dispute_id IN (SELECT id FROM disputes WHERE participant_id = auth.uid()) AND is_internal = FALSE);
CREATE POLICY "dmsg_select_organizer"   ON dispute_messages FOR SELECT
  USING (dispute_id IN (SELECT id FROM disputes WHERE organizer_id = auth.uid()) AND is_internal = FALSE);
CREATE POLICY "dmsg_select_admin"       ON dispute_messages FOR SELECT USING (get_my_role() = 'admin');
CREATE POLICY "dmsg_insert_participant" ON dispute_messages FOR INSERT
  WITH CHECK (dispute_id IN (SELECT id FROM disputes WHERE participant_id = auth.uid()));
CREATE POLICY "dmsg_insert_organizer"   ON dispute_messages FOR INSERT
  WITH CHECK (dispute_id IN (SELECT id FROM disputes WHERE organizer_id = auth.uid()));
CREATE POLICY "dmsg_insert_admin"       ON dispute_messages FOR INSERT WITH CHECK (get_my_role() = 'admin');

-- ============================================================
-- STRIPE CHECKOUT SESSIONS
-- ============================================================
CREATE POLICY "checkout_select_own"   ON stripe_checkout_sessions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "checkout_select_admin" ON stripe_checkout_sessions FOR SELECT USING (get_my_role() = 'admin');
CREATE POLICY "checkout_insert_own"   ON stripe_checkout_sessions FOR INSERT WITH CHECK (user_id = auth.uid());
