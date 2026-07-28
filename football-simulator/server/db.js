'use strict';

/* Хранилище на SQLite (модуль node:sqlite, встроен в Node 22+).
   Зачем отдельная база вместо JSON-файла:
     - запись идёт построчно, а не переписыванием всего файла;
     - WAL-журнал переживает обрыв питания без потери базы;
     - уникальность имени и каскадное удаление обеспечивает сама СУБД;
     - таблица лидеров строится по индексу, а не разбором каждого сохранения.

   Node 20 и старше модуля не имеет — там сервер сам откатится на JSON-хранилище
   (см. createStore в конце файла). */

const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = 1;

/* Последние пять результатов из сохранения — от старого к новому,
   как их рисует полоска формы в интерфейсе. */
function formOf(save) {
  const hist = save && Array.isArray(save.history) ? save.history : [];
  return hist.slice(0, 5).map(h => h && h.result).filter(r => r === 'w' || r === 'd' || r === 'l')
    .reverse().join('');
}

class SqliteStore {
  constructor(file) {
    const { DatabaseSync } = require('node:sqlite');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.file = file;
    this.db = new DatabaseSync(file);
    this.kind = 'sqlite';

    // WAL: читатели не блокируют писателя, а обрыв записи не рушит базу.
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.db.exec('PRAGMA foreign_keys = ON');

    this.migrate();
    this.prepareStatements();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        name_key      TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at    INTEGER NOT NULL,
        banned        INTEGER NOT NULL DEFAULT 0,
        ban_reason    TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

      CREATE TABLE IF NOT EXISTS saves (
        user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        payload    TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        -- Поля ниже продублированы из сохранения, чтобы таблица лидеров
        -- строилась по индексу, а не разбором JSON каждого игрока.
        club_name  TEXT,
        division   INTEGER,
        season     INTEGER,
        trophies   INTEGER NOT NULL DEFAULT 0,
        wins       INTEGER NOT NULL DEFAULT 0,
        goals      INTEGER NOT NULL DEFAULT 0,
        rating     INTEGER NOT NULL DEFAULT 0,
        -- Последние пять результатов строкой вида "wwdlw": на экране вызова
        -- видно форму соперника, не вытаскивая наружу всё его сохранение.
        form       TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_saves_board
        ON saves(trophies DESC, division ASC, wins DESC, goals DESC);

      -- Вход в админку отдельный от игроков: свой токен и свой срок жизни,
      -- чтобы утечка игрового токена не давала прав на управление.
      CREATE TABLE IF NOT EXISTS admin_sessions (
        token_hash TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        client     TEXT NOT NULL DEFAULT ''
      );

      -- Журнал действий: что админ сделал, с кем и когда. Пишется всегда,
      -- иначе разобраться в спорной ситуации потом нечем.
      CREATE TABLE IF NOT EXISTS audit (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        at       INTEGER NOT NULL,
        action   TEXT NOT NULL,
        target   TEXT NOT NULL DEFAULT '',
        detail   TEXT NOT NULL DEFAULT '',
        client   TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at DESC);
    `);

    // Колонки появились позже схемы v1 — на старой базе добавляем на месте.
    const cols = this.db.prepare('PRAGMA table_info(saves)').all().map(c => c.name);
    if (!cols.includes('rating')) {
      this.db.exec('ALTER TABLE saves ADD COLUMN rating INTEGER NOT NULL DEFAULT 0');
    }
    if (!cols.includes('form')) {
      this.db.exec("ALTER TABLE saves ADD COLUMN form TEXT NOT NULL DEFAULT ''");
    }
    const ucols = this.db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
    if (!ucols.includes('banned')) {
      this.db.exec('ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0');
    }
    if (!ucols.includes('ban_reason')) {
      this.db.exec("ALTER TABLE users ADD COLUMN ban_reason TEXT NOT NULL DEFAULT ''");
    }

    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
    if (!row) {
      this.db.prepare("INSERT INTO meta(key, value) VALUES('schema_version', ?)")
        .run(String(SCHEMA_VERSION));
    }
  }

  prepareStatements() {
    const d = this.db;
    this.q = {
      userByKey:   d.prepare('SELECT * FROM users WHERE name_key = ?'),
      userById:    d.prepare('SELECT * FROM users WHERE id = ?'),
      insertUser:  d.prepare(`INSERT INTO users(id, name, name_key, password_hash, created_at)
                              VALUES(?, ?, ?, ?, ?)`),
      deleteUser:  d.prepare('DELETE FROM users WHERE id = ?'),
      countUsers:  d.prepare('SELECT COUNT(*) AS n FROM users'),
      allUsers:    d.prepare('SELECT * FROM users'),

      insertSession: d.prepare(`INSERT INTO sessions(token_hash, user_id, created_at, expires_at)
                                VALUES(?, ?, ?, ?)`),
      sessionByHash: d.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
      deleteSession: d.prepare('DELETE FROM sessions WHERE token_hash = ?'),
      deleteUserSessions: d.prepare('DELETE FROM sessions WHERE user_id = ?'),
      purgeSessions: d.prepare('DELETE FROM sessions WHERE expires_at < ?'),
      countSessions: d.prepare('SELECT COUNT(*) AS n FROM sessions'),
      allSessions:   d.prepare('SELECT * FROM sessions'),

      saveByUser: d.prepare('SELECT * FROM saves WHERE user_id = ?'),
      upsertSave: d.prepare(`
        INSERT INTO saves(user_id, payload, updated_at, club_name, division, season,
                          trophies, wins, goals, rating, form)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          payload = excluded.payload, updated_at = excluded.updated_at,
          club_name = excluded.club_name, division = excluded.division,
          season = excluded.season, trophies = excluded.trophies,
          wins = excluded.wins, goals = excluded.goals, rating = excluded.rating,
          form = excluded.form`),

      /* Соперники для товарищеских матчей: отдаём только витрину клуба,
         сохранение целиком наружу не уходит. */
      rivals: d.prepare(`
        SELECT u.id AS user_id, u.name AS manager, s.club_name, s.division,
               s.season, s.rating, s.trophies, s.form, s.updated_at
        FROM saves s JOIN users u ON u.id = s.user_id
        WHERE s.user_id != ? AND s.rating > 0
        ORDER BY s.updated_at DESC
        LIMIT ?`),
      board: d.prepare(`
        SELECT u.name AS manager, s.club_name, s.division, s.season,
               s.trophies, s.wins, s.goals
        FROM saves s JOIN users u ON u.id = s.user_id
        ORDER BY s.trophies DESC, s.division ASC, s.wins DESC, s.goals DESC
        LIMIT ?`)
    };
  }

  // ---------- пользователи ----------
  findUserByName(name) {
    const row = this.q.userByKey.get(String(name).trim().toLowerCase());
    return row ? this.toUser(row) : null;
  }

  findUserById(id) {
    const row = this.q.userById.get(id);
    return row ? this.toUser(row) : null;
  }

  toUser(row) {
    return {
      id: row.id, name: row.name, nameKey: row.name_key,
      passwordHash: row.password_hash, createdAt: row.created_at,
      banned: !!row.banned, banReason: row.ban_reason || ''
    };
  }

  addUser(user) {
    this.q.insertUser.run(user.id, user.name, user.nameKey, user.passwordHash, user.createdAt);
    return user;
  }

  /* Сессии и сохранение уходят каскадом — за целостностью следит сама база. */
  removeUser(id) { this.q.deleteUser.run(id); }

  userCount() { return this.q.countUsers.get().n; }

  // ---------- сессии ----------
  addSession(session) {
    this.q.insertSession.run(session.tokenHash, session.userId, session.createdAt, session.expiresAt);
    return session;
  }

  findSession(tokenHash) {
    const row = this.q.sessionByHash.get(tokenHash);
    if (!row) return null;
    if (row.expires_at < Date.now()) {
      this.removeSession(tokenHash);
      return null;
    }
    return {
      tokenHash: row.token_hash, userId: row.user_id,
      createdAt: row.created_at, expiresAt: row.expires_at
    };
  }

  removeSession(tokenHash) { this.q.deleteSession.run(tokenHash); }
  removeUserSessions(userId) { this.q.deleteUserSessions.run(userId); }
  purgeExpiredSessions() { this.q.purgeSessions.run(Date.now()); }

  // ---------- сохранения ----------
  getSave(userId) {
    const row = this.q.saveByUser.get(userId);
    if (!row) return null;
    try {
      return { save: JSON.parse(row.payload), updatedAt: row.updated_at };
    } catch (e) {
      return null;
    }
  }

  putSave(userId, save) {
    const updatedAt = Date.now();
    const stats = save && save.stats ? save.stats : {};
    this.q.upsertSave.run(
      userId, JSON.stringify(save), updatedAt,
      save && save.clubName ? String(save.clubName) : null,
      Number(save && save.division) || 2,
      Number(save && save.season) || 1,
      Array.isArray(save && save.trophies) ? save.trophies.length : 0,
      Number(stats.wins) || 0,
      Number(stats.goals) || 0,
      Number(save && save.rating) || 0,
      formOf(save)
    );
    return { save, updatedAt };
  }

  rivals(excludeUserId, limit) {
    return this.q.rivals.all(excludeUserId || '', limit || 30).map(r => ({
      id: r.user_id, manager: r.manager, clubName: r.club_name || '—',
      division: r.division || 2, season: r.season || 1,
      rating: r.rating, trophies: r.trophies,
      form: (r.form || '').split('').filter(c => 'wdl'.includes(c)),
      updatedAt: r.updated_at
    }));
  }

  leaderboard(limit) {
    return this.q.board.all(limit || 50).map(r => ({
      manager: r.manager,
      clubName: r.club_name || '—',
      division: r.division || 2,
      season: r.season || 1,
      trophies: r.trophies,
      wins: r.wins,
      goals: r.goals
    }));
  }

  // ---------- админка ----------
  /* Настройки живут в meta: их немного, а отдельная таблица ради трёх
     строк только усложнила бы перенос базы. */
  getSetting(key, fallback) {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get('set_' + key);
    return row ? row.value : fallback;
  }

  setSetting(key, value) {
    this.db.prepare(`INSERT INTO meta(key, value) VALUES(?, ?)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .run('set_' + key, String(value));
  }

  addAdminSession(s) {
    this.db.prepare(`INSERT INTO admin_sessions(token_hash, created_at, expires_at, client)
                     VALUES(?, ?, ?, ?)`)
      .run(s.tokenHash, s.createdAt, s.expiresAt, s.client || '');
    return s;
  }

  findAdminSession(tokenHash) {
    const row = this.db.prepare('SELECT * FROM admin_sessions WHERE token_hash = ?').get(tokenHash);
    if (!row) return null;
    if (row.expires_at < Date.now()) {
      this.removeAdminSession(tokenHash);
      return null;
    }
    return { tokenHash: row.token_hash, createdAt: row.created_at, expiresAt: row.expires_at };
  }

  removeAdminSession(tokenHash) {
    this.db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash);
  }

