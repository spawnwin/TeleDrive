'use strict';

/* Панель управления игрой.
   Отдельный вход, отдельные токены, отдельный журнал действий: игровой токен
   прав на управление не даёт, а каждое изменение остаётся в аудите.

   Пароль берётся из переменной FUTBOLX_ADMIN_PASSWORD. Если её нет, при первом
   запуске генерируется случайный и печатается в лог один раз — так панель не
   остаётся с паролем по умолчанию. Хранится только scrypt-хеш.

   Всё, что здесь есть, требует SQLite: на запасном JSON-хранилище админка
   честно отвечает, что недоступна, а не делает вид, что работает. */

const crypto = require('node:crypto');
const { hashPassword, verifyPassword, issueToken, hashToken, RateLimiter } = require('./auth');

const ADMIN_TTL_MS = 12 * 60 * 60 * 1000;      // смена админа — половина суток
const loginLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 8 });

/* Настройки со значениями по умолчанию. Ключи те же, что в meta. */
const SETTINGS = {
  registrationOpen: { key: 'registration_open', def: '1', kind: 'bool',
                      title: 'Регистрация новых менеджеров' },
  rivalsOpen:       { key: 'rivals_open', def: '1', kind: 'bool',
                      title: 'Вызовы между менеджерами' },
  announcement:     { key: 'announcement', def: '', kind: 'text',
                      title: 'Объявление в игре' },
  motd:             { key: 'motd_level', def: 'info', kind: 'enum',
                      title: 'Тон объявления', options: ['info', 'warn', 'good'] }
};

class Admin {
  constructor(store, log) {
    this.store = store;
    this.log = log || console.log;
    this.available = store.kind === 'sqlite';
    if (this.available) this.ensurePassword();
  }

  // ---------------- пароль и вход ----------------
  ensurePassword() {
    const fromEnv = process.env.FUTBOLX_ADMIN_PASSWORD;
    if (fromEnv) {
      // Пароль из окружения главнее: сменили переменную — сменился вход.
      const current = this.store.getSetting('admin_hash', '');
      if (!current || !verifyPassword(fromEnv, current)) {
        this.store.setSetting('admin_hash', hashPassword(fromEnv));
        this.store.setSetting('admin_source', 'env');
      }
      return;
    }
    if (this.store.getSetting('admin_hash', '')) return;

    const generated = crypto.randomBytes(9).toString('base64url');
    this.store.setSetting('admin_hash', hashPassword(generated));
    this.store.setSetting('admin_source', 'generated');
    this.log('');
    this.log('  ┌─ Панель управления ────────────────────────────────');
    this.log('  │  адрес:  /admin');
    this.log('  │  пароль: ' + generated);
    this.log('  │  Показывается один раз. Чтобы задать свой, укажите');
    this.log('  │  FUTBOLX_ADMIN_PASSWORD и перезапустите сервис.');
    this.log('  └────────────────────────────────────────────────────');
    this.log('');
  }

  login(password, client) {
    const gate = loginLimiter.check(client || 'unknown');
    if (!gate.allowed) {
      const err = new Error('Слишком много попыток. Повторите позже.');
      err.status = 429;
      throw err;
    }
    const stored = this.store.getSetting('admin_hash', '');
    if (!stored || !verifyPassword(String(password || ''), stored)) {
      const err = new Error('Неверный пароль');
      err.status = 401;
      throw err;
    }
    loginLimiter.reset(client || 'unknown');

    const token = issueToken();
    this.store.addAdminSession({
      tokenHash: token.hash,
      createdAt: Date.now(),
      expiresAt: Date.now() + ADMIN_TTL_MS,
      client: client || ''
    });
    this.record('admin.login', '', '', client);
    return { token: token.raw, expiresAt: Date.now() + ADMIN_TTL_MS };
  }

  logout(rawToken) {
    if (rawToken) this.store.removeAdminSession(hashToken(rawToken));
  }

  authorized(rawToken) {
    if (!rawToken) return false;
    return !!this.store.findAdminSession(hashToken(rawToken));
  }

