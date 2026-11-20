-- SPEC-016: medalhas da rodada, exclusivamente visuais (INV-006).
-- No máximo uma medalha por participação e rodada do bolão (INV-005); a medalha pertence ao bolão
-- da participação, nunca a outro bolão que compartilhe a mesma rodada oficial (INV-015).
CREATE TABLE pool_medals (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL REFERENCES pools (id),
  participation_id TEXT NOT NULL REFERENCES pool_participations (id),
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  awarded_at TEXT NOT NULL,
  UNIQUE (participation_id, round_number)
);

CREATE INDEX pool_medals_pool_round ON pool_medals (pool_id, round_number);
