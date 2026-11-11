CREATE TABLE password_recovery_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'used', 'invalidated')),
  CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX password_recovery_one_pending_per_user
  ON password_recovery_tokens (user_id)
  WHERE state = 'pending';
