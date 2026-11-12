CREATE TABLE scenario_progress (
  scenario_key TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  step INTEGER NOT NULL,
  flags TEXT NOT NULL,
  moves INTEGER NOT NULL,
  completions INTEGER NOT NULL,
  ending_key TEXT,
  endings_seen TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
