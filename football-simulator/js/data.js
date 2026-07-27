const DATA = {
  clubs: [
    /* Стартовый состав менеджера тянет примерно на 59, поэтому лига
       разложена вокруг этого значения: снизу есть кого обыгрывать,
       сверху — куда расти через трансферы. */
    { id: 'volna', name: 'Волна Юга', power: 49, color: '#f43f5e' },
    { id: 'ural', name: 'Уральский Кряж', power: 54, color: '#78716c' },
    { id: 'tayga', name: 'Тайга ФК', power: 58, color: '#22c55e' },
    { id: 'metel', name: 'Метель Норд', power: 62, color: '#e2e8f0' },
    { id: 'vulkan', name: 'Вулкан Ультра', power: 67, color: '#f97316' },
    { id: 'grom', name: 'Гром Столицы', power: 72, color: '#facc15' },
    { id: 'legenda', name: 'Легенда X', power: 78, color: '#a855f7' }
  ],

  stadiums: [
    { id: 'city', name: 'Городская Арена', cost: 0, grass: '#1e6b3a', line: '#e8fff0', sky: '#12203a' },
    { id: 'night', name: 'Ночной Неон', cost: 300, grass: '#123024', line: '#7dfcff', sky: '#0a0620' },
    { id: 'desert', name: 'Пустынный Кубок', cost: 500, grass: '#8a7a3f', line: '#fff6d9', sky: '#3a2410' },
    { id: 'snow', name: 'Снежная Арена', cost: 700, grass: '#d8e8e0', line: '#274b5e', sky: '#3a4a5c' }
  ],

  weathers: [
    { id: 'clear', name: 'Ясно', atkMul: 1, defMul: 1 },
    { id: 'rain', name: 'Дождь', atkMul: 0.94, defMul: 0.94 },
    { id: 'snow', name: 'Снег', atkMul: 0.9, defMul: 0.96 },
    { id: 'night', name: 'Ночь', atkMul: 1, defMul: 1 },
    { id: 'wind', name: 'Ветер', atkMul: 0.95, defMul: 1 }
  ],

  formations: {
    '4-4-2': { def: 4, mid: 4, fwd: 2, label: '4-4-2 · Классика' },
    '4-3-3': { def: 4, mid: 3, fwd: 3, label: '4-3-3 · Атакующая' },
    '3-5-2': { def: 3, mid: 5, fwd: 2, label: '3-5-2 · Контроль центра' },
    '5-3-2': { def: 5, mid: 3, fwd: 2, label: '5-3-2 · Автобус' }
  },

  tacticStyles: [
    { id: 'attack', name: 'Атакующий', ic: 'attack', atkMul: 1.18, defMul: 0.85 },
    { id: 'balance', name: 'Сбалансированный', ic: 'balance', atkMul: 1, defMul: 1 },
    { id: 'defense', name: 'Оборонительный', ic: 'shield', atkMul: 0.85, defMul: 1.18 }
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
    { id: 'classic', name: 'Классика', cost: 0, color: '#F2F6F0' },
    { id: 'fire', name: 'Огненный', cost: 300, color: '#FF5B41' },
    { id: 'disco', name: 'Дискошар', cost: 350, color: '#7DD3FC' },
    { id: 'galaxy', name: 'Галактика', cost: 450, color: '#A78BFA' }
  ],

  interventions: [
    { id: 'speech', name: 'Мотивационная речь', cost: 0, ic: 'flame', short: 'Речь', desc: '+15% к силе команды на 15 минут, один раз за матч' },
    { id: 'masterclass', name: 'Тактический гений', cost: 400, ic: 'chart', short: 'Разбор', desc: 'Смена тактики без штрафа за перестроение' },
    { id: 'ironwall', name: 'Железная стена', cost: 400, ic: 'shield', short: 'Стена', desc: 'Оборона держится насмерть 10 минут' }
  ],

  achievements: [
    { id: 'first_goal', ic: 'ball', name: 'Первый гол', desc: 'Забей свой первый гол в матче' },
    { id: 'hat_trick', ic: 'attack', name: 'Разгром', desc: 'Выиграй матч с разницей в три мяча и больше' },
    { id: 'first_win', ic: 'medal', name: 'Первая победа', desc: 'Выиграй свой первый матч' },
    { id: 'intervention_used', ic: 'flame', name: 'Слово тренера', desc: 'Используй тренерское вмешательство' },
    { id: 'league_complete', ic: 'trophy', name: 'Легенда Лиги', desc: 'Выиграй сезон Ультра-Лиги' },
    { id: 'shopaholic', ic: 'shop', name: 'Модник', desc: 'Купи любой предмет в магазине' },
    { id: 'transfer_done', ic: 'transfer', name: 'Трансферное окно', desc: 'Подпиши игрока на трансферном рынке' },
    { id: 'clean_sheet', ic: 'shield', name: 'Сухой лист', desc: 'Не пропусти ни одного гола за матч' },
    { id: 'top_table', ic: 'star', name: 'Вершина таблицы', desc: 'Возглавь турнирную таблицу лиги' }
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
