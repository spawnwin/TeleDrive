'use strict';

/* Тесты API без сторонних библиотек: поднимаем сервер на свободном порту,
   ходим настоящими HTTP-запросами и проверяем ответы. */

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DB = path.join(os.tmpdir(), 'futbolx-test-' + Date.now() + '.json');
process.env.DB_FILE = DB;

const { server, store } = require('./server');

let base = '';
const results = [];

async function call(method, url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(base + url, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('  ✓', name);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log('  ✗', name, '\n     ', e.message);
  }
}

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  console.log('Тесты API FUTBOL X\n');

  await test('здоровье сервера', async () => {
    const r = await call('GET', '/api/health');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.ok, true);
  });

  await test('регистрация отклоняет короткий пароль', async () => {
    const r = await call('POST', '/api/auth/register', { name: 'Тестовый', password: 'abc' });
    assert.strictEqual(r.status, 400);
  });

  await test('регистрация отклоняет короткое имя', async () => {
    const r = await call('POST', '/api/auth/register', { name: 'ab', password: 'longenough1' });
    assert.strictEqual(r.status, 400);
  });

  let token = null;
  await test('регистрация выдаёт токен', async () => {
    const r = await call('POST', '/api/auth/register', { name: 'Менеджер Тест', password: 'longenough1' });
    assert.strictEqual(r.status, 201);
    assert.ok(r.data.token);
    assert.strictEqual(r.data.user.name, 'Менеджер Тест');
    token = r.data.token;
  });

  await test('имя занято без учёта регистра', async () => {
    const r = await call('POST', '/api/auth/register', { name: 'менеджер тест', password: 'longenough1' });
    assert.strictEqual(r.status, 409);
  });

  await test('пароль не хранится в открытом виде', async () => {
    store.flush();
    const raw = fs.readFileSync(DB, 'utf8');
    assert.ok(!raw.includes('longenough1'), 'пароль найден в базе');
    assert.ok(raw.includes('scrypt$'), 'нет scrypt-хеша');
  });

  await test('токен сессии хранится только хешем', async () => {
    store.flush();
    const raw = JSON.parse(fs.readFileSync(DB, 'utf8'));
    assert.ok(raw.sessions.length > 0);
    raw.sessions.forEach(s => {
      assert.strictEqual(s.tokenHash.length, 64, 'ожидался sha256');
      assert.ok(!s.token, 'сырой токен не должен храниться');
    });
  });

  await test('/api/me требует токен', async () => {
    const r = await call('GET', '/api/me');
    assert.strictEqual(r.status, 401);
  });

  await test('/api/me отдаёт профиль по токену', async () => {
    const r = await call('GET', '/api/me', undefined, token);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.user.name, 'Менеджер Тест');
  });

  await test('сохранение записывается и читается', async () => {
    const save = { clubName: 'ФК Тест', division: 2, season: 2, trophies: [], stats: { wins: 3, goals: 8 } };
    const put = await call('PUT', '/api/save', { save }, token);
    assert.strictEqual(put.status, 200);
    const get = await call('GET', '/api/save', undefined, token);
    assert.strictEqual(get.data.save.clubName, 'ФК Тест');
    assert.strictEqual(get.data.save.season, 2);
  });

  await test('чужой токен не даёт доступ к сохранению', async () => {
    const r = await call('GET', '/api/save', undefined, 'forged-token-abc123');
    assert.strictEqual(r.status, 401);
  });

  await test('вход с неверным паролем отклонён', async () => {
    const r = await call('POST', '/api/auth/login', { name: 'Менеджер Тест', password: 'wrongpassword' });
    assert.strictEqual(r.status, 401);
  });

  await test('вход возвращает сохранение', async () => {
    const r = await call('POST', '/api/auth/login', { name: 'Менеджер Тест', password: 'longenough1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.save.clubName, 'ФК Тест');
    token = r.data.token;
  });

  await test('выход отзывает токен', async () => {
    await call('POST', '/api/auth/logout', undefined, token);
    const r = await call('GET', '/api/me', undefined, token);
    assert.strictEqual(r.status, 401);
  });

  await test('таблица лидеров показывает менеджера', async () => {
    const r = await call('GET', '/api/leaderboard');
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.rows.some(x => x.clubName === 'ФК Тест'));
  });

  await test('обход каталога заблокирован', async () => {
    const res = await fetch(base + '/%2e%2e%2f%2e%2e%2fetc%2fpasswd');
    assert.ok(res.status === 403 || res.status === 404, 'ожидался отказ, получено ' + res.status);
  });

  await test('слишком большое тело отклоняется', async () => {
    const login = await call('POST', '/api/auth/login', { name: 'Менеджер Тест', password: 'longenough1' });
    const big = { save: { blob: 'x'.repeat(600 * 1024) } };
    const r = await call('PUT', '/api/save', big, login.data.token);
    assert.strictEqual(r.status, 413);
  });

  await test('удаление аккаунта стирает сохранение', async () => {
    const login = await call('POST', '/api/auth/login', { name: 'Менеджер Тест', password: 'longenough1' });
    const del = await call('DELETE', '/api/account', undefined, login.data.token);
    assert.strictEqual(del.status, 200);
    const after = await call('POST', '/api/auth/login', { name: 'Менеджер Тест', password: 'longenough1' });
    assert.strictEqual(after.status, 401);
  });

  await test('ограничение частоты входов срабатывает', async () => {
    await call('POST', '/api/auth/register', { name: 'Жертва Перебора', password: 'longenough1' });
    let limited = false;
    for (let i = 0; i < 14; i++) {
      const r = await call('POST', '/api/auth/login', { name: 'Жертва Перебора', password: 'nope12345' });
      if (r.status === 429) { limited = true; break; }
    }
    assert.ok(limited, 'перебор не был ограничен');
  });

  server.close();
  store.flush();
  try { fs.unlinkSync(DB); } catch (e) {}

  const failed = results.filter(r => !r.ok);
  console.log(`\nИтог: ${results.length - failed.length} из ${results.length} прошли`);
  process.exit(failed.length ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
