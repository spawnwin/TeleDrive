(function () {
  Save.load();

  let friendlyRivalId = DATA.clubs[0].id;
  let activeMatchCtx = null; // { isLeague, opponentId, userIsHome }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + id);
    if (el) el.classList.add('active');
    if (id === 'menu') renderMenu();
    if (id === 'friendly') renderFriendly();
    if (id === 'league') renderLeague();
    if (id === 'squad') renderSquad();
    if (id === 'transfers') renderTransfers();
    if (id === 'shop') renderShop(currentShopTab);
    if (id === 'customize') renderCustomize();
    if (id === 'achievements') renderAchievements();
  }

  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.nav));
  });

  function showToast(text) {
    const layer = document.getElementById('global-toast-layer');
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = text;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1900);
  }

  function pill(container, items, selectedId, onPick, opts) {
    container.innerHTML = '';
    items.forEach(item => {
      const el = document.createElement('button');
      el.className = 'pill' + (item.id === selectedId ? ' selected' : '');
      const locked = opts && opts.lockedCheck && opts.lockedCheck(item);
      if (locked) el.classList.add('locked');
      el.textContent = opts && opts.label ? opts.label(item) : item.name;
      el.addEventListener('click', () => {
        if (locked) { showToast('🔒 Открой в магазине'); return; }
        onPick(item.id);
        pill(container, items, item.id, onPick, opts);
      });
      container.appendChild(el);
    });
  }

  // ---------------- MENU ----------------
  function renderMenu() {
    document.getElementById('menu-club-name').textContent = Save.data.clubName;
    document.getElementById('menu-level').textContent = Save.data.level;
    document.getElementById('menu-season').textContent = Save.data.season;
    document.getElementById('menu-coins').textContent = Save.data.coins;
  }

  // ---------------- FRIENDLY SETUP ----------------
  function renderFriendly() {
    pill(document.getElementById('rival-list'), DATA.clubs.map(c => ({ id: c.id, name: c.name })), friendlyRivalId, id => friendlyRivalId = id);
    pill(document.getElementById('stadium-list'), DATA.stadiums, Save.data.stadiumId, id => { Save.data.stadiumId = id; Save.persist(); }, {
      label: s => s.cost > 0 && !Save.owns('stadiums', s.id) ? `🔒 ${s.name}` : s.name,
      lockedCheck: s => s.cost > 0 && !Save.owns('stadiums', s.id)
    });
    pill(document.getElementById('weather-list'), DATA.weathers, Save.data.weatherId, id => { Save.data.weatherId = id; Save.persist(); });
  }

  document.getElementById('btn-start-match').addEventListener('click', () => {
    launchMatch({ opponentId: friendlyRivalId, isLeague: false });
  });

  // ---------------- LEAGUE ----------------
  function renderLeague() {
    document.getElementById('league-season').textContent = Save.data.season;
    document.getElementById('league-round').textContent = Math.min(Save.data.round + 1, Save.data.fixtures.length);

    const sorted = Save.data.table.slice().sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
    const tbody = document.getElementById('league-table-body');
    tbody.innerHTML = '';
    sorted.forEach((row, i) => {
      const tr = document.createElement('tr');
      if (row.id === 'user') tr.className = 'me';
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td><div class="club-cell"><span class="club-dot" style="background:${row.color}"></span>${row.name}</div></td>
        <td>${row.played}</td>
        <td>${row.gf - row.ga >= 0 ? '+' : ''}${row.gf - row.ga}</td>
        <td class="pts">${row.pts}</td>`;
      tbody.appendChild(tr);
    });

    const round = Save.currentRoundFixtures();
    const wrap = document.getElementById('league-fixtures');
    wrap.innerHTML = '';
    if (!round) {
      wrap.innerHTML = '<p style="color:#93a3c9;font-size:13px;">Сезон завершён — начинается новый!</p>';
      return;
    }
    round.forEach(([h, a]) => {
      const homeName = h === 'user' ? Save.data.clubName : DATA.clubs.find(c => c.id === h).name;
      const awayName = a === 'user' ? Save.data.clubName : DATA.clubs.find(c => c.id === a).name;
      const isMine = h === 'user' || a === 'user';
      const row = document.createElement('div');
      row.className = 'fixture-row' + (isMine ? ' mine' : '');
      row.innerHTML = `<span class="fr-teams">${homeName} — ${awayName}</span>`;
      if (isMine) {
        const btn = document.createElement('button');
        btn.className = 'fr-play';
        btn.textContent = 'Играть';
        btn.addEventListener('click', () => {
          launchMatch({ opponentId: h === 'user' ? a : h, isLeague: true, userIsHome: h === 'user' });
        });
        row.appendChild(btn);
      } else {
        const span = document.createElement('span');
        span.className = 'fr-done'; span.textContent = 'по расписанию';
        row.appendChild(span);
      }
      wrap.appendChild(row);
    });
  }

  // ---------------- SQUAD & TACTICS ----------------
  function renderSquad() {
    pill(document.getElementById('formation-list'),
      Object.keys(DATA.formations).map(id => ({ id, name: DATA.formations[id].label })),
      Save.data.formation, id => { Save.data.formation = id; Save.persist(); renderSquad(); });

    pill(document.getElementById('tactic-list'), DATA.tacticStyles, Save.data.tacticStyle,
      id => { Save.data.tacticStyle = id; Save.persist(); renderSquad(); },
      { label: t => `${t.icon} ${t.name}` });

    const strength = Save.teamStrength();
    document.getElementById('stat-attack-fill').style.width = Math.min(100, strength.attack) + '%';
    document.getElementById('stat-attack-val').textContent = Math.round(strength.attack);
    document.getElementById('stat-defense-fill').style.width = Math.min(100, strength.defense) + '%';
    document.getElementById('stat-defense-val').textContent = Math.round(strength.defense);

    const xiIds = new Set(strength.xi.all.map(p => p.id));
    const list = document.getElementById('squad-list');
    list.innerHTML = '';
    const order = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
    const squad = Save.data.squad.slice().sort((a, b) => order[a.pos] - order[b.pos] || overall(b) - overall(a));
    squad.forEach(p => {
      const row = document.createElement('div');
      row.className = 'player-row';
      row.innerHTML = `
        <div class="player-pos ${p.pos}">${p.pos}</div>
        <div class="player-info">
          <b>${p.name} ${xiIds.has(p.id) ? '★' : ''}</b>
          <div class="player-meta"><span>Форма ${p.fitness}%</span><span>Настрой ${p.morale}%</span></div>
        </div>
        <div class="player-ovr">${overall(p)}</div>
        <button class="player-sell">Продать</button>`;
      row.querySelector('.player-sell').addEventListener('click', () => {
        const refund = Save.sellPlayer(p.id);
        if (refund === false) { showToast('Нельзя продать — состав слишком мал'); return; }
        showToast(`Продан за 🪙 ${refund}`);
        renderSquad();
      });
      list.appendChild(row);
    });
  }

  // ---------------- TRANSFERS ----------------
  function renderTransfers() {
    document.getElementById('transfers-coins').textContent = Save.data.coins;
    if (!Save.data.transferPool.length) Save.refreshTransferPool();
    const list = document.getElementById('transfer-list');
    list.innerHTML = '';
    Save.data.transferPool.forEach(p => {
      const row = document.createElement('div');
      row.className = 'player-row';
      const affordable = Save.data.coins >= p.price;
      row.innerHTML = `
        <div class="player-pos ${p.pos}">${p.pos}</div>
        <div class="player-info">
          <b>${p.name}</b>
          <div class="player-meta"><span>Возраст ${p.age}</span></div>
        </div>
        <div class="player-ovr">${overall(p)}</div>
        <span class="player-price">🪙 ${p.price}</span>
        <button class="player-buy" ${affordable ? '' : 'disabled'}>Купить</button>`;
      row.querySelector('.player-buy').addEventListener('click', () => {
        if (Save.buyPlayer(p.id)) { showToast(`${p.name} в составе!`); renderTransfers(); }
        else showToast('Недостаточно монет 🪙');
      });
      list.appendChild(row);
    });
  }

  document.getElementById('btn-refresh-market').addEventListener('click', () => {
    Save.refreshTransferPool();
    renderTransfers();
  });

  // ---------------- SHOP ----------------
  let currentShopTab = 'kits';
  document.querySelectorAll('.shop-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentShopTab = tab.dataset.tab;
      renderShop(currentShopTab);
    });
  });

  function renderShop(tab) {
    document.getElementById('shop-coins').textContent = Save.data.coins;
    const grid = document.getElementById('shop-grid');
    grid.innerHTML = '';
    let items, category, iconFn, equipKey;
    if (tab === 'kits') { items = DATA.kitColors; category = 'kits'; iconFn = k => `<span class="si-icon" style="color:${k.color}">●</span>`; equipKey = 'kit'; }
    else if (tab === 'balls') { items = DATA.ballSkins; category = 'balls'; iconFn = k => `<span class="si-icon">${k.icon}</span>`; equipKey = 'ball'; }
    else if (tab === 'interventions') { items = DATA.interventions; category = 'interventions'; iconFn = k => `<span class="si-icon">${k.icon}</span>`; equipKey = null; }
    else { items = DATA.stadiums; category = 'stadiums'; iconFn = () => `<span class="si-icon">🏟️</span>`; equipKey = null; }

    items.forEach(item => {
      const owned = item.cost === 0 || Save.owns(category, item.id);
      const equipped = equipKey && Save.data[equipKey] === item.id;
      const card = document.createElement('div');
      card.className = 'shop-item';
      card.innerHTML = `
        ${iconFn(item)}
        <div class="si-name">${item.name}</div>
        <div style="font-size:11px;color:#93a3c9">${item.desc || (owned ? 'Куплено' : '🪙 ' + item.cost)}</div>
        <button class="si-buy ${equipped ? 'equipped' : owned ? 'owned' : ''}">${equipped ? 'Экипировано' : owned ? (equipKey ? 'Выбрать' : 'Есть') : 'Купить'}</button>`;
      const buyBtn = card.querySelector('.si-buy');
      buyBtn.addEventListener('click', () => {
        if (!owned) {
          if (Save.buy(category, item.id, item.cost)) {
            Save.unlockAchievement('shopaholic');
            if (equipKey) Save.data[equipKey] = item.id;
            Save.persist();
            renderShop(tab);
          } else {
            showToast('Недостаточно монет 🪙');
          }
        } else if (equipKey && !equipped) {
          Save.data[equipKey] = item.id;
          Save.persist();
          renderShop(tab);
        }
      });
      grid.appendChild(card);
    });
  }

  // ---------------- CUSTOMIZE ----------------
  function renderCustomize() {
    document.getElementById('club-name-input').value = Save.data.clubName;
    pill(document.getElementById('kit-color-list'), DATA.kitColors, Save.data.kit, id => Save.data.kit = id, {
      label: k => Save.owns('kits', k.id) ? k.name : `🔒 ${k.name}`,
      lockedCheck: k => !Save.owns('kits', k.id)
    });
    pill(document.getElementById('ball-skin-list'), DATA.ballSkins, Save.data.ball, id => Save.data.ball = id, {
      label: b => Save.owns('balls', b.id) ? `${b.icon} ${b.name}` : `🔒 ${b.name}`,
      lockedCheck: b => !Save.owns('balls', b.id)
    });
  }

  document.getElementById('btn-save-customize').addEventListener('click', () => {
    const name = document.getElementById('club-name-input').value.trim();
    Save.data.clubName = name || 'FC Аврора';
    Save.data.table.find(r => r.id === 'user').name = Save.data.clubName;
    Save.persist();
    showScreen('menu');
  });

  // ---------------- ACHIEVEMENTS ----------------
  function renderAchievements() {
    const list = document.getElementById('achievements-list');
    list.innerHTML = '';
    DATA.achievements.forEach(a => {
      const unlocked = !!Save.data.achievements[a.id];
      const el = document.createElement('div');
      el.className = 'achv-item' + (unlocked ? ' unlocked' : '');
      el.innerHTML = `<span class="ai-icon">${a.icon}</span><div><b>${a.name}</b><small>${a.desc}</small></div>`;
      list.appendChild(el);
    });
  }

  // ---------------- MATCH ORCHESTRATION ----------------
  const EVENT_ICON = { chance: '🔹', goal: '⚽', save: '🧤', miss: '❌', post: '🥅', card: '🟨', injury: '🚑', boost: '⚡', info: 'ℹ️' };

  function pushCommentary(ev) {
    const feed = document.getElementById('commentary-feed');
    const div = document.createElement('div');
    div.className = 'cfeed-item' + (ev.kind === 'goal' ? ' goal' : ev.kind === 'boost' ? ' boost' : '');
    div.innerHTML = `<b>${ev.minute}'</b><span>${EVENT_ICON[ev.kind] || ''} ${ev.text}</span>`;
    feed.appendChild(div);
    feed.scrollTop = feed.scrollHeight;
  }

  function renderInterventionButtons() {
    const row = document.getElementById('intervention-row');
    row.innerHTML = '';
    const owned = Save.data.ownedInterventions;
    if (owned.includes('speech')) {
      const b = document.createElement('button');
      b.className = 'mgr-intervention-btn'; b.textContent = '🔥 Речь';
      b.addEventListener('click', () => {
        if (MatchEngine.useSpeech()) b.disabled = true; else showToast('Уже использовано в этом матче');
      });
      row.appendChild(b);
    }
    if (owned.includes('ironwall')) {
      const b = document.createElement('button');
      b.className = 'mgr-intervention-btn'; b.textContent = '🛡️ Стена';
      b.addEventListener('click', () => {
        if (MatchEngine.useIronwall()) b.disabled = true; else showToast('Уже использовано в этом матче');
      });
      row.appendChild(b);
    }
  }

  function launchMatch(ctx) {
    activeMatchCtx = ctx;
    showScreen('match');
    document.getElementById('commentary-feed').innerHTML = '';
    document.getElementById('hud-home-name').textContent = Save.data.clubName;
    const opp = DATA.clubs.find(c => c.id === ctx.opponentId);
    document.getElementById('hud-away-name').textContent = opp.name;
    document.getElementById('hud-score').textContent = '0 : 0';
    document.getElementById('hud-minute').textContent = "0'";
    document.querySelectorAll('.speed-btn[data-speed]').forEach(b => b.classList.toggle('active', b.dataset.speed === '1'));
    document.querySelectorAll('.mgr-tactic-btn').forEach(b => b.classList.toggle('active', b.dataset.tactic === Save.data.tacticStyle));
    renderInterventionButtons();
    MatchEngine.init();
    MatchEngine.start({
      opponentId: ctx.opponentId,
      stadiumId: Save.data.stadiumId,
      weatherId: Save.data.weatherId,
      onCommentary: pushCommentary,
      onScore: score => { document.getElementById('hud-score').textContent = `${score.home} : ${score.away}`; },
      onMinute: m => { document.getElementById('hud-minute').textContent = m + "'"; },
      onFinish: result => onMatchFinish(result, ctx)
    });
  }

  document.querySelectorAll('.speed-btn[data-speed]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn[data-speed]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      MatchEngine.setSpeed(Number(btn.dataset.speed));
    });
  });
  document.getElementById('btn-skip').addEventListener('click', () => MatchEngine.skip());
  document.querySelectorAll('.mgr-tactic-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      MatchEngine.setTactic(btn.dataset.tactic);
      document.querySelectorAll('.mgr-tactic-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  document.getElementById('btn-sub').addEventListener('click', (e) => {
    if (MatchEngine.substitute()) {
      if (MatchEngine.getSubsUsed() >= 3) e.target.disabled = true;
    } else showToast('Нет доступных замен');
  });

  document.getElementById('btn-pause').addEventListener('click', () => {
    MatchEngine.pause();
    document.getElementById('overlay-pause').classList.remove('hidden');
  });
  document.getElementById('btn-resume').addEventListener('click', () => {
    MatchEngine.resume();
    document.getElementById('overlay-pause').classList.add('hidden');
  });
  document.getElementById('btn-quit-match').addEventListener('click', () => {
    document.getElementById('overlay-pause').classList.add('hidden');
    MatchEngine.stop();
    showScreen('menu');
  });

  function onMatchFinish(result, ctx) {
    const { score } = result;
    const win = score.home > score.away;
    const draw = score.home === score.away;

    if (ctx.isLeague) {
      const oppId = ctx.opponentId;
      if (ctx.userIsHome) Save.recordResult('user', oppId, score.home, score.away);
      else Save.recordResult(oppId, 'user', score.away, score.home);
      Save.playOtherFixturesThisRound();
      Save.advanceRound();
      const sorted = Save.data.table.slice().sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
      if (sorted[0] && sorted[0].id === 'user') Save.unlockAchievement('top_table');
    }

    Save.data.stats.matches++;
    Save.data.stats.goals += score.home;
    if (win) Save.data.stats.wins++;
    if (score.away === 0) Save.unlockAchievement('clean_sheet');
    if (score.home > 0) Save.unlockAchievement('first_goal');
    if (win) Save.unlockAchievement('first_win');
    if (win && score.home - score.away >= 3) Save.unlockAchievement('hat_trick');

    let coins = 30 + score.home * 15;
    let xp = 40 + score.home * 12;
    if (win) { coins += 60; xp += 40; } else if (draw) { coins += 20; xp += 15; }

    Save.addXp(xp);
    Save.addCoins(coins);

    document.getElementById('result-title').textContent = win ? '🏆 ПОБЕДА!' : draw ? '🤝 НИЧЬЯ' : '😔 ПОРАЖЕНИЕ';
    document.getElementById('result-score').textContent = `${score.home} : ${score.away}`;
    document.getElementById('stat-xp').textContent = '+' + xp;
    document.getElementById('stat-coins').textContent = '+' + coins;
    document.getElementById('stat-goals').textContent = score.home;
    document.getElementById('overlay-result').classList.remove('hidden');
    Save.persist();
  }

  document.getElementById('btn-result-continue').addEventListener('click', () => {
    document.getElementById('overlay-result').classList.add('hidden');
    MatchEngine.stop();
    showScreen(activeMatchCtx && activeMatchCtx.isLeague ? 'league' : 'menu');
  });

  // ---------------- BOOT SEQUENCE ----------------
  window.addEventListener('load', () => {
    MatchEngine.init();
    let p = 0;
    const fill = document.getElementById('boot-fill');
    const iv = setInterval(() => {
      p += 8 + Math.random() * 10;
      if (p >= 100) { p = 100; clearInterval(iv); setTimeout(() => showScreen('menu'), 250); }
      fill.style.width = p + '%';
    }, 90);
    document.body.addEventListener('pointerdown', () => SFX.unlock(), { once: true });
  });
})();