  purgeExpiredAdminSessions() {
    this.db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(Date.now());
  }

  logAction(entry) {
    this.db.prepare(`INSERT INTO audit(at, action, target, detail, client)
                     VALUES(?, ?, ?, ?, ?)`)
      .run(Date.now(), entry.action, entry.target || '', entry.detail || '', entry.client || '');
  }

  auditLog(limit) {
    return this.db.prepare('SELECT * FROM audit ORDER BY at DESC LIMIT ?')
      .all(limit || 100)
      .map(r => ({ id: r.id, at: r.at, action: r.action, target: r.target,
                   detail: r.detail, client: r.client }));
  }

  /* Сводка для панели. Всё считается запросами, а не разбором сохранений. */
  overview() {
    const one = (sql, ...args) => Object.values(this.db.prepare(sql).get(...args) || {})[0] || 0;
    const day = Date.now() - 24 * 60 * 60 * 1000;
    const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return {
      users: one('SELECT COUNT(*) FROM users'),
      banned: one('SELECT COUNT(*) FROM users WHERE banned = 1'),
      newToday: one('SELECT COUNT(*) FROM users WHERE created_at > ?', day),
      sessions: one('SELECT COUNT(*) FROM sessions WHERE expires_at > ?', Date.now()),
      clubs: one('SELECT COUNT(*) FROM saves'),
      activeDay: one('SELECT COUNT(*) FROM saves WHERE updated_at > ?', day),
      activeWeek: one('SELECT COUNT(*) FROM saves WHERE updated_at > ?', week),
      matches: one('SELECT COALESCE(SUM(wins), 0) FROM saves'),
      goals: one('SELECT COALESCE(SUM(goals), 0) FROM saves'),
      trophies: one('SELECT COALESCE(SUM(trophies), 0) FROM saves'),
      avgRating: Math.round(one('SELECT COALESCE(AVG(rating), 0) FROM saves WHERE rating > 0')),
      dbBytes: (() => { try { return fs.statSync(this.file).size; } catch (e) { return 0; } })()
    };
  }

