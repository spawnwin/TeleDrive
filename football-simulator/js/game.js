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
      lastTacticSwitchMinute: -99,
      ballAnim: { x: 0.5, y: 0.5, phase: 'idle' },
      momentum: 0,
      timerHandle: null,
      onCommentary: opts.onCommentary || (() => {}),
      onScore: opts.onScore || (() => {}),
      onMinute: opts.onMinute || (() => {}),
      onFinish: opts.onFinish || (() => {}),
      onState: opts.onState || (() => {})
    };
  }

  function homeStrengthNow() {
    const base = Save.teamStrength();
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

  function randomAttackerName(side) {
    if (side === 'home') {
      const pool = state.xi.fwd.concat(state.xi.mid);
      const p = pick(pool.length ? pool : state.xi.all);
      return p.name;
    }
    return choice(DATA.firstNames) + ' ' + choice(DATA.lastNames);
  }

  function say(text, kind) {
    state.onCommentary({ minute: state.minute, text, kind: kind || 'info' });
  }

  function triggerGoal(side) {
    if (side === 'home') state.score.home++; else state.score.away++;
    state.onScore(Object.assign({}, state.score));
    const teamName = side === 'home' ? state.homeName : state.awayName;
    say(fmt(pick(FLAVORS.goal), { team: teamName, player: randomAttackerName(side) }), 'goal');
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

    if (Math.random() < pChanceHome) resolveChance('home', home, away);
    if (Math.random() < pChanceAway) resolveChance('away', away, home);

    if (Math.random() < 0.01) say(pick(FLAVORS.card), 'card');
    if (Math.random() < 0.0035) say(pick(FLAVORS.injury), 'injury');
  }

  function resolveChance(side, atkTeam, defTeam) {
    const opp = side === 'home' ? state.awayName : state.homeName;
    const team = side === 'home' ? state.homeName : state.awayName;
    say(fmt(pick(FLAVORS.chance), { team }), 'chance');
    animateChance(side);
    const onTarget = Math.random() < 0.62;
    if (!onTarget) {
      if (Math.random() < 0.15) say(fmt(pick(FLAVORS.post), { team }), 'miss');
      else say(fmt(pick(FLAVORS.miss), { team }), 'miss');
      return;
    }
    const pGoal = clamp(0.28 + (atkTeam.attack - defTeam.defense) / 260, 0.08, 0.62);
    if (Math.random() < pGoal) {
      triggerGoal(side);
    } else {
      say(fmt(pick(FLAVORS.save), { opp }), 'save');
    }
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
    const bench = Save.data.squad.filter(p => p.pos === worst.pos && !state.xi.all.includes(p))
      .sort((a, b) => effectiveRating(b) - effectiveRating(a));
    if (!bench.length) return false;
    const inPlayer = bench[0];
    ['gk', 'def', 'mid', 'fwd'].forEach(group => {
      const idx = state.xi[group].indexOf(worst);
      if (idx !== -1) state.xi[group][idx] = inPlayer;
    });
    const allIdx = state.xi.all.indexOf(worst);
    if (allIdx !== -1) state.xi.all[allIdx] = inPlayer;
    state.subsUsed++;
    say(`Замена: ${worst.name} уступает место ${inPlayer.name}`, 'info');
    return true;
  }

  // ---------------- ТАКТИЧЕСКАЯ КАМЕРА ----------------
  /* Горизонтальное поле: хозяева атакуют слева направо.
     Оформление — телевизионный тактический план. */
  let animRaf = null;
  let particles = [];
  let ballTrail = [];

  function animateChance(side) {
    state.ballAnim.phase = 'attack';
    state.ballAnim.side = side;
    state.ballAnim.t = 0;
  }

  function renderLoop() {
    animRaf = requestAnimationFrame(renderLoop);
    render();
  }

  function shade(hex, pct) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + pct, g = ((n >> 8) & 0xff) + pct, b = (n & 0xff) + pct;
    return `rgb(${clamp(r,0,255)},${clamp(g,0,255)},${clamp(b,0,255)})`;
  }

  function kitColorHex() {
    const k = DATA.kitColors.find(k => k.id === Save.data.kit);
    return k ? k.color : '#B6F24A';
  }

  function geometry() {
    const padX = W * 0.035, top = H * 0.05, bottom = H - 14;
    return {
      L: padX, R: W - padX, T: top, B: bottom,
      cx: W / 2, cy: (top + bottom) / 2
    };
  }

  function drawPitch(g) {
    const st = state.stadium;
    ctx.fillStyle = '#060B09';
    ctx.fillRect(0, 0, W, H);

    const grad = ctx.createLinearGradient(0, g.T, 0, g.B);
    grad.addColorStop(0, shade(st.grass, 8));
    grad.addColorStop(1, shade(st.grass, -16));
    ctx.fillStyle = grad;
    ctx.fillRect(g.L, g.T, g.R - g.L, g.B - g.T);

    // подстриженные полосы
    ctx.save();
    ctx.beginPath(); ctx.rect(g.L, g.T, g.R - g.L, g.B - g.T); ctx.clip();
    const bands = 9, bw = (g.R - g.L) / bands;
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < bands; i += 2) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(g.L + i * bw, g.T, bw, g.B - g.T);
    }
    ctx.restore();

    // свет прожекторов
    const bloom = ctx.createRadialGradient(g.cx, g.T, 0, g.cx, g.T, (g.R - g.L) * 0.62);
    bloom.addColorStop(0, 'rgba(255,255,240,.10)');
    bloom.addColorStop(1, 'rgba(255,255,240,0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(g.L, g.T, g.R - g.L, g.B - g.T);

    // разметка
    ctx.strokeStyle = st.line;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(g.L, g.T, g.R - g.L, g.B - g.T);
    ctx.beginPath(); ctx.moveTo(g.cx, g.T); ctx.lineTo(g.cx, g.B); ctx.stroke();
    const rC = (g.B - g.T) * 0.20;
    ctx.beginPath(); ctx.arc(g.cx, g.cy, rC, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(g.cx, g.cy, 2, 0, Math.PI * 2);
    ctx.fillStyle = st.line; ctx.fill();

    // штрафные и ворота
    const boxW = (g.R - g.L) * 0.13, boxH = (g.B - g.T) * 0.52;
    const sixW = boxW * 0.42, sixH = boxH * 0.5;
    ctx.strokeRect(g.L, g.cy - boxH / 2, boxW, boxH);
    ctx.strokeRect(g.R - boxW, g.cy - boxH / 2, boxW, boxH);
    ctx.strokeRect(g.L, g.cy - sixH / 2, sixW, sixH);
    ctx.strokeRect(g.R - sixW, g.cy - sixH / 2, sixW, sixH);
    ctx.globalAlpha = 1;

    const goalH = (g.B - g.T) * 0.22;
    ctx.strokeStyle = '#F2F6F0'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(g.L, g.cy - goalH / 2); ctx.lineTo(g.L, g.cy + goalH / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(g.R, g.cy - goalH / 2); ctx.lineTo(g.R, g.cy + goalH / 2); ctx.stroke();
  }

  function drawSquads(g) {
    const f = DATA.formations[Save.data.formation];
    const push = clamp(state.momentum, -1, 1) * (g.R - g.L) * 0.05;
    const spanY = (g.B - g.T) * 0.78;
    const width = g.R - g.L;

    const home = kitColorHex();
    const away = state.rival.color;

    /* Линии команд заходят на чужую половину и переплетаются в центре —
       так план читается как живой матч, а не как два отдельных блока. */
    drawKeeper(g.L + width * 0.035 + push * 0.25, g.cy, home);
    drawLine(f.def, g.L + width * 0.19 + push, g, spanY, home);
    drawLine(f.mid, g.L + width * 0.38 + push, g, spanY, home);
    drawLine(f.fwd, g.L + width * 0.57 + push, g, spanY * 0.66, home);

    drawKeeper(g.R - width * 0.035 + push * 0.25, g.cy, away);
    drawLine(4, g.R - width * 0.19 + push, g, spanY, away);
    drawLine(4, g.R - width * 0.38 + push, g, spanY, away);
    drawLine(2, g.R - width * 0.57 + push, g, spanY * 0.66, away);
  }

  function drawLine(n, x, g, spanY, color) {
    if (!n) return;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      drawNode(x, g.cy - spanY / 2 + t * spanY, color);
    }
  }

  function drawKeeper(x, y, color) { drawNode(x, y, color, true); }

  function drawNode(x, y, color, keeper) {
    ctx.beginPath();
    ctx.ellipse(x, y + 7, 6, 2.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, keeper ? 5 : 5.8, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = keeper ? 'rgba(6,11,9,.9)' : 'rgba(6,11,9,.55)';
    ctx.stroke();
  }

  function playGoalFx(side) {
    const g = geometry();
    const x = side === 'home' ? g.R : g.L;
    for (let i = 0; i < 30; i++) {
      particles.push({
        x, y: g.cy,
        vx: (side === 'home' ? -1 : 1) * (1 + Math.random() * 4),
        vy: (Math.random() - 0.5) * 6,
        life: 42,
        color: side === 'home' ? kitColorHex() : state.rival.color
      });
    }
  }

  function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life--;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = p.life / 42;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3, 3);
      ctx.globalAlpha = 1;
    }
  }

  function drawBall(g) {
    let bx = g.cx, by = g.cy;
    if (state.ballAnim.phase === 'attack') {
      state.ballAnim.t = Math.min(1, (state.ballAnim.t || 0) + 0.05);
      const e = 1 - Math.pow(1 - state.ballAnim.t, 3);
      const dir = state.ballAnim.side === 'home' ? 1 : -1;
      bx = g.cx + dir * e * ((g.R - g.L) * 0.4);
      by = g.cy + Math.sin(e * Math.PI) * (g.B - g.T) * 0.12 * dir;
      if (state.ballAnim.t >= 1) state.ballAnim.phase = 'idle';
    }

    ballTrail.push({ x: bx, y: by });
    if (ballTrail.length > 9) ballTrail.shift();
    ballTrail.forEach((pt, i) => {
      ctx.globalAlpha = (i / ballTrail.length) * 0.4;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = '#F2F6F0'; ctx.fill();
    });
    ctx.globalAlpha = 1;

    ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#F2F6F0'; ctx.fill();
    ctx.strokeStyle = 'rgba(6,11,9,.6)'; ctx.lineWidth = 1; ctx.stroke();
  }

  function drawMomentum(g) {
    const barW = (g.R - g.L) * 0.5, x0 = g.cx - barW / 2, y = g.B + 7;
    ctx.fillStyle = 'rgba(233,241,234,.10)';
    ctx.fillRect(x0, y, barW, 2);
    const m = clamp(state.momentum, -1, 1);
    const w = (barW / 2) * Math.abs(m);
    ctx.fillStyle = m >= 0 ? kitColorHex() : state.rival.color;
    if (m >= 0) ctx.fillRect(g.cx, y, w, 2);
    else ctx.fillRect(g.cx - w, y, w, 2);
  }

  function render() {
    if (!state) return;
    // Холст может быть ещё не разложен (нулевая высота) — тогда геометрия
    // вырождается в отрицательные радиусы и canvas бросает IndexSizeError.
    if (W < 40 || H < 40) return;
    const g = geometry();
    drawPitch(g);
    drawSquads(g);
    drawBall(g);
    drawParticles();
    drawMomentum(g);
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
    Save.applyFatigue(state.xi);
    const result = { score: state.score };
    if (animRaf) cancelAnimationFrame(animRaf);
    state.onFinish(result);
  }

  return {
    init() { resize(); },
    start(opts) {
      resize();
      state = buildState(opts);
      state.running = true; state.paused = false;
      particles = []; ballTrail = [];
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
    currentMinute() { return state ? state.minute : 0; }
  };
})();
