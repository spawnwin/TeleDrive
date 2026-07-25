const DATA = {
  clubs: [
    { id: 'volna', name: 'Волна Юга', power: 58, color: '#f43f5e' },
    { id: 'ural', name: 'Уральский Кряж', power: 64, color: '#78716c' },
    { id: 'tayga', name: 'Тайга ФК', power: 69, color: '#22c55e' },
    { id: 'metel', name: 'Метель Норд', power: 75, color: '#e2e8f0' },
    { id: 'vulkan', name: 'Вулкан Ультра', power: 80, color: '#f97316' },
    { id: 'grom', name: 'Гром Столицы', power: 85, color: '#facc15' },
    { id: 'legenda', name: 'Легенда X', power: 90, color: '#a855f7' }
  ],

  stadiums: [
    { id: 'city', name: 'Городская Арена', cost: 0, grass: '#1e6b3a', line: '#e8fff0', sky: '#12203a' },
    { id: 'night', name: 'Ночной Неон', cost: 300, grass: '#123024', line: '#7dfcff', sky: '#0a0620' },
    { id: 'desert', name: 'Пустынный Кубок', cost: 500, grass: '#8a7a3f', line: '#fff6d9', sky: '#3a2410' },
    { id: 'snow', name: 'Снежная Арена', cost: 700, grass: '#d8e8e0', line: '#274b5e', sky: '#3a4a5c' }
  ],

  weathers: [
    { id: 'clear', name: '☀️ Ясно', atkMul: 1, defMul: 1 },
    { id: 'rain', name: '🌧️ Дождь', atkMul: 0.94, defMul: 0.94 },
    { id: 'snow', name: '❄️ Снег', atkMul: 0.9, defMul: 0.96 },
    { id: 'night', name: '🌙 Ночь', atkMul: 1, defMul: 1 },
    { id: 'wind', name: '🌬️ Ветер', atkMul: 0.95, defMul: 1 }
  ],

  formations: {
    '4-4-2': { def: 4, mid: 4, fwd: 2, label: '4-4-2 · Классика' },
    '4-3-3': { def: 4, mid: 3, fwd: 3, label: '4-3-3 · Атакующая' },
    '3-5-2': { def: 3, mid: 5, fwd: 2, label: '3-5-2 · Контроль центра' },
    '5-3-2': { def: 5, mid: 3, fwd: 2, label: '5-3-2 · Автобус' }
  },

  tacticStyles: [
    { id: 'attack', name: 'Атакующий', icon: '⚔️', atkMul: 1.18, defMul: 0.85 },
    { id: 'balance', name: 'Сбалансированный', icon: '⚖️', atkMul: 1, defMul: 1 },
    { id: 'defense', name: 'Оборонительный', icon: '🛡️', atkMul: 0.85, defMul: 1.18 }
  ],

  kitColors: [
    { id: 'cyan', name: 'Циан', cost: 0, color: '#22d3ee' },
    { id: 'crimson', name: 'Багровый', cost: 150, color: '#ef4444' },
    { id: 'gold', name: 'Золото', cost: 250, color: '#facc15' },
    { id: 'violet', name: 'Фиолет', cost: 250, color: '#a855f7' },
    { id: 'emerald', name: 'Изумруд', cost: 200, color: '#10b981' },
    { id: 'inferno', name: 'Инферно', cost: 400, color: '#f97316' }
  ],

  ballSkins: [
    { id: 'classic', name: 'Классика', cost: 0, icon: '⚽' },
    { id: 'fire', name: 'Огненный', cost: 300, icon: '🔥' },
    { id: 'disco', name: 'Дискошар', cost: 350, icon: '🪩' },
    { id: 'galaxy', name: 'Галактика', cost: 450, icon: '🌌' }
  ],

  interventions: [
    { id: 'speech', name: 'Мотивационная речь', cost: 0, icon: '🔥', desc: '+15% к силе команды на 15 минут (1 раз за матч)' },
    { id: 'masterclass', name: 'Тактический гений', cost: 400, icon: '🧠', desc: 'Смена тактики без штрафа адаптации' },
    { id: 'ironwall', name: 'Железная стена', cost: 400, icon: '🛡️', desc: 'Оборона держится насмерть 10 минут' }
  ],

  achievements: [
    { id: 'first_goal', icon: '⚽', name: 'Первый гол', desc: 'Забей свой первый гол в матче' },
    { id: 'hat_trick', icon: '🎩', name: 'Разгром', desc: 'Выиграй матч с разницей в 3+ гола' },
    { id: 'first_win', icon: '🏅', name: 'Первая победа', desc: 'Выиграй свой первый матч' },
    { id: 'intervention_used', icon: '⚡', name: 'Слово тренера', desc: 'Используй тренерское вмешательство' },
    { id: 'league_complete', icon: '👑', name: 'Легенда Лиги', desc: 'Пройди весь сезон Ультра-Лиги' },
    { id: 'shopaholic', icon: '🛍️', name: 'Модник', desc: 'Купи любой предмет в магазине' },
    { id: 'transfer_done', icon: '🤝', name: 'Трансферное окно', desc: 'Купи игрока на трансферном рынке' },
    { id: 'clean_sheet', icon: '🧤', name: 'Сухой лист', desc: 'Не пропусти ни одного гола за матч' },
    { id: 'top_table', icon: '🥇', name: 'Вершина таблицы', desc: 'Возглавь турнирную таблицу лиги' }
  ],

  firstNames: ['Артём', 'Дмитрий', 'Иван', 'Максим', 'Никита', 'Егор', 'Кирилл', 'Роман',
    'Данила', 'Богдан', 'Тимур', 'Владислав', 'Глеб', 'Ярослав', 'Матвей', 'Савелий',
    'Руслан', 'Захар', 'Всеволод', 'Демид'],

  lastNames: ['Соколов', 'Волков', 'Морозов', 'Орлов', 'Быков', 'Громов', 'Захаров', 'Куницын',
    'Лебедев', 'Медведев', 'Рысаков', 'Ястребов', 'Барсуков', 'Тигров', 'Комаров', 'Соловьёв',
    'Воронин', 'Метелин', 'Стрелков', 'Буревой'],

  positions: [
    { id: 'GK', name: 'Вратарь' },
    { id: 'DEF', name: 'Защитник' },
    { id: 'MID', name: 'Полузащитник' },
    { id: 'FWD', name: 'Нападающий' }
  ]
};
