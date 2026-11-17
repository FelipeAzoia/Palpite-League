-- O status "saiu" (left) da participação é previsto pela baseline (SPEC-008, CA-06; SPEC-009; SPEC-011).
-- O SQLite não altera restrições CHECK, então a tabela é reconstruída com o mesmo conteúdo.
CREATE TABLE pool_participations_rebuilt (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL REFERENCES pools (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  role TEXT NOT NULL CHECK (role IN ('administrator', 'coadministrator', 'participant')),
  status TEXT NOT NULL CHECK (status IN ('requested', 'approved_awaiting_payment', 'confirmed', 'rejected', 'left')),
  payment_confirmed INTEGER NOT NULL CHECK (payment_confirmed IN (0, 1)),
  rules_accepted_at TEXT NOT NULL,
  joined_at TEXT,
  UNIQUE (pool_id, user_id)
);

INSERT INTO pool_participations_rebuilt (
  id, pool_id, user_id, role, status, payment_confirmed, rules_accepted_at, joined_at
)
SELECT id, pool_id, user_id, role, status, payment_confirmed, rules_accepted_at, joined_at
FROM pool_participations;

DROP TABLE pool_participations;
ALTER TABLE pool_participations_rebuilt RENAME TO pool_participations;
CREATE INDEX pool_participations_user ON pool_participations (user_id, status);

-- O status "expirado" não é gravado: um convite ativo vencido é apresentado como expirado (INV-010).
CREATE TABLE pool_invites (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL REFERENCES pools (id),
  code_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'revoked')),
  created_by TEXT NOT NULL REFERENCES users (id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_by TEXT REFERENCES users (id),
  used_at INTEGER,
  revoked_at INTEGER,
  CHECK (expires_at > created_at),
  CHECK ((status = 'used') = (used_by IS NOT NULL AND used_at IS NOT NULL)),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);

CREATE INDEX pool_invites_pool ON pool_invites (pool_id, created_at);
