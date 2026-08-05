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
    assert.ok(Array.isArray(m.homeXi));
  });

  it('traits, suspensions and release work', () => {
    const club = G.defaultClub({ id: 'u7', login: 't7', name: 'T7', clubName: 'T7 FC' });
    G.ensureLineup(club, true);
    assert.ok(club.players.some((p) => Array.isArray(p.specials)));
    const spare = club.players.find((p) => !club.lineupIds.includes(p.id));
    spare.suspendedMatches = 1;
    G.ensureLineup(club, true);
    assert.ok(!club.lineupIds.includes(spare.id));
    const rel = G.releasePlayer(club, spare.id);
    assert.equal(rel.ok, true);
    const wage = G.renegotiateWage(club, club.lineupIds[1], 'raise');
    assert.equal(wage.ok, true);
    assert.ok(wage.player.morale >= 0);
    club.ticketPrice = 25;
    const tickets = G.ticketIncome(club, { fans: 12000 }, true);
    assert.ok(tickets > 0);
  });

  it('contracts renew and tick', () => {
    const club = G.defaultClub({ id: 'u8', login: 't8', name: 'T8', clubName: 'T8 FC' });
    G.ensureLineup(club, true);
    assert.ok(club.players.every((p) => p.contractYears >= 1));
    const p = club.players[0];
    p.contractYears = 1;
    let paid = 0;
    const ren = G.renewContract(club, p.id, 2, {
      spendUserMoney: (c) => { paid = c; return true; }
    });
    assert.equal(ren.ok, true);
    assert.ok(paid > 0);
    assert.equal(p.contractYears, 3);
    club.players.forEach((x) => { x.contractYears = 1; });
    const weak = club.players.find((x) => !club.lineupIds.includes(x.id));
    weak.contractYears = 0;
    // force leave path: not in XI, low mastery
    Object.keys(weak.skills).forEach((k) => { weak.skills[k] = 8; });
    const tick = G.tickContracts(club, 1);
    assert.ok(tick.asks.length + tick.left.length >= 1);
  });

  it('prematch board and scout brief', () => {
    const club = G.defaultClub({ id: 'h', login: 'h', name: 'H', clubName: 'Home' });
    const opp = G.defaultClub({ id: 'a', login: 'a', name: 'A', clubName: 'Away' });
    G.ensureLineup(club, true);
    G.ensureLineup(opp, true);
    opp.players[2].injuredHours = 24;
    const board = G.prematchBoard(club);
    assert.equal(board.xi.length, 11);
    assert.ok(board.xiStrength > 0);
    assert.ok(board.benchStrength >= 0);
    const locked = G.opponentBrief(opp, { scoutLevel: 0 });
    assert.equal(locked.locked, true);
    assert.equal(locked.threats.length, 0);
    const brief = G.opponentBrief(opp, { scoutLevel: 2 });
    assert.equal(brief.locked, false);
    assert.ok(brief.threats.length >= 1);
    assert.ok(brief.out.length >= 1);
    assert.ok(brief.styleLabel);
  });

  it('finance allows debt within credit and embargo', () => {
    const club = G.defaultClub({ id: 'f', login: 'f', name: 'F', clubName: 'Fin FC' });
    const user = { id: 'f', money: -50000, fans: 12000, fame: 0 };
    const snap = G.financeSnapshot(user, club);
    assert.ok(snap.credit > 0);
    assert.equal(snap.debt, 50000);
    assert.ok(['debt', 'critical', 'insolvent'].includes(snap.status));
    user.money = -snap.credit - 1000;
    const insol = G.financeSnapshot(user, club);
    assert.equal(insol.status, 'insolvent');
    assert.equal(insol.embargo, true);
  });

  it('motm chemistry and youth academy pool', () => {
    const home = G.defaultClub({ id: 'h9', login: 'h9', name: 'H9', clubName: 'H9' });
    const away = G.defaultClub({ id: 'a9', login: 'a9', name: 'A9', clubName: 'A9' });
    G.ensureLineup(home, true);
    G.ensureLineup(away, true);
    const chem = G.formationChemistry(home, G.resolveXi(home));
    assert.ok(chem >= 20 && chem <= 100);
    const m = G.simulateMatch(home, away, { competition: 'friendly', homeUserId: 'h9', awayUserId: 'a9' });
    assert.ok(m.motm);
    assert.ok(m.motm.rating >= 4);
    assert.ok(m.chemistry);
    home.stadiumLevel = 3;
    const ac = G.academyStatus(home);
    assert.ok(ac.youth.length >= 3);
    const id = ac.youth[0].id;
    const promoted = G.promoteYouth(home, id);
    assert.equal(promoted.ok, true);
    assert.ok(home.players.some((p) => p.id === id));
    const bay = G.medicalBay(home);
    assert.ok(Array.isArray(bay.injured));
  });

  it('board confidence season review and new job', () => {
    const club = G.defaultClub({ id: 'b1', login: 'b1', name: 'B1', clubName: 'Board FC' });
    const user = { id: 'b1', level: 3 };
    const board = G.ensureBoard(club, user);
    assert.ok(board.confidence >= 50);
    assert.ok(board.targetPlace >= 2);
    const before = club.board.confidence;
    G.applyMatchConfidence(club, { won: false, drew: false, competition: 'league' });
    assert.ok(club.board.confidence < before);
    club.board.confidence = 30;
    club.board.warnings = 2;
    club.board.targetPlace = 4;
    const review = G.seasonBoardReview(club, 9, { user });
    assert.equal(review.ok, false);
    assert.equal(review.sacked, true);
    const job = G.takeNewJob(club, user);
    assert.equal(job.ok, true);
    assert.equal(club.board.sacked, false);
    assert.ok(club.board.confidence >= 50);
  });

  it('injury types treat and academy upgrade', () => {
    const club = G.defaultClub({ id: 'm1', login: 'm1', name: 'M1', clubName: 'Med FC' });
    club.stadiumLevel = 3;
    club.academyLevel = 1;
    const p = club.players.find((x) => x.pos !== 'Gk');
    const inj = G.inflictInjury(p, 0, { prefer: 'sprain' });
    assert.equal(inj.type, 'sprain');
    assert.ok(p.injuredHours > 0);
    assert.equal(p.injuryLabel, 'Растяжение');
    let spent = 0;
    const treat = G.treatInjury(club, p.id, {
      spendUserMoney: (c) => { spent = c; return true; }
    });
    assert.equal(treat.ok, true);
    assert.ok(spent >= 4000);
    assert.ok(treat.hours < treat.hoursBefore);
    const up = G.upgradeAcademy(club);
    assert.equal(up.ok, true);
    assert.equal(club.academyLevel, 2);
    const st = G.academyStatus(club);
    assert.equal(st.academyLevel, 2);
    assert.ok(st.youth.length >= 3);
  });
});
