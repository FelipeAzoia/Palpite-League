CREATE TABLE audit_records (
  id INTEGER PRIMARY KEY,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'system', 'anonymous')),
  actor_id TEXT,
  action TEXT NOT NULL CHECK (length(trim(action)) > 0),
  object_type TEXT NOT NULL CHECK (length(trim(object_type)) > 0),
  object_id TEXT NOT NULL CHECK (length(trim(object_id)) > 0),
  occurred_at TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('success', 'failure', 'denied')),
  origin TEXT,
  correlation_id TEXT NOT NULL CHECK (length(trim(correlation_id)) > 0),
  details_json TEXT,
  CHECK (
    (actor_type = 'user' AND actor_id IS NOT NULL AND length(trim(actor_id)) > 0)
    OR (actor_type IN ('system', 'anonymous') AND actor_id IS NULL)
  )
);

CREATE INDEX audit_records_object_history
  ON audit_records (object_type, object_id, occurred_at, id);

CREATE INDEX audit_records_actor_history
  ON audit_records (actor_type, actor_id, occurred_at, id);

CREATE TRIGGER audit_records_no_update
BEFORE UPDATE ON audit_records
BEGIN
  SELECT RAISE(ABORT, 'audit records are immutable');
END;

CREATE TRIGGER audit_records_no_delete
BEFORE DELETE ON audit_records
BEGIN
  SELECT RAISE(ABORT, 'audit records are immutable');
END;