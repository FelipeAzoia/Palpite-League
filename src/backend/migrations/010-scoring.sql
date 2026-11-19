-- SPEC-014: pontuação automática.
-- scored_version: versão do resultado já pontuada; a partida é pendente enquanto
-- result_version > scored_version (OPEN-76). Nunca maior que a versão do resultado.
ALTER TABLE sports_matches ADD COLUMN scored_version INTEGER NOT NULL DEFAULT 0 CHECK (scored_version >= 0);

-- Pontuação acumulada da participação: soma dos pontos de seus palpites, valor derivado e
-- recalculado na mesma transação dos pontos (INV-008).
ALTER TABLE pool_participations ADD COLUMN total_points INTEGER NOT NULL DEFAULT 0 CHECK (total_points >= 0);

CREATE TRIGGER sports_matches_scored_version_bounded
BEFORE UPDATE OF scored_version ON sports_matches
WHEN NEW.scored_version > NEW.result_version
BEGIN
  SELECT RAISE(ABORT, 'scored version cannot exceed result version');
END;

-- Pontos permitidos: 0, 2 e 5, ou vazio enquanto não há resultado oficial (INV-001).
CREATE TRIGGER predictions_points_allowed_on_update
BEFORE UPDATE OF points ON predictions
WHEN NEW.points IS NOT NULL AND NEW.points NOT IN (0, 2, 5)
BEGIN
  SELECT RAISE(ABORT, 'prediction points must be 0, 2 or 5');
END;

CREATE INDEX pool_participations_pool_points ON pool_participations (pool_id, total_points);
