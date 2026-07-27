const MatchEngine = (() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = Math.max(1, window.devicePixelRatio || 1);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;           // экран матча ещё скрыт — размеры возьмём позже
    W = w; H = h;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);

  const FLAVORS = {
    chance: [
      '{team} создаёт опасный момент у штрафной!',
      '{team} проходит по флангу и навешивает в штрафную!',
      '{team} разыгрывает комбинацию до линии штрафной!',
      'Быстрая контратака {team}!',
      '{team} находит свободную зону перед воротами!'
    ],
    goal: [
      'ГОЛ!!! {player} ({team}) выводит команду вперёд!',
      'ГОЛ! {player} мощно пробивает в девятку!',
      'ГОЛ! {player} замыкает передачу точным ударом!',
      'ГОЛ! {player} оформляет великолепный удар!'
    ],
    save: ['Вратарь {opp} тащит мёртвый мяч!', 'Отличный сейв вратаря {opp}!', 'Вратарь {opp} в падении переводит мяч на угловой!'],
    miss: ['Удар {team} уходит выше ворот', '{team} не попадает в створ', 'Неточный удар {team}'],
    post: ['Мяч после удара {team} попадает в перекладину!', '{team} попадает в штангу!'],
    card: ['Жёлтая карточка сопернику за грубый снос', 'Судья показывает жёлтую карточку за фол'],
    injury: ['Игрок получил повреждение и вынужден покинуть поле'],
    halftime: ['Судья фиксирует окончание первого тайма'],
    fulltime: ['Финальный свисток! Матч завершён']
  };

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function fmt(str, o) { return str.replace(/\{(\w+)\}/g, (_, k) => o[k] || ''); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  let state = null;

  function buildState(opts) {
    const stadium = DATA.stadiums.find(s => s.id === opts.stadiumId) || DATA.stadiums[0];
    const weather = DATA.weathers.find(w => w.id === opts.weatherId) || DATA.weathers[0];
    const rival = DATA.clubs.find(c => c.id === opts.opponentId) || DATA.clubs[0];
    const homeStrength = Save.teamStrength();
    const rivalTacticId = pick(['attack', 'balance', 'balance', 'defense']);
    const rivalTactic = DATA.tacticStyles.find(t => t.id === rivalTacticId);

    return {
      opts, stadium, weather, rival,
      homeName: Save.data.clubName,
      awayName: rival.name,
      awayBaseAttack: rival.power,
      awayBaseDefense: rival.power,
      awayTactic: rivalTactic,
      minute: 0,
      injuryMinuteNext: null,
      score: { home: 0, away: 0 },
      running: false,
      paused: false,
      speed: 1,
      boosts: [], // {side:'home'|'away', type:'atk'|'def', mul, untilMinute}
      speechUsed: false,
      ironwallUsed: false,
      masterclassCharge: Save.owns('interventions', 'masterclass'),
      subsUsed: 0,
      tacticPenaltyUntil: 0,
      xi: homeStrength.xi,
      stats: {
        home: { shots: 0, onTarget: 0, poss: 0 },
        away: { shots: 0, onTarget: 0, poss: 0 }
      },
      scorers: [],
      redCard: false,
      lastTacticSwitchMinute: -99,
      momentum: 0,
      // состояние картинки на поле
      players: null,
      ball: { x: 0.5, y: 0.5, z: 0, px: 0, py: 0, move: null, t: 0, idle: 0 },
      ballQueue: [],
      possession: 'home',
      pressure: 0,
      net: null,
      timerHandle: null,
      onCommentary: opts.onCommentary || (() => {}),
      onScore: opts.onScore || (() => {}),
      onMinute: opts.onMinute || (() => {}),
      onFinish: opts.onFinish || (() => {}),
      onState: opts.onState || (() => {})
    };
  }

  function homeStrengthNow() {
    const base = Save.strengthOfXI(state.xi);
    let atk = base.attack, def = base.defense;
    for (const b of state.boosts) {
      if (b.side !== 'home' || b.untilMinute < state.minute) continue;
      if (b.type === 'atk') atk *= b.mul; else def *= b.mul;
    }
    if (state.minute < state.tacticPenaltyUntil) { atk *= 0.9; def *= 0.9; }
    return { attack: atk, defense: def };
  }

  function awayStrengthNow() {
    let atk = state.awayBaseAttack * state.awayTactic.atkMul * state.weather.atkMul;
    let def = state.awayBaseDefense * state.awayTactic.defMul * state.weather.defMul;
    for (const b of state.boosts) {
      if (b.side !== 'away' || b.untilMinute < state.minute) continue;
      if (b.type === 'atk') atk *= b.mul; else def *= b.mul;
    }
    return { attack: atk, defense: def };
  }

  /* Автор гола — настоящий игрок стартового состава: нападающие бьют чаще
     полузащитников, те чаще защитников. Гол пишется в его счёт. */
  function creditScorer() {
    const xi = state.xi;
    const weighted = [];
    xi.fwd.forEach(p => { for (let i = 0; i < 6; i++) weighted.push(p); });
    xi.mid.forEach(p => { for (let i = 0; i < 3; i++) weighted.push(p); });
    xi.def.forEach(p => weighted.push(p));
    const p = weighted.length ? pick(weighted) : xi.all[0];
    if (!p) return 'Неизвестный игрок';
    p.goals++;
    return p.name;
  }

  function removeFromXI(p) {
    ['gk', 'def', 'mid', 'fwd', 'all'].forEach(group => {
      const i = state.xi[group].indexOf(p);
      if (i !== -1) state.xi[group].splice(i, 1);
    });
  }

  function replaceInXI(out, inp) {
    ['gk', 'def', 'mid', 'fwd', 'all'].forEach(group => {
      const i = state.xi[group].indexOf(out);
      if (i !== -1) state.xi[group][i] = inp;
    });
  }

  function benchBest(pos) {
    return Save.data.squad
      .filter(p => Save.isAvailable(p) && !state.xi.all.includes(p) && (!pos || p.pos === pos))
      .sort((a, b) => effectiveRating(b) - effectiveRating(a))[0] || null;
  }

  function manDownPenalty() {
    state.boosts.push({ side: 'home', type: 'atk', mul: 0.85, untilMinute: 999 });
    state.boosts.push({ side: 'home', type: 'def', mul: 0.88, untilMinute: 999 });
  }

  function say(text, kind) {
    state.onCommentary({ minute: state.minute, text, kind: kind || 'info' });
  }

  function triggerGoal(side) {
    if (side === 'home') state.score.home++; else state.score.away++;
    state.onScore(Object.assign({}, state.score));
    const teamName = side === 'home' ? state.homeName : state.awayName;
    const scorer = side === 'home'
      ? creditScorer()
      : choice(DATA.firstNames) + ' ' + choice(DATA.lastNames);
    state.scorers.push({ side, name: scorer, minute: state.minute });
    say(fmt(pick(FLAVORS.goal), { team: teamName, player: scorer }), 'goal');
    playGoalFx(side);
    SFX.goal();
    if (navigator.vibrate) navigator.vibrate(side === 'home' ? [40, 60, 90] : 40);
  }

  function simulateMinute() {
    const home = homeStrengthNow();
    const away = awayStrengthNow();

    /* База момента подобрана так, чтобы равные команды выходили примерно
       на 1.3 гола за матч, а не на регулярные нули. */
    const pChanceHome = clamp(0.075 + (home.attack - away.defense) / 1100, 0.02, 0.14);
    const pChanceAway = clamp(0.075 + (away.attack - home.defense) / 1100, 0.02, 0.14);

    state.momentum = clamp(state.momentum * 0.85 + ((pChanceHome - pChanceAway) * 6), -1, 1);
    // вне атак мяч на картинке у той команды, за которой инициатива
    if (!state.ballQueue.length) state.possession = state.momentum >= 0 ? 'home' : 'away';

    // Владение: доля минут, проведённых с мячом, по соотношению сил.
    const share = (home.attack + home.defense) /
                  (home.attack + home.defense + away.attack + away.defense);
    if (Math.random() < share) state.stats.home.poss++; else state.stats.away.poss++;

    if (Math.random() < pChanceHome) resolveChance('home', home, away);
    if (Math.random() < pChanceAway) resolveChance('away', away, home);

    if (Math.random() < 0.012) cardEvent();
    if (Math.random() < 0.004) injuryEvent();
  }

  /* Жёлтая — предупреждение, вторая за матч превращается в удаление:
     игрок пропускает следующий матч, а команда доигрывает в меньшинстве. */
  function cardEvent() {
    const p = pick(state.xi.all);
    if (!p) return;
    p.yellows++;
    if (p.yellows >= 2 && !state.redCard) {
      state.redCard = true;
      p.suspendedFor = 1;
      removeFromXI(p);
      manDownPenalty();
      say(`${p.name} получает вторую жёлтую и уходит с поля — играем в меньшинстве`, 'card');
    } else {
      say(`${p.name} получает жёлтую карточку`, 'card');
    }
  }

  /* Травмированного меняет лучший доступный из запаса и тратит слот замены.
     Если замен не осталось — доигрываем в меньшинстве. */
  function injuryEvent() {
    const fit = state.xi.all.filter(p => !p.injuredFor);
    if (!fit.length) return;
    const p = pick(fit);
    p.injuredFor = randInt(2, 4);
    const rep = state.subsUsed < 3 ? (benchBest(p.pos) || benchBest(null)) : null;
    if (rep) {
      replaceInXI(p, rep);
      state.subsUsed++;
      say(`${p.name} повредился, вместо него выходит ${rep.name}`, 'injury');
    } else {
      removeFromXI(p);
      manDownPenalty();
      say(`${p.name} повредился, замен не осталось — доигрываем вдесятером`, 'injury');
    }
  }

  /* Исход момента решается до анимации, чтобы мяч на поле летел именно
     туда, куда ушёл по сюжету: в сетку, во вратаря, в штангу или мимо. */
  function resolveChance(side, atkTeam, defTeam) {
    const opp = side === 'home' ? state.awayName : state.homeName;
    const team = side === 'home' ? state.homeName : state.awayName;
    state.stats[side].shots++;

    let outcome;
    const onTarget = Math.random() < 0.62;
    if (!onTarget) {
      outcome = Math.random() < 0.15 ? 'post' : 'miss';
    } else {
      state.stats[side].onTarget++;
      const pGoal = clamp(0.28 + (atkTeam.attack - defTeam.defense) / 260, 0.08, 0.62);
      outcome = Math.random() < pGoal ? 'goal' : 'save';
    }

    say(fmt(pick(FLAVORS.chance), { team }), 'chance');
    animateAttack(side, outcome);

    if (outcome === 'post') say(fmt(pick(FLAVORS.post), { team }), 'miss');
    else if (outcome === 'miss') say(fmt(pick(FLAVORS.miss), { team }), 'miss');
    else if (outcome === 'goal') triggerGoal(side);
    else say(fmt(pick(FLAVORS.save), { opp }), 'save');
  }

  // ---------------- MANAGER ACTIONS ----------------
  function useSpeech() {
    if (state.speechUsed) return false;
    state.speechUsed = true;
    state.boosts.push({ side: 'home', type: 'atk', mul: 1.15, untilMinute: state.minute + 15 });
    state.boosts.push({ side: 'home', type: 'def', mul: 1.1, untilMinute: state.minute + 15 });
    say('Тренер поднимает команду мотивационной речью у бровки', 'boost');
    Save.unlockAchievement('intervention_used');
    return true;
  }

  function useIronwall() {
    if (state.ironwallUsed || !Save.owns('interventions', 'ironwall')) return false;
    state.ironwallUsed = true;
    state.boosts.push({ side: 'home', type: 'def', mul: 1.2, untilMinute: state.minute + 10 });
    say('Команда садится в глухую оборону — железная стена', 'boost');
    Save.unlockAchievement('intervention_used');
    return true;
  }

  function setTactic(styleId) {
    if (Save.data.tacticStyle === styleId) return;
    Save.data.tacticStyle = styleId;
    Save.persist();
    if (state.masterclassCharge) {
      state.masterclassCharge = false;
      say('Тактический разбор на ходу: перестроение без потери ритма', 'boost');
    } else {
      state.tacticPenaltyUntil = state.minute + 5;
      say('Смена тактики — команде нужно время на перестроение', 'info');
    }
  }

  function substitute() {
    if (state.subsUsed >= 3) return false;
    let worst = null, worstScore = Infinity;
    for (const p of state.xi.all) {
      if (p.fitness < worstScore) { worstScore = p.fitness; worst = p; }
    }
    if (!worst || worst.fitness > 70) return false;
    const inPlayer = benchBest(worst.pos);
    if (!inPlayer) return false;
    replaceInXI(worst, inPlayer);
    state.subsUsed++;
    say(`Замена: ${worst.name} уступает место ${inPlayer.name}`, 'info');
    return true;
  }

  // ================= ТАКТИЧЕСКАЯ КАМЕРА =================
  /* Поле в долях: x — от ворот хозяев (0) к воротам гостей (1), y — поперёк.
     Игроки дышат вокруг своих позиций и тянутся к мячу, мяч ходит по
     цепочке пасов, а момент завершается тем исходом, который выпал в
     симуляции. */

  let animRaf = null;
  let particles = [];
  let ballTrail = [];
  let flashes = [];
  let frame = 0;

  function geometry() {
    const padX = W * 0.03, padY = H * 0.055;
    const L = padX, R = W - padX, T = padY, B = H - padY - 11;
    return {
      L, R, T, B, w: R - L, h: B - T, cx: (L + R) / 2, cy: (T + B) / 2,
      px: u => L + u * (R - L),
      py: v => T + v * (B - T)
    };
  }

  // ---------- состав на поле ----------
  function buildPlayers() {
    const f = DATA.formations[Save.data.formation];
    const home = [], away = [];
    const line = (list, n, x, spread, mirror) => {
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        list.push({
          bx: mirror ? 1 - x : x,
          by: 0.5 + (t - 0.5) * spread,
          x: 0, y: 0,
          phase: Math.random() * Math.PI * 2,
          speed: 0.012 + Math.random() * 0.01
        });
      }
    };
    line(home, 1, 0.035, 0, false);
    line(home, f.def, 0.20, 0.78, false);
    line(home, f.mid, 0.40, 0.80, false);
    line(home, f.fwd, 0.58, 0.52, false);

    line(away, 1, 0.035, 0, true);
    line(away, 4, 0.20, 0.78, true);
    line(away, 4, 0.40, 0.80, true);
    line(away, 2, 0.58, 0.52, true);

    state.players = { home, away };
  }

  function updatePlayers(g) {
    frame++;
    // Команда с мячом поджимается вперёд, обороняющаяся отходит назад.
    const target = state.possession === 'home' ? 1 : state.possession === 'away' ? -1 : 0;
    state.pressure += (target - state.pressure) * 0.03;

    const b = state.ball;
    const move = (list, side) => {
      const dir = side === 'home' ? 1 : -1;
      const push = state.pressure * dir * 0.045;
      for (const p of list) {
        const drift = Math.sin(frame * p.speed + p.phase);
        let ux = p.bx + push + drift * 0.006;
        let uy = p.by + Math.cos(frame * p.speed * 0.8 + p.phase) * 0.012;
        // лёгкое тяготение к мячу — поле выглядит живым
        const d = Math.hypot(b.x - ux, b.y - uy);
        if (d < 0.28) {
          const k = (1 - d / 0.28) * 0.05;
          ux += (b.x - ux) * k;
          uy += (b.y - uy) * k;
        }
        p.x = g.px(clamp(ux, 0.012, 0.988));
        p.y = g.py(clamp(uy, 0.05, 0.95));
      }
    };
    move(state.players.home, 'home');
    move(state.players.away, 'away');
  }

  // ---------- мяч ----------
  function queueMove(tx, ty, dur, arc) {
    state.ballQueue.push({ tx, ty, dur, arc: arc || 0 });
  }

  function animateAttack(side, outcome) {
    state.possession = side;
    state.ballQueue.length = 0;

    const dir = side === 'home' ? 1 : -1;
    const goalU = side === 'home' ? 0.985 : 0.015;
    const at = u => side === 'home' ? u : 1 - u;
    const lane = () => 0.32 + Math.random() * 0.36;

    queueMove(at(0.58), lane(), 16, 0.1);          // выход из середины
    queueMove(at(0.78), lane(), 13, 0.08);         // подход к штрафной

    if (outcome === 'goal') {
      queueMove(goalU, 0.42 + Math.random() * 0.16, 11, 0.22);
      state.ballQueue[state.ballQueue.length - 1].onArrive = 'net';
    } else if (outcome === 'save') {
      queueMove(at(0.955), 0.44 + Math.random() * 0.12, 11, 0.18);
      state.ballQueue[state.ballQueue.length - 1].onArrive = 'save';
      queueMove(at(0.72), lane(), 18, 0.14);       // отскок в поле
    } else if (outcome === 'post') {
      queueMove(goalU, Math.random() < 0.5 ? 0.345 : 0.655, 11, 0.2);
      state.ballQueue[state.ballQueue.length - 1].onArrive = 'post';
      queueMove(at(0.7), lane(), 20, 0.2);
    } else {
      queueMove(at(1.04), Math.random() < 0.5 ? 0.16 : 0.84, 13, 0.3);
      state.ballQueue[state.ballQueue.length - 1].onArrive = 'out';
    }
    // после эпизода игра возвращается в середину
    queueMove(0.5 + dir * -0.06, 0.4 + Math.random() * 0.2, 26, 0.06);
  }

  function idlePass() {
    const side = state.possession || 'home';
    const list = state.players[side];
    if (!list || !list.length) return;
    const p = list[Math.max(1, Math.floor(Math.random() * list.length))];
    const g = geometry();
    queueMove(
      clamp((p.x - g.L) / g.w + (Math.random() - 0.5) * 0.04, 0.06, 0.94),
      clamp((p.y - g.T) / g.h + (Math.random() - 0.5) * 0.04, 0.08, 0.92),
      18 + Math.random() * 14, 0.05
    );
  }

  function updateBall(g) {
    const b = state.ball;

    if (!b.move && state.ballQueue.length) {
      const m = state.ballQueue.shift();
      b.move = m;
      b.fx = b.x; b.fy = b.y; b.t = 0;
    }
    if (!b.move) {
      b.idle = (b.idle || 0) + 1;
      if (b.idle > 26) { b.idle = 0; idlePass(); }
    } else {
      const m = b.move;
      m.dur = Math.max(1, m.dur);
      b.t = Math.min(1, b.t + 1 / m.dur);
      const e = b.t < 0.5 ? 2 * b.t * b.t : 1 - Math.pow(-2 * b.t + 2, 2) / 2;
      b.x = b.fx + (m.tx - b.fx) * e;
      b.y = b.fy + (m.ty - b.fy) * e;
      b.z = Math.sin(b.t * Math.PI) * m.arc;
      if (b.t >= 1) {
        if (m.onArrive === 'net') netRipple(m.tx);
        if (m.onArrive === 'post') { SFX.postHit(); flashes.push({ x: m.tx, y: m.ty, r: 0, life: 18, hue: '#F2F6F0' }); }
        if (m.onArrive === 'save') flashes.push({ x: m.tx, y: m.ty, r: 0, life: 14, hue: '#F2F6F0' });
        b.move = null; b.z = 0;
      }
    }

    const px = g.px(b.x), py = g.py(b.y) - b.z * g.h;
    ballTrail.push({ x: px, y: py });
    if (ballTrail.length > 11) ballTrail.shift();
    b.px = px; b.py = py;
  }

  function netRipple(u) {
    state.net = { side: u > 0.5 ? 'right' : 'left', life: 30 };
  }

  // ---------- поле ----------
  function drawPitch(g) {
    const st = state.stadium;
    ctx.fillStyle = '#050908';
    ctx.fillRect(0, 0, W, H);

    const grad = ctx.createLinearGradient(0, g.T, 0, g.B);
    grad.addColorStop(0, shade(st.grass, 14));
    grad.addColorStop(0.5, shade(st.grass, 2));
    grad.addColorStop(1, shade(st.grass, -18));
    ctx.fillStyle = grad;
    ctx.fillRect(g.L, g.T, g.w, g.h);

    ctx.save();
    ctx.beginPath(); ctx.rect(g.L, g.T, g.w, g.h); ctx.clip();

    // полосы газона
    const bands = 10, bw = g.w / bands;
    for (let i = 0; i < bands; i++) {
      ctx.globalAlpha = i % 2 ? 0.055 : 0.015;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(g.L + i * bw, g.T, bw, g.h);
    }
    ctx.globalAlpha = 1;

    // световые пятна прожекторов
    [0.25, 0.75].forEach(u => {
      const lx = g.px(u);
      const pool = ctx.createRadialGradient(lx, g.T, 0, lx, g.T, g.w * 0.42);
      pool.addColorStop(0, 'rgba(255,255,238,.13)');
      pool.addColorStop(1, 'rgba(255,255,238,0)');
      ctx.fillStyle = pool;
      ctx.fillRect(g.L, g.T, g.w, g.h);
    });

    // затемнение к краям
    const vig = ctx.createRadialGradient(g.cx, g.cy, g.h * 0.3, g.cx, g.cy, g.w * 0.7);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,.38)');
    ctx.fillStyle = vig;
    ctx.fillRect(g.L, g.T, g.w, g.h);
    ctx.restore();

    // разметка
    ctx.strokeStyle = st.line;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.3;
    ctx.strokeRect(g.L, g.T, g.w, g.h);
    ctx.beginPath(); ctx.moveTo(g.cx, g.T); ctx.lineTo(g.cx, g.B); ctx.stroke();

    const rC = g.h * 0.19;
    ctx.beginPath(); ctx.arc(g.cx, g.cy, rC, 0, Math.PI * 2); ctx.stroke();
    dot(g.cx, g.cy, 1.6, st.line);

    const boxW = g.w * 0.145, boxH = g.h * 0.56;
    const sixW = g.w * 0.055, sixH = g.h * 0.28;
    ctx.strokeRect(g.L, g.cy - boxH / 2, boxW, boxH);
    ctx.strokeRect(g.R - boxW, g.cy - boxH / 2, boxW, boxH);
    ctx.strokeRect(g.L, g.cy - sixH / 2, sixW, sixH);
    ctx.strokeRect(g.R - sixW, g.cy - sixH / 2, sixW, sixH);

    // точки пенальти и дуги штрафных
    const spot = g.w * 0.10;
    dot(g.L + spot, g.cy, 1.4, st.line);
    dot(g.R - spot, g.cy, 1.4, st.line);
    ctx.beginPath(); ctx.arc(g.L + spot, g.cy, rC * 0.8, -Math.PI / 2.6, Math.PI / 2.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(g.R - spot, g.cy, rC * 0.8, Math.PI - Math.PI / 2.6, Math.PI + Math.PI / 2.6); ctx.stroke();

    // угловые дуги
    const rc = Math.min(g.w, g.h) * 0.035;
    ctx.beginPath(); ctx.arc(g.L, g.T, rc, 0, Math.PI / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(g.L, g.B, rc, -Math.PI / 2, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(g.R, g.T, rc, Math.PI / 2, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(g.R, g.B, rc, Math.PI, Math.PI * 1.5); ctx.stroke();
    ctx.globalAlpha = 1;

    drawGoal(g, 'left');
    drawGoal(g, 'right');
  }

  function dot(x, y, r, color) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
  }

  function drawGoal(g, sideName) {
    const gh = g.h * 0.26, depth = g.w * 0.022;
    const x = sideName === 'left' ? g.L : g.R;
    const dirX = sideName === 'left' ? -1 : 1;
    const top = g.cy - gh / 2, bot = g.cy + gh / 2;

    // сетка
    ctx.save();
    const shaking = state.net && state.net.side === sideName ? state.net.life : 0;
    ctx.globalAlpha = 0.30 + (shaking ? 0.35 * (shaking / 30) : 0);
    ctx.strokeStyle = '#F2F6F0';
    ctx.lineWidth = 0.5;
    const cols = 5, rows = 4;
    for (let i = 0; i <= cols; i++) {
      const t = i / cols;
      ctx.beginPath();
      ctx.moveTo(x + dirX * depth * t, top);
      ctx.lineTo(x + dirX * depth * t, bot);
      ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      const y = top + (bot - top) * (j / rows);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dirX * depth, y);
      ctx.stroke();
    }
    ctx.restore();

    // штанги
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x, top); ctx.lineTo(x, bot);
    ctx.stroke();
  }

  // ---------- игроки и мяч ----------
  function drawSquads(g) {
    const home = kitColorHex(), away = state.rival.color;
    const b = state.ball;
    const nearest = { home: null, away: null };
    let bestD = { home: 1e9, away: 1e9 };
    ['home', 'away'].forEach(side => {
      state.players[side].forEach((p, i) => {
        if (i === 0) return;                    // вратарь не считается
        const d = Math.hypot(p.x - b.px, p.y - b.py);
        if (d < bestD[side]) { bestD[side] = d; nearest[side] = p; }
      });
    });
    const carrier = state.possession ? nearest[state.possession] : null;

    ['home', 'away'].forEach(side => {
      const color = side === 'home' ? home : away;
      state.players[side].forEach((p, i) => drawNode(p, color, i === 0, p === carrier));
    });
  }

  function drawNode(p, color, keeper, carrier) {
    const r = keeper ? 4.6 : 5.4;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 6, r * 1.15, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fill();

    if (carrier) {
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 4.5, 0, Math.PI * 2);
      ctx.strokeStyle = color; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.4;
      ctx.stroke(); ctx.globalAlpha = 1;
    }

    const grd = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.45, r * 0.15, p.x, p.y, r);
    grd.addColorStop(0, shadeHex(color, 42));
    grd.addColorStop(1, color);
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = grd; ctx.fill();
    ctx.lineWidth = keeper ? 1.6 : 1.1;
    ctx.strokeStyle = 'rgba(5,9,8,.75)';
    ctx.stroke();
  }

  function drawBall() {
    const b = state.ball;
    ballTrail.forEach((pt, i) => {
      const a = i / ballTrail.length;
      ctx.globalAlpha = a * a * 0.4;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 1.6 + a * 1.4, 0, Math.PI * 2);
      ctx.fillStyle = '#F2F6F0'; ctx.fill();
    });
    ctx.globalAlpha = 1;

    const lift = b.z * 40;
    ctx.beginPath();
    ctx.ellipse(b.px, b.py + lift + 5, 3.4, 1.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fill();

    const r = 3.6 + b.z * 8;
    const grd = ctx.createRadialGradient(b.px - 1.2, b.py - 1.4, 0.4, b.px, b.py, r);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(1, '#C9D4CC');
    ctx.beginPath(); ctx.arc(b.px, b.py, r, 0, Math.PI * 2);
    ctx.fillStyle = grd; ctx.fill();
    ctx.strokeStyle = 'rgba(5,9,8,.55)'; ctx.lineWidth = 0.8; ctx.stroke();
  }

  // ---------- эффекты ----------
  function playGoalFx(side) {
    const g = geometry();
    const x = side === 'home' ? g.R : g.L;
    flashes.push({ x: side === 'home' ? 0.985 : 0.015, y: 0.5, r: 0, life: 34,
                   hue: side === 'home' ? kitColorHex() : state.rival.color, big: true });
    for (let i = 0; i < 34; i++) {
      particles.push({
        x, y: g.cy,
        vx: (side === 'home' ? -1 : 1) * (1 + Math.random() * 4.5),
        vy: (Math.random() - 0.5) * 7,
        life: 46,
        color: side === 'home' ? kitColorHex() : state.rival.color
      });
    }
  }

  function drawEffects(g) {
    // эффекты живут только на газоне, иначе искры сыплются мимо поля
    ctx.save();
    ctx.beginPath(); ctx.rect(g.L, g.T, g.w, g.h); ctx.clip();

    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.life--;
      if (f.life <= 0) { flashes.splice(i, 1); continue; }
      const k = 1 - f.life / (f.big ? 34 : 18);
      ctx.globalAlpha = (1 - k) * 0.75;
      ctx.beginPath();
      ctx.arc(g.px(f.x), g.py(f.y), k * (f.big ? g.w * 0.35 : 16), 0, Math.PI * 2);
      ctx.strokeStyle = f.hue; ctx.lineWidth = f.big ? 2.5 : 1.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.14; p.life--;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = p.life / 46;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 2.6, 2.6);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (state.net) {
      state.net.life--;
      if (state.net.life <= 0) state.net = null;
    }
  }

  function drawPressure(g) {
    const barW = g.w * 0.46, x0 = g.cx - barW / 2, y = g.B + 6;
    ctx.fillStyle = 'rgba(233,241,234,.10)';
    ctx.fillRect(x0, y, barW, 2);
    const m = clamp(state.pressure, -1, 1);
    const w = (barW / 2) * Math.abs(m);
    ctx.fillStyle = m >= 0 ? kitColorHex() : state.rival.color;
    if (m >= 0) ctx.fillRect(g.cx, y, w, 2);
    else ctx.fillRect(g.cx - w, y, w, 2);
    ctx.fillStyle = 'rgba(233,241,234,.35)';
    ctx.fillRect(g.cx - 0.5, y - 2, 1, 6);
  }

  function shade(hex, pct) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) + pct, g = ((n >> 8) & 0xff) + pct, b = (n & 0xff) + pct;
    return `rgb(${clamp(r,0,255)},${clamp(g,0,255)},${clamp(b,0,255)})`;
  }
  function shadeHex(hex, pct) { return shade(hex, pct); }

  function kitColorHex() {
    const k = DATA.kitColors.find(k => k.id === Save.data.kit);
    return k ? k.color : '#B6F24A';
  }

  function renderLoop() {
    animRaf = requestAnimationFrame(renderLoop);
    render();
  }

  function render() {
    if (!state) return;
    // Холст может быть ещё не разложен (нулевая высота) — тогда геометрия
    // вырождается в отрицательные радиусы и canvas бросает IndexSizeError.
    if (W < 40 || H < 40) return;
    const g = geometry();
    if (!state.players) buildPlayers();
    updateBall(g);
    updatePlayers(g);
    drawPitch(g);
    drawSquads(g);
    drawBall();
    drawEffects(g);
    drawPressure(g);
  }

  // ---------------- LOOP / TIMING ----------------
  function scheduleNext() {
    if (!state.running || state.paused) return;
    const msPerMinute = 480 / state.speed;
    state.timerHandle = setTimeout(tick, msPerMinute);
  }

  function tick() {
    if (!state.running || state.paused) return;
    state.minute++;
    state.onMinute(state.minute);
    if (state.minute === 45) say(pick(FLAVORS.halftime), 'info');
    simulateMinute();
    if (state.minute >= 90) {
      finish();
      return;
    }
    scheduleNext();
  }

  function finish() {
    state.running = false;
    if (state.timerHandle) clearTimeout(state.timerHandle);
    say(pick(FLAVORS.fulltime), 'info');
    SFX.whistle();
    Save.applyPostMatch(state.xi, state.score.home > state.score.away);
    const result = {
      score: state.score,
      stats: publicStats(),
      scorers: state.scorers.slice()
    };
    if (animRaf) cancelAnimationFrame(animRaf);
    state.onFinish(result);
  }

  function publicStats() {
    const s = state.stats;
    const total = s.home.poss + s.away.poss;
    return {
      possHome: total ? Math.round(s.home.poss / total * 100) : 50,
      home: { shots: s.home.shots, onTarget: s.home.onTarget },
      away: { shots: s.away.shots, onTarget: s.away.onTarget }
    };
  }

  return {
    init() { resize(); },
    start(opts) {
      resize();
      state = buildState(opts);
      state.running = true; state.paused = false;
      particles = []; ballTrail = []; flashes = []; frame = 0;
      SFX.crowdAmbience(true);
      SFX.whistle();
      say('Судья даёт стартовый свисток', 'info');
      if (animRaf) cancelAnimationFrame(animRaf);
      renderLoop();
      scheduleNext();
    },
    setSpeed(n) { if (state) state.speed = n; },
    skip() {
      if (!state || !state.running) return;
      while (state.running && state.minute < 90) {
        state.minute++;
        if (state.minute === 45) {}
        simulateMinute();
        if (state.minute >= 90) { finish(); break; }
      }
      state && state.onMinute && state.onMinute(state.minute);
    },
    pause() { if (state) { state.paused = true; if (state.timerHandle) clearTimeout(state.timerHandle); } },
    resume() { if (state) { state.paused = false; scheduleNext(); } },
    stop() {
      if (state) { state.running = false; if (state.timerHandle) clearTimeout(state.timerHandle); }
      if (animRaf) cancelAnimationFrame(animRaf);
      SFX.crowdAmbience(false);
    },
    useSpeech() { return state && useSpeech(); },
    useIronwall() { return state && useIronwall(); },
    setTactic(id) { if (state) setTactic(id); },
    substitute() { return state && substitute(); },
    getSpeechUsed() { return state ? state.speechUsed : false },
    getIronwallUsed() { return state ? state.ironwallUsed : false },
    getSubsUsed() { return state ? state.subsUsed : 0 },
    getStats() { return state ? publicStats() : null; },
    getScorers() { return state ? state.scorers.slice() : []; },
    currentMinute() { return state ? state.minute : 0; }
  };
})();
