-- SPEC-020: consulta e cancelamento da assinatura, expiração e downgrade.
-- O SQLite não altera restrições CHECK, então as duas tabelas são reconstruídas com o mesmo conteúdo;
-- o executor de migrações confere as chaves estrangeiras antes do commit.

-- 1. Movimentação de cancelamento da assinatura (OPEN-93): registrada no núcleo financeiro, com chave
--    de operação idempotente, e de valor zero, porque não movimenta dinheiro (ADR-0003, INV-008).
CREATE TABLE financial_movements_rebuilt (
  id TEXT PRIMARY KEY,
  operation_key TEXT NOT NULL UNIQUE,
  business_reference TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  type TEXT NOT NULL CHECK (type IN ('entry_fee', 'subscription', 'refund', 'payout', 'subscription_cancellation')),
  amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND (
    (type = 'subscription_cancellation' AND amount_cents = 0)
    OR (type <> 'subscription_cancellation' AND amount_cents > 0)
  )),
  currency TEXT NOT NULL CHECK (currency = 'BRL'),
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'refused')),
  user_id TEXT NOT NULL REFERENCES users (id),
  origin TEXT NOT NULL CHECK (origin IN ('simulator', 'test_provider')),
  operation_type TEXT NOT NULL CHECK (operation_type IN ('participation', 'subscription', 'refund_request', 'pool')),
  operation_id TEXT NOT NULL,
  provider_id TEXT,
  continuation_json TEXT,
  original_movement_id TEXT REFERENCES financial_movements (id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (business_reference, attempt_number),
  CHECK ((type = 'refund') = (original_movement_id IS NOT NULL))
);

INSERT INTO financial_movements_rebuilt
SELECT id, operation_key, business_reference, attempt_number, type, amount_cents, currency, status, user_id, origin,
  operation_type, operation_id, provider_id, continuation_json, original_movement_id, created_at, updated_at
FROM financial_movements;

DROP TABLE financial_movements;
ALTER TABLE financial_movements_rebuilt RENAME TO financial_movements;

CREATE INDEX financial_movements_user_created ON financial_movements (user_id, created_at DESC);
CREATE INDEX financial_movements_pending ON financial_movements (status, created_at);

CREATE TRIGGER financial_movements_final_states_are_immutable
BEFORE UPDATE ON financial_movements
WHEN OLD.status <> 'pending'
BEGIN
  SELECT RAISE(ABORT, 'final financial movements are immutable');
END;

CREATE TRIGGER financial_movements_identity_is_immutable
BEFORE UPDATE OF id, operation_key, business_reference, attempt_number, type, amount_cents, currency,
  user_id, origin, operation_type, operation_id, original_movement_id, created_at ON financial_movements
BEGIN
  SELECT RAISE(ABORT, 'financial movement identity is immutable');
END;

CREATE TRIGGER financial_movements_no_delete
BEFORE DELETE ON financial_movements
BEGIN
  SELECT RAISE(ABORT, 'financial movements are never deleted');
END;

-- 2. Assinatura com os estados desta Spec (OPEN-91): cancelamento pendente, cancelada e expirada.
--    O gatilho do plano do usuário lê esta tabela; ele é refeito depois da reconstrução.
DROP TRIGGER users_premium_requires_active_subscription;

CREATE TABLE subscriptions_rebuilt (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'refused', 'cancellation_pending', 'cancelled', 'expired')),
  amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency = 'BRL'),
  recurrence TEXT NOT NULL CHECK (recurrence = 'monthly'),
  origin TEXT NOT NULL CHECK (origin IN ('simulator', 'test_provider')),
  starts_at TEXT,
  ends_at TEXT,
  -- Quando o cancelamento foi pedido e quando o estado final (cancelada ou expirada) passou a valer.
  cancellation_requested_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status IN ('active', 'cancellation_pending', 'cancelled', 'expired')) = (starts_at IS NOT NULL AND ends_at IS NOT NULL)),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK ((status = 'cancellation_pending') <= (cancellation_requested_at IS NOT NULL)),
  CHECK ((status IN ('cancelled', 'expired')) = (ended_at IS NOT NULL))
);

INSERT INTO subscriptions_rebuilt (id, user_id, status, amount_cents, currency, recurrence, origin, starts_at, ends_at, created_at, updated_at)
SELECT id, user_id, status, amount_cents, currency, recurrence, origin, starts_at, ends_at, created_at, updated_at FROM subscriptions;

DROP TABLE subscriptions;
ALTER TABLE subscriptions_rebuilt RENAME TO subscriptions;

-- No máximo uma assinatura em aberto por usuário: pendente, ativa ou com cancelamento pendente.
CREATE UNIQUE INDEX subscriptions_one_open_per_user ON subscriptions (user_id)
  WHERE status IN ('pending', 'active', 'cancellation_pending');
CREATE INDEX subscriptions_user_created ON subscriptions (user_id, created_at DESC);
CREATE INDEX subscriptions_expiring ON subscriptions (status, ends_at);

CREATE TRIGGER subscriptions_terms_are_immutable
BEFORE UPDATE OF id, user_id, amount_cents, currency, recurrence, origin, created_at, starts_at, ends_at ON subscriptions
WHEN OLD.starts_at IS NOT NULL
  OR NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.amount_cents IS NOT OLD.amount_cents
  OR NEW.currency IS NOT OLD.currency OR NEW.recurrence IS NOT OLD.recurrence OR NEW.origin IS NOT OLD.origin
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'subscription terms are immutable');
END;

-- Recusada, cancelada e expirada são finais e não são reabertas (INV-005).
CREATE TRIGGER subscriptions_final_states_are_final
BEFORE UPDATE ON subscriptions
WHEN OLD.status IN ('refused', 'cancelled', 'expired')
BEGIN
  SELECT RAISE(ABORT, 'final subscriptions are final');
END;

CREATE TRIGGER subscriptions_no_delete
BEFORE DELETE ON subscriptions
BEGIN
  SELECT RAISE(ABORT, 'subscriptions are never deleted');
END;

-- O plano só é Premium com a assinatura ativa ou com o cancelamento ainda pendente (OPEN-89).
CREATE TRIGGER users_premium_requires_active_subscription
BEFORE UPDATE OF plan ON users
WHEN NEW.plan = 'premium'
  AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = NEW.id AND status IN ('active', 'cancellation_pending'))
BEGIN
  SELECT RAISE(ABORT, 'premium plan requires an active subscription');
END;
