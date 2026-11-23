-- SPEC-022: pagamento da taxa de entrada confirmado quando a participação já não podia ser
-- confirmada (saiu, rejeitada, bolão encerrado). A movimentação fica confirmada, a participação não
-- muda e o caso fica sinalizado aqui para tratamento administrativo, sem reembolso automático (OPEN-112).
CREATE TABLE entry_fee_late_payments (
  movement_id TEXT PRIMARY KEY REFERENCES financial_movements (id),
  participation_id TEXT NOT NULL REFERENCES pool_participations (id),
  pool_id TEXT NOT NULL REFERENCES pools (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  reason TEXT NOT NULL CHECK (reason IN ('left', 'rejected', 'pool_ended', 'already_confirmed', 'not_awaiting_payment')),
  flagged_at TEXT NOT NULL
);

CREATE INDEX entry_fee_late_payments_pool ON entry_fee_late_payments (pool_id, flagged_at);

CREATE TRIGGER entry_fee_late_payments_no_update
BEFORE UPDATE ON entry_fee_late_payments
BEGIN
  SELECT RAISE(ABORT, 'late payment flags are immutable');
END;

CREATE TRIGGER entry_fee_late_payments_no_delete
BEFORE DELETE ON entry_fee_late_payments
BEGIN
  SELECT RAISE(ABORT, 'late payment flags are never deleted');
END;
