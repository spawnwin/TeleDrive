'use strict';

const fs = require('node:fs');
const path = require('node:path');

/* Хранилище на JSON-файле с атомарной записью: файл сначала пишется рядом,
   затем переименовывается, поэтому оборванная запись не портит базу.
   Внешних зависимостей нет намеренно — сервер поднимается одной командой. */
class Store {
  constructor(file) {
    this.file = file;
    this.data = { users: [], sessions: [], saves: {} };
    this.writeTimer = null;
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = Object.assign(this.data, parsed);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.error('[store] не удалось прочитать базу, начинаем с пустой:', e.message);
      }
      this.flush();
    }
  }

  /* Запись откладывается на тик, чтобы серия изменений в одном запросе
     не приводила к нескольким обращениям к диску. */
  save() {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.flush();
    }, 50);
  }

  flush() {
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  userCount() { return this.data.users.length; }

  close() { this.flush(); }

  // ---------- пользователи ----------
  findUserByName(name) {
    const key = String(name).trim().toLowerCase();
    return this.data.users.find(u => u.nameKey === key) || null;
  }

  findUserById(id) {
    return this.data.users.find(u => u.id === id) || null;
  }

  addUser(user) {
    this.data.users.push(user);
    this.save();
    return user;
  }

  removeUser(id) {
    this.data.users = this.data.users.filter(u => u.id !== id);
    this.data.sessions = this.data.sessions.filter(s => s.userId !== id);
    delete this.data.saves[id];
    this.save();
  }

  // ---------- сессии ----------
  addSession(session) {
    this.data.sessions.push(session);
    this.save();
    return session;
  }

  findSession(tokenHash) {
    const s = this.data.sessions.find(x => x.tokenHash === tokenHash);
    if (!s) return null;
    if (s.expiresAt < Date.now()) {
      this.removeSession(tokenHash);
      return null;
    }
    return s;
  }

  removeSession(tokenHash) {
    this.data.sessions = this.data.sessions.filter(s => s.tokenHash !== tokenHash);
    this.save();
  }

  removeUserSessions(userId) {
    this.data.sessions = this.data.sessions.filter(s => s.userId !== userId);
    this.save();
  }

  purgeExpiredSessions() {
    const now = Date.now();
    const before = this.data.sessions.length;
    this.data.sessions = this.data.sessions.filter(s => s.expiresAt >= now);
    if (this.data.sessions.length !== before) this.save();
  }

  // ---------- сохранения ----------
  getSave(userId) {
    return this.data.saves[userId] || null;
  }

  putSave(userId, save) {
    this.data.saves[userId] = { save, updatedAt: Date.now() };
    this.save();
    return this.data.saves[userId];
  }

  /* Таблица лидеров строится из сохранений: трофеи, дивизион, сезон. */
  leaderboard(limit) {
    const rows = [];
    for (const user of this.data.users) {
      const entry = this.data.saves[user.id];
      if (!entry || !entry.save) continue;
      const s = entry.save;
      rows.push({
        manager: user.name,
        clubName: s.clubName || '—',
        division: s.division || 2,
        season: s.season || 1,
        trophies: Array.isArray(s.trophies) ? s.trophies.length : 0,
        wins: (s.stats && s.stats.wins) || 0,
        goals: (s.stats && s.stats.goals) || 0
      });
    }
    rows.sort((a, b) =>
      b.trophies - a.trophies ||
      a.division - b.division ||
      b.wins - a.wins ||
      b.goals - a.goals);
    return rows.slice(0, limit || 50);
  }
}

module.exports = { Store };
