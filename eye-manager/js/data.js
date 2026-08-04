/* EYE Manager — static world data */
window.EYE_DATA = (() => {
  const FIRST = [
    'Артём','Иван','Максим','Дмитрий','Кирилл','Андрей','Алексей','Никита','Михаил','Егор',
    'Сергей','Владимир','Роман','Тимур','Даниил','Павел','Илья','Денис','Матвей','Лев',
    'Марк','Ярослав','Глеб','Савелий','Фёдор','Богдан','Арсений','Платон','Захар','Руслан',
    'Оскар','Лукас','Эрик','Ноа','Леон','Марко','Лука','Фабио','Педро','Рафа',
    'Карлос','Диего','Хави','Иньеста','Кай','Юнас','Свен','Томас','Ян','Пиотр'
  ];
  const LAST = [
    'Иванов','Смирнов','Кузнецов','Попов','Васильев','Петров','Соколов','Лебедев','Козлов','Новиков',
    'Морозов','Волков','Алексеев','Лебедев','Семёнов','Егоров','Павлов','Козлов','Степанов','Николаев',
    'Орлов','Андреев','Макаров','Никитин','Захаров','Зайцев','Соловьёв','Борисов','Яковлев','Григорьев',
    'Сильва','Сантос','Оливейра','Фернандес','Росси','Бьянки','Мюллер','Шмидт','Берг','Ларссон',
    'Ким','Пак','Накамура','Танака','Джонсон','Смит','Браун','Уилсон','Тейлор','Андерсон'
  ];
  const NATIONS = ['Россия','Бразилия','Аргентина','Испания','Германия','Франция','Англия','Италия','Португалия','Нидерланды','Бельгия','Хорватия','Япония','Корея','США','Мексика','Уругвай','Колумбия','Турция','Польша'];
  const CLUB_PREFIX = ['Норд','Аура','Вектор','Орион','Пульс','Квант','Неон','Сириус','Атлас','Эхо','Призма','Фотон','Зенит','Шторм','Импульс','Форсаж','Омега','Титан','Апекс','Рейс'];
  const CLUB_SUFFIX = ['Юнайтед','Сити','Атлетик','ФК','Динамо','Спорт','Юнион','Роялс','Фокс','Вингс','Легион','Клуб','Форс','Элит','Прайм'];
  const FORMATIONS = {
    '4-4-2':  { slots:['GK','RB','CB','CB','LB','RM','CM','CM','LM','ST','ST'] },
    '4-3-3':  { slots:['GK','RB','CB','CB','LB','CM','CM','CM','RW','ST','LW'] },
    '3-5-2':  { slots:['GK','CB','CB','CB','RWB','CM','CM','CM','LWB','ST','ST'] },
    '4-2-3-1':{ slots:['GK','RB','CB','CB','LB','CDM','CDM','RAM','CAM','LAM','ST'] },
    '5-3-2':  { slots:['GK','RWB','CB','CB','CB','LWB','CM','CM','CM','ST','ST'] },
    '4-1-4-1':{ slots:['GK','RB','CB','CB','LB','CDM','RM','CM','CM','LM','ST'] }
  };
  const POS_GROUP = {
    GK:'GK', RB:'DEF', LB:'DEF', CB:'DEF', RWB:'DEF', LWB:'DEF',
    CM:'MID', CDM:'MID', CAM:'MID', RM:'MID', LM:'MID', RAM:'MID', LAM:'MID',
    ST:'ATT', RW:'ATT', LW:'ATT'
  };
  const POS_LABEL = {
    GK:'ВР', RB:'ПЗ', LB:'ЛЗ', CB:'ЦЗ', RWB:'ПП', LWB:'ЛП',
    CM:'ЦП', CDM:'ОП', CAM:'АП', RM:'ПП', LM:'ЛП', RAM:'ПА', LAM:'ЛА',
    ST:'НАП', RW:'ПВ', LW:'ЛВ'
  };
  const STYLES = [
    { id:'attack', name:'Атака', desc:'Высокий прессинг, риск' },
    { id:'balance', name:'Баланс', desc:'Контроль и структура' },
    { id:'defend', name:'Оборона', desc:'Низкий блок, контратаки' },
    { id:'possession', name:'Владение', desc:'Короткий пас, терпение' },
    { id:'counter', name:'Контратака', desc:'Глубоко + вертикаль' }
  ];
  const LEAGUES = [
    { id:'eye-premier', name:'EYE Premier', tier:1, teams:12, prize:2.4e6 },
    { id:'eye-champ', name:'EYE Championship', tier:2, teams:12, prize:9e5 },
    { id:'eye-national', name:'EYE National', tier:3, teams:12, prize:3.5e5 }
  ];
  const TRAINING = [
    { id:'fitness', name:'Фитнес', focus:'stamina', boost:3 },
    { id:'tactics', name:'Тактика', focus:'iq', boost:3 },
    { id:'shooting', name:'Удары', focus:'attack', boost:3 },
    { id:'defense', name:'Оборона', focus:'defense', boost:3 },
    { id:'tech', name:'Техника', focus:'tech', boost:3 },
    { id:'recovery', name:'Восстановление', focus:'condition', boost:8 }
  ];
  const FACILITIES = [
    { id:'stadium', name:'Стадион', max:5, base:4e5, effect:'income' },
    { id:'training', name:'База', max:5, base:2.5e5, effect:'training' },
    { id:'youth', name:'Академия', max:5, base:3e5, effect:'youth' },
    { id:'medical', name:'Медицина', max:5, base:2e5, effect:'injury' },
    { id:'scout', name:'Скаутинг', max:5, base:1.8e5, effect:'scout' }
  ];

  function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
  function pick(arr) { return arr[rnd(0, arr.length - 1)]; }
  function uid(prefix='id') { return prefix + '_' + Math.random().toString(36).slice(2, 10); }

  function genName() { return pick(FIRST) + ' ' + pick(LAST); }

  function genPlayer(pos, overallBias = 70, ageBias = null) {
    const age = ageBias ?? rnd(17, 34);
    const peak = age < 24 ? overallBias - 4 : age > 30 ? overallBias - 3 : overallBias;
    const ovr = Math.max(45, Math.min(94, peak + rnd(-6, 6)));
    const spread = (base) => Math.max(30, Math.min(99, base + rnd(-8, 8)));
    let attack = ovr, defense = ovr, tech = ovr, stamina = ovr, iq = ovr;
    const g = POS_GROUP[pos] || 'MID';
    if (g === 'GK') { attack = spread(ovr - 25); defense = spread(ovr + 5); tech = spread(ovr); }
    if (g === 'DEF') { attack = spread(ovr - 12); defense = spread(ovr + 6); tech = spread(ovr - 2); }
    if (g === 'MID') { attack = spread(ovr); defense = spread(ovr); tech = spread(ovr + 3); }
    if (g === 'ATT') { attack = spread(ovr + 6); defense = spread(ovr - 14); tech = spread(ovr + 2); }
    stamina = spread(ovr + (age < 23 ? 4 : age > 30 ? -4 : 0));
    iq = spread(ovr + (age > 27 ? 3 : -2));
    const pot = Math.min(95, ovr + (age < 22 ? rnd(6, 16) : age < 26 ? rnd(2, 8) : rnd(0, 3)));
    const value = Math.round(Math.pow(ovr / 10, 3.1) * (pot / ovr) * (36 - age) * 1200);
    const wage = Math.round(value / 180);
    return {
      id: uid('p'), name: genName(), pos, age, ovr, pot,
      attack, defense, tech, stamina, iq,
      condition: rnd(78, 100), morale: rnd(55, 90),
      form: rnd(45, 85), energy: rnd(70, 100),
      goals: 0, assists: 0, apps: 0, seasonGoals: 0, seasonApps: 0,
      injured: 0, yellow: 0, red: 0, nation: pick(NATIONS),
      value, wage, contract: rnd(1, 4),
      traits: []
    };
  }

  function squadForOverall(baseOvr) {
    const slots = ['GK','RB','CB','CB','LB','CM','CM','CM','ST','ST','RW','LW','GK','CB','CM','ST','RB','LB'];
    return slots.map((pos, i) => genPlayer(pos, baseOvr + (i < 11 ? rnd(-2, 3) : rnd(-8, 0))));
  }

  function genClub(name, color, baseOvr, leagueId) {
    return {
      id: uid('c'), name, color, leagueId,
      squad: squadForOverall(baseOvr),
      formation: '4-3-3', style: 'balance',
      budget: Math.round(baseOvr * baseOvr * 1800),
      reputation: baseOvr,
      facilities: { stadium:1, training:1, youth:1, medical:1, scout:1 },
      fans: Math.round(baseOvr * 800 + rnd(2000, 12000)),
      morale: 60
    };
  }

  function genLeagueClubs(league, playerClubName) {
    const clubs = [];
    const used = new Set([playerClubName?.toLowerCase()]);
    for (let i = 0; i < league.teams - 1; i++) {
      let name;
      do { name = pick(CLUB_PREFIX) + ' ' + pick(CLUB_SUFFIX); } while (used.has(name.toLowerCase()));
      used.add(name.toLowerCase());
      const hue = rnd(0, 359);
      const color = `hsl(${hue} 72% 52%)`;
      const base = league.tier === 1 ? rnd(72, 82) : league.tier === 2 ? rnd(62, 72) : rnd(52, 64);
      clubs.push(genClub(name, color, base, league.id));
    }
    return clubs;
  }

  function pitchCoords(formation) {
    const slots = FORMATIONS[formation]?.slots || FORMATIONS['4-3-3'].slots;
    const rows = {};
    slots.forEach((p, i) => {
      const key = p;
      rows[key] = rows[key] || [];
      rows[key].push(i);
    });
    // approximate Y by role depth
    const depth = {
      GK: 8, CB: 22, RB: 28, LB: 28, RWB: 34, LWB: 34,
      CDM: 40, CM: 50, RM: 52, LM: 52, CAM: 62, RAM: 64, LAM: 64,
      RW: 75, LW: 75, ST: 86
    };
    const byLine = {};
    slots.forEach((pos, idx) => {
      const y = depth[pos] ?? 50;
      byLine[y] = byLine[y] || [];
      byLine[y].push({ pos, idx });
    });
    const coords = new Array(slots.length);
    Object.keys(byLine).map(Number).sort((a,b)=>a-b).forEach(y => {
      const line = byLine[y];
      line.forEach((item, i) => {
        const x = ((i + 1) / (line.length + 1)) * 100;
        coords[item.idx] = { x, y, pos: item.pos };
      });
    });
    return coords;
  }

  return {
    FIRST, LAST, NATIONS, FORMATIONS, POS_GROUP, POS_LABEL, STYLES, LEAGUES, TRAINING, FACILITIES,
    rnd, pick, uid, genName, genPlayer, squadForOverall, genClub, genLeagueClubs, pitchCoords
  };
})();
