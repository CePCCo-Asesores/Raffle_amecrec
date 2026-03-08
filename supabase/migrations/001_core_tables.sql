-- ============================================================
-- MIGRACIÓN 001: Tablas principales del sistema RifaMax
-- Ejecutar en orden en el SQL Editor de Supabase
-- ============================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- PROFILES (extiende auth.users de Supabase)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  full_name       TEXT NOT NULL DEFAULT '',
  role            TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('admin', 'organizer', 'participant')),
  phone           TEXT,
  avatar_url      TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  stripe_customer_id      TEXT,
  stripe_connect_id       TEXT,
  stripe_connect_status   TEXT NOT NULL DEFAULT 'not_connected'
                            CHECK (stripe_connect_status IN ('not_connected','pending','active','disabled')),
  onboarding_completed    BOOLEAN NOT NULL DEFAULT FALSE,
  payment_instructions    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger para crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'participant')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- SUBSCRIPTION PLANS
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  TEXT NOT NULL,
  description           TEXT,
  price_monthly         NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_active_raffles    INT NOT NULL DEFAULT 1,
  max_tickets_per_raffle INT NOT NULL DEFAULT 100,
  features              JSONB NOT NULL DEFAULT '[]',
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Planes por defecto
INSERT INTO subscription_plans (name, description, price_monthly, max_active_raffles, max_tickets_per_raffle, features)
VALUES
  ('Básico',    'Para organizadores que inician', 299.00,  1,   200,  '["1 rifa activa","Hasta 200 boletos","Soporte por email"]'),
  ('Estándar',  'Para organizadores frecuentes',  599.00,  3,   500,  '["3 rifas activas","Hasta 500 boletos","Soporte prioritario","Estadísticas básicas"]'),
  ('Pro',       'Para organizadores profesionales',999.00, 10, 2000,  '["10 rifas activas","Hasta 2000 boletos","Soporte 24/7","Estadísticas avanzadas","API access"]')
ON CONFLICT DO NOTHING;

-- ============================================================
-- ORGANIZER SUBSCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS organizer_subscriptions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizer_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id               UUID NOT NULL REFERENCES subscription_plans(id),
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','past_due','cancelled','suspended')),
  stripe_subscription_id TEXT,
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- RAFFLES
-- ============================================================
CREATE TABLE IF NOT EXISTS raffles (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizer_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  description           TEXT,
  image_url             TEXT,
  price_per_ticket      NUMERIC(10,2) NOT NULL CHECK (price_per_ticket > 0),
  total_tickets         INT NOT NULL CHECK (total_tickets > 0),
  sales_close_date      TIMESTAMPTZ NOT NULL,
  draw_date             TIMESTAMPTZ NOT NULL,
  payment_method        TEXT NOT NULL DEFAULT 'external'
                          CHECK (payment_method IN ('stripe','external')),
  unsold_winner_policy  TEXT NOT NULL DEFAULT 'desert'
                          CHECK (unsold_winner_policy IN ('desert','redraw','absorb','extend')),
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','active','closed','validated','locked','winner_declared','cancelled')),
  lottery_type          TEXT,
  lottery_draw_date     TIMESTAMPTZ,
  lottery_draw_number   TEXT,
  winning_number        INT,
  winner_ticket_id      UUID,
  winner_evidence_url   TEXT,
  winner_declared_at    TIMESTAMPTZ,
  tickets_sold          INT NOT NULL DEFAULT 0,
  revenue               NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_public             BOOLEAN NOT NULL DEFAULT TRUE,
  -- Inmutabilidad del resultado
  result_locked         BOOLEAN NOT NULL DEFAULT FALSE,
  result_locked_at      TIMESTAMPTZ,
  result_locked_by      UUID REFERENCES profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raffles_organizer    ON raffles(organizer_id);
CREATE INDEX IF NOT EXISTS idx_raffles_status       ON raffles(status);
CREATE INDEX IF NOT EXISTS idx_raffles_is_public    ON raffles(is_public);

-- ============================================================
-- TICKETS
-- ============================================================
CREATE TABLE IF NOT EXISTS tickets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  raffle_id         UUID NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  ticket_number     INT NOT NULL,
  participant_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'available'
                      CHECK (status IN ('available','reserved','sold','paid')),
  reserved_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reserved_at       TIMESTAMPTZ,
  reserved_until    TIMESTAMPTZ,
  purchased_at      TIMESTAMPTZ,
  payment_method    TEXT,
  stripe_payment_id TEXT,
  marked_paid_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  marked_paid_at    TIMESTAMPTZ,
  commission_rate   NUMERIC(5,2) DEFAULT 0,
  commission_amount NUMERIC(10,2) DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(raffle_id, ticket_number)
);

