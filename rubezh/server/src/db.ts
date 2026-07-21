import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/rubezh.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function ensureColumn(table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      callsign TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      experience INTEGER NOT NULL DEFAULT 0,
      tutorial_step INTEGER NOT NULL DEFAULT 0,
      tutorial_done INTEGER NOT NULL DEFAULT 0,
      state_version INTEGER NOT NULL DEFAULT 1,
      last_seen_at TEXT NOT NULL,
      last_offline_claim_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS resources (
      user_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      amount REAL NOT NULL,
      PRIMARY KEY (user_id, resource_type),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS buildings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      state TEXT NOT NULL DEFAULT 'idle',
      upgrade_ends_at TEXT,
      stored REAL NOT NULL DEFAULT 0,
      last_tick_at TEXT NOT NULL,
      assigned_specialist_id TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS specialists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      rarity TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      management INTEGER NOT NULL,
      speed INTEGER NOT NULL,
      reliability INTEGER NOT NULL,
      assigned_building_id TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      condition INTEGER NOT NULL DEFAULT 100,
      capacity INTEGER NOT NULL,
      speed INTEGER NOT NULL,
      reliability INTEGER NOT NULL,
      fuel_use INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      difficulty INTEGER NOT NULL,
      duration_sec INTEGER NOT NULL,
      cost_json TEXT NOT NULL,
      reward_json TEXT NOT NULL,
      xp INTEGER NOT NULL,
      required_building TEXT,
      vehicle_id TEXT,
      started_at TEXT,
      ends_at TEXT,
      quality TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      quest_def_id TEXT NOT NULL,
      title TEXT NOT NULL,
      metric TEXT NOT NULL,
      target INTEGER NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      claimed INTEGER NOT NULL DEFAULT 0,
      reward_json TEXT NOT NULL,
      day_key TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quest_counters (
      user_id TEXT PRIMARY KEY,
      requests_completed INTEGER NOT NULL DEFAULT 0,
      upgrades INTEGER NOT NULL DEFAULT 0,
      collects INTEGER NOT NULL DEFAULT 0,
      offline_claims INTEGER NOT NULL DEFAULT 0,
      assignments INTEGER NOT NULL DEFAULT 0,
      day_key TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS resource_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      amount_before REAL NOT NULL,
      delta REAL NOT NULL,
      amount_after REAL NOT NULL,
      reason TEXT NOT NULL,
      source_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS operations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      def_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      score REAL,
      result_label TEXT,
      reward_json TEXT NOT NULL,
      started_at TEXT,
      ends_at TEXT,
      claimed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS achievements (
      user_id TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      unlocked INTEGER NOT NULL DEFAULT 0,
      claimed INTEGER NOT NULL DEFAULT 0,
      unlocked_at TEXT,
      PRIMARY KEY (user_id, achievement_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS player_stats (
      user_id TEXT PRIMARY KEY,
      requests_total INTEGER NOT NULL DEFAULT 0,
      collects_total INTEGER NOT NULL DEFAULT 0,
      operations_total INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS automation (
      user_id TEXT PRIMARY KEY,
      auto_collect INTEGER NOT NULL DEFAULT 0,
      auto_simple_requests INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS story_progress (
      user_id TEXT PRIMARY KEY,
      chapter INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS active_effects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      effect TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS clans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      tag TEXT NOT NULL UNIQUE,
      motto TEXT NOT NULL DEFAULT '',
      commander_id TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      weekly_goal INTEGER NOT NULL DEFAULT 200,
      weekly_progress INTEGER NOT NULL DEFAULT 0,
      week_key TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clan_members (
      clan_id TEXT NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      contribution INTEGER NOT NULL DEFAULT 0,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (clan_id, user_id),
      FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS clan_messages (
      id TEXT PRIMARY KEY,
      clan_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      callsign TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS clan_helps (
      id TEXT PRIMARY KEY,
      from_user_id TEXT NOT NULL,
      to_user_id TEXT NOT NULL,
      building_id TEXT,
      day_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(from_user_id, to_user_id, day_key)
    );

    CREATE TABLE IF NOT EXISTS race_scores (
      user_id TEXT NOT NULL,
      day_key TEXT NOT NULL,
      requests INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS region_state (
      user_id TEXT PRIMARY KEY,
      stability INTEGER NOT NULL DEFAULT 62,
      last_event TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS region_nodes (
      user_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      PRIMARY KEY (user_id, node_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  ensureColumn('users', 'story_chapter', 'story_chapter INTEGER NOT NULL DEFAULT 1');
  ensureColumn('users', 'speed_boost_until', 'speed_boost_until TEXT');
  ensureColumn('users', 'clan_id', 'clan_id TEXT');
  ensureColumn('users', 'last_auto_action', 'last_auto_action TEXT');
  ensureColumn('quest_counters', 'operations', 'operations INTEGER NOT NULL DEFAULT 0');
  ensureColumn('quest_counters', 'clan_helps', 'clan_helps INTEGER NOT NULL DEFAULT 0');
  ensureColumn('player_stats', 'helps_sent', 'helps_sent INTEGER NOT NULL DEFAULT 0');
  ensureColumn('player_stats', 'repairs_total', 'repairs_total INTEGER NOT NULL DEFAULT 0');
  ensureColumn('story_progress', 'objective_done', 'objective_done INTEGER NOT NULL DEFAULT 0');
  ensureColumn('story_progress', 'claimed_reward_chapter', 'claimed_reward_chapter INTEGER NOT NULL DEFAULT 0');
  ensureColumn('race_scores', 'reward_claimed', 'reward_claimed INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'password_hash', 'password_hash TEXT');
}
