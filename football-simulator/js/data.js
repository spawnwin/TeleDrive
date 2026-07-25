const DATA = {
  rivals: [
    { id: 'volna', name: 'Волна Юга', power: 1, color: '#f43f5e' },
    { id: 'ural', name: 'Уральский Кряж', power: 2, color: '#78716c' },
    { id: 'tayga', name: 'Тайга ФК', power: 3, color: '#22c55e' },
    { id: 'stal', name: 'Сталь Города', power: 4, color: '#64748b' },
    { id: 'metel', name: 'Метель Норд', power: 5, color: '#e2e8f0' },
    { id: 'vulkan', name: 'Вулкан Ультра', power: 6, color: '#f97316' },
    { id: 'grom', name: 'Гром Столицы', power: 7, color: '#facc15' },
    { id: 'legenda', name: 'Легенда X', power: 8, color: '#a855f7' }
  ],

  stadiums: [
    { id: 'city', name: 'Городская Арена', cost: 0, grass: '#1e6b3a', line: '#e8fff0', sky: '#12203a' },
    { id: 'night', name: 'Ночной Неон', cost: 300, grass: '#123024', line: '#7dfcff', sky: '#0a0620' },
    { id: 'desert', name: 'Пустынный Кубок', cost: 500, grass: '#8a7a3f', line: '#fff6d9', sky: '#3a2410' },
    { id: 'snow', name: 'Снежная Арена', cost: 700, grass: '#d8e8e0', line: '#274b5e', sky: '#3a4a5c' }
  ],

  weathers: [
    { id: 'clear', name: '☀️ Ясно', friction: 0.988, windX: 0, slip: 1 },
    { id: 'rain', name: '🌧️ Дождь', friction: 0.978, windX: 0.02, slip: 1.25 },
    { id: 'snow', name: '❄️ Снег', friction: 0.965, windX: 0, slip: 0.85 },
    { id: 'night', name: '🌙 Ночь', friction: 0.988, windX: 0, slip: 1 },
    { id: 'wind', name: '🌬️ Ветер', friction: 0.988, windX: 0.06, slip: 1 }
  ],

  difficulties: [
    { id: 'easy', name: 'Новичок', aiSkill: 0.55 },
    { id: 'normal', name: 'Игрок', aiSkill: 0.72 },
    { id: 'hard', name: 'Профи', aiSkill: 0.88 },
    { id: 'ultra', name: 'ULTRA', aiSkill: 1.0 }
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

  abilities: [
    { id: 'fireshot', name: 'Огненный удар', cost: 0, icon: '🔥', desc: 'Неберущийся удар с огненным следом' },
    { id: 'timewarp', name: 'Разрыв времени', cost: 400, icon: '⏱️', desc: 'Замедляет соперников на 3 сек' },
    { id: 'magnet', name: 'Магнит-дриблинг', cost: 400, icon: '🧲', desc: 'Мяч прилипает к ноге на 4 сек' }
  ],

  achievements: [
    { id: 'first_goal', icon: '⚽', name: 'Первый гол', desc: 'Забей свой первый гол' },
    { id: 'hat_trick', icon: '🎩', name: 'Хет-трик', desc: 'Забей 3 гола в одном матче' },
    { id: 'first_win', icon: '🏅', name: 'Первая победа', desc: 'Выиграй свой первый матч' },
    { id: 'ultra_used', icon: '⚡', name: 'Сила Ультра', desc: 'Используй суперспособность' },
    { id: 'career_complete', icon: '👑', name: 'Легенда Лиги', desc: 'Пройди всю карьеру' },
    { id: 'shopaholic', icon: '🛍️', name: 'Модник', desc: 'Купи любой предмет в магазине' },
    { id: 'comeback', icon: '🔥', name: 'Камбэк', desc: 'Выиграй матч, проигрывая в счёте' },
    { id: 'clean_sheet', icon: '🧤', name: 'Сухой лист', desc: 'Не пропусти ни одного гола за матч' }
  ]
};
