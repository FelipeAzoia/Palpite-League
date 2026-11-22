-- SPEC-018: núcleo financeiro de teste.
CREATE TABLE financial_movements (
  id TEXT PRIMARY KEY,
  operation_key TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('entry_fee', 'subscription', 'refund', 'payout')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'refused')),
  user_id TEXT NOT NULL REFERENCES users (id),
  origin TEXT NOT NULL CHECK (origin IN ('simulator', 'test_provider')),
  provider_id TEXT,
  operation_type TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  original_movement_id TEXT REFERENCES financial_movements (id),
  continuation_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT,
  refused_at TEXT
);

CREATE INDEX financial_movements_user_created ON financial_movements (user_id, created_at DESC);
CREATE INDEX financial_movements_pending ON financial_movements (status, created_at);
CREATE INDEX financial_movements_origin_operation ON financial_movements (operation_type, operation_id);
