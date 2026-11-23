-- SPEC-021: dado ao vivo das partidas, guardado à parte do resultado oficial (INV-001, OPEN-100).
-- Uma linha por partida com a última leitura válida; nada aqui é lido pela pontuação, pelo
-- ranking, pelas medalhas ou pelo encerramento.
CREATE TABLE sports_live_scores (
  match_id TEXT PRIMARY KEY REFERENCES sports_matches (id),
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'in_progress', 'finished', 'postponed', 'cancelled')),
  home_score INTEGER CHECK (home_score BETWEEN 0 AND 99),
  away_score INTEGER CHECK (away_score BETWEEN 0 AND 99),
  -- Instante da leitura no provedor (UTC); leitura mais antiga que esta é descartada (INV-010).
  observed_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('simulated', 'api-football')),
  -- Placar parcial só com os dois lados, e nunca em partida adiada ou cancelada (CA-14).
  CHECK ((home_score IS NULL) = (away_score IS NULL)),
  CHECK (home_score IS NULL OR status IN ('in_progress', 'finished'))
);
