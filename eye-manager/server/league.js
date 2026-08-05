'use strict';

/**
 * Division leagues by manager level — round-robin seasons.
 */

const crypto = require('crypto');
const { LEVEL_BRACKETS, levelFromXp } = require('./cups');

const LEAGUE_SIZE = 8;
const ROUND_MS = Number(process.env.EYE_LEAGUE_ROUND_MS || 8 * 60e3);
const TICK_MS = Number(process.env.EYE_LEAGUE_TICK_MS || 60e3);
const FINISHED_KEEP_MS = 3 * 24 * 3600e3;

function uid(prefix) {
  return prefix + '_' + crypto.randomBytes(5).toString('hex');
}

function emptyRow() {
  return { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 };
}

/** Circle method single round-robin. Returns rounds of [homeIdx, awayIdx]. */
function buildRoundRobin(n) {
  const teams = Array.from({ length: n }, (_, i) => i);
  if (n % 2 === 1) teams.push(-1);
  const total = teams.length;
  const rounds = [];
  const roundsCount = total - 1;
  const half = total / 2;
  const arr = teams.slice();
  for (let r = 0; r < roundsCount; r++) {
    const pairs = [];
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[total - 1 - i];
      if (a >= 0 && b >= 0) {
        if (r % 2 === 0) pairs.push([a, b]);
        else pairs.push([b, a]);
      }
    }
    rounds.push(pairs);
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr.splice(0, arr.length, fixed, ...rest);
  }
  return rounds;
}

