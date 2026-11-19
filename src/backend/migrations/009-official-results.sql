-- SPEC-013: resultado oficial das partidas, gravado somente pela sincronização com o provedor.
-- result_version é uma sequência global crescente: cada registro ou correção de resultado recebe
-- o próximo valor, e a pontuação (SPEC-014) lê as partidas com versão maior que a última processada.
ALTER TABLE sports_matches ADD COLUMN home_score INTEGER CHECK (home_score BETWEEN 0 AND 99);
ALTER TABLE sports_matches ADD COLUMN away_score INTEGER CHECK (away_score BETWEEN 0 AND 99);
ALTER TABLE sports_matches ADD COLUMN result_version INTEGER NOT NULL DEFAULT 0 CHECK (result_version >= 0);
ALTER TABLE sports_matches ADD COLUMN result_recorded_at TEXT;

CREATE INDEX sports_matches_result_version ON sports_matches (result_version);

-- Placar oficial só existe em partida encerrada, e com os dois lados (INV-002, INV-012).
CREATE TRIGGER sports_matches_score_only_when_finished
BEFORE UPDATE OF status, home_score, away_score ON sports_matches
WHEN (NEW.home_score IS NULL) <> (NEW.away_score IS NULL)
  OR (NEW.home_score IS NOT NULL AND NEW.status <> 'finished')
BEGIN
  SELECT RAISE(ABORT, 'official score requires a finished match');
END;

-- A versão do resultado só cresce (INV-009).
CREATE TRIGGER sports_matches_result_version_grows
BEFORE UPDATE OF result_version ON sports_matches
WHEN NEW.result_version < OLD.result_version
BEGIN
  SELECT RAISE(ABORT, 'result version must grow');
END;

-- Última divergência auditada de partida cujos bolões estão todos encerrados (OPEN-04),
-- para que a mesma divergência não seja auditada de novo a cada execução (INV-005).
CREATE TABLE sports_result_divergences (
  match_id TEXT PRIMARY KEY REFERENCES sports_matches (id),
  home_score INTEGER NOT NULL CHECK (home_score BETWEEN 0 AND 99),
  away_score INTEGER NOT NULL CHECK (away_score BETWEEN 0 AND 99),
  recorded_at TEXT NOT NULL
);

-- Situação da última sincronização de resultados (técnica).
CREATE TABLE results_sync_metadata (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_attempt_at TEXT NOT NULL,
  last_success_at TEXT,
  last_attempt_result TEXT NOT NULL CHECK (last_attempt_result IN ('success', 'failure')),
  last_failure_code TEXT
);
