CREATE TABLE IF NOT EXISTS oauth_tokens (
  id INTEGER PRIMARY KEY,
  user_id TEXT,
  refresh_token TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  type TEXT CHECK(type IN ('ADD','REMOVE','MOVE','UNDO')),
  source_playlist_id TEXT,
  target_playlist_id TEXT,
  status TEXT CHECK(status IN ('pending','running','success','partial','failed')) DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME,
  parent_action_id TEXT
);

CREATE TABLE IF NOT EXISTS action_items (
  id TEXT PRIMARY KEY,
  action_id TEXT,
  type TEXT,
  video_id TEXT,
  source_playlist_id TEXT,
  target_playlist_id TEXT,
  source_playlist_item_id TEXT,
  target_playlist_item_id TEXT,
  position INTEGER,
  status TEXT CHECK(status IN ('pending','success','failed')) DEFAULT 'pending',
  error_code TEXT,
  error_message TEXT,
  FOREIGN KEY(action_id) REFERENCES actions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_actions_user_created_at ON actions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_items_action ON action_items(action_id);