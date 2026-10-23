ALTER TABLE technical_events
  ADD COLUMN level TEXT NOT NULL DEFAULT 'info';

ALTER TABLE technical_events
  ADD COLUMN component TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE technical_events
  ADD COLUMN correlation_id TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE technical_events
  ADD COLUMN outcome TEXT NOT NULL DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS technical_events_correlation_id
  ON technical_events (correlation_id);
