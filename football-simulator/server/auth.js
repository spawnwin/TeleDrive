'use strict';

const crypto = require('node:crypto');

/* Пароли хранятся как scrypt-хеш с индивидуальной солью. scrypt входит в
   стандартную библиотеку Node, поэтому bcrypt как зависимость не нужен. */
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_PARAMS.keylen, SCRYPT_PARAMS);
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$` +
         `${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password, salt, expected.length,
      { N: Number(N), r: Number(r), p: Number(p) });
    // Сравнение постоянного времени: иначе по задержке можно подбирать хеш.
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (e) {
    return false;
  }
}

/* Клиенту уходит сырой токен, в базе лежит только его SHA-256. Утечка
   файла базы не даёт войти под чужой сессией. */
function issueToken() {
  const raw = crypto.randomBytes(32).toString('base64url');
  return { raw, hash: hashToken(raw) };
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

function newId(prefix) {
  return prefix + crypto.randomBytes(9).toString('base64url');
}

// ---------- валидация ----------
const NAME_RE = /^[\p{L}\p{N}_\- ]{3,24}$/u;

function validateName(name) {
  if (typeof name !== 'string') return 'Имя менеджера обязательно';
  const trimmed = name.trim();
  if (!NAME_RE.test(trimmed)) {
    return 'Имя: от 3 до 24 символов, буквы, цифры, пробел, дефис или подчёркивание';
  }
  return null;
}

function validatePassword(password) {
  if (typeof password !== 'string') return 'Пароль обязателен';
  if (password.length < 8) return 'Пароль должен быть не короче 8 символов';
  if (password.length > 200) return 'Пароль слишком длинный';
  return null;
}

/* Простое ограничение частоты попыток входа по ключу (имя или адрес).
   Хранится в памяти: перезапуск сервера обнуляет счётчики. */
class RateLimiter {
  constructor({ windowMs, max }) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map();
  }

  check(key) {
    const now = Date.now();
    const rec = this.hits.get(key);
    if (!rec || now - rec.start > this.windowMs) {
      this.hits.set(key, { start: now, count: 1 });
      return { allowed: true, retryAfter: 0 };
    }
    rec.count++;
    if (rec.count > this.max) {
      return { allowed: false, retryAfter: Math.ceil((this.windowMs - (now - rec.start)) / 1000) };
    }
    return { allowed: true, retryAfter: 0 };
  }

  /* Проверка без списания попытки: нужна там, где счётчик должен расти
     только от удавшихся действий (регистрация), а не от каждой опечатки. */
  peek(key) {
    const now = Date.now();
    const rec = this.hits.get(key);
    if (!rec || now - rec.start > this.windowMs) return { allowed: true, retryAfter: 0 };
    if (rec.count >= this.max) {
      return { allowed: false, retryAfter: Math.ceil((this.windowMs - (now - rec.start)) / 1000) };
    }
    return { allowed: true, retryAfter: 0 };
  }

  /* Списывает одну попытку по ключу. Парная к peek. */
  count(key) {
    const now = Date.now();
    const rec = this.hits.get(key);
    if (!rec || now - rec.start > this.windowMs) this.hits.set(key, { start: now, count: 1 });
    else rec.count++;
  }

  reset(key) { this.hits.delete(key); }

  sweep() {
    const now = Date.now();
    for (const [key, rec] of this.hits) {
      if (now - rec.start > this.windowMs) this.hits.delete(key);
    }
  }
}

module.exports = {
  hashPassword, verifyPassword,
  issueToken, hashToken, newId,
  validateName, validatePassword,
  RateLimiter
};
