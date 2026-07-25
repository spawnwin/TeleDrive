(function () {
  Save.load();

  const setupState = {
    rivalId: 'volna',
    stadiumId: 'city',
    weatherId: 'clear',
    difficultyId: 'normal',
    careerMode: false
  };

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + id);
    if (el) el.classList.add('active');
    if (id === 'menu') renderMenu();
    if (id === 'match-setup') renderMatchSetup();
    if (id === 'career') renderCareer();
    if (id === 'shop') renderShop('kits');
    if (id === 'customize') renderCustomize();
    if (id === 'achievements') renderAchievements();
  }

  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.nav));
  });

  function renderMenu() {
    document.getElementById('menu-club-name').textContent = Save.data.clubName;
    document.getElementById('menu-level').textContent = Save.data.level;
    document.getElementById('menu-coins').textContent = Save.data.coins;
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
        if (locked) { showToastGlobal('🔒 Открой в магазине'); return; }
        onPick(item.id);
        pill(container, items, item.id, onPick, opts);
      });
      container.appendChild(el);
    });
  }

  function showToastGlobal(text) {
    const layer = document.getElementById('global-toast-layer');
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = text;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1900);
  }

  function renderMatchSetup() {
    setupState.careerMode = false;
    pill(document.getElementById('rival-list'), DATA.rivals, setupState.rivalId, id => setupState.rivalId = id);
    pill(document.getElementById('stadium-list'), DATA.stadiums, setupState.stadiumId, id => setupState.stadiumId = id, {
      label: s => s.cost > 0 && !Save.owns('stadiums', s.id) ? `🔒 ${s.name}` : s.name,
      lockedCheck: s => s.cost > 0 && !Save.owns('stadiums', s.id)
    });
    pill(document.getElementById('weather-list'), DATA.weathers, setupState.weatherId, id => setupState.weatherId = id);
    pill(document.getElementById('difficulty-list'), DATA.difficulties, setupState.difficultyId, id => setupState.difficultyId = id);
  }

  document.getElementById('btn-start-match').addEventListener('click', () => {
    launchMatch(setupState);
  });

  function launchMatch(options) {
    showScreen('match');
    Match.start({
      rivalId: options.rivalId,
      stadiumId: options.stadiumId,
      weatherId: options.weatherId,
      difficultyId: options.difficultyId,
      halfSeconds: 75,
      onFinish: result => onMatchFinish(result, options)
    });
  }

  function onMatchFinish(result, options) {
    const { score } = result;
    const win = score.home > score.away;
    const draw = score.home === score.away;
    Save.data.stats.matches++;
    Save.data.stats.goals += score.home;
    if (win) Save.data.stats.wins++;
    if (result.matchStats.wentBehind && win) Save.unlockAchievement('comeback');
    if (score.away === 0) Save.unlockAchievement('clean_sheet');
    if (score.home > 0) Save.unlockAchievement('first_goal');
    if (win) Save.unlockAchievement('first_win');

    let coins = 30 + score.home * 15;
    let xp = 40 + score.home * 12;
    if (win) { coins += 60; xp += 40; } else if (draw) { coins += 20; xp += 15; }

    let leveledUp = Save.addXp(xp);
    Save.addCoins(coins);

    if (options.careerMode && win) {
      Save.data.careerIndex = Math.min(DATA.rivals.length, Save.data.careerIndex + 1);
      Save.data.careerWins++;
      if (Save.data.careerIndex >= DATA.rivals.length) Save.unlockAchievement('career_complete');
      Save.persist();
    }

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
    Match.stop();
    showScreen('menu');
  });

  document.getElementById('btn-pause') && document.getElementById('btn-pause').addEventListener('click', () => Match.pause());
  document.getElementById('btn-resume').addEventListener('click', () => Match.resume());
  document.getElementById('btn-quit-match').addEventListener('click', () => {
    document.getElementById('overlay-pause').classList.add('hidden');
    Match.stop();
    showScreen('menu');
  });

  // ---------------- CAREER ----------------
  function renderCareer() {
    const wrap = document.getElementById('career-ladder');
    wrap.innerHTML = '';
    DATA.rivals.forEach((r, i) => {
      const node = document.createElement('div');
      const done = i < Save.data.careerIndex;
      const locked = i > Save.data.careerIndex;
      node.className = 'career-node' + (done ? ' done' : '') + (locked ? ' locked' : '');
      node.innerHTML = `
        <div class="cn-index">${done ? '✓' : i + 1}</div>
        <div class="cn-info"><b>${r.name}</b><small>Сила состава: ${r.power}/8</small></div>
        <div>${locked ? '🔒' : '▶️'}</div>`;
      if (!locked) {
        node.addEventListener('click', () => {
          setupState.rivalId = r.id;
          setupState.stadiumId = 'city';
          setupState.weatherId = DATA.weathers[Math.floor(Math.random() * DATA.weathers.length)].id;
          setupState.difficultyId = i < 2 ? 'easy' : i < 5 ? 'normal' : i < 7 ? 'hard' : 'ultra';
          launchMatch(Object.assign({}, setupState, { careerMode: true }));
        });
      }
      wrap.appendChild(node);
    });
  }

  // ---------------- SHOP ----------------
  let shopTab = 'kits';
  document.querySelectorAll('.shop-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      shopTab = tab.dataset.tab;
      renderShop(shopTab);
    });
  });

  function renderShop(tab) {
    document.getElementById('shop-coins').textContent = Save.data.coins;
    const grid = document.getElementById('shop-grid');
    grid.innerHTML = '';
    let items, category, iconFn, equipKey;
    if (tab === 'kits') { items = DATA.kitColors; category = 'kits'; iconFn = k => `<span class="si-icon" style="color:${k.color}">●</span>`; equipKey = 'kit'; }
    else if (tab === 'balls') { items = DATA.ballSkins; category = 'balls'; iconFn = k => `<span class="si-icon">${k.icon}</span>`; equipKey = 'ball'; }
    else if (tab === 'abilities') { items = DATA.abilities; category = 'abilities'; iconFn = k => `<span class="si-icon">${k.icon}</span>`; equipKey = 'equippedAbility'; }
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
            showToastGlobal('Недостаточно монет 🪙');
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
    const input = document.getElementById('club-name-input');
    input.value = Save.data.clubName;
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

  // ---------------- BOOT SEQUENCE ----------------
  window.addEventListener('load', () => {
    Match.init();
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
