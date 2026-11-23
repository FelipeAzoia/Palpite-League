-- SPEC-018: núcleo financeiro de teste.
-- Movimentação financeira (RF31, RB53, RNF10). Valores em centavos inteiros, em BRL (OPEN-84).
-- A chave de operação é a referência de negócio mais o número da tentativa, única em todo o sistema.
CREATE TABLE financial_movements (
  id TEXT PRIMARY KEY,
  operation_key TEXT NOT NULL UNIQUE,
  business_reference TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  type TEXT NOT NULL CHECK (type IN ('entry_fee', 'subscription', 'refund', 'payout')),
  amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents > 0),
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

CREATE INDEX financial_movements_user_created ON financial_movements (user_id, created_at DESC);
CREATE INDEX financial_movements_pending ON financial_movements (status, created_at);

-- Estados finais não são reabertos nem reescritos; nenhuma movimentação é removida (INV-003, INV-004).
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
