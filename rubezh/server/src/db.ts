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
  `);
}
