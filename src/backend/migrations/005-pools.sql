CREATE TABLE pools (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users (id),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  starts_on TEXT NOT NULL CHECK (starts_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  ends_on TEXT NOT NULL CHECK (ends_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  entry_fee_cents INTEGER NOT NULL CHECK (entry_fee_cents = 0 OR entry_fee_cents BETWEEN 100 AND 50000),
  prize_model TEXT NOT NULL CHECK (prize_model IN ('winner_takes_all')),
  tiebreaker TEXT NOT NULL CHECK (tiebreaker IN ('exact_scores', 'correct_results', 'last_round_points')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  live_results INTEGER NOT NULL CHECK (live_results IN (0, 1)),
  created_at TEXT NOT NULL,
  CHECK (ends_on >= starts_on)
);

CREATE INDEX pools_creator_status ON pools (creator_id, status);

-- As regras do bolão são imutáveis depois da criação (SPEC-007, INV-001); só o status evolui, em outras Specs.
CREATE TRIGGER pools_rules_are_immutable
BEFORE UPDATE OF creator_id, name, starts_on, ends_on, entry_fee_cents, prize_model, tiebreaker, live_results, created_at ON pools
BEGIN
  SELECT RAISE(ABORT, 'pool rules are immutable');
END;

CREATE TABLE pool_matches (
  pool_id TEXT NOT NULL REFERENCES pools (id),
  match_id TEXT NOT NULL REFERENCES sports_matches (id),
  PRIMARY KEY (pool_id, match_id)
);

-- O conjunto de partidas é fixado na criação (INV-015).
CREATE TRIGGER pool_matches_are_immutable_on_update
BEFORE UPDATE ON pool_matches
BEGIN
  SELECT RAISE(ABORT, 'pool matches are immutable');
END;

CREATE TRIGGER pool_matches_are_immutable_on_delete
BEFORE DELETE ON pool_matches
BEGIN
  SELECT RAISE(ABORT, 'pool matches are immutable');
END;

CREATE TABLE pool_participations (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL REFERENCES pools (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  role TEXT NOT NULL CHECK (role IN ('administrator', 'coadministrator', 'participant')),
  status TEXT NOT NULL CHECK (status IN ('requested', 'approved_awaiting_payment', 'confirmed', 'rejected')),
  payment_confirmed INTEGER NOT NULL CHECK (payment_confirmed IN (0, 1)),
  rules_accepted_at TEXT NOT NULL,
  joined_at TEXT,
  UNIQUE (pool_id, user_id)
);

CREATE INDEX pool_participations_user ON pool_participations (user_id, status);