  /* Список игроков с поиском и постраничностью. Поиск идёт и по имени
     менеджера, и по названию клуба — админ помнит то одно, то другое. */
  players({ query, limit, offset, sort } = {}) {
    const q = '%' + String(query || '').trim().toLowerCase() + '%';
    const orders = {
      recent:   's.updated_at DESC',
      new:      'u.created_at DESC',
      name:     'u.name_key ASC',
      rating:   's.rating DESC',
      trophies: 's.trophies DESC, s.wins DESC'
    };
    const order = orders[sort] || orders.recent;
    const where = `WHERE u.name_key LIKE ? OR LOWER(COALESCE(s.club_name, '')) LIKE ?`;
    const rows = this.db.prepare(`
      SELECT u.id, u.name, u.created_at, u.banned, u.ban_reason,
             s.club_name, s.division, s.season, s.rating, s.trophies,
             s.wins, s.goals, s.updated_at
      FROM users u LEFT JOIN saves s ON s.user_id = u.id
      ${where}
      ORDER BY ${order} NULLS LAST
      LIMIT ? OFFSET ?`).all(q, q, limit || 25, offset || 0);
    const total = Object.values(this.db.prepare(`
      SELECT COUNT(*) FROM users u LEFT JOIN saves s ON s.user_id = u.id ${where}`)
      .get(q, q))[0];
    return { total, rows: rows.map(r => this.toPlayerRow(r)) };
  }

