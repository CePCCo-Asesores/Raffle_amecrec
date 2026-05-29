-- ============================================================
-- MIGRACIÓN 004: Correcciones de seguridad en políticas RLS
-- Ejecutar DESPUÉS de 002_rls_policies.sql
-- ============================================================

-- SEC-05: audit_log — solo usuarios autenticados pueden insertar
-- Evita que usuarios anónimos inyecten entradas falsas en el log
DROP POLICY IF EXISTS "audit_insert_all" ON audit_log;
CREATE POLICY "audit_insert_auth" ON audit_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- SEC-06: financial_ledger — solo usuarios autenticados pueden insertar
-- Las RPCs con SECURITY DEFINER siempre pueden escribir al ledger
DROP POLICY IF EXISTS "ledger_insert_all" ON financial_ledger;
CREATE POLICY "ledger_insert_auth" ON financial_ledger
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- SEC-07: notifications — cada usuario solo inserta notificaciones para sí mismo
-- Las Edge Functions con service_role bypasean esta política (sin restricción)
DROP POLICY IF EXISTS "notifs_insert_system" ON notifications;
CREATE POLICY "notifs_insert_own" ON notifications
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- SEC-09: organizadores solo ven perfiles de sus propios participantes
-- Antes: cualquier organizador podía leer TODOS los perfiles (incl. stripe_customer_id, phone)
DROP POLICY IF EXISTS "profiles_select_org" ON profiles;
CREATE POLICY "profiles_select_org" ON profiles FOR SELECT
  USING (
    get_my_role() = 'organizer'
    AND id IN (
      SELECT DISTINCT t.participant_id
      FROM tickets t
      WHERE t.raffle_id IN (
        SELECT r.id FROM raffles r WHERE r.organizer_id = auth.uid()
      )
      AND t.participant_id IS NOT NULL
    )
  );

-- SEC-04 (complemento): evitar que usuarios actualicen su propio rol
-- La columna role solo puede ser modificada por administradores vía service_role
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  );
