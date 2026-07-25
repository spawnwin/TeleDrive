const MatchEngine = (() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = Math.max(1, window.devicePixelRatio || 1);

  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
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

    const pChanceHome = clamp(0.03 + (home.attack - away.defense) / 900, 0.008, 0.11);
    const pChanceAway = clamp(0.03 + (away.attack - home.defense) / 900, 0.008, 0.11);

    state.momentum = clamp(state.momentum * 0.85 + ((pChanceHome - pChanceAway) * 6), -1, 1);
    animateMomentum();

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
    say('🔥 Тренер произносит мотивационную речь перед трибунами!', 'boost');
    Save.unlockAchievement('intervention_used');
    return true;
  }

  function useIronwall() {
    if (state.ironwallUsed || !Save.owns('interventions', 'ironwall')) return false;
    state.ironwallUsed = true;
    state.boosts.push({ side: 'home', type: 'def', mul: 1.2, untilMinute: state.minute + 10 });
    say('🛡️ Команда перестраивается в железную стену обороны!', 'boost');
    Save.unlockAchievement('intervention_used');
    return true;
  }

  function setTactic(styleId) {
    if (Save.data.tacticStyle === styleId) return;
    Save.data.tacticStyle = styleId;
    Save.persist();
    if (state.masterclassCharge) {
      state.masterclassCharge = false;
      say('🧠 Тактический гений: команда мгновенно перестраивается без потерь!', 'boost');
    } else {
      state.tacticPenaltyUntil = state.minute + 5;
      say('🔄 Тренер меняет тактику — команде нужно немного времени на перестроение', 'info');
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
    say(`🔄 Замена: ${worst.name} уступает место ${inPlayer.name}`, 'info');
    return true;
  }

  // ---------------- ANIMATION ----------------
  let animRaf = null;
  function animateChance(side) {
    state.ballAnim.phase = 'attack';
    state.ballAnim.side = side;
    state.ballAnim.t = 0;
  }
  function animateMomentum() {}

  function renderLoop() {
    animRaf = requestAnimationFrame(renderLoop);
    render();
  }

  function drawPitch() {
    const stadium = state.stadium;
    ctx.fillStyle = stadium.sky; ctx.fillRect(0, 0, W, H * 0.12);
    const g = ctx.createLinearGradient(0, H * 0.12, 0, H);
    g.addColorStop(0, stadium.grass); g.addColorStop(1, shade(stadium.grass, -14));
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.12, W, H * 0.88);

    ctx.save(); ctx.globalAlpha = 0.05;
    const stripes = 8, top = H * 0.12, sh = (H - top) / stripes;
    for (let i = 0; i < stripes; i += 2) { ctx.fillStyle = '#fff'; ctx.fillRect(0, top + i * sh, W, sh); }
    ctx.restore();

    ctx.strokeStyle = stadium.line; ctx.globalAlpha = 0.8; ctx.lineWidth = 2;
    const pad = W * 0.06;
    ctx.strokeRect(pad, top + 6, W - pad * 2, H - top - 12);
    const cx = W / 2, cy = (top + H) / 2;
    ctx.beginPath(); ctx.moveTo(pad, cy); ctx.lineTo(W - pad, cy); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, W * 0.11, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    return { cx, cy, top, pad };
  }

  function shade(hex, pct) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + pct, g = ((n >> 8) & 0xff) + pct, b = (n & 0xff) + pct;
    r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  function kitColorHex() {
    const k = DATA.kitColors.find(k => k.id === Save.data.kit);
    return k ? k.color : '#22d3ee';
  }

  function drawDots(geo) {
    const { cx, cy, top, pad } = geo;
    const spanX = (W - pad * 2) * 0.8;
    const homeColor = kitColorHex(), awayColor = state.rival.color;
    const homeBiasY = clamp(state.momentum, -1, 1) * 14;
    const homeRows = [
      { n: DATA.formations[Save.data.formation].fwd, y: cy - 60 - homeBiasY },
      { n: DATA.formations[Save.data.formation].mid, y: cy - 24 - homeBiasY },
      { n: DATA.formations[Save.data.formation].def, y: cy + 40 - homeBiasY }
    ];
    homeRows.forEach(row => drawRow(row.n, row.y, cx, spanX, homeColor));
    ctx.beginPath(); ctx.arc(cx, cy + 90 - homeBiasY, 8, 0, Math.PI * 2); ctx.fillStyle = '#334155'; ctx.fill();

    const awayF = { def: 4, mid: 4, fwd: 2 };
    const awayRows = [
      { n: awayF.def, y: cy - 40 - homeBiasY },
      { n: awayF.mid, y: cy + 24 - homeBiasY },
      { n: awayF.fwd, y: cy + 60 - homeBiasY }
    ];
    awayRows.forEach(row => drawRow(row.n, row.y, cx, spanX, awayColor));
    ctx.beginPath(); ctx.arc(cx, cy - 90 - homeBiasY, 8, 0, Math.PI * 2); ctx.fillStyle = '#1e293b'; ctx.fill();
  }

  function drawRow(n, y, cx, spanX, color) {
    if (!n) return;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const x = cx - spanX / 2 + t * spanX;
      ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.stroke();
    }
  }

  let particles = [];
  function playGoalFx(side) {
    for (let i = 0; i < 26; i++) {
      particles.push({ x: W / 2, y: H / 2, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6 - 1, life: 45, color: side === 'home' ? kitColorHex() : state.rival.color });
    }
  }

  function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = p.life / 45;
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawBall(geo) {
    const { cx, cy } = geo;
    let bx = cx, by = cy;
    if (state.ballAnim.phase === 'attack') {
      state.ballAnim.t = Math.min(1, (state.ballAnim.t || 0) + 0.06);
      const dir = state.ballAnim.side === 'home' ? -1 : 1;
      by = cy + dir * state.ballAnim.t * (H * 0.32);
      if (state.ballAnim.t >= 1) state.ballAnim.phase = 'idle';
    }
    ctx.beginPath(); ctx.arc(bx, by, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#fefefe'; ctx.fill(); ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.stroke();
  }

  function render() {
    if (!state) return;
    const geo = drawPitch();
    drawDots(geo);
    drawBall(geo);
    drawParticles();
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
      particles = [];
      SFX.crowdAmbience(true);
      SFX.whistle();
      say('⚽ Судья дает стартовый свисток!', 'info');
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