  toPlayerRow(r) {
    return {
      id: r.id, name: r.name, createdAt: r.created_at,
      banned: !!r.banned, banReason: r.ban_reason || '',
      clubName: r.club_name || null,
      division: r.division || null, season: r.season || null,
      rating: r.rating || 0, trophies: r.trophies || 0,
      wins: r.wins || 0, goals: r.goals || 0,
      updatedAt: r.updated_at || null
    };
  }

  /* Карточка игрока: строка списка плюс то, что лежит в самом сохранении. */
  playerDetail(id) {
    const row = this.db.prepare(`
      SELECT u.id, u.name, u.created_at, u.banned, u.ban_reason,
             s.club_name, s.division, s.season, s.rating, s.trophies,
             s.wins, s.goals, s.updated_at
      FROM users u LEFT JOIN saves s ON s.user_id = u.id
      WHERE u.id = ?`).get(id);
    if (!row) return null;
    const base = this.toPlayerRow(row);
    const entry = this.getSave(id);
    const save = entry ? entry.save : null;
    base.sessions = Object.values(this.db.prepare(
      'SELECT COUNT(*) FROM sessions WHERE user_id = ? AND expires_at > ?').get(id, Date.now()))[0];
    base.save = save && {
      coins: save.coins || 0,
      level: save.level || 1,
      xp: save.xp || 0,
      squad: Array.isArray(save.squad) ? save.squad.length : 0,
      created: !!save.created,
      formation: save.formation || '—',
      tacticStyle: save.tacticStyle || '—',
      history: Array.isArray(save.history) ? save.history.length : 0,
      stats: save.stats || {}
    };
    return base;
  }

