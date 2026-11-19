-- SPEC-012: palpites. No máximo um por participação e partida (INV-001), de uma única
-- modalidade (INV-002): resultado (home, draw, away) ou placar exato (0 a 99 para cada lado).
-- Os pontos ficam vazios até a apuração (SPEC-014, INV-013).
CREATE TABLE predictions (
  id TEXT PRIMARY KEY,
  participation_id TEXT NOT NULL REFERENCES pool_participations (id),
  match_id TEXT NOT NULL REFERENCES sports_matches (id),
  type TEXT NOT NULL CHECK (type IN ('result', 'exact_score')),
  predicted_outcome TEXT CHECK (predicted_outcome IN ('home', 'draw', 'away')),
  home_goals INTEGER CHECK (home_goals BETWEEN 0 AND 99),
  away_goals INTEGER CHECK (away_goals BETWEEN 0 AND 99),
  points INTEGER,
  submitted_at TEXT NOT NULL,
  UNIQUE (participation_id, match_id),
  CHECK (
    (type = 'result' AND predicted_outcome IS NOT NULL AND home_goals IS NULL AND away_goals IS NULL)
    OR (type = 'exact_score' AND predicted_outcome IS NULL AND home_goals IS NOT NULL AND away_goals IS NOT NULL)
  )
);

CREATE INDEX predictions_match ON predictions (match_id);
