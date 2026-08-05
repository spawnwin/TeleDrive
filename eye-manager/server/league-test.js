'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createLeagueModule, buildRoundRobin } = require('./league');

describe('league system', () => {
  it('builds round-robin for 8 teams', () => {
    const rounds = buildRoundRobin(8);
    assert.equal(rounds.length, 7);
    rounds.forEach((pairs) => {
      assert.equal(pairs.length, 4);
      const used = new Set();
      pairs.forEach(([a, b]) => {
        assert.ok(!used.has(a) && !used.has(b));
        used.add(a); used.add(b);
      });
      assert.equal(used.size, 8);
    });
  });

  it('join, start, play season to champion', () => {
    const users = {
      users: {
        u1: { id: 'u1', login: 'p1', name: 'P1', level: 1, xp: 0, money: 500000, fame: 0, prestige: 0, points: 0, cupEvents: [], isBot: false },
        b1: { id: 'b1', login: 'bot1', name: 'B1', level: 1, isBot: true, clubName: 'Bot1', strength: 110 },
        b2: { id: 'b2', login: 'bot2', name: 'B2', level: 1, isBot: true, clubName: 'Bot2', strength: 100 },
        b3: { id: 'b3', login: 'bot3', name: 'B3', level: 1, isBot: true, clubName: 'Bot3', strength: 95 },
        b4: { id: 'b4', login: 'bot4', name: 'B4', level: 1, isBot: true, clubName: 'Bot4', strength: 90 },
        b5: { id: 'b5', login: 'bot5', name: 'B5', level: 1, isBot: true, clubName: 'Bot5', strength: 88 },
        b6: { id: 'b6', login: 'bot6', name: 'B6', level: 1, isBot: true, clubName: 'Bot6', strength: 85 },
        b7: { id: 'b7', login: 'bot7', name: 'B7', level: 1, isBot: true, clubName: 'Bot7', strength: 80 }
      }
    };
    let saved = { leagues: {}, meta: { seasonCounter: 1 } };
    const league = createLeagueModule({
      usersDb: () => users,
      saveUsers: (db) => { Object.assign(users.users, db.users); },
      store: {
        loadLeagues: () => saved,
        saveLeagues: (x) => { saved = JSON.parse(JSON.stringify(x)); },
        clubStrength: () => 120,
        ensureBotPool: () => {},
        ensureBotClub: () => {},
        playLeagueTie: (h, a, meta) => ({
          id: 'm_' + h + a,
          score: [2, 1],
          home: { name: 'H' },
          away: { name: 'A' }
        }),
        pushLedger: () => {}
      }
    });
    league.ensureOpenLeagues();
    const join = league.joinLeague(users.users.u1, 'Human FC', { strength: 120 });
    assert.equal(join.ok, true, join.error);
    const id = join.league.id;
    const started = league.adminForceRound(id);
    assert.equal(started.ok, true, started.error || JSON.stringify(started));
    assert.equal(started.league.status, 'live');
    const fin = league.adminFinish(id);
    assert.equal(fin.ok, true);
    assert.equal(fin.league.status, 'finished');
    assert.ok(fin.league.champion);
    assert.ok((users.users.u1.cupEvents || []).some((e) => e.type === 'league_done' || e.type === 'league_won'));
    const cal = league.calendarFor('u1');
    // after finish findMyLeague returns null — calendar empty season ok
    assert.ok(cal.season >= 1);
  });
});
