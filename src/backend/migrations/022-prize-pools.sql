-- SPEC-026: montante da premiação, apurado e fixado uma única vez por bolão na primeira solicitação,
-- para que todos os co-vencedores dividam o mesmo valor (INV-004, OPEN-144). Nunca muda.
CREATE TABLE pool_prize_pools (
  pool_id TEXT PRIMARY KEY REFERENCES pool_final_results (pool_id),
  amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents >= 0),
  currency TEXT NOT NULL CHECK (currency = 'BRL'),
  winner_count INTEGER NOT NULL CHECK (winner_count > 0),
  fixed_at TEXT NOT NULL
);

CREATE TRIGGER pool_prize_pools_fixed_update BEFORE UPDATE ON pool_prize_pools
BEGIN SELECT RAISE(ABORT, 'prize pools are fixed'); END;
CREATE TRIGGER pool_prize_pools_fixed_delete BEFORE DELETE ON pool_prize_pools
BEGIN SELECT RAISE(ABORT, 'prize pools are fixed'); END;
