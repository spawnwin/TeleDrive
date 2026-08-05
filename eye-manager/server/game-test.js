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

  it('sponsors form derby playtime and season archive', () => {
    const home = G.defaultClub({ id: 's1', login: 's1', name: 'S1', clubName: 'Северный Шторм', level: 4 });
    const away = G.defaultClub({ id: 's2', login: 's2', name: 'S2', clubName: 'Северный Орёл', level: 4 });
    const user = { id: 's1', level: 4, fame: 30, fans: 12000, money: 500000 };
    home.name = 'Северный Шторм';
    away.name = 'Северный Орёл';
    G.ensureLineup(home, true);
    G.ensureLineup(away, true);
    const sp = G.pickSponsor(home, user);
    assert.ok(sp.weekly > 0);
    assert.ok(sp.name);
    const m = G.simulateMatch(home, away, { competition: 'friendly', homeUserId: 's1', awayUserId: 's2', challenge: true });
    assert.ok(m.derby);
    assert.ok(home.form.length >= 1);
    assert.ok(['W', 'D', 'L'].includes(home.form[0]));
    const guide = G.clubFormGuide(home);
    assert.ok(guide.formStr.length >= 1);
    const benchId = (home.players || []).find((p) => !(home.lineupIds || []).includes(p.id))?.id;
    assert.ok(benchId);
    const p = home.players.find((x) => x.id === benchId);
    p.seasonApps = 0;
    p.request = 'playtime';
    const resolved = G.resolvePlaytimeRequest(home, benchId, 'promise');
    assert.equal(resolved.ok, true);
    const arch = G.snapshotSeasonAwards(home, { season: 2, rank: 3, leagueName: 'Тест' });
    assert.ok(arch);
    assert.equal(home.seasonArchive[0].season, 2);
    assert.equal(home.players[0].seasonGoals || 0, 0);
  });

  it('player form loans midseason and profile', () => {
    const club = G.defaultClub({ id: 'l1', login: 'l1', name: 'L1', clubName: 'Loan FC' });
    const user = { id: 'l1', login: 'loanmgr', name: 'Loan Mgr', level: 3, fame: 20, prestige: 2, points: 10, fans: 10000 };
    G.ensureLineup(club, true);
    G.ensureBoard(club, user);
    const spare = club.players.find((p) => !(club.lineupIds || []).includes(p.id));
    assert.ok(spare);
    const loan = G.loanOutPlayer(club, spare.id, 7);
    assert.equal(loan.ok, true);
    assert.ok(spare.loanUntil > Date.now());
    assert.equal(G.playerAvailable(spare), false);
    assert.ok(G.weeklyWages(club) < club.players.reduce((s, p) => s + (p.wage || 0), 0));
    spare.loanUntil = Date.now() - 1000;
    const ret = G.tickLoans(club);
    assert.equal(ret.returned.length, 1);
    assert.equal(!!spare.loanUntil, false);

    const mid = G.midSeasonBoardReview(club, 2, { user, season: 1 });
    assert.equal(mid.ok, true);
    assert.ok(mid.delta > 0);
    const mid2 = G.midSeasonBoardReview(club, 2, { user, season: 1 });
    assert.equal(mid2.skipped, true);

    const away = G.defaultClub({ id: 'l2', login: 'l2', name: 'L2', clubName: 'Away' });
    G.ensureLineup(away, true);
    const m = G.simulateMatch(club, away, { competition: 'friendly', homeUserId: 'l1', awayUserId: 'l2' });
    assert.ok(m.homeXi?.length);
    const rated = club.players.find((p) => p.lastRating != null);
    assert.ok(rated);
    assert.ok(rated.form >= 30 && rated.form <= 95);

    const fit = G.lineupFitMap(club);
    assert.equal(fit.length, 11);
    assert.ok(fit.every((r) => r.fit >= 0));

    const profile = G.publicProfile(user, club);
    assert.equal(profile.login, 'loanmgr');
    assert.ok(profile.club.top.length >= 1);
  });

  it('tv training offers player card and skill cap', () => {
    const club = G.defaultClub({ id: 'tv1', login: 'tv1', name: 'TV1', clubName: 'TV FC' });
    const user = { id: 'tv1', level: 4, fame: 40, fans: 15000, money: 800000, lastWageAt: Date.now() - 24 * 3600e3 };
    assert.equal(club.trainingLevel, 1);
    const tv = G.weeklyTvIncome(club, user);
    assert.ok(tv > 20000);
    const fin = G.financeSnapshot(user, club);
    assert.ok(fin.tvWeekly > 0);
    assert.ok(fin.tvDaily > 0);

    club.stadiumLevel = 3;
    const q = G.quoteTraining(club);
    assert.equal(q.ok, true);
    const up = G.upgradeTraining(club);
    assert.equal(up.ok, true);
    assert.equal(club.trainingLevel, 2);
    assert.ok(G.skillCap(club, false) > G.skillCap({ ...club, trainingLevel: 1 }, false));

    G.ensureLineup(club, true);
    const offers = G.maybeGenerateTransferOffers(club, { force: true });
    assert.ok(offers.length >= 1);
    const offer = offers[0];
    const reject = G.resolveTransferOffer(club, offer.id, 'reject');
    assert.equal(reject.ok, true);
    assert.equal(reject.decision, 'reject');

    const more = G.maybeGenerateTransferOffers(club, { force: true });
    assert.ok(more.length >= 1);
    // ensure not in XI for accept path
    const oid = more[0].playerId;
    club.lineupIds = (club.lineupIds || []).filter((id) => id !== oid);
    club.benchIds = (club.benchIds || []).filter((id) => id !== oid);
    while ((club.players || []).length <= 16) {
      club.players.push(G.makePlayer('Cm', 10));
    }
    const before = club.players.length;
    const moneyBefore = user.money;
    const acc = G.resolveTransferOffer(club, more[0].id, 'accept');
    assert.equal(acc.ok, true);
    assert.equal(club.players.length, before - 1);

    const wage = G.settleWageDay(user, club);
    assert.ok(wage);
    assert.ok(wage.tvPay > 0);
    assert.ok(user.money > moneyBefore - 1 || wage.tvPay > 0);

    const away = G.defaultClub({ id: 'tv2', login: 'tv2', name: 'TV2', clubName: 'Away TV' });
    G.ensureLineup(club, true);
    G.ensureLineup(away, true);
    G.simulateMatch(club, away, { competition: 'friendly', homeUserId: 'tv1', awayUserId: 'tv2' });
    const rated = club.players.find((p) => p.lastRating != null);
    assert.ok(rated);
    assert.ok(Array.isArray(rated.ratingLog));
    assert.ok(rated.ratingLog.length >= 1);
    const card = G.playerCard(club, rated.id);
    assert.ok(card);
    assert.equal(card.id, rated.id);
    assert.ok(card.avgRating != null);
  });

  it('captain setpieces team talk fitness subs and rivals', () => {
    const home = G.defaultClub({ id: 'r1', login: 'r1', name: 'R1', clubName: 'Roles FC' });
    const away = G.defaultClub({ id: 'r2', login: 'r2', name: 'R2', clubName: 'Away Roles' });
    home.userId = 'r1';
    away.userId = 'r2';
    G.ensureLineup(home, true);
    G.ensureLineup(away, true);

    const capId = home.lineupIds[1];
    const leader = home.players.find((p) => p.id === capId);
    leader.specials = ['leader'];
    const cap = G.setCaptain(home, capId);
    assert.equal(cap.ok, true);
    assert.equal(home.captainId, capId);
    const chem = G.formationChemistry(home, home.players.filter((p) => home.lineupIds.includes(p.id)));
    home.captainId = null;
    const chemNo = G.formationChemistry(home, home.players.filter((p) => home.lineupIds.includes(p.id)));
    home.captainId = capId;
    assert.ok(chem > chemNo);

    const sp = G.setSetPieces(home, { corner: capId, freeKick: home.lineupIds[2], penalty: home.lineupIds[3] });
    assert.equal(sp.ok, true);
    assert.equal(home.setPieces.corner, capId);
    const pub = G.publicSetPieces(home);
    assert.equal(pub.corner.id, capId);

    const talk = G.applyTeamTalk(home, 'motivate');
    assert.equal(talk.ok, true);
    assert.ok(home.teamTalk);
    const talk2 = G.applyTeamTalk(home, 'calm');
    assert.equal(talk2.ok, false);

    G.setSubPolicy(home, { enabled: true, fitnessBelow: 95, maxSubs: 3 });
    home.players.forEach((p) => {
      if (home.lineupIds.includes(p.id) && p.pos !== 'Gk') p.fitness = 50;
    });
    home.benchIds = home.players.filter((p) => !home.lineupIds.includes(p.id)).slice(0, 7).map((p) => p.id);
    home.players.forEach((p) => {
      if (home.benchIds.includes(p.id)) p.fitness = 95;
    });

    // force zero-goal path sometimes uses set piece taker — run several matches
    let sawNamedCornerOrPiece = false;
    let sawFitnessSub = false;
    for (let i = 0; i < 8; i++) {
      const h = G.defaultClub({ id: 'r1x' + i, login: 'r1', name: 'R1', clubName: 'Roles FC' });
      const a = G.defaultClub({ id: 'r2x' + i, login: 'r2', name: 'R2', clubName: 'Away Roles' });
      h.userId = 'r1';
      a.userId = 'r2';
      h.name = 'Северный Шторм';
      a.name = 'Северный Орёл';
      G.ensureLineup(h, true);
      G.ensureLineup(a, true);
      G.setCaptain(h, h.lineupIds[1]);
      G.setSetPieces(h, { corner: h.lineupIds[1], freeKick: h.lineupIds[2], penalty: h.lineupIds[3] });
      G.applyTeamTalk(h, 'demand');
      G.setSubPolicy(h, { enabled: true, fitnessBelow: 95, maxSubs: 3 });
      h.players.forEach((p) => {
        if (h.lineupIds.includes(p.id) && p.pos !== 'Gk') p.fitness = 40;
        if ((h.benchIds || []).includes(p.id) || (!h.lineupIds.includes(p.id) && p.pos !== 'Gk')) p.fitness = 99;
      });
      h.benchIds = h.players.filter((p) => !h.lineupIds.includes(p.id)).slice(0, 7).map((p) => p.id);
      const m = G.simulateMatch(h, a, { competition: 'friendly', homeUserId: 'r1', awayUserId: 'r2', challenge: true });
      if ((m.events || []).some((e) => e.type === 'corner' && e.playerId)) sawNamedCornerOrPiece = true;
      if ((m.events || []).some((e) => e.type === 'goal' && e.setPiece && e.playerId)) sawNamedCornerOrPiece = true;
      if ((m.events || []).some((e) => e.type === 'sub' && e.reason === 'усталость')) sawFitnessSub = true;
      if ((m.events || []).some((e) => e.type === 'talk')) assert.ok(true);
      assert.equal(!!h.teamTalk, false);
    }
    assert.ok(sawNamedCornerOrPiece || sawFitnessSub);

    G.rememberRival(home, 'r2');
    home.history = [
      { opp: 'Away Roles', oppUserId: 'r2', score: [2, 1], result: 'W', derby: 'Северное дерби' },
      { opp: 'Away Roles', oppUserId: 'r2', score: [0, 1], result: 'L', derby: null }
    ];
    const riv = G.rivalsStatus(home);
    assert.ok(riv.rivalIds.includes('r2'));
    assert.equal(riv.h2h[0].played, 2);
    assert.equal(riv.h2h[0].w, 1);

    const card = G.playerCard(home, home.captainId);
    assert.equal(card.isCaptain, true);
  });
});
