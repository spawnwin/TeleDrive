import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { createGuest, getBaseState } from './economy.js';

function nowIso() {
  return new Date().toISOString();
}

function sanitizeCallsign(raw: string): string {
  const value = (raw || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  if (value.length < 2) {
    throw Object.assign(new Error('Позывной слишком короткий (мин. 2 символа)'), { statusCode: 400 });
  }
  return value;
}

function sanitizePassword(raw: string): string {
  const value = (raw || '').trim();
  if (value.length < 4) {
    throw Object.assign(new Error('Пароль слишком короткий (мин. 4 символа)'), { statusCode: 400 });
  }
  if (value.length > 64) {
    throw Object.assign(new Error('Пароль слишком длинный'), { statusCode: 400 });
  }
  return value;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    // legacy plain fallback (should not exist)
    return stored === createHash('sha256').update(password).digest('hex');
  }
  const [, salt, hash] = parts;
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, 'hex');
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

export function registerPlayer(callsignRaw: string, passwordRaw: string) {
  const callsign = sanitizeCallsign(callsignRaw);
  const password = sanitizePassword(passwordRaw);
  const taken = db.prepare('SELECT id FROM users WHERE lower(callsign) = lower(?)').get(callsign);
  if (taken) throw Object.assign(new Error('Такой позывной уже занят'), { statusCode: 409 });

  const state = createGuest(callsign);
  const passwordHash = hashPassword(password);
  db.prepare('UPDATE users SET password_hash = ?, nickname = ?, callsign = ?, last_seen_at = ? WHERE id = ?').run(
    passwordHash,
    callsign,
    callsign,
    nowIso(),
    state.user.id,
  );
  const next = getBaseState(state.user.id);
  return {
    token: state.user.id,
    userId: state.user.id,
    callsign,
    state: next,
  };
}

export function loginPlayer(callsignRaw: string, passwordRaw: string) {
  const callsign = sanitizeCallsign(callsignRaw);
  const password = sanitizePassword(passwordRaw);
  const user = db.prepare('SELECT * FROM users WHERE lower(callsign) = lower(?)').get(callsign) as any;
  if (!user) throw Object.assign(new Error('Командир с таким позывным не найден'), { statusCode: 404 });
  if (!user.password_hash) {
    throw Object.assign(
      new Error('У этого аккаунта нет пароля. Зарегистрируйте новый или войдите как гость с тем же устройством.'),
      { statusCode: 400 },
    );
  }
  if (!verifyPassword(password, user.password_hash)) {
    throw Object.assign(new Error('Неверный пароль'), { statusCode: 401 });
  }
  db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(nowIso(), user.id);
  const state = getBaseState(user.id);
  return {
    token: user.id,
    userId: user.id,
    callsign: user.callsign,
    state,
  };
}

/** Attach password to an existing guest session so the player can log in later from another device. */
export function setAccountPassword(userId: string, passwordRaw: string) {
  const password = sanitizePassword(passwordRaw);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  if (!user) throw Object.assign(new Error('Игрок не найден'), { statusCode: 404 });
  db.prepare('UPDATE users SET password_hash = ?, last_seen_at = ? WHERE id = ?').run(
    hashPassword(password),
    nowIso(),
    userId,
  );
  return { ok: true, callsign: user.callsign };
}
