-- SPEC-025: encerramento automático e resultado final.
-- O instante do encerramento fica no próprio bolão; a classificação final e os vencedores ficam
-- registrados uma única vez, congelados (OPEN-138). Nada disso é escrito por usuário.
ALTER TABLE pools ADD COLUMN ended_at TEXT;

-- Encerramento único e irreversível (INV-003): bolão encerrado não reabre e o instante não muda.
CREATE TRIGGER pools_ended_is_final
BEFORE UPDATE OF status, ended_at ON pools
WHEN OLD.status = 'ended' AND (NEW.status <> 'ended' OR NEW.ended_at IS NOT OLD.ended_at)
BEGIN
  SELECT RAISE(ABORT, 'ended pools are final');
END;

CREATE TABLE pool_final_results (
  pool_id TEXT PRIMARY KEY REFERENCES pools (id),
  ended_at TEXT NOT NULL,
  tiebreaker TEXT NOT NULL,
  eligible_count INTEGER NOT NULL CHECK (eligible_count >= 0),
  winner_count INTEGER NOT NULL CHECK (winner_count >= 0),
  -- Ausência de vencedor registrada explicitamente (INV-006).
  no_winner_reason TEXT CHECK (no_winner_reason IS NULL OR no_winner_reason IN ('no_eligible', 'zero_points')),
  CHECK ((winner_count = 0) = (no_winner_reason IS NOT NULL))
);

CREATE TABLE pool_final_standings (
  pool_id TEXT NOT NULL REFERENCES pool_final_results (pool_id),
  participation_id TEXT NOT NULL REFERENCES pool_participations (id),
  position INTEGER NOT NULL CHECK (position > 0),
  total_points INTEGER NOT NULL CHECK (total_points >= 0),
  tiebreak_value INTEGER NOT NULL CHECK (tiebreak_value >= 0),
  winner INTEGER NOT NULL CHECK (winner IN (0, 1)),
  PRIMARY KEY (pool_id, participation_id),
  CHECK (winner = 0 OR position = 1)
);

-- O resultado final é congelado (INV-008): nunca alterado nem apagado.
CREATE TRIGGER pool_final_results_frozen_update BEFORE UPDATE ON pool_final_results
BEGIN SELECT RAISE(ABORT, 'final results are frozen'); END;
CREATE TRIGGER pool_final_results_frozen_delete BEFORE DELETE ON pool_final_results
BEGIN SELECT RAISE(ABORT, 'final results are frozen'); END;
CREATE TRIGGER pool_final_standings_frozen_update BEFORE UPDATE ON pool_final_standings
BEGIN SELECT RAISE(ABORT, 'final standings are frozen'); END;
CREATE TRIGGER pool_final_standings_frozen_delete BEFORE DELETE ON pool_final_standings
BEGIN SELECT RAISE(ABORT, 'final standings are frozen'); END;
