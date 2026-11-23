-- SPEC-023: pedido formal de devolução da taxa de entrada por quem saiu do bolão, com a decisão
-- administrativa. Um pedido por participação e por movimentação de origem (INV-006); a decisão é única
-- e final (INV-007). A devolução em si é da SPEC-024, que referencia o pedido aprovado.
CREATE TABLE refund_requests (
  id TEXT PRIMARY KEY,
  participation_id TEXT NOT NULL UNIQUE REFERENCES pool_participations (id),
  pool_id TEXT NOT NULL REFERENCES pools (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  source_movement_id TEXT NOT NULL UNIQUE REFERENCES financial_movements (id),
  amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency = 'BRL'),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TEXT NOT NULL,
  decided_by TEXT REFERENCES users (id),
  decided_at TEXT,
  CHECK ((status = 'pending') = (decided_by IS NULL)),
  CHECK ((decided_by IS NULL) = (decided_at IS NULL)),
  CHECK (decided_by IS NULL OR decided_by <> user_id)
);

CREATE INDEX refund_requests_pool_status ON refund_requests (pool_id, status, requested_at);
CREATE INDEX refund_requests_user ON refund_requests (user_id, requested_at);

-- Pedido decidido não muda; a identidade do pedido nunca muda; nada é apagado.
CREATE TRIGGER refund_requests_decisions_are_final
BEFORE UPDATE ON refund_requests
WHEN OLD.status <> 'pending'
BEGIN
  SELECT RAISE(ABORT, 'refund request decisions are final');
END;

CREATE TRIGGER refund_requests_identity_is_immutable
BEFORE UPDATE OF id, participation_id, pool_id, user_id, source_movement_id, amount_cents, currency, requested_at ON refund_requests
BEGIN
  SELECT RAISE(ABORT, 'refund request identity is immutable');
END;

CREATE TRIGGER refund_requests_no_delete
BEFORE DELETE ON refund_requests
BEGIN
  SELECT RAISE(ABORT, 'refund requests are never deleted');
END;
