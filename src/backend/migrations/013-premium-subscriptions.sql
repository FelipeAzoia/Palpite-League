-- SPEC-019: contratação do Premium.
-- O plano do usuário passa a aceitar "premium" (RB01, RB03). O SQLite não altera restrições CHECK,
-- então a tabela é reconstruída com o mesmo conteúdo; o executor de migrações confere as chaves
-- estrangeiras antes do commit.
CREATE TABLE users_rebuilt (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  email TEXT NOT NULL CHECK (length(email) <= 254),
  normalized_email TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL
);

INSERT INTO users_rebuilt (id, name, email, normalized_email, plan, status, created_at)
SELECT id, name, email, normalized_email, plan, status, created_at FROM users;

DROP TABLE users;
ALTER TABLE users_rebuilt RENAME TO users;

-- Assinatura (OPEN-86): nasce pendente; fica ativa na confirmação, com vigência de um mês de
-- calendário em UTC, ou recusada. Cancelamento, renovação e expiração são da SPEC-020.
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'refused')),
  amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency = 'BRL'),
  recurrence TEXT NOT NULL CHECK (recurrence = 'monthly'),
  origin TEXT NOT NULL CHECK (origin IN ('simulator', 'test_provider')),
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status = 'active') = (starts_at IS NOT NULL AND ends_at IS NOT NULL)),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

-- No máximo uma assinatura pendente ou ativa por usuário (INV-003).
CREATE UNIQUE INDEX subscriptions_one_open_per_user ON subscriptions (user_id) WHERE status IN ('pending', 'active');
CREATE INDEX subscriptions_user_created ON subscriptions (user_id, created_at DESC);

-- Valor, moeda, recorrência e dono não mudam depois da criação; recusada não é reaberta.
CREATE TRIGGER subscriptions_terms_are_immutable
BEFORE UPDATE OF id, user_id, amount_cents, currency, recurrence, origin, created_at ON subscriptions
BEGIN
  SELECT RAISE(ABORT, 'subscription terms are immutable');
END;

CREATE TRIGGER subscriptions_refused_is_final
BEFORE UPDATE ON subscriptions
WHEN OLD.status = 'refused'
BEGIN
  SELECT RAISE(ABORT, 'refused subscriptions are final');
END;

CREATE TRIGGER subscriptions_no_delete
BEFORE DELETE ON subscriptions
BEGIN
  SELECT RAISE(ABORT, 'subscriptions are never deleted');
END;

-- O plano só passa a Premium com uma assinatura ativa (RB55, INV-001).
CREATE TRIGGER users_premium_requires_active_subscription
BEFORE UPDATE OF plan ON users
WHEN NEW.plan = 'premium'
  AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = NEW.id AND status = 'active')
BEGIN
  SELECT RAISE(ABORT, 'premium plan requires an active subscription');
END;
