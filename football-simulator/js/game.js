const Match = (() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0, PAD = 0, pitchTop = 0, pitchBottom = 0, pitchLeft = 0, pitchRight = 0, goalW = 0;
  let dpr = Math.max(1, window.devicePixelRatio || 1);

  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    PAD = W * 0.07;
    pitchLeft = PAD; pitchRight = W - PAD;
    pitchTop = H * 0.09; pitchBottom = H * 0.93;
    goalW = (pitchRight - pitchLeft) * 0.34;
  }
  window.addEventListener('resize', resize);

  // ---------------- MATCH STATE ----------------
  let cfg = null;
  let running = false, paused = false;
  let half = 1, halfTime = 75, clock = 75;
  let score = { home: 0, away: 0 };
  let matchGoals = 0;
  let possessor = null;
  let possessTimer = 0;
  let ultra = 0, ultraReady = false;
  let ultraActive = null, ultraActiveTimer = 0;
  let cooldownTackle = 0;
  let ball, homeGK, awayGK, homePlayers, awayPlayers, allOutfield;
  let weather, stadium, rival, aiSkill;
  let replayBuffer = [];
  let replaying = false, replayIdx = 0, replayFrom = null;
  let onFinish = null;
  let particles = [];
  let matchStats = { homeGoals: 0, awayGoals: 0, wentBehind: false };
  let lastTime = 0;
  let rafId = null;
  let shakeT = 0, shakeMag = 0;

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  // ---------------- ENTITIES ----------------
  function makePlayer(team, role, x, y, isUser) {
    return { team, role, x, y, vx: 0, vy: 0, dirX: 0, dirY: -1, r: 13, isUser: !!isUser, speed: 2.55, stamina: 1 };
  }

  function setupMatch(options) {
    cfg = options;
    rival = DATA.rivals.find(r => r.id === options.rivalId) || DATA.rivals[0];
    stadium = DATA.stadiums.find(s => s.id === options.stadiumId) || DATA.stadiums[0];
    weather = DATA.weathers.find(w => w.id === options.weatherId) || DATA.weathers[0];
    const diff = DATA.difficulties.find(d => d.id === options.difficultyId) || DATA.difficulties[1];
    aiSkill = clamp(diff.aiSkill + (rival.power - 4) * 0.03, 0.4, 1.05);
    onFinish = options.onFinish || null;

    half = 1; halfTime = options.halfSeconds || 75; clock = halfTime;
    score = { home: 0, away: 0 };
    matchStats = { homeGoals: 0, awayGoals: 0, wentBehind: false };
    ultra = 0; ultraReady = false; ultraActive = null; ultraActiveTimer = 0;
    replayBuffer = []; replaying = false;
    particles = [];

    resize();
    kickoffSetup();
    running = true; paused = false;
    lastTime = performance.now();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
    SFX.whistle();
    SFX.crowdAmbience(true);
  }

  function kickoffSetup() {
    const cx = (pitchLeft + pitchRight) / 2;
    const cy = (pitchTop + pitchBottom) / 2;
    ball = { x: cx, y: cy, vx: 0, vy: 0, z: 0, vz: 0, r: 8 };

    homeGK = makePlayer('home', 'gk', cx, pitchBottom - 14);
    awayGK = makePlayer('away', 'gk', cx, pitchTop + 14);

    homePlayers = [
      makePlayer('home', 'user', cx, cy + 70, true),
      makePlayer('home', 'mate', cx - 90, cy + 40),
      makePlayer('home', 'mate', cx + 90, cy + 40)
    ];
    awayPlayers = [
      makePlayer('away', 'opp', cx, cy - 70),
      makePlayer('away', 'opp', cx - 90, cy - 40),
      makePlayer('away', 'opp', cx + 90, cy - 40)
    ];
    allOutfield = homePlayers.concat(awayPlayers);
    possessor = null; possessTimer = 0;
  }

  // ---------------- INPUT ----------------
  const input = { joyX: 0, joyY: 0, charging: false, chargeStart: 0, swipeStartY: 0, swipeUp: false };

  function setupInput() {
    const zone = document.getElementById('joystick-zone');
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    let joyActive = false, joyId = null, baseX = 0, baseY = 0, maxR = 46;

    zone.addEventListener('pointerdown', e => {
      joyActive = true; joyId = e.pointerId;
      const rect = zone.getBoundingClientRect();
      baseX = e.clientX - rect.left; baseY = e.clientY - rect.top;
      base.style.left = (baseX - 54) + 'px'; base.style.top = (baseY - 54) + 'px';
      base.style.bottom = 'auto';
      knob.style.left = '31px'; knob.style.top = '31px';
      zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener('pointermove', e => {
      if (!joyActive || e.pointerId !== joyId) return;
      const rect = zone.getBoundingClientRect();
      let dx = (e.clientX - rect.left) - baseX;
      let dy = (e.clientY - rect.top) - baseY;
      const d = Math.hypot(dx, dy);
      if (d > maxR) { dx = dx / d * maxR; dy = dy / d * maxR; }
      knob.style.left = (31 + dx) + 'px'; knob.style.top = (31 + dy) + 'px';
      input.joyX = dx / maxR; input.joyY = dy / maxR;
    });
    function endJoy(e) {
      if (e.pointerId !== joyId) return;
      joyActive = false; joyId = null;
      input.joyX = 0; input.joyY = 0;
      knob.style.left = '31px'; knob.style.top = '31px';
      base.style.left = ''; base.style.top = ''; base.style.bottom = '30px';
    }
    zone.addEventListener('pointerup', endJoy);
    zone.addEventListener('pointercancel', endJoy);

    const actionBtn = document.getElementById('btn-action');
    const powerFill = document.getElementById('power-meter-fill');
    actionBtn.addEventListener('pointerdown', e => {
      SFX.unlock();
      input.charging = true; input.chargeStart = performance.now();
      input.swipeStartY = e.clientY; input.swipeUp = false;
      actionBtn.classList.add('charging');
      actionBtn.setPointerCapture(e.pointerId);
    });
    actionBtn.addEventListener('pointermove', e => {
      if (!input.charging) return;
      if (input.swipeStartY - e.clientY > 40) input.swipeUp = true;
    });
    actionBtn.addEventListener('pointerup', () => {
      if (!input.charging) return;
      const held = performance.now() - input.chargeStart;
      input.charging = false;
      actionBtn.classList.remove('charging');
      powerFill.style.height = '0%';
      doAction(held, input.swipeUp);
    });
    actionBtn.addEventListener('pointercancel', () => {
      input.charging = false; actionBtn.classList.remove('charging'); powerFill.style.height = '0%';
    });

    document.getElementById('btn-ultra').addEventListener('pointerdown', () => {
      if (ultraReady) activateUltra();
    });

    document.getElementById('btn-pause').addEventListener('click', () => Match.pause());
  }

  function userPlayer() { return homePlayers[0]; }

  function nearestTeammate(p, list) {
    let best = null, bd = Infinity;
    for (const t of list) {
      if (t === p) continue;
      const d = dist(t, p);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  function doAction(heldMs, swipeUp) {
    const p = userPlayer();
    if (possessor !== p) return; // no ball, no action
    if (heldMs < 180) {
      const mate = nearestTeammateAheadOf(p);
      if (mate) kickBallTo(mate.x, mate.y - 40, 6.2, 0);
      SFX.pass();
      addUltra(1.5);
    } else {
      const power = clamp(heldMs / 1100, 0.35, 1);
      const targetX = (pitchLeft + pitchRight) / 2 + (p.x - (pitchLeft + pitchRight) / 2) * -0.15;
      const targetY = pitchTop;
      let speed = lerp(7, 16.5, power);
      let vz = swipeUp ? lerp(3, 7.5, power) : 0.6;
      if (ultraActive === 'fireshot') {
        speed *= 1.35; vz = swipeUp ? vz : 1.2;
        spawnFireTrail();
        ultraActive = null; ultraActiveTimer = 0;
      }
      const dx = targetX - ball.x, dy = targetY - ball.y;
      const d = Math.hypot(dx, dy) || 1;
      ball.vx = (dx / d) * speed; ball.vy = (dy / d) * speed; ball.vz = vz;
      possessor = null; possessTimer = 20;
      SFX.kick();
      addUltra(3 + power * 4);
      shake(4 + power * 5);
    }
  }

  function nearestTeammateAheadOf(p) {
    let best = null, bd = Infinity;
    for (const t of homePlayers) {
      if (t === p) continue;
      const d = dist(t, p);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  function kickBallTo(tx, ty, speed, vz) {
    const dx = tx - ball.x, dy = ty - ball.y;
    const d = Math.hypot(dx, dy) || 1;
    ball.vx = (dx / d) * speed; ball.vy = (dy / d) * speed; ball.vz = vz || 0.3;
    possessor = null; possessTimer = 14;
  }

  function addUltra(n) {
    if (ultraActive) return;
    ultra = clamp(ultra + n, 0, 100);
    ultraReady = ultra >= 100;
    document.getElementById('ultra-bar-fill').style.width = ultra + '%';
    const btn = document.getElementById('btn-ultra');
    btn.disabled = !ultraReady;
  }

  function activateUltra() {
    const ability = Save.data.equippedAbility || 'fireshot';
    ultra = 0; ultraReady = false;
    document.getElementById('ultra-bar-fill').style.width = '0%';
    document.getElementById('btn-ultra').disabled = true;
    SFX.ultra();
    Save.unlockAchievement('ultra_used');
    if (ability === 'timewarp') {
      ultraActive = 'timewarp'; ultraActiveTimer = 180;
      showToast('⏱️ РАЗРЫВ ВРЕМЕНИ!');
    } else if (ability === 'magnet') {
      ultraActive = 'magnet'; ultraActiveTimer = 240;
      showToast('🧲 МАГНИТ-ДРИБЛИНГ!');
    } else {
      ultraActive = 'fireshot'; ultraActiveTimer = 400;
      showToast('🔥 ОГНЕННЫЙ УДАР ГОТОВ!');
    }
  }

  function spawnFireTrail() {
    for (let i = 0; i < 18; i++) {
      particles.push({ type: 'fire', x: ball.x, y: ball.y, life: 40, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2 });
    }
  }

  function shake(mag) { shakeT = 14; shakeMag = mag; }

  function showToast(text) {
    const layer = document.getElementById('toast-layer');
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = text;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1900);
  }

  // ---------------- AI ----------------
  function updateAI(dt) {
    const cx = (pitchLeft + pitchRight) / 2;
    const homeHasBall = possessor && possessor.team === 'home';
    const awayHasBall = possessor && possessor.team === 'away';
    const slow = ultraActive === 'timewarp' ? 0.4 : 1;

    // home AI mates (skip user index 0)
    for (let i = 1; i < homePlayers.length; i++) {
      const p = homePlayers[i];
      let tx, ty;
      if (homeHasBall) {
        tx = cx + (i === 1 ? -110 : 110); ty = (possessor ? possessor.y : ball.y) - 90;
      } else if (awayHasBall) {
        tx = ball.x + (i === 1 ? -40 : 40); ty = ball.y + 60;
      } else {
        tx = ball.x + (i === 1 ? -60 : 60); ty = ball.y + 30;
      }
      steerTo(p, tx, ty, 1);
    }

    // away AI
    for (let i = 0; i < awayPlayers.length; i++) {
      const p = awayPlayers[i];
      let tx, ty;
      if (awayHasBall) {
        if (possessor === p) {
          tx = cx + (p.x > cx ? 40 : -40); ty = pitchBottom - 120;
          if (dist(p, { x: cx, y: pitchBottom }) < 230 && Math.random() < 0.012 * aiSkill) {
            aiShoot(p);
          }
        } else {
          tx = cx + (i === 0 ? 0 : i === 1 ? -100 : 100); ty = (possessor ? possessor.y : ball.y) + 80;
        }
      } else if (homeHasBall) {
        tx = ball.x + (i - 1) * 50; ty = ball.y - 40;
      } else {
        tx = ball.x + (i - 1) * 40; ty = ball.y - 20;
      }
      steerTo(p, tx, ty, slow);
    }

    // goalkeepers
    const gkSpan = goalW / 2 - 14;
    homeGK.x = lerp(homeGK.x, clamp(ball.x, cx - gkSpan, cx + gkSpan), 0.08);
    homeGK.y = pitchBottom - 14;
    awayGK.x = lerp(awayGK.x, clamp(ball.x, cx - gkSpan, cx + gkSpan), 0.08);
    awayGK.y = pitchTop + 14;
  }

  function aiShoot(p) {
    const cx = (pitchLeft + pitchRight) / 2;
    const targetX = cx + (Math.random() - 0.5) * goalW * 0.7;
    kickBallTo(targetX, pitchBottom, lerp(8, 13, aiSkill), Math.random() < 0.3 ? 3 : 0.5);
    SFX.kick();
  }

  function steerTo(p, tx, ty, mult) {
    const dx = tx - p.x, dy = ty - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const spd = p.speed * mult;
    p.vx = lerp(p.vx, (dx / d) * spd, 0.18);
    p.vy = lerp(p.vy, (dy / d) * spd, 0.18);
  }

  // ---------------- PHYSICS ----------------
  function updateUser(dt) {
    const p = userPlayer();
    const mag = clamp(Math.hypot(input.joyX, input.joyY), 0, 1);
    if (mag > 0.05) {
      p.dirX = input.joyX / (mag || 1); p.dirY = input.joyY / (mag || 1);
    }
    p.vx = lerp(p.vx, input.joyX * p.speed, 0.25);
    p.vy = lerp(p.vy, input.joyY * p.speed, 0.25);

    if (input.charging) {
      const held = performance.now() - input.chargeStart;
      document.getElementById('power-meter-fill').style.height = clamp(held / 1100, 0, 1) * 100 + '%';
    }
  }

  function movePlayers() {
    for (const p of allOutfield) {
      p.x += p.vx; p.y += p.vy;
      p.x = clamp(p.x, pitchLeft + 8, pitchRight - 8);
      p.y = clamp(p.y, pitchTop + 8, pitchBottom - 8);
    }
    // soft separation
    for (let i = 0; i < allOutfield.length; i++) {
      for (let j = i + 1; j < allOutfield.length; j++) {
        const a = allOutfield[i], b = allOutfield[j];
        const d = dist(a, b);
        const minD = a.r + b.r;
        if (d < minD && d > 0.01) {
          const push = (minD - d) / 2;
          const nx = (a.x - b.x) / d, ny = (a.y - b.y) / d;
          a.x += nx * push; a.y += ny * push;
          b.x -= nx * push; b.y -= ny * push;
        }
      }
    }
  }

  function updateBall() {
    if (ball.z > 0 || ball.vz !== 0) {
      ball.z += ball.vz;
      ball.vz -= 0.35;
      if (ball.z <= 0) { ball.z = 0; ball.vz = 0; }
    }
    ball.vx += weather.windX;
    ball.x += ball.vx; ball.y += ball.vy;
    const fr = ball.z > 4 ? 0.996 : weather.friction;
    ball.vx *= fr; ball.vy *= fr;

    const cx = (pitchLeft + pitchRight) / 2;
    const gL = cx - goalW / 2, gR = cx + goalW / 2;

    if (ball.x < pitchLeft + ball.r) { ball.x = pitchLeft + ball.r; ball.vx *= -0.6; }
    if (ball.x > pitchRight - ball.r) { ball.x = pitchRight - ball.r; ball.vx *= -0.6; }

    if (ball.y < pitchTop + ball.r) {
      if (ball.x > gL && ball.x < gR && ball.z < 18) {
        scoreGoal('home');
      } else {
        ball.y = pitchTop + ball.r; ball.vy *= -0.6; SFX.postHit();
      }
    }
    if (ball.y > pitchBottom - ball.r) {
      if (ball.x > gL && ball.x < gR && ball.z < 18) {
        scoreGoal('away');
      } else {
        ball.y = pitchBottom - ball.r; ball.vy *= -0.6; SFX.postHit();
      }
    }
  }

  function updatePossession() {
    if (possessTimer > 0) { possessTimer--; return; }
    const candidates = allOutfield.concat([homeGK, awayGK]);
    let best = null, bd = 22;
    for (const p of candidates) {
      const d = dist(p, ball);
      if (d < bd && ball.z < 6) { bd = d; best = p; }
    }
    if (best) {
      if (possessor !== best) {
        if (possessor && possessor.team !== best.team) SFX.tackle();
        possessor = best;
      }
      const stickiness = (ultraActive === 'magnet' && best.isUser) ? 0.55 : 0.32;
      const ang = Math.atan2(best.vy, best.vx);
      const fx = (Math.abs(best.vx) + Math.abs(best.vy)) > 0.05 ? Math.cos(ang) : best.dirX || 0;
      const fy = (Math.abs(best.vx) + Math.abs(best.vy)) > 0.05 ? Math.sin(ang) : best.dirY || -1;
      const tx = best.x + fx * 20, ty = best.y + fy * 20;
      ball.x = lerp(ball.x, tx, stickiness);
      ball.y = lerp(ball.y, ty, stickiness);
      ball.vx *= 0.8; ball.vy *= 0.8; ball.z = 0; ball.vz = 0;
      if (best.isUser && Math.random() < 0.01) addUltra(0.6);
    }
  }

  function scoreGoal(who) {
    score[who]++;
    matchStats[who === 'home' ? 'homeGoals' : 'awayGoals']++;
    if (who === 'home') { matchGoals++; addUltra(20); }
    updateScoreHud();
    SFX.goal();
    if (navigator.vibrate) navigator.vibrate(who === 'home' ? [40, 60, 90] : 40);
    showToast(who === 'home' ? '⚽ ГОЛ!' : 'ГОЛ СОПЕРНИКА');
    if (who === 'home' && score.home === 3) Save.unlockAchievement('hat_trick');
    startReplay();
  }

  function updateScoreHud() {
    document.getElementById('hud-score').textContent = `${score.home} : ${score.away}`;
  }

  // ---------------- REPLAY ----------------
  function pushReplayFrame() {
    replayBuffer.push({
      ball: { x: ball.x, y: ball.y, z: ball.z },
      players: allOutfield.map(p => ({ x: p.x, y: p.y, team: p.team, r: p.r })),
      gk: [{ x: homeGK.x, y: homeGK.y, r: homeGK.r }, { x: awayGK.x, y: awayGK.y, r: awayGK.r }]
    });
    if (replayBuffer.length > 210) replayBuffer.shift();
  }

  function startReplay() {
    replaying = true; replayIdx = Math.max(0, replayBuffer.length - 150);
    document.getElementById('replay-badge').classList.add('show');
  }

  function endReplay() {
    replaying = false;
    document.getElementById('replay-badge').classList.remove('show');
    kickoffSetup();
  }

  // ---------------- RENDER ----------------
  function drawPitch() {
    ctx.fillStyle = stadium.sky;
    ctx.fillRect(0, 0, W, pitchTop);
    const g = ctx.createLinearGradient(0, pitchTop, 0, pitchBottom);
    g.addColorStop(0, stadium.grass);
    g.addColorStop(1, shade(stadium.grass, -12));
    ctx.fillStyle = g;
    ctx.fillRect(0, pitchTop, W, pitchBottom - pitchTop);

    // stripes
    ctx.save();
    ctx.globalAlpha = 0.06;
    const stripes = 10;
    const sh = (pitchBottom - pitchTop) / stripes;
    for (let i = 0; i < stripes; i += 2) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(pitchLeft, pitchTop + i * sh, pitchRight - pitchLeft, sh);
    }
    ctx.restore();

    ctx.strokeStyle = stadium.line; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
    ctx.strokeRect(pitchLeft, pitchTop, pitchRight - pitchLeft, pitchBottom - pitchTop);
    const cx = (pitchLeft + pitchRight) / 2, cy = (pitchTop + pitchBottom) / 2;
    ctx.beginPath(); ctx.moveTo(pitchLeft, cy); ctx.lineTo(pitchRight, cy); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fillStyle = stadium.line; ctx.fill();

    const boxW = goalW + 60, boxH = 60;
    ctx.strokeRect(cx - boxW / 2, pitchTop, boxW, boxH);
    ctx.strokeRect(cx - boxW / 2, pitchBottom - boxH, boxW, boxH);

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#f5fff9';
    ctx.fillRect(cx - goalW / 2, pitchTop - 8, goalW, 8);
    ctx.fillRect(cx - goalW / 2, pitchBottom, goalW, 8);
    ctx.strokeStyle = '#f5fff9'; ctx.lineWidth = 3;
    ctx.strokeRect(cx - goalW / 2, pitchTop - 8, goalW, 8);
    ctx.strokeRect(cx - goalW / 2, pitchBottom, goalW, 8);

    if (stadium.id === 'night' || weather.id === 'night') {
      for (const fx of [pitchLeft - 10, pitchRight + 10]) {
        for (const fy of [pitchTop - 4, pitchBottom]) {
          const rg = ctx.createRadialGradient(fx, fy, 0, fx, fy, 90);
          rg.addColorStop(0, 'rgba(255,255,220,.18)'); rg.addColorStop(1, 'rgba(255,255,220,0)');
          ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(fx, fy, 90, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  function shade(hex, pct) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + pct, g = ((n >> 8) & 0xff) + pct, b = (n & 0xff) + pct;
    r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  function drawPlayer(p, color, label, team) {
    const shy = p.y + 4;
    ctx.beginPath(); ctx.ellipse(p.x, shy + 10, 12, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill();

    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = team === 'away' ? 2.5 : 2;
    ctx.strokeStyle = team === 'away' ? 'rgba(10,12,20,.85)' : 'rgba(255,255,255,.65)';
    ctx.stroke();
    if (label) {
      ctx.fillStyle = '#fff'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(label, p.x, p.y + 3);
    }
    if (p.isUser) {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  function drawBall() {
    const scale = 1 + ball.z * 0.02;
    ctx.beginPath(); ctx.ellipse(ball.x, ball.y + ball.z * 0.6 + 3, 7, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill();
    ctx.beginPath();
    ctx.arc(ball.x, ball.y - ball.z, ball.r * scale, 0, Math.PI * 2);
    ctx.fillStyle = '#fefefe'; ctx.fill();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.stroke();
  }

  function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.x += pt.vx; pt.y += pt.vy; pt.life--;
      if (pt.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = pt.life / 40;
      ctx.fillStyle = pt.type === 'fire' ? '#f97316' : '#fff';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  let weatherParticles = null;
  function initWeatherParticles() {
    weatherParticles = [];
    if (weather.id === 'rain') {
      for (let i = 0; i < 70; i++) weatherParticles.push({ x: Math.random() * W, y: Math.random() * H, s: 10 + Math.random() * 6 });
    } else if (weather.id === 'snow') {
      for (let i = 0; i < 50; i++) weatherParticles.push({ x: Math.random() * W, y: Math.random() * H, s: 1 + Math.random() * 2, sway: Math.random() * 2 });
    }
  }
  function drawWeather() {
    if (!weatherParticles || !weatherParticles.length) return;
    if (weather.id === 'rain') {
      ctx.strokeStyle = 'rgba(180,220,255,.5)'; ctx.lineWidth = 1;
      for (const p of weatherParticles) {
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 2, p.y + p.s); ctx.stroke();
        p.y += p.s; p.x -= 1;
        if (p.y > H) { p.y = -10; p.x = Math.random() * W; }
      }
    } else if (weather.id === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      for (const p of weatherParticles) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
        p.y += p.s * 0.6; p.x += Math.sin(p.y * 0.02) * p.sway * 0.3;
        if (p.y > H) { p.y = -5; p.x = Math.random() * W; }
      }
    }
  }

  function render() {
    ctx.save();
    if (shakeT > 0) {
      ctx.translate((Math.random() - 0.5) * shakeMag, (Math.random() - 0.5) * shakeMag);
      shakeT--; shakeMag *= 0.9;
    }
    drawPitch();

    if (replaying) {
      const f = replayBuffer[Math.floor(replayIdx)];
      if (f) {
        drawPlayer(f.gk[0], '#334155', '', 'home');
        drawPlayer(f.gk[1], '#334155', '', 'away');
        for (const p of f.players) {
          drawPlayer(p, p.team === 'home' ? kitColorHex() : rival.color, '', p.team);
        }
        const b = f.ball;
        ctx.beginPath(); ctx.arc(b.x, b.y - b.z, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#fefefe'; ctx.fill(); ctx.strokeStyle = '#333'; ctx.stroke();
      }
    } else {
      drawPlayer(homeGK, '#334155', 'GK', 'home');
      drawPlayer(awayGK, '#1e293b', 'GK', 'away');
      homePlayers.forEach(p => drawPlayer(p, kitColorHex(), '', 'home'));
      awayPlayers.forEach(p => drawPlayer(p, rival.color, '', 'away'));
      drawBall();
      drawParticles();
    }
    drawWeather();
    ctx.restore();
  }

  function kitColorHex() {
    const k = DATA.kitColors.find(k => k.id === (Save.data && Save.data.kit));
    return k ? k.color : '#22d3ee';
  }

  // ---------------- LOOP ----------------
  function loop(t) {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    const dt = Math.min(2, (t - lastTime) / 16.67);
    lastTime = t;
    if (paused) { render(); return; }

    if (replaying) {
      replayIdx += 0.5;
      if (replayIdx >= replayBuffer.length) endReplay();
      render();
      return;
    }

    clock -= dt / 60;
    if (clock <= 0) { clock = 0; endHalf(); }
    document.getElementById('hud-clock').textContent = formatClock(clock);

    if (ultraActiveTimer > 0) { ultraActiveTimer--; if (ultraActiveTimer <= 0 && ultraActive !== 'fireshot') ultraActive = null; }

    updateUser(dt);
    updateAI(dt);
    movePlayers();
    updateBall();
    updatePossession();
    pushReplayFrame();
    render();
  }

  function formatClock(s) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function endHalf() {
    if (half === 1) {
      half = 2; clock = halfTime;
      document.getElementById('hud-half').textContent = '2-й тайм';
      showToast('⏱️ ПЕРЕРЫВ');
      kickoffSetup();
    } else {
      finishMatch();
    }
  }

  function finishMatch() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    SFX.crowdAmbience(false);
    SFX.whistle();
    if (onFinish) onFinish({ score, matchGoals, matchStats });
  }

  // ---------------- PUBLIC API ----------------
  return {
    init() { setupInput(); resize(); },
    start(options) {
      document.getElementById('hud-half').textContent = '1-й тайм';
      document.getElementById('hud-home-name').textContent = Save.data.clubName;
      document.getElementById('hud-away-name').textContent = (DATA.rivals.find(r => r.id === options.rivalId) || DATA.rivals[0]).name;
      updateScoreHud();
      document.getElementById('ultra-bar-fill').style.width = '0%';
      document.getElementById('btn-ultra').disabled = true;
      resize();
      setupMatch(options);
      initWeatherParticles();
    },
    pause() {
      paused = true;
      document.getElementById('overlay-pause').classList.remove('hidden');
    },
    resume() {
      paused = false; lastTime = performance.now();
      document.getElementById('overlay-pause').classList.add('hidden');
    },
    stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      SFX.crowdAmbience(false);
    }
  };
})();
