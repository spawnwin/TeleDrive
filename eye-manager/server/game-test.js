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

  it('simulateMatch returns stats and respects instructions', () => {
    const home = G.defaultClub({ id: 'h', login: 'h', name: 'H', clubName: 'Home FC' });
    const away = G.defaultClub({ id: 'a', login: 'a', name: 'A', clubName: 'Away FC' });
    G.ensureLineup(home, true);
    G.ensureLineup(away, true);
    home.style = 'attack';
    home.instructions = ['high_press', 'through_balls'];
    away.style = 'defend';
    away.instructions = ['low_block'];
    const m = G.simulateMatch(home, away, { competition: 'friendly', homeUserId: 'h', awayUserId: 'a' });
    assert.ok(m.stats);
    assert.ok(Array.isArray(m.stats.shots));
    assert.ok(m.events.length >= 0);
    assert.equal(m.home.formation, home.formation);
  });

  it('listPlayer and promoteYouth work', () => {
    const club = G.defaultClub({ id: 'u6', login: 't6', name: 'T6', clubName: 'T6 FC' });
    club.userId = 'u6';
    G.ensureLineup(club, true);
    const spare = club.players.find((p) => !club.lineupIds.includes(p.id));
    assert.ok(spare);
    const listed = G.listPlayer(club, spare.id);
    assert.equal(listed.ok, true);
    assert.equal(listed.listing.source, 'club');

    club.stadiumLevel = 3;
    const youth = G.promoteYouth(club);
    assert.equal(youth.ok, true, youth.error);
    assert.ok(youth.player.age <= 19);
    assert.ok(youth.cost >= 20000);
  });
});
