-- SPEC-027: notificações dentro da aplicação (único canal; nenhum envio externo, OPEN-32).
-- event_key é a chave natural do evento e do destinatário: o mesmo evento nunca gera duas
-- notificações para o mesmo usuário (INV-002).
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  type TEXT NOT NULL CHECK (type IN (
    'entry_approved', 'result_recorded', 'result_corrected', 'round_closed',
    'medal_awarded', 'subscription_changed', 'prize_completed'
  )),
  event_key TEXT NOT NULL UNIQUE,
  message TEXT NOT NULL,
  pool_id TEXT REFERENCES pools (id),
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  simulated INTEGER NOT NULL DEFAULT 0 CHECK (simulated IN (0, 1)),
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE INDEX notifications_user_created ON notifications (user_id, created_at DESC, id);
CREATE INDEX notifications_user_unread ON notifications (user_id) WHERE read_at IS NULL;

-- Lida não volta a não lida (INV-010); a notificação em si não muda nem é apagada.
CREATE TRIGGER notifications_read_is_final
BEFORE UPDATE ON notifications
WHEN OLD.read_at IS NOT NULL OR NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id
  OR NEW.message IS NOT OLD.message OR NEW.event_key IS NOT OLD.event_key OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'notifications only change from unread to read');
END;

-- Onde a geração parou: a varredura não é retroativa e começa nos eventos posteriores a esta
-- migração (OPEN-155). Eventos que falharam ficam para o ciclo seguinte (A3).
CREATE TABLE notification_cursor (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_audit_id INTEGER NOT NULL,
  last_medal_rowid INTEGER NOT NULL
);
INSERT INTO notification_cursor (id, last_audit_id, last_medal_rowid)
VALUES (1, (SELECT COALESCE(MAX(id), 0) FROM audit_records), (SELECT COALESCE(MAX(rowid), 0) FROM pool_medals));

CREATE TABLE notification_retries (
  source TEXT NOT NULL CHECK (source IN ('audit', 'medal')),
  source_id INTEGER NOT NULL,
  PRIMARY KEY (source, source_id)
);