  changePassword(oldPass, newPass, client) {
    const stored = this.store.getSetting('admin_hash', '');
    if (!verifyPassword(String(oldPass || ''), stored)) {
      const err = new Error('Текущий пароль указан неверно');
      err.status = 401;
      throw err;
    }
    if (String(newPass || '').length < 10) {
      const err = new Error('Новый пароль должен быть не короче 10 символов');
      err.status = 400;
      throw err;
    }
    this.store.setSetting('admin_hash', hashPassword(String(newPass)));
    this.store.setSetting('admin_source', 'panel');
    this.record('admin.password', '', 'пароль панели изменён', client);
    return { ok: true };
  }

  record(action, target, detail, client) {
    try {
      this.store.logAction({ action, target, detail, client: client || '' });
    } catch (e) { /* журнал не должен ронять действие */ }
  }

  // ---------------- данные ----------------
  overview() {
    const o = this.store.overview();
    o.storage = this.store.kind;
    o.uptime = Math.round(process.uptime());
    o.node = process.version;
    o.memory = process.memoryUsage().rss;
    o.settings = this.settings();
    return o;
  }

  settings() {
    const out = {};
    for (const [name, def] of Object.entries(SETTINGS)) {
      const raw = this.store.getSetting(def.key, def.def);
      out[name] = def.kind === 'bool' ? raw === '1' : raw;
    }
    return out;
  }

  saveSettings(patch, client) {
    const changed = [];
    for (const [name, def] of Object.entries(SETTINGS)) {
      if (!(name in patch)) continue;
      let value;
      if (def.kind === 'bool') value = patch[name] ? '1' : '0';
      else if (def.kind === 'enum') {
        value = def.options.includes(patch[name]) ? patch[name] : def.def;
      } else value = String(patch[name]).slice(0, 400);
      this.store.setSetting(def.key, value);
      changed.push(def.title + ' → ' + (def.kind === 'bool' ? (value === '1' ? 'вкл' : 'выкл') : value || '—'));
    }
    if (changed.length) this.record('settings.update', '', changed.join('; '), client);
    return this.settings();
  }

  players(params) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(5, Number(params.limit) || 25));
    const data = this.store.players({
      query: params.query, sort: params.sort,
      limit, offset: (page - 1) * limit
    });
    return { page, limit, pages: Math.max(1, Math.ceil(data.total / limit)), ...data };
  }

  player(id) {
    const row = this.store.playerDetail(id);
    if (!row) {
      const err = new Error('Менеджер не найден');
      err.status = 404;
      throw err;
    }
    return row;
  }

  // ---------------- действия над игроком ----------------
  ban(id, banned, reason, client) {
    const p = this.player(id);
    this.store.setBanned(id, banned, banned ? String(reason || '').slice(0, 200) : '');
    this.record(banned ? 'player.ban' : 'player.unban', p.name,
      banned ? (reason || 'без причины') : '', client);
    return this.player(id);
  }

  resetPassword(id, password, client) {
    const p = this.player(id);
    if (String(password || '').length < 8) {
      const err = new Error('Пароль должен быть не короче 8 символов');
      err.status = 400;
      throw err;
    }
    this.store.setPasswordHash(id, hashPassword(String(password)));
    this.record('player.password', p.name, 'пароль сброшен, сессии закрыты', client);
    return { ok: true };
  }

  patchSave(id, patch, client) {
    const p = this.player(id);
    if (!this.store.patchSave(id, patch)) {
      const err = new Error('У менеджера ещё нет сохранения');
      err.status = 400;
      throw err;
    }
    const parts = Object.entries(patch)
      .filter(([k]) => ['coins', 'level', 'division', 'season', 'clubName'].includes(k))
      .map(([k, v]) => k + '=' + v);
    this.record('player.save', p.name, parts.join(', '), client);
    return this.player(id);
  }

  remove(id, client) {
    const p = this.player(id);
    this.store.removeUser(id);
    this.record('player.delete', p.name, 'аккаунт и сохранение удалены', client);
    return { ok: true };
  }

  kick(id, client) {
    const p = this.player(id);
    this.store.removeUserSessions(id);
    this.record('player.kick', p.name, 'сессии закрыты', client);
    return { ok: true };
  }

  audit(limit) {
    return this.store.auditLog(Math.min(300, Math.max(10, Number(limit) || 100)));
  }
}

module.exports = { Admin, SETTINGS, ADMIN_TTL_MS };
