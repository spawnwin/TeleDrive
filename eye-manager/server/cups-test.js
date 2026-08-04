'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createCupsModule } = require('./cups');

describe('cups system', () => {
  let dir;
  let users;
  let cups;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eye-cups-'));
    fs.mkdirSync(path.join(dir, 'saves'), { recursive: true });
    users = { users: {} };
    cups = createCupsModule({
      dataDir: dir,
      usersDb: () => users,
      saveUsers: (db) => { users = db; },
      publicUser: (u) => ({ id: u.id, login: u.login, name: u.name })
    });
  });

  after(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it('creates bots and open cups on tick', () => {
    cups.ensureBotPool(4);
    const bots = Object.values(users.users).filter((u) => u.isBot);
    assert.ok(bots.length >= 20, 'bots seeded');
    const r = cups.tick();
    assert.equal(r.ok, true);
    const open = cups.listCups({ status: 'open' });
    assert.equal(open.length, 15);
  });

  it('archives cups with no humans at start', () => {
    const open = cups.listCups({ status: 'open' })[0];
    assert.ok(open);
    const made = cups.adminCreateCup({ size: 4, bracketId: open.bracketId, startInMs: -1000 });
    const beforeArch = cups.loadArchive().entries.length;
    const r = cups.tick();
    assert.ok(r.results.some((x) => x.action === 'archived' && x.id === made.id));
    assert.equal(cups.getCup(made.id), null);
    assert.ok(cups.loadArchive().entries.length > beforeArch);
  });

  it('starts live then finishes across rounds with bots', () => {
    users.users.u1 = {
      id: 'u1', login: 'player1', name: 'Игрок', role: 'user', isBot: false,
      level: 1, xp: 0, cupsPlayed: 0, cupsWon: 0
    };
    const cup = cups.adminCreateCup({ size: 4, bracketId: 'l1_2', startInMs: 60_000 });
    const join = cups.joinCup(cup.id, users.users.u1, 'Тест FC');
    assert.equal(join.ok, true);
    assert.equal(join.cup.humans, 1);

    const started = cups.adminForceStart(cup.id);
    assert.equal(started.ok, true);
    assert.equal(started.action, 'started');
    let cur = cups.getCup(cup.id);
    assert.ok(cur);
    assert.equal(cur.status, 'live');
    assert.ok(cur.history.length >= 1);
    assert.equal(cur.bots, 3);

    const done = cups.adminFinishCup(cup.id);
    assert.equal(done.ok, true);
    cur = cups.getCup(cup.id);
    assert.equal(cur.status, 'finished');
    assert.ok(cur.champion);
    assert.equal(users.users.u1.cupsPlayed, 1);
    assert.ok(users.users.u1.xp > 0);
    assert.ok(cur.xpAwards && cur.xpAwards.u1 > 0);
  });

  it('blocks join outside level bracket for normal users', () => {
    users.users.u2 = {
      id: 'u2', login: 'high', name: 'Хай', role: 'user', isBot: false,
      level: 9, xp: 5200, cupsPlayed: 0, cupsWon: 0
    };
    const cup = cups.adminCreateCup({ size: 8, bracketId: 'l1_2', startInMs: 120_000 });
    const r = cups.joinCup(cup.id, users.users.u2, 'High FC');
    assert.equal(r.ok, false);
    assert.match(r.error, /уровень/i);
  });

  it('allows admin to join any bracket', () => {
    users.users.admin = {
      id: 'admin', login: 'admin', name: 'Админ', role: 'admin', isBot: false,
      level: 10, xp: 7500, cupsPlayed: 0, cupsWon: 0
    };
    const cup = cups.adminCreateCup({ size: 4, bracketId: 'l1_2', startInMs: 120_000 });
    const r = cups.joinCup(cup.id, users.users.admin, 'Admin FC');
    assert.equal(r.ok, true);
    assert.equal(r.cup.humans, 1);
  });
});
