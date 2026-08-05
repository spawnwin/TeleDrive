'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const G = require('./game');

describe('game lineup guards', () => {
  it('ensureLineup strips injured and keeps GK', () => {
    const club = G.defaultClub({ id: 'u', login: 't', name: 'T', clubName: 'T FC' });
    G.ensureLineup(club, true);
    assert.equal((club.lineupIds || []).length, 11);
    const field = club.lineupIds.find((id) => club.players.find((p) => p.id === id)?.pos !== 'Gk');
    assert.ok(field);
    const injured = club.players.find((p) => p.id === field);
    injured.injuredHours = 24;
    G.ensureLineup(club, false);
    assert.ok(!club.lineupIds.includes(field), 'injured removed from XI');
    assert.ok(club.lineupIds.some((id) => club.players.find((p) => p.id === id)?.pos === 'Gk'));
    assert.equal(club.lineupIds.length, 11);
    const pub = G.publicClub(club, { id: 'u', login: 't' });
    assert.equal(pub.understrength, false);
  });

  it('publicClub marks understrength when too few healthy', () => {
    const club = G.defaultClub({ id: 'u2', login: 't2', name: 'T2', clubName: 'T2 FC' });
    club.players.forEach((p) => {
      if (p.pos !== 'Gk') p.injuredHours = 48;
    });
    G.ensureLineup(club, true);
    const pub = G.publicClub(club, { id: 'u2' });
    assert.equal(pub.understrength, true);
  });

  it('settleWageDay catches up multiple days capped at 7', () => {
    const club = G.defaultClub({ id: 'u3', login: 't3', name: 'T3', clubName: 'T3 FC' });
    const user = { id: 'u3', money: 500000, fans: 10000, lastWageAt: Date.now() - 3 * 24 * 3600e3 };
    const r = G.settleWageDay(user, club);
    assert.ok(r);
    assert.equal(r.days, 3);
    assert.equal(r.wages, Math.round(G.weeklyWages(club) / 7) * 3);
    assert.equal(user.money, 500000 + r.delta);

    const user2 = { id: 'u4', money: 100000, fans: 10000, lastWageAt: Date.now() - 20 * 24 * 3600e3 };
    const r2 = G.settleWageDay(user2, club);
    assert.equal(r2.days, 7);

    const fresh = { id: 'u5', money: 100000, fans: 10000 };
    assert.equal(G.settleWageDay(fresh, club), null);
    assert.ok(fresh.lastWageAt);
  });
});
