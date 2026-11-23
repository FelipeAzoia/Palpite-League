-- SPEC-029: renovação recorrente, plano anual e pagamento em atraso.
-- O SQLite não altera restrições CHECK, então as duas tabelas são reconstruídas com o mesmo conteúdo;
-- o executor de migrações confere as chaves estrangeiras antes do commit.

-- 1. Cobrança de renovação da assinatura: movimentação com o valor do ciclo (RF43, INV-008).
CREATE TABLE financial_movements_rebuilt (
  id TEXT PRIMARY KEY,
  operation_key TEXT NOT NULL UNIQUE,
  business_reference TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  type TEXT NOT NULL CHECK (type IN ('entry_fee', 'subscription', 'refund', 'payout', 'subscription_cancellation', 'subscription_renewal')),
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

-- 2. Assinatura com ciclo mensal ou anual e os estados "renovação pendente" (past_due) e
--    "renovação cancelada" (non_renewing). O gatilho do plano do usuário lê esta tabela.
DROP TRIGGER users_premium_requires_active_subscription;

CREATE TABLE subscriptions_rebuilt (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  status TEXT NOT NULL CHECK (status IN (
    'pending', 'active', 'refused', 'cancellation_pending', 'cancelled', 'expired', 'past_due', 'non_renewing'
  )),
  amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency = 'BRL'),
  recurrence TEXT NOT NULL CHECK (recurrence IN ('monthly', 'annual')),
  origin TEXT NOT NULL CHECK (origin IN ('simulator', 'test_provider')),
  starts_at TEXT,
  -- Fim do período atual (pago); a renovação confirmada o estende por mais um ciclo.
  ends_at TEXT,
  -- Fim da carência de 3 dias da renovação pendente (RB67).
  grace_ends_at TEXT,
  cancellation_requested_at TEXT,
  ended_at TEXT,
  billing_policy_version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status IN ('active', 'cancellation_pending', 'cancelled', 'expired', 'past_due', 'non_renewing'))
    = (starts_at IS NOT NULL AND ends_at IS NOT NULL)),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK ((status = 'cancellation_pending') <= (cancellation_requested_at IS NOT NULL)),
  CHECK ((status IN ('cancelled', 'expired')) = (ended_at IS NOT NULL)),
  CHECK ((status = 'past_due') <= (grace_ends_at IS NOT NULL AND grace_ends_at > ends_at))
);

INSERT INTO subscriptions_rebuilt (
  id, user_id, status, amount_cents, currency, recurrence, origin, starts_at, ends_at,
  cancellation_requested_at, ended_at, billing_policy_version, created_at, updated_at
)
SELECT id, user_id, status, amount_cents, currency, recurrence, origin, starts_at, ends_at,
  cancellation_requested_at, ended_at, billing_policy_version, created_at, updated_at
FROM subscriptions;

DROP TABLE subscriptions;
ALTER TABLE subscriptions_rebuilt RENAME TO subscriptions;

-- No máximo uma assinatura em aberto por usuário.
CREATE UNIQUE INDEX subscriptions_one_open_per_user ON subscriptions (user_id)
  WHERE status IN ('pending', 'active', 'cancellation_pending', 'past_due', 'non_renewing');
CREATE INDEX subscriptions_user_created ON subscriptions (user_id, created_at DESC);
CREATE INDEX subscriptions_expiring ON subscriptions (status, ends_at);

-- Valor, ciclo, dono e início não mudam depois de definidos.
CREATE TRIGGER subscriptions_terms_are_immutable
BEFORE UPDATE OF id, user_id, amount_cents, currency, recurrence, origin, created_at, starts_at ON subscriptions
WHEN OLD.starts_at IS NOT NULL
  OR NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.amount_cents IS NOT OLD.amount_cents
  OR NEW.currency IS NOT OLD.currency OR NEW.recurrence IS NOT OLD.recurrence OR NEW.origin IS NOT OLD.origin
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'subscription terms are immutable');
END;

-- A vigência nunca diminui nem é reescrita: só a renovação a estende (INV-010).
CREATE TRIGGER subscriptions_period_only_extends
BEFORE UPDATE OF ends_at ON subscriptions
WHEN OLD.ends_at IS NOT NULL AND (NEW.ends_at IS NULL OR NEW.ends_at <= OLD.ends_at)
BEGIN
  SELECT RAISE(ABORT, 'subscription terms are immutable');
END;

-- Recusada, cancelada e expirada são finais e não são reabertas.
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

-- O plano só é Premium enquanto a assinatura dá direito a ele: ativa, com cancelamento pendente,
-- com a renovação pendente (carência) ou com a renovação cancelada (até o fim do período pago).
CREATE TRIGGER users_premium_requires_active_subscription
BEFORE UPDATE OF plan ON users
WHEN NEW.plan = 'premium'
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = NEW.id AND status IN ('active', 'cancellation_pending', 'past_due', 'non_renewing')
  )
BEGIN
  SELECT RAISE(ABORT, 'premium plan requires an active subscription');
END;