CREATE INDEX IF NOT EXISTS idx_tickets_raffle      ON tickets(raffle_id);
CREATE INDEX IF NOT EXISTS idx_tickets_participant ON tickets(participant_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status      ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_reserved_until ON tickets(reserved_until) WHERE reserved_until IS NOT NULL;

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  message           TEXT NOT NULL,
  type              TEXT NOT NULL DEFAULT 'info'
                      CHECK (type IN ('info','success','warning','error')),
  related_raffle_id UUID REFERENCES raffles(id) ON DELETE SET NULL,
  is_read           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user   ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type                      TEXT NOT NULL
                              CHECK (type IN ('ticket_purchase','subscription','commission','refund')),
  amount                    NUMERIC(12,2) NOT NULL,
  currency                  TEXT NOT NULL DEFAULT 'MXN',
  status                    TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','completed','failed','refunded')),
  payer_id                  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  receiver_id               UUID REFERENCES profiles(id) ON DELETE SET NULL,
  raffle_id                 UUID REFERENCES raffles(id) ON DELETE SET NULL,
  ticket_id                 UUID REFERENCES tickets(id) ON DELETE SET NULL,
  stripe_payment_intent_id  TEXT,
  commission_amount         NUMERIC(10,2) NOT NULL DEFAULT 0,
  commission_rate           NUMERIC(5,2),
  description               TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_payer   ON transactions(payer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_raffle  ON transactions(raffle_id);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_email  TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID,
  old_value   JSONB,
  new_value   JSONB,
  details     JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_log(action);

-- ============================================================
-- FINANCIAL LEDGER
-- ============================================================
CREATE TABLE IF NOT EXISTS financial_ledger (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_type                  TEXT NOT NULL
                                CHECK (entry_type IN ('ticket_sale','platform_commission','organizer_income','subscription_payment','refund')),
  amount                      NUMERIC(12,2) NOT NULL,
  currency                    TEXT NOT NULL DEFAULT 'MXN',
  description                 TEXT NOT NULL,
  raffle_id                   UUID REFERENCES raffles(id) ON DELETE SET NULL,
  ticket_id                   UUID REFERENCES tickets(id) ON DELETE SET NULL,
  payer_id                    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  receiver_id                 UUID REFERENCES profiles(id) ON DELETE SET NULL,
  commission_rate_applied     NUMERIC(5,2),
  commission_amount_calculated NUMERIC(10,2),
  transaction_id              UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Inmutable: sin UPDATE permitido (ver RLS)
);

CREATE INDEX IF NOT EXISTS idx_ledger_raffle ON financial_ledger(raffle_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type   ON financial_ledger(entry_type);

-- ============================================================
-- RAFFLE RESULTS LOG (inmutabilidad del sorteo)
-- ============================================================
CREATE TABLE IF NOT EXISTS raffle_results_log (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  raffle_id           UUID NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  winning_number      INT NOT NULL,
  lottery_type        TEXT NOT NULL,
  lottery_draw_number TEXT NOT NULL,
  lottery_draw_date   TIMESTAMPTZ NOT NULL,
  registered_by       UUID NOT NULL REFERENCES profiles(id),
  registered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result_hash         TEXT NOT NULL,
  evidence_url        TEXT,
  is_official         BOOLEAN NOT NULL DEFAULT TRUE,
  previous_result_id  UUID REFERENCES raffle_results_log(id),
  change_reason       TEXT
);

CREATE INDEX IF NOT EXISTS idx_results_raffle ON raffle_results_log(raffle_id);

-- ============================================================
-- PLATFORM CONFIG
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_config (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key         TEXT NOT NULL UNIQUE,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_config (key, value, description) VALUES
  ('commission_rate',         '5',                    'Comisión de la plataforma (%)'),
  ('max_tickets_per_tx',      '10',                   'Máximo boletos por transacción'),
  ('max_tickets_per_minute',  '20',                   'Máximo boletos por minuto por usuario'),
  ('platform_name',           'RifaMax',              'Nombre de la plataforma'),
  ('support_email',           'soporte@rifamax.mx',   'Email de soporte'),
  ('reservation_duration_sec','300',                  'Duración de reserva de boletos (segundos)')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- NOTIFICATION PREFERENCES
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  ticket_purchase_email   BOOLEAN NOT NULL DEFAULT TRUE,
  raffle_closed_email     BOOLEAN NOT NULL DEFAULT TRUE,
  winner_declared_email   BOOLEAN NOT NULL DEFAULT TRUE,
  sales_threshold_email   BOOLEAN NOT NULL DEFAULT TRUE,
  marketing_email         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- EMAIL LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS email_log (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_email     TEXT NOT NULL,
  recipient_user_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  email_type          TEXT NOT NULL,
  subject             TEXT NOT NULL,
  raffle_id           UUID REFERENCES raffles(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'sent'
                        CHECK (status IN ('sent','delivered','failed','bounced')),
  error_message       TEXT,
  metadata            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- REFUND REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS refund_requests (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id           UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  raffle_id           UUID NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  participant_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organizer_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ticket_number       INT NOT NULL,
  amount              NUMERIC(10,2) NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'MXN',
  reason              TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','denied','processing','refunded','failed')),
  stripe_payment_id   TEXT,
  stripe_refund_id    TEXT,
  organizer_notes     TEXT,
  reviewed_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  refunded_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_raffle       ON refund_requests(raffle_id);
CREATE INDEX IF NOT EXISTS idx_refunds_participant  ON refund_requests(participant_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status       ON refund_requests(status);

-- ============================================================
-- DISPUTES
-- ============================================================
CREATE TABLE IF NOT EXISTS disputes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  refund_request_id   UUID NOT NULL REFERENCES refund_requests(id) ON DELETE CASCADE,
  raffle_id           UUID NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  ticket_id           UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  participant_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organizer_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ticket_number       INT NOT NULL,
  amount              NUMERIC(10,2) NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'MXN',
  status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','under_review','resolved_participant','resolved_organizer','closed')),
  reason              TEXT NOT NULL,
  admin_notes         TEXT,
  admin_decision      TEXT,
  assigned_admin_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  force_refund        BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_refund_id    TEXT,
  resolution_summary  TEXT,
  resolved_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_raffle      ON disputes(raffle_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status      ON disputes(status);

-- ============================================================
-- DISPUTE MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS dispute_messages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id    UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  sender_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sender_role   TEXT NOT NULL CHECK (sender_role IN ('participant','organizer','admin','system')),
  sender_name   TEXT,
  message       TEXT NOT NULL,
  message_type  TEXT NOT NULL DEFAULT 'message'
                  CHECK (message_type IN ('message','status_change','admin_action','force_refund','evidence','system')),
  metadata      JSONB,
  is_internal   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_msgs_dispute ON dispute_messages(dispute_id);

-- ============================================================
-- STRIPE CHECKOUT SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS stripe_checkout_sessions (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id                TEXT NOT NULL UNIQUE,
  user_id                   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  raffle_id                 UUID NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  ticket_numbers            JSONB NOT NULL DEFAULT '[]',
  amount_total              NUMERIC(12,2) NOT NULL,
  currency                  TEXT NOT NULL DEFAULT 'MXN',
  status                    TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','completed','expired','cancelled')),
  stripe_payment_intent_id  TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at              TIMESTAMPTZ
);

-- ============================================================
-- UPDATED_AT TRIGGER (reutilizable)
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_raffles_updated_at
  BEFORE UPDATE ON raffles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_refunds_updated_at
  BEFORE UPDATE ON refund_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_disputes_updated_at
  BEFORE UPDATE ON disputes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_notif_prefs_updated_at
  BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at();
