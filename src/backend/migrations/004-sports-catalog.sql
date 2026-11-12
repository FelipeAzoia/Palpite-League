CREATE TABLE sports_teams (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  crest TEXT
);

CREATE TABLE sports_rounds (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL UNIQUE,
  number INTEGER NOT NULL UNIQUE CHECK (number > 0),
  starts_on TEXT,
  ends_on TEXT
);

CREATE TABLE sports_matches (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL UNIQUE,
  round_id TEXT NOT NULL REFERENCES sports_rounds (id),
  home_team_id TEXT NOT NULL REFERENCES sports_teams (id),
  away_team_id TEXT NOT NULL REFERENCES sports_teams (id),
  starts_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'in_progress', 'finished', 'postponed', 'cancelled')),
  CHECK (home_team_id <> away_team_id),
  CHECK (status = 'postponed' OR starts_at IS NOT NULL)
);

CREATE INDEX sports_matches_round ON sports_matches (round_id, starts_at);

CREATE TABLE sports_catalog_metadata (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  source TEXT NOT NULL CHECK (source IN ('simulated', 'api-football')),
  season INTEGER NOT NULL,
  last_attempt_at TEXT NOT NULL,
  last_success_at TEXT,
  last_attempt_result TEXT NOT NULL CHECK (last_attempt_result IN ('pending', 'success', 'failure'))
);
