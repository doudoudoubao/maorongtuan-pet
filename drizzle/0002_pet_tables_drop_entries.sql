DROP TABLE IF EXISTS entries;
--> statement-breakpoint
CREATE TABLE pet_state (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  stage INTEGER NOT NULL,
  level INTEGER NOT NULL,
  xp INTEGER NOT NULL,
  coins INTEGER NOT NULL,
  satiety INTEGER NOT NULL,
  happiness INTEGER NOT NULL,
  cleanliness INTEGER NOT NULL,
  energy INTEGER NOT NULL,
  intimacy INTEGER NOT NULL,
  inv_milk INTEGER NOT NULL,
  inv_cookie INTEGER NOT NULL,
  inv_cake INTEGER NOT NULL,
  total_actions INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_decay_at INTEGER NOT NULL,
  tasks_date TEXT NOT NULL,
  task_feed INTEGER NOT NULL,
  task_play INTEGER NOT NULL,
  task_care INTEGER NOT NULL,
  task_claimed INTEGER NOT NULL,
  last_checkin_date TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE care_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
