/* Match simulation engine */
window.EYE_ENGINE = (() => {
  const D = () => window.EYE_DATA;

  function teamStrength(club, opts = {}) {
    const form = club.formation || '4-3-3';
    const slots = D().FORMATIONS[form].slots;
    const XI = (club.lineup && club.lineup.length >= 11
      ? club.lineup
      : club.squad.slice(0, 11)).slice(0, 11);
    while (XI.length < 11) XI.push(D().genPlayer(slots[XI.length] || 'CM', 55));
    let atk = 0, def = 0, mid = 0, cond = 0;
    XI.forEach((p, i) => {
      const pos = slots[i];
      const g = D().POS_GROUP[pos];
      const formMod = (p.form || 60) / 70;
      const condMod = (p.condition || 80) / 90;
      const moraleMod = (p.morale || 60) / 70;
      const m = formMod * condMod * moraleMod * (p.injured > 0 ? 0.4 : 1) * (p.red ? 0 : 1);
      const a = p.attack * m;
      const d = p.defense * m;
      const t = ((p.tech + p.iq) / 2) * m;
      if (g === 'ATT') { atk += a * 1.25; mid += t * 0.4; }
      else if (g === 'MID') { mid += t * 1.1; atk += a * 0.55; def += d * 0.45; }
      else if (g === 'DEF') { def += d * 1.2; mid += t * 0.35; }
      else { def += d * 1.35; }
      cond += (p.condition || 80);
    });
    const style = club.style || 'balance';
    const styleMod = {
      attack: { a: 1.12, d: 0.9, m: 1 },
      balance: { a: 1, d: 1, m: 1 },
      defend: { a: 0.88, d: 1.14, m: 0.96 },
      possession: { a: 0.96, d: 1.02, m: 1.12 },
      counter: { a: 1.08, d: 1.06, m: 0.92 }
    }[style] || { a: 1, d: 1, m: 1 };
    const homeBoost = opts.home ? 1.04 : 1;
    return {
      attack: (atk / 11) * styleMod.a * homeBoost,
      defense: (def / 11) * styleMod.d,
      mid: (mid / 11) * styleMod.m,
      condition: cond / 11,
      xi: XI,
      slots
    };
  }

  function chance(homeS, awayS, minute) {
    const hChance = homeS.attack / (homeS.attack + awayS.defense + 1) * (0.55 + homeS.mid / (homeS.mid + awayS.mid + 1) * 0.45);
    const aChance = awayS.attack / (awayS.attack + homeS.defense + 1) * (0.55 + awayS.mid / (awayS.mid + homeS.mid + 1) * 0.45);
    const fatigue = minute > 75 ? 1.15 : minute > 60 ? 1.05 : 1;
    return { home: hChance * fatigue, away: aChance * fatigue };
  }

  function pickScorer(xi, slots) {
    const weights = xi.map((p, i) => {
      const g = D().POS_GROUP[slots[i]];
      const w = g === 'ATT' ? 3.2 : g === 'MID' ? 1.4 : g === 'DEF' ? 0.35 : 0.05;
      return Math.max(0.1, w * (p.attack / 70) * ((p.form || 60) / 60));
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return xi[i];
    }
    return xi[0];
  }

  function pickAssister(xi, scorer) {
    const pool = xi.filter(p => p.id !== scorer.id && D().POS_GROUP[p.pos] !== 'GK');
    if (!pool.length) return null;
    if (Math.random() < 0.28) return null;
    return D().pick(pool);
  }

  const COMMENT = {
    chance: ['Острый момент!', 'Выход один на один!', 'Опасная подача!', 'Стандарты — и снова угроза!', 'Быстрая комбинация!', 'Прострел в штрафную!'],
    shot: ['Удар!', 'Бьёт из-за штрафной!', 'Удар головой!', 'Прострел — удар!', 'Бьёт низом в угол!'],
    save: ['Вратарь спасает!', 'Потрясающий сейв!', 'Выносит кулаками!', 'Парирует на угол!'],
    miss: ['Мимо!', 'Штанга!', 'Перекладина!', 'Чуть выше!', 'Блок защитника!'],
    goal: ['ГОЛ!', 'В сетке!', 'Невероятный гол!', 'Разрезает оборону — и гол!', 'Холодный удар — гол!'],
    card: ['Жёлтая карточка.', 'Жёсткий фол — жёлтая.', 'Судья достаёт желтую.'],
    red: ['КРАСНАЯ КАРТОЧКА!', 'Удаление!', 'Вторая жёлтая — удаление!'],
    injury: ['Травма...', 'Игрок остаётся лежать.', 'Медики на поле.'],
    sub: ['Замена.', 'Тренер меняет игрока.', 'Свежие ноги на поле.']
  };

  /**
   * options: startMinute, endMinute, score, stats, applyFatigue, scorersH/A
   */
  function simulateMatch(home, away, options = {}) {
    const startMinute = options.startMinute || 1;
    const endMinute = options.endMinute || 90;
    const homeS = teamStrength(home, { home: true });
    const awayS = teamStrength(away, { home: false });
    const events = [];
    let hg = options.score ? options.score[0] : 0;
    let ag = options.score ? options.score[1] : 0;
    let possessionH = options.stats?.possession?.[0] ?? 50;
    let shotsH = options.stats?.shots?.[0] ?? 0;
    let shotsA = options.stats?.shots?.[1] ?? 0;
    let onH = options.stats?.onTarget?.[0] ?? 0;
    let onA = options.stats?.onTarget?.[1] ?? 0;
    const scorersH = options.scorersH ? [...options.scorersH] : [];
    const scorersA = options.scorersA ? [...options.scorersA] : [];

    for (let minute = startMinute; minute <= endMinute; minute++) {
      const midDiff = homeS.mid - awayS.mid;
      possessionH = Math.max(32, Math.min(68, possessionH + midDiff * 0.02 + (Math.random() - 0.5) * 1.2));

      const ch = chance(homeS, awayS, minute);
      const roll = Math.random();
      const attackSide = roll < ch.home * 0.085 ? 'home' : roll < (ch.home + ch.away) * 0.085 ? 'away' : null;

      if (attackSide) {
        const isHome = attackSide === 'home';
        const side = isHome ? homeS : awayS;
        const opp = isHome ? awayS : homeS;
        const quality = side.attack / (opp.defense + 1);
        events.push({ minute, type: 'chance', side: attackSide, text: D().pick(COMMENT.chance) });

        if (Math.random() < 0.72) {
          if (isHome) shotsH++; else shotsA++;
          events.push({ minute, type: 'shot', side: attackSide, text: D().pick(COMMENT.shot) });
          const onTarget = Math.random() < 0.45 + quality * 0.18;
          if (onTarget) {
            if (isHome) onH++; else onA++;
            const goalProb = Math.min(0.55, 0.18 + quality * 0.22);
            if (Math.random() < goalProb) {
              const scorer = pickScorer(side.xi, side.slots);
              const assist = pickAssister(side.xi, scorer);
              if (isHome) { hg++; scorersH.push({ player: scorer, minute, assist }); }
              else { ag++; scorersA.push({ player: scorer, minute, assist }); }
              events.push({
                minute, type: 'goal', side: attackSide, scorer, assist,
                text: `${D().pick(COMMENT.goal)} ${scorer.name}${assist ? ` (п. ${assist.name})` : ''}`,
                score: [hg, ag]
              });
            } else {
              events.push({ minute, type: 'save', side: attackSide === 'home' ? 'away' : 'home', text: D().pick(COMMENT.save) });
            }
          } else {
            events.push({ minute, type: 'miss', side: attackSide, text: D().pick(COMMENT.miss) });
          }
        }
      }

      if (Math.random() < 0.012) {
        const side = Math.random() < 0.5 ? 'home' : 'away';
        const xi = side === 'home' ? homeS.xi : awayS.xi;
        const p = D().pick(xi);
        if (Math.random() < 0.85) {
          p.yellow = (p.yellow || 0) + 1;
          events.push({ minute, type: 'card', side, player: p, text: `${D().pick(COMMENT.card)} ${p.name}` });
        } else {
          p.red = (p.red || 0) + 1;
          events.push({ minute, type: 'red', side, player: p, text: `${D().pick(COMMENT.red)} ${p.name}` });
        }
      }
      if (Math.random() < 0.004) {
        const side = Math.random() < 0.5 ? 'home' : 'away';
        const xi = side === 'home' ? homeS.xi : awayS.xi;
        const p = D().pick(xi.filter(x => !x.injured));
        if (p) {
          p.injured = D().rnd(1, 4);
          events.push({ minute, type: 'injury', side, player: p, text: `${D().pick(COMMENT.injury)} ${p.name}` });
        }
      }
    }

    if (options.applyFatigue !== false && endMinute >= 90 && startMinute <= 1) {
      homeS.xi.forEach(p => {
        p.seasonApps = (p.seasonApps || 0) + 1; p.apps = (p.apps || 0) + 1;
        p.condition = Math.max(40, (p.condition || 80) - D().rnd(4, 12));
        p.energy = Math.max(30, (p.energy || 80) - D().rnd(8, 18));
      });
      awayS.xi.forEach(p => {
        p.seasonApps = (p.seasonApps || 0) + 1; p.apps = (p.apps || 0) + 1;
        p.condition = Math.max(40, (p.condition || 80) - D().rnd(4, 12));
        p.energy = Math.max(30, (p.energy || 80) - D().rnd(8, 18));
      });
    } else if (options.applyFatigue && endMinute === 90) {
      // second half fatigue only
      homeS.xi.forEach(p => {
        p.seasonApps = (p.seasonApps || 0) + 1; p.apps = (p.apps || 0) + 1;
        p.condition = Math.max(40, (p.condition || 80) - D().rnd(4, 12));
        p.energy = Math.max(30, (p.energy || 80) - D().rnd(8, 18));
      });
      awayS.xi.forEach(p => {
        p.seasonApps = (p.seasonApps || 0) + 1; p.apps = (p.apps || 0) + 1;
        p.condition = Math.max(40, (p.condition || 80) - D().rnd(4, 12));
        p.energy = Math.max(30, (p.energy || 80) - D().rnd(8, 18));
      });
    }

    // only count new scorers from this segment for season stats when finishing
    if (options.finalizeStats) {
      const baseH = (options.scorersH || []).length;
      const baseA = (options.scorersA || []).length;
      scorersH.slice(baseH).forEach(s => {
        s.player.seasonGoals = (s.player.seasonGoals || 0) + 1;
        s.player.goals = (s.player.goals || 0) + 1;
        s.player.form = Math.min(99, (s.player.form || 60) + 3);
        if (s.assist) { s.assist.assists = (s.assist.assists || 0) + 1; s.assist.seasonAssists = (s.assist.seasonAssists || 0) + 1; }
      });
      scorersA.slice(baseA).forEach(s => {
        s.player.seasonGoals = (s.player.seasonGoals || 0) + 1;
        s.player.goals = (s.player.goals || 0) + 1;
        s.player.form = Math.min(99, (s.player.form || 60) + 3);
        if (s.assist) { s.assist.assists = (s.assist.assists || 0) + 1; s.assist.seasonAssists = (s.assist.seasonAssists || 0) + 1; }
      });
    } else if (!options.startMinute || options.startMinute === 1) {
      // legacy full-match path
      if (endMinute >= 90 && startMinute === 1) {
        scorersH.forEach(s => {
          s.player.seasonGoals = (s.player.seasonGoals || 0) + 1; s.player.goals = (s.player.goals || 0) + 1;
          s.player.form = Math.min(99, (s.player.form || 60) + 3);
          if (s.assist) { s.assist.assists = (s.assist.assists || 0) + 1; s.assist.seasonAssists = (s.assist.seasonAssists || 0) + 1; }
        });
        scorersA.forEach(s => {
          s.player.seasonGoals = (s.player.seasonGoals || 0) + 1; s.player.goals = (s.player.goals || 0) + 1;
          s.player.form = Math.min(99, (s.player.form || 60) + 3);
          if (s.assist) { s.assist.assists = (s.assist.assists || 0) + 1; s.assist.seasonAssists = (s.assist.seasonAssists || 0) + 1; }
        });
      }
    }

    return {
      home: home.name, away: away.name,
      homeId: home.id, awayId: away.id,
      score: [hg, ag],
      events,
      stats: {
        possession: [Math.round(possessionH), 100 - Math.round(possessionH)],
        shots: [shotsH, shotsA],
        onTarget: [onH, onA]
      },
      scorersH, scorersA,
      homeColor: home.color, awayColor: away.color,
      startMinute, endMinute
    };
  }

  function mergeResults(a, b) {
    return {
      ...b,
      events: [...(a.events || []), ...(b.events || [])],
      scorersH: b.scorersH,
      scorersA: b.scorersA,
      score: b.score,
      stats: b.stats,
      startMinute: a.startMinute || 1,
      endMinute: b.endMinute || 90
    };
  }

  async function playLive(result, onEvent, onTick, opts = {}) {
    const baseMs = opts.msPerMinute || 280;
    const from = opts.fromMinute || result.startMinute || 1;
    const to = opts.toMinute || result.endMinute || 90;
    let idx = 0;
    while (idx < result.events.length && result.events[idx].minute < from) idx++;
    for (let minute = from; minute <= to; minute++) {
      if (opts.aborted?.()) break;
      const msPerMinute = opts.aborted?.() ? 0 : baseMs;
      onTick?.(minute, result);
      while (idx < result.events.length && result.events[idx].minute === minute) {
        onEvent?.(result.events[idx], result);
        idx++;
        if (!opts.aborted?.()) await sleep(Math.min(160, msPerMinute * 0.35));
      }
      if (!opts.aborted?.()) await sleep(msPerMinute);
    }
    if (opts.aborted?.()) {
      while (idx < result.events.length && result.events[idx].minute <= to) {
        onEvent?.(result.events[idx++], result);
      }
    }
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  return { teamStrength, simulateMatch, mergeResults, playLive, sleep, COMMENT };
})();
