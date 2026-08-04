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

  it('starts live with delayed first round then finishes', () => {
    users.users.u1 = {
      id: 'u1', login: 'player1', name: 'Игрок', role: 'user', isBot: false,
      level: 1, xp: 0, cupsPlayed: 0, cupsWon: 0, cupEvents: []
    };
    const cup = cups.adminCreateCup({ size: 4, bracketId: 'l1_2', startInMs: 60_000 });
    const join = cups.joinCup(cup.id, users.users.u1, 'Тест FC');
    assert.equal(join.ok, true);

    const started = cups.adminForceStart(cup.id);
    assert.equal(started.ok, true);
    let cur = cups.getCup(cup.id);
    assert.equal(cur.status, 'live');
    assert.equal(cur.history.length, 0, 'first round delayed');
    assert.ok(cur.nextRoundAt);
    assert.equal(cur.bots, 3);
    assert.ok((users.users.u1.cupEvents || []).some((e) => e.type === 'cup_started'));

    const done = cups.adminFinishCup(cup.id);
    assert.equal(done.ok, true);
    cur = cups.getCup(cup.id);
    assert.equal(cur.status, 'finished');
    assert.ok(cur.champion);
    assert.equal(users.users.u1.cupsPlayed, 1);
    assert.ok(users.users.u1.xp > 0);
    assert.ok(cur.xpAwards && cur.xpAwards.u1 > 0);
    assert.ok((users.users.u1.cupEvents || []).some((e) => e.type === 'cup_done' || e.type === 'cup_won'));
  });

  it('filters list by bracket and mine', () => {
    users.users.u3 = {
      id: 'u3', login: 'mid', name: 'Мид', role: 'user', isBot: false,
      level: 5, xp: 900, cupsPlayed: 0, cupsWon: 0
    };
    const cup = cups.adminCreateCup({ size: 4, bracketId: 'l5_6', startInMs: 120_000 });
    cups.joinCup(cup.id, users.users.u3, 'Mid FC');
    const mine = cups.listCups({ mineFor: 'u3' });
    assert.ok(mine.some((c) => c.id === cup.id));
    const br = cups.listCups({ status: 'open', bracketId: 'l5_6' });
    assert.ok(br.every((c) => c.bracketId === 'l5_6'));
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

  it('allows admin to join any bracket and has leaderboard', () => {
    users.users.admin = {
      id: 'admin', login: 'admin', name: 'Админ', role: 'admin', isBot: false,
      level: 10, xp: 7500, cupsPlayed: 2, cupsWon: 1
    };
    const cup = cups.adminCreateCup({ size: 4, bracketId: 'l1_2', startInMs: 120_000 });
    const r = cups.joinCup(cup.id, users.users.admin, 'Admin FC');
    assert.equal(r.ok, true);
    const board = cups.leaderboard({ limit: 10 });
    assert.ok(board.length >= 1);
    assert.ok(board[0].rank === 1);
  });
});
