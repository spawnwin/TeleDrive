'use strict';

/* Тесты API без сторонних библиотек: поднимаем сервер на свободном порту,
   ходим настоящими HTTP-запросами и проверяем ответы. */

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DB = path.join(os.tmpdir(), 'futbolx-test-' + Date.now() + '.json');
const SQLITE = DB.replace(/\.json$/, '.sqlite');
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
    const u = store.findUserByName('Менеджер Тест');
    assert.ok(u, 'пользователь не найден');
    assert.ok(u.passwordHash.startsWith('scrypt$'), 'ожидался scrypt-хеш');
    assert.ok(!u.passwordHash.includes('longenough1'), 'пароль виден в хеше');
    if (store.kind === 'sqlite') {
      const raw = fs.readFileSync(SQLITE);
      assert.ok(!raw.includes('longenough1'), 'пароль найден в файле базы');
    }
  });

  await test('токен сессии хранится только хешем', async () => {
    const rows = store.kind === 'sqlite'
      ? store.q.allSessions.all().map(r => ({ tokenHash: r.token_hash, token: r.token }))
      : store.data.sessions;
    assert.ok(rows.length > 0, 'сессий нет');
    rows.forEach(s => {
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

  if (store.kind === 'sqlite') {
    await test('база: используется SQLite', async () => {
      const r = await call('GET', '/api/health');
      assert.strictEqual(r.data.storage, 'sqlite');
      assert.ok(fs.existsSync(SQLITE), 'файл базы не создан');
    });

    await test('база: имя уникально на уровне СУБД', async () => {
      const u = store.findUserByName('Жертва Перебора');
      assert.ok(u);
      assert.throws(() => store.addUser({
        id: 'u_dup', name: u.name, nameKey: u.nameKey,
        passwordHash: 'x', createdAt: Date.now()
      }), 'дубликат имени прошёл в базу');
    });

    /* Проверка уровня хранилища: пользователь заводится напрямую, чтобы не
       расходовать лимит регистраций, который к этому моменту уже исчерпан. */
    await test('база: удаление пользователя каскадом чистит сессии и сохранение', async () => {
      const id = 'u_cascade';
      store.addUser({ id, name: 'Каскадный', nameKey: 'каскадный',
                      passwordHash: 'scrypt$1$1$1$aa$bb', createdAt: Date.now() });
      store.addSession({ tokenHash: 'c'.repeat(64), userId: id,
                         createdAt: Date.now(), expiresAt: Date.now() + 6e4 });
      store.putSave(id, { clubName: 'ФК Каскад', trophies: [] });
      assert.ok(store.getSave(id), 'сохранение не записалось');

      store.removeUser(id);
      assert.strictEqual(store.getSave(id), null, 'сохранение осталось');
      assert.strictEqual(store.findUserById(id), null, 'пользователь остался');
      const left = store.q.allSessions.all().filter(r => r.user_id === id);
      assert.strictEqual(left.length, 0, 'сессии остались');
    });

    await test('база: включён журнал WAL', async () => {
      const mode = store.db.prepare('PRAGMA journal_mode').get();
      assert.strictEqual(String(Object.values(mode)[0]).toLowerCase(), 'wal');
    });

    await test('база: таблица лидеров сортируется по трофеям', async () => {
      const id = 'u_titled';
      store.addUser({ id, name: 'Титулованный', nameKey: 'титулованный',
                      passwordHash: 'scrypt$1$1$1$aa$bb', createdAt: Date.now() });
      store.putSave(id, { clubName: 'ФК Титул', division: 1, season: 5,
                          trophies: [1, 2, 3, 4], stats: { wins: 40, goals: 90 } });
      const r = await call('GET', '/api/leaderboard');
      assert.strictEqual(r.data.rows[0].clubName, 'ФК Титул');
      assert.strictEqual(r.data.rows[0].trophies, 4);
      assert.strictEqual(r.data.rows[0].manager, 'Титулованный');
    });

    await test('база: перенос из JSON выполняется один раз', async () => {
      const { SqliteStore } = require('./db');
      const jsonPath = path.join(os.tmpdir(), 'mig-' + Date.now() + '.json');
      const sqlPath = jsonPath.replace(/\.json$/, '.sqlite');
      fs.writeFileSync(jsonPath, JSON.stringify({
        users: [{ id: 'u_old', name: 'Старый', nameKey: 'старый',
                  passwordHash: 'scrypt$1$1$1$aa$bb', createdAt: 1 }],
        sessions: [],
        saves: { u_old: { save: { clubName: 'ФК Архив', trophies: [] }, updatedAt: 1 } }
      }));
      const s1 = new SqliteStore(sqlPath);
      assert.strictEqual(s1.importFromJson(jsonPath), 1, 'перенос не выполнился');
      assert.strictEqual(s1.importFromJson(jsonPath), 0, 'перенос повторился');
      assert.strictEqual(s1.getSave('u_old').save.clubName, 'ФК Архив');
      s1.close();
      [sqlPath, sqlPath + '-wal', sqlPath + '-shm', jsonPath].forEach(f => {
        try { fs.unlinkSync(f); } catch (e) {}
      });
    });
  }

  server.close();
  store.flush();
  if (store.close) store.close();
  [DB, SQLITE, SQLITE + '-wal', SQLITE + '-shm'].forEach(f => {
    try { fs.unlinkSync(f); } catch (e) {}
  });

  const failed = results.filter(r => !r.ok);
  console.log(`\nИтог: ${results.length - failed.length} из ${results.length} прошли`);
  process.exit(failed.length ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