  setBanned(id, banned, reason) {
    this.db.prepare('UPDATE users SET banned = ?, ban_reason = ? WHERE id = ?')
      .run(banned ? 1 : 0, reason || '', id);
    // Блокировка должна действовать сразу, а не после истечения токена.
    if (banned) this.removeUserSessions(id);
  }

  setPasswordHash(id, hash) {
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
    this.removeUserSessions(id);
  }

  /* Правка сохранения из админки. Меняем только разрешённые поля и
     перезаписываем витрину, чтобы список и таблица лидеров совпали с игрой. */
  patchSave(id, patch) {
    const entry = this.getSave(id);
    if (!entry) return null;
    const save = entry.save;
    const num = (v, min, max) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
    };
    if (patch.coins !== undefined) {
      const v = num(patch.coins, 0, 99999999); if (v !== null) save.coins = v;
    }
    if (patch.level !== undefined) {
      const v = num(patch.level, 1, 999); if (v !== null) save.level = v;
    }
    if (patch.division !== undefined) {
      const v = num(patch.division, 1, 2); if (v !== null) save.division = v;
    }
    if (patch.season !== undefined) {
      const v = num(patch.season, 1, 9999); if (v !== null) save.season = v;
    }
    if (patch.clubName !== undefined) {
      const name = String(patch.clubName).trim().slice(0, 18);
      if (name) save.clubName = name;
    }
    return this.putSave(id, save);
  }

  // ---------- служебное ----------
  flush() { /* SQLite пишет сразу, отдельный сброс не нужен */ }

  close() { try { this.db.close(); } catch (e) {} }

  /* Однократный перенос данных из старого JSON-файла. Вызывается только
     когда база пуста, поэтому повторный запуск ничего не задваивает. */
  importFromJson(jsonFile) {
    if (this.userCount() > 0) return 0;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    } catch (e) {
      return 0;
    }
    if (!data || !Array.isArray(data.users) || !data.users.length) return 0;

    this.db.exec('BEGIN');
    try {
      for (const u of data.users) {
        this.addUser({
          id: u.id, name: u.name,
          nameKey: u.nameKey || String(u.name).toLowerCase(),
          passwordHash: u.passwordHash, createdAt: u.createdAt || Date.now()
        });
      }
      for (const s of data.sessions || []) {
        if (!s.tokenHash || !s.userId) continue;
        try { this.addSession(s); } catch (e) { /* сессия без пользователя — пропускаем */ }
      }
      for (const [userId, entry] of Object.entries(data.saves || {})) {
        if (!entry || !entry.save) continue;
        try { this.putSave(userId, entry.save); } catch (e) {}
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return data.users.length;
  }
}

/* Выбирает хранилище: SQLite, если доступен модуль, иначе JSON-файл.
   Так сервер запускается и на Node 20, где node:sqlite ещё нет. */
function createStore(dbFile) {
  const sqliteFile = dbFile.replace(/\.json$/i, '') + '.sqlite';
  try {
    require('node:sqlite');
  } catch (e) {
    const { Store } = require('./store');
    const store = new Store(dbFile);
    store.kind = 'json';
    console.warn('[db] node:sqlite недоступен (Node ' + process.version +
                 '), используется JSON-хранилище. Для базы нужен Node 22+.');
    return store;
  }

  const store = new SqliteStore(sqliteFile);
  const moved = store.importFromJson(dbFile);
  if (moved) {
    const backup = dbFile + '.migrated';
    try { fs.renameSync(dbFile, backup); } catch (e) {}
    console.log(`[db] Перенесено из JSON в SQLite: ${moved} аккаунт(ов). ` +
                `Старый файл сохранён как ${backup}`);
  }
  return store;
}

module.exports = { SqliteStore, createStore, SCHEMA_VERSION };
