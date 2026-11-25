-- SPEC-030: premiação por pódio.

-- 1. Novos modelos de premiação (RB69). O SQLite não altera restrições CHECK, então a tabela de
--    bolões é reconstruída com o mesmo conteúdo, índices e gatilhos de imutabilidade.
CREATE TABLE pools_rebuilt (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users (id),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  starts_on TEXT NOT NULL CHECK (starts_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  ends_on TEXT NOT NULL CHECK (ends_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  entry_fee_cents INTEGER NOT NULL CHECK (entry_fee_cents = 0 OR entry_fee_cents BETWEEN 100 AND 50000),
  prize_model TEXT NOT NULL CHECK (prize_model IN ('winner_takes_all', 'podium_50_30_20', 'podium_60_30_10', 'podium_70_20_10')),
  tiebreaker TEXT NOT NULL CHECK (tiebreaker IN ('exact_scores', 'correct_results', 'last_round_points')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  live_results INTEGER NOT NULL CHECK (live_results IN (0, 1)),
  created_at TEXT NOT NULL, ended_at TEXT,
  CHECK (ends_on >= starts_on)
);

INSERT INTO pools_rebuilt (
  id, creator_id, name, starts_on, ends_on, entry_fee_cents, prize_model, tiebreaker, status, live_results, created_at, ended_at
)
SELECT id, creator_id, name, starts_on, ends_on, entry_fee_cents, prize_model, tiebreaker, status, live_results, created_at, ended_at
FROM pools;

DROP TABLE pools;
ALTER TABLE pools_rebuilt RENAME TO pools;
CREATE INDEX pools_creator_status ON pools (creator_id, status);

CREATE TRIGGER pools_rules_are_immutable
BEFORE UPDATE OF creator_id, name, starts_on, ends_on, entry_fee_cents, prize_model, tiebreaker, created_at ON pools
BEGIN
  SELECT RAISE(ABORT, 'pool rules are immutable');
END;

CREATE TRIGGER pools_live_results_can_only_be_removed
BEFORE UPDATE OF live_results ON pools
WHEN NOT (OLD.live_results = 1 AND NEW.live_results = 0)
BEGIN
  SELECT RAISE(ABORT, 'pool rules are immutable');
END;

CREATE TRIGGER pools_ended_is_final
BEFORE UPDATE OF status, ended_at ON pools
WHEN OLD.status = 'ended' AND (NEW.status <> 'ended' OR NEW.ended_at IS NOT OLD.ended_at)
BEGIN
  SELECT RAISE(ABORT, 'ended pools are final');
END;

-- 2. Parte de cada premiado, gravada junto com o montante na primeira solicitação e imutável
--    (SPEC-030 INV-007). Bolões com montante fixado antes desta migration não têm partes gravadas e
--    continuam com a divisão igual entre os vencedores (INV-008).
CREATE TABLE pool_prize_shares (
  pool_id TEXT NOT NULL REFERENCES pool_prize_pools (pool_id),
  participation_id TEXT NOT NULL REFERENCES pool_participations (id),
  place INTEGER NOT NULL CHECK (place BETWEEN 1 AND 3),
  percent_basis_points INTEGER NOT NULL CHECK (percent_basis_points BETWEEN 1 AND 10000),
  amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents >= 0),
  PRIMARY KEY (pool_id, participation_id)
);

CREATE TRIGGER pool_prize_shares_fixed_update BEFORE UPDATE ON pool_prize_shares
BEGIN SELECT RAISE(ABORT, 'prize shares are fixed'); END;
CREATE TRIGGER pool_prize_shares_fixed_delete BEFORE DELETE ON pool_prize_shares
BEGIN SELECT RAISE(ABORT, 'prize shares are fixed'); END;