function createLeagueModule({ usersDb, saveUsers, store }) {
  let state = { leagues: {}, meta: { lastTick: 0, seasonCounter: 1 } };

  function load() {
    if (store?.loadLeagues) {
      const raw = store.loadLeagues();
      if (raw && typeof raw === 'object') {
        state = {
          leagues: raw.leagues || {},
          meta: raw.meta || { lastTick: 0, seasonCounter: 1 }
        };
      }
    }
    return state;
  }

  function save() {
    if (store?.saveLeagues) store.saveLeagues(state);
  }

  function bracketForLevel(level) {
    const lvl = level || 1;
    return LEVEL_BRACKETS.find((b) => lvl >= b.min && lvl <= b.max) || LEVEL_BRACKETS[0];
  }

  function publicLeague(L, viewerId) {
    if (!L) return null;
    const standings = Object.entries(L.table || {})
      .map(([userId, row]) => {
        const ent = (L.entrants || []).find((e) => e.userId === userId) || {};
        return {
          userId,
          clubName: ent.clubName || '—',
          isBot: !!ent.isBot,
          login: ent.login || null,
          ...row,
          gd: (row.gf || 0) - (row.ga || 0)
        };
      })
      .sort((a, b) => (b.pts - a.pts) || (b.gd - a.gd) || (b.gf - a.gf));
    standings.forEach((r, i) => { r.rank = i + 1; });

    const fixtures = (L.fixtures || []).map((f) => {
      const home = (L.entrants || []).find((e) => e.userId === f.homeUserId);
      const away = (L.entrants || []).find((e) => e.userId === f.awayUserId);
      return {
        ...f,
        homeName: home?.clubName || '—',
        awayName: away?.clubName || '—',
        mine: viewerId && (f.homeUserId === viewerId || f.awayUserId === viewerId)
      };
    });

    return {
      id: L.id,
      name: L.name,
      bracketId: L.bracketId,
      bracketLabel: L.bracketLabel,
      minLevel: L.minLevel,
      maxLevel: L.maxLevel,
      status: L.status,
      season: L.season,
      size: L.size,
      currentRound: L.currentRound,
      totalRounds: L.totalRounds,
      nextRoundAt: L.nextRoundAt,
      entrantsCount: (L.entrants || []).length,
      humans: (L.entrants || []).filter((e) => !e.isBot).length,
      standings,
      fixtures,
      champion: L.champion || null,
      createdAt: L.createdAt,
      finishedAt: L.finishedAt || null,
      myUserId: viewerId || null
    };
  }

  function findOpenForBracket(bracketId) {
    load();
    return Object.values(state.leagues).find(
      (L) => L.bracketId === bracketId && L.status === 'open' && (L.entrants || []).length < L.size
    );
  }

  function findMyLeague(userId) {
    load();
    return Object.values(state.leagues).find(
      (L) =>
        (L.status === 'open' || L.status === 'live') &&
        (L.entrants || []).some((e) => e.userId === userId && !e.isBot)
    ) || null;
  }

  function ensureBotEntrants(L) {
    const need = L.size - (L.entrants || []).length;
    if (need <= 0) return;
    if (store?.ensureBotPool) store.ensureBotPool(Math.max(8, need));
    const used = new Set((L.entrants || []).map((e) => e.userId));
    const bots = Object.values(usersDb().users)
      .filter((u) => u.isBot && !used.has(u.id))
      .sort(() => Math.random() - 0.5);
    for (let i = 0; i < need && i < bots.length; i++) {
      const b = bots[i];
      if (store?.ensureBotClub) store.ensureBotClub(b, b.clubName);
      const strength = store?.clubStrength ? store.clubStrength(b.id) : (b.strength || 100);
      L.entrants.push({
        userId: b.id,
        clubName: b.clubName || b.name || 'AI FC',
        login: b.login,
        isBot: true,
        strength: strength || 100
      });
      L.table[b.id] = emptyRow();
    }
  }

  function createOpenLeague(bracket) {
    load();
    const season = state.meta.seasonCounter || 1;
    const L = {
      id: uid('lg'),
      name: `Лига ${bracket.label} · сезон ${season}`,
      bracketId: bracket.id,
      bracketLabel: bracket.label,
      minLevel: bracket.min,
      maxLevel: bracket.max,
      status: 'open',
      season,
      size: LEAGUE_SIZE,
      entrants: [],
      table: {},
      fixtures: [],
      currentRound: 0,
      totalRounds: LEAGUE_SIZE - 1,
      nextRoundAt: null,
      createdAt: Date.now(),
      champion: null
    };
    state.leagues[L.id] = L;
    save();
    return L;
  }

  function ensureOpenLeagues() {
    load();
    LEVEL_BRACKETS.forEach((br) => {
      const open = Object.values(state.leagues).filter(
        (L) => L.bracketId === br.id && L.status === 'open'
      );
      if (!open.length) createOpenLeague(br);
    });
  }

  function generateFixtures(L) {
    const ents = L.entrants || [];
    const rounds = buildRoundRobin(ents.length);
    L.fixtures = [];
    rounds.forEach((pairs, ri) => {
      pairs.forEach(([hi, ai]) => {
        L.fixtures.push({
          id: uid('fx'),
          round: ri + 1,
          homeUserId: ents[hi].userId,
          awayUserId: ents[ai].userId,
          score: null,
          matchId: null,
          playedAt: null
        });
      });
    });
    L.totalRounds = rounds.length;
  }

  function pushEvent(userId, ev) {
    const udb = usersDb();
    const u = udb.users[userId];
    if (!u || u.isBot) return;
    u.cupEvents = Array.isArray(u.cupEvents) ? u.cupEvents : [];
    u.cupEvents.unshift({ id: uid('ev'), at: Date.now(), read: false, ...ev });
    if (u.cupEvents.length > 40) u.cupEvents.length = 40;
    saveUsers(udb);
  }

  function startLeague(L) {
    ensureBotEntrants(L);
    if ((L.entrants || []).length < 4) return { ok: false, error: 'Мало участников' };
    while (L.entrants.length > LEAGUE_SIZE) {
      const botIdx = [...L.entrants.keys()].reverse().find((i) => L.entrants[i].isBot);
      if (botIdx == null) break;
      const [removed] = L.entrants.splice(botIdx, 1);
      delete L.table[removed.userId];
    }
    if (L.entrants.length % 2 === 1) {
      const tmp = { size: L.entrants.length + 1, entrants: L.entrants, table: L.table };
      ensureBotEntrants(tmp);
    }
    generateFixtures(L);
    L.status = 'live';
    L.currentRound = 1;
    L.nextRoundAt = Date.now() + Math.min(ROUND_MS, 90e3);
    (L.entrants || []).filter((e) => !e.isBot).forEach((e) => {
      pushEvent(e.userId, { type: 'league_started', title: 'Лига стартовала', body: L.name, leagueId: L.id });
    });
    return { ok: true };
  }

  function applyResult(L, fixture, score, matchId) {
    const [hg, ag] = score;
    fixture.score = [hg, ag];
    fixture.matchId = matchId;
    fixture.playedAt = Date.now();
    const home = L.table[fixture.homeUserId] || emptyRow();
    const away = L.table[fixture.awayUserId] || emptyRow();
    home.played++; away.played++;
    home.gf += hg; home.ga += ag;
    away.gf += ag; away.ga += hg;
    if (hg > ag) { home.won++; home.pts += 3; away.lost++; }
    else if (ag > hg) { away.won++; away.pts += 3; home.lost++; }
    else { home.drawn++; away.drawn++; home.pts += 1; away.pts += 1; }
    L.table[fixture.homeUserId] = home;
    L.table[fixture.awayUserId] = away;
  }

  function playRound(L, roundNum) {
    const fixtures = (L.fixtures || []).filter((f) => f.round === roundNum && !f.playedAt);
    const results = [];
    fixtures.forEach((f) => {
      let match = null;
      if (store?.playLeagueTie) {
        match = store.playLeagueTie(f.homeUserId, f.awayUserId, {
          leagueId: L.id, round: roundNum, leagueName: L.name
        });
      }
      if (match?.score) {
        applyResult(L, f, match.score, match.id);
        results.push({ fixtureId: f.id, score: match.score, matchId: match.id });
        [f.homeUserId, f.awayUserId].forEach((uid_) => {
          const ent = (L.entrants || []).find((e) => e.userId === uid_);
          if (ent && !ent.isBot) {
            pushEvent(uid_, {
              type: 'league_match',
              title: `Тур ${roundNum}`,
              body: `${match.home?.name} ${match.score[0]}:${match.score[1]} ${match.away?.name}`,
              matchId: match.id,
              leagueId: L.id
            });
          }
        });
      } else {
        const h = (L.entrants || []).find((e) => e.userId === f.homeUserId);
        const a = (L.entrants || []).find((e) => e.userId === f.awayUserId);
        const hs = (h?.strength || 100) * 1.05;
        const as = a?.strength || 100;
        let hg = 0, ag = 0;
        for (let i = 0; i < 90; i++) {
          if (Math.random() < 0.04) {
            if (Math.random() < hs / (hs + as)) hg++; else ag++;
          }
        }
        if (hg + ag === 0) { if (Math.random() < hs / (hs + as)) hg = 1; else ag = 1; }
        applyResult(L, f, [hg, ag], null);
        results.push({ fixtureId: f.id, score: [hg, ag] });
      }
    });
    return results;
  }

  function finishLeague(L) {
    L.status = 'finished';
    L.finishedAt = Date.now();
    L.nextRoundAt = null;
    const pub = publicLeague(L);
    const champ = pub.standings[0];
    L.champion = champ ? { userId: champ.userId, clubName: champ.clubName, pts: champ.pts } : null;
    if (typeof store?.onLeagueFinish === 'function') {
      try {
        store.onLeagueFinish({
          id: L.id,
          name: L.name,
          champion: L.champion,
          standings: pub.standings.slice(0, 3)
        });
      } catch (e) {
        console.warn('[league] onLeagueFinish', e.message || e);
      }
    }
    (L.entrants || []).filter((e) => !e.isBot).forEach((e) => {
      const row = pub.standings.find((s) => s.userId === e.userId);
      const rank = row?.rank || 99;
      const u = usersDb().users[e.userId];
      if (!u) return;
      const prize = rank === 1 ? 120000 : rank === 2 ? 70000 : rank === 3 ? 40000 : 15000;
      u.money = Math.max(0, (u.money || 0) + prize);
      u.xp = (u.xp || 0) + (rank === 1 ? 80 : rank <= 3 ? 45 : 20);
      u.level = levelFromXp(u.xp);
      if (rank === 1) {
        u.prestige = (u.prestige || 0) + 3;
        u.fame = (u.fame || 0) + 10;
        u.points = (u.points || 0) + 15;
      } else if (rank <= 3) {
        u.fame = (u.fame || 0) + 4;
        u.points = (u.points || 0) + 6;
      }
      saveUsers(usersDb());
      if (store?.pushLedger) store.pushLedger(e.userId, prize, `Лига · место ${rank}`);
      pushEvent(e.userId, {
        type: rank === 1 ? 'league_won' : 'league_done',
        title: rank === 1 ? 'Чемпион лиги!' : `Лига завершена · ${rank} место`,
        body: L.name,
        money: prize,
        leagueId: L.id
      });
    });
  }

  function advanceLiveLeague(L, now = Date.now(), { force = false } = {}) {
    if (L.status !== 'live') return null;
    if (!force && L.nextRoundAt && now < L.nextRoundAt) return null;
    const round = L.currentRound || 1;
    const played = playRound(L, round);
    if (round >= L.totalRounds) {
      finishLeague(L);
      return { action: 'finished', results: played };
    }
    L.currentRound = round + 1;
    L.nextRoundAt = now + ROUND_MS;
    return { action: 'round', round, results: played, nextRoundAt: L.nextRoundAt };
  }

  function joinLeague(user, clubName, opts = {}) {
    load();
    const br = bracketForLevel(user.level || 1);
    const existing = findMyLeague(user.id);
    if (existing) return { ok: false, error: 'Вы уже в лиге', league: publicLeague(existing, user.id) };
    let L = findOpenForBracket(br.id);
    if (!L) L = createOpenLeague(br);
    if (L.entrants.some((e) => e.userId === user.id)) return { ok: false, error: 'Уже записаны' };
    if (L.entrants.length >= L.size) L = createOpenLeague(br);
    const strength = opts.strength || (store?.clubStrength ? store.clubStrength(user.id) : 0);
    L.entrants.push({
      userId: user.id,
      clubName: clubName || user.clubName || 'Клуб',
      login: user.login,
      isBot: false,
      strength: strength || 100
    });
    L.table[user.id] = emptyRow();
    pushEvent(user.id, { type: 'league_joined', title: 'Запись в лигу', body: L.name, leagueId: L.id });
    if (L.entrants.filter((e) => !e.isBot).length >= 1 && L.entrants.length >= L.size) startLeague(L);
    save();
    return { ok: true, league: publicLeague(L, user.id) };
  }

  function leaveLeague(userId) {
    load();
    const L = Object.values(state.leagues).find(
      (x) => x.status === 'open' && (x.entrants || []).some((e) => e.userId === userId)
    );
    if (!L) return { ok: false, error: 'Нет открытой записи' };
    L.entrants = L.entrants.filter((e) => e.userId !== userId);
    delete L.table[userId];
    save();
    return { ok: true };
  }

  function tick() {
    load();
    ensureOpenLeagues();
    const now = Date.now();
    const results = [];
    Object.values(state.leagues).forEach((L) => {
      if (L.status !== 'open') return;
      const humans = (L.entrants || []).filter((e) => !e.isBot);
      const age = now - (L.createdAt || now);
      if (humans.length >= 1 && (L.entrants.length >= L.size || age > 5 * 60e3)) {
        ensureBotEntrants(L);
        if (L.entrants.length >= 4) {
          const r = startLeague(L);
          results.push({ id: L.id, action: 'started', ...r });
        }
      }
    });
    Object.values(state.leagues).forEach((L) => {
      if (L.status === 'live') {
        const r = advanceLiveLeague(L, now);
        if (r) results.push({ id: L.id, ...r });
      }
    });
    Object.keys(state.leagues).forEach((id) => {
      const L = state.leagues[id];
      if (L.status === 'finished' && L.finishedAt && now - L.finishedAt > FINISHED_KEEP_MS) {
        delete state.leagues[id];
        results.push({ id, action: 'pruned' });
      }
    });
    ensureOpenLeagues();
    state.meta.lastTick = now;
    const seasons = Object.values(state.leagues).map((L) => L.season || 1);
    if (seasons.length) {
      const maxSeason = Math.max(1, ...seasons);
      if (maxSeason >= (state.meta.seasonCounter || 1)) state.meta.seasonCounter = maxSeason;
    }
    save();
    return { ok: true, results };
  }

  function getLeague(id, viewerId) {
    load();
    return publicLeague(state.leagues[id], viewerId);
  }

  function listLeagues({ status, mineFor } = {}) {
    load();
    let list = Object.values(state.leagues).map((L) => publicLeague(L, mineFor));
    if (status) list = list.filter((L) => L.status === status);
    if (mineFor) {
      list = list.filter((L) => (state.leagues[L.id].entrants || []).some((e) => e.userId === mineFor));
    }
    list.sort((a, b) => {
      const order = { live: 0, open: 1, finished: 2 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });
    return list;
  }

  function calendarFor(userId) {
    load();
    const my = findMyLeague(userId);
    if (!my) return { season: state.meta.seasonCounter || 1, week: 1, items: [] };
    const items = [];
    (my.fixtures || [])
      .filter((f) => f.homeUserId === userId || f.awayUserId === userId)
      .forEach((f) => {
        const home = (my.entrants || []).find((e) => e.userId === f.homeUserId);
        const away = (my.entrants || []).find((e) => e.userId === f.awayUserId);
        items.push({
          type: 'league',
          leagueId: my.id,
          leagueName: my.name,
          round: f.round,
          when: f.playedAt || (f.round === my.currentRound ? my.nextRoundAt : null),
          status: f.playedAt ? 'done' : f.round < (my.currentRound || 1) ? 'missed' : f.round === my.currentRound ? 'next' : 'planned',
          home: home?.clubName,
          away: away?.clubName,
          score: f.score,
          matchId: f.matchId,
          homeUserId: f.homeUserId,
          awayUserId: f.awayUserId,
          season: my.season,
          week: f.round
        });
      });
    return {
      season: my.season,
      week: my.currentRound || 1,
      leagueId: my.id,
      leagueName: my.name,
      nextRoundAt: my.nextRoundAt,
      items: items.sort((a, b) => a.round - b.round)
    };
  }

  function adminForceRound(id) {
    load();
    const L = state.leagues[id];
    if (!L) return { ok: false, error: 'Нет лиги' };
    if (L.status === 'open') {
      ensureBotEntrants(L);
      const r = startLeague(L);
      save();
      return { ok: !!r.ok, ...r, league: publicLeague(L) };
    }
    if (L.status !== 'live') return { ok: false, error: 'Лига не live' };
    const r = advanceLiveLeague(L, Date.now(), { force: true });
    save();
    return { ok: true, ...r, league: publicLeague(L) };
  }

  function adminFinish(id) {
    load();
    const L = state.leagues[id];
    if (!L) return { ok: false, error: 'Нет лиги' };
    if (L.status === 'open') {
      ensureBotEntrants(L);
      startLeague(L);
    }
    while (L.status === 'live') advanceLiveLeague(L, Date.now(), { force: true });
    save();
    return { ok: true, league: publicLeague(L) };
  }

  function stats() {
    load();
    const list = Object.values(state.leagues);
    return {
      leaguesOpen: list.filter((L) => L.status === 'open').length,
      leaguesLive: list.filter((L) => L.status === 'live').length,
      leaguesFinished: list.filter((L) => L.status === 'finished').length,
      seasonCounter: state.meta.seasonCounter || 1,
      lastTick: state.meta.lastTick || 0,
      roundMs: ROUND_MS
    };
  }

  function startScheduler() {
    load();
    ensureOpenLeagues();
    save();
    setTimeout(() => {
      try { tick(); } catch (e) { console.error('[EYE league] tick', e); }
      setInterval(() => {
        try { tick(); } catch (e) { console.error('[EYE league] tick', e); }
      }, TICK_MS);
    }, 5000);
    console.log(`[EYE league] scheduler every ${TICK_MS / 1000}s · round ${ROUND_MS / 1000}s · size ${LEAGUE_SIZE}`);
  }

  return {
    LEAGUE_SIZE, ROUND_MS,
    joinLeague, leaveLeague, findMyLeague, getLeague, listLeagues,
    calendarFor, tick, publicLeague, adminForceRound, adminFinish,
    stats, startScheduler, ensureOpenLeagues
  };
}

module.exports = { createLeagueModule, buildRoundRobin, LEAGUE_SIZE };
