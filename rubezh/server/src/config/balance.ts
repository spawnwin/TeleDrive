export type ResourceType =
  | 'materials'
  | 'fuel'
  | 'parts'
  | 'food'
  | 'medkits'
  | 'energy'
  | 'badges';

export type BuildingType =
  | 'command'
  | 'warehouse'
  | 'motorpool'
  | 'repair'
  | 'fuel_depot'
  | 'food_hub'
  | 'medical'
  | 'comms'
  | 'engineering'
  | 'training';

export type RequestType =
  | 'tutorial_delivery'
  | 'supply_food'
  | 'supply_fuel'
  | 'supply_gear'
  | 'urgent_repair'
  | 'medevac'
  | 'restore_comms'
  | 'evac_vehicle'
  | 'road_repair'
  | 'generator_delivery'
  | 'weather_recovery'
  | 'civil_aid'
  | 'search_cargo'
  | 'fortify_post'
  | 'reserve_depot';

export interface BuildingDef {
  type: BuildingType;
  name: string;
  baseCost: number;
  growth: number;
  produces?: ResourceType;
  ratePerHour: number;
  unlockLevel: number;
}

export interface RequestDef {
  type: RequestType;
  title: string;
  description: string;
  durationSec: number;
  difficulty: number;
  cost: Partial<Record<ResourceType, number>>;
  reward: Partial<Record<ResourceType, number>>;
  xp: number;
  requiredBuilding?: BuildingType;
}

export interface OperationDef {
  id: string;
  title: string;
  description: string;
  durationSec: number;
  difficulty: number;
  cost: Partial<Record<ResourceType, number>>;
  reward: Partial<Record<ResourceType, number>>;
  xp: number;
  minCommandLevel: number;
  weights: { supply: number; mobility: number; comms: number; engineering: number; morale: number };
}

export const OFFLINE_CAP_HOURS = 4;

export const BUILDINGS: BuildingDef[] = [
  { type: 'command', name: 'Командный пункт', baseCost: 50, growth: 1.15, ratePerHour: 0, unlockLevel: 1 },
  { type: 'warehouse', name: 'Центральный склад', baseCost: 40, growth: 1.1, produces: 'materials', ratePerHour: 60, unlockLevel: 1 },
  { type: 'motorpool', name: 'Автопарк', baseCost: 55, growth: 1.15, produces: 'fuel', ratePerHour: 24, unlockLevel: 1 },
  { type: 'repair', name: 'Ремонтный комплекс', baseCost: 70, growth: 1.15, produces: 'parts', ratePerHour: 18, unlockLevel: 2 },
  { type: 'fuel_depot', name: 'Склад горючего', baseCost: 60, growth: 1.12, produces: 'fuel', ratePerHour: 36, unlockLevel: 2 },
  { type: 'food_hub', name: 'Продовольственный узел', baseCost: 45, growth: 1.12, produces: 'food', ratePerHour: 30, unlockLevel: 1 },
  { type: 'medical', name: 'Медицинский пункт', baseCost: 80, growth: 1.15, produces: 'medkits', ratePerHour: 12, unlockLevel: 3 },
  { type: 'comms', name: 'Узел связи', baseCost: 75, growth: 1.15, produces: 'energy', ratePerHour: 4, unlockLevel: 3 },
  { type: 'engineering', name: 'Инженерный парк', baseCost: 90, growth: 1.16, produces: 'materials', ratePerHour: 20, unlockLevel: 4 },
  { type: 'training', name: 'Учебный центр', baseCost: 85, growth: 1.15, ratePerHour: 0, unlockLevel: 4 },
];

export const REQUEST_DEFS: RequestDef[] = [
  {
    type: 'tutorial_delivery',
    title: 'Первый приказ',
    description: 'Доставьте комплект оборудования на учебный пункт.',
    durationSec: 8,
    difficulty: 1,
    cost: { materials: 10 },
    reward: { materials: 40, badges: 10 },
    xp: 25,
    requiredBuilding: 'warehouse',
  },
  {
    type: 'supply_food',
    title: 'Доставка продовольствия',
    description: 'Колонна с рационами для соседнего района.',
    durationSec: 25,
    difficulty: 1,
    cost: { food: 15, fuel: 8 },
    reward: { materials: 25, food: 5 },
    xp: 15,
  },
  {
    type: 'supply_fuel',
    title: 'Доставка топлива',
    description: 'Срочная заправка генераторов на рубеже.',
    durationSec: 30,
    difficulty: 1,
    cost: { fuel: 20 },
    reward: { materials: 30, parts: 5 },
    xp: 18,
  },
  {
    type: 'supply_gear',
    title: 'Доставка имущества',
    description: 'Комплектация заявки по накладной склада.',
    durationSec: 35,
    difficulty: 2,
    cost: { materials: 25, fuel: 10 },
    reward: { materials: 45, badges: 5 },
    xp: 22,
  },
  {
    type: 'urgent_repair',
    title: 'Срочный ремонт',
    description: 'Вернуть транспорт в строй на ремонтной площадке.',
    durationSec: 40,
    difficulty: 2,
    cost: { parts: 12, materials: 10 },
    reward: { parts: 8, materials: 20 },
    xp: 28,
    requiredBuilding: 'repair',
  },
  {
    type: 'medevac',
    title: 'Медицинская эвакуация',
    description: 'Доставить медкомплекты и сопроводить эвакуацию.',
    durationSec: 45,
    difficulty: 2,
    cost: { medkits: 8, fuel: 12 },
    reward: { medkits: 4, materials: 35, badges: 8 },
    xp: 32,
    requiredBuilding: 'medical',
  },
  {
    type: 'restore_comms',
    title: 'Восстановление связи',
    description: 'Настроить резервный канал связи с районом.',
    durationSec: 28,
    difficulty: 1,
    cost: { materials: 15, energy: 2 },
    reward: { materials: 28, energy: 1 },
    xp: 20,
    requiredBuilding: 'comms',
  },
  {
    type: 'evac_vehicle',
    title: 'Эвакуация техники',
    description: 'Вытянуть повреждённый транспорт на ремонтную базу.',
    durationSec: 50,
    difficulty: 2,
    cost: { fuel: 15, parts: 8 },
    reward: { parts: 15, materials: 30 },
    xp: 30,
    requiredBuilding: 'repair',
  },
  {
    type: 'road_repair',
    title: 'Восстановление дороги',
    description: 'Инженерная бригада расчищает условный участок маршрута.',
    durationSec: 55,
    difficulty: 3,
    cost: { materials: 35, fuel: 12 },
    reward: { materials: 55, badges: 10 },
    xp: 36,
    requiredBuilding: 'engineering',
  },
  {
    type: 'generator_delivery',
    title: 'Доставка генератора',
    description: 'Обеспечить автономное питание полевого узла.',
    durationSec: 40,
    difficulty: 2,
    cost: { materials: 20, fuel: 15, energy: 1 },
    reward: { energy: 3, materials: 25 },
    xp: 26,
  },
  {
    type: 'weather_recovery',
    title: 'Последствия непогоды',
    description: 'Восстановить склад после сильного ветра и дождя.',
    durationSec: 35,
    difficulty: 2,
    cost: { materials: 18, food: 10 },
    reward: { materials: 40, food: 8 },
    xp: 24,
  },
  {
    type: 'civil_aid',
    title: 'Помощь гражданской инфраструктуре',
    description: 'Передать запас воды и рационов условному гражданскому объекту.',
    durationSec: 32,
    difficulty: 1,
    cost: { food: 20, medkits: 4, fuel: 8 },
    reward: { badges: 12, materials: 20 },
    xp: 22,
  },
  {
    type: 'search_cargo',
    title: 'Поиск пропавшего груза',
    description: 'Найти и вернуть контейнер, отмеченный на оперативной схеме.',
    durationSec: 48,
    difficulty: 3,
    cost: { fuel: 18, energy: 2 },
    reward: { materials: 60, parts: 10, badges: 8 },
    xp: 34,
  },
  {
    type: 'fortify_post',
    title: 'Инженерное укрепление',
    description: 'Установить защитные конструкции на временном пункте.',
    durationSec: 60,
    difficulty: 3,
    cost: { materials: 40, parts: 10 },
    reward: { materials: 50, badges: 15 },
    xp: 40,
    requiredBuilding: 'engineering',
  },
  {
    type: 'reserve_depot',
    title: 'Резервный пункт',
    description: 'Развернуть запасной склад на учебном рубеже.',
    durationSec: 70,
    difficulty: 3,
    cost: { materials: 50, fuel: 20, food: 15 },
    reward: { materials: 70, badges: 20 },
    xp: 45,
    requiredBuilding: 'warehouse',
  },
];

export const SPECIALIST_TEMPLATES = [
  { templateId: 'logistics_ivan', name: 'Иван «Склад»', role: 'Тыловик', rarity: 'Опытный', management: 8, speed: 6, reliability: 9 },
  { templateId: 'driver_olga', name: 'Ольга «Маршрут»', role: 'Водитель', rarity: 'Обычный', management: 5, speed: 10, reliability: 7 },
  { templateId: 'mechanic_petr', name: 'Пётр «Ключ»', role: 'Ремонтник', rarity: 'Редкий', management: 7, speed: 7, reliability: 10 },
  { templateId: 'medic_anna', name: 'Анна «Щит»', role: 'Медик', rarity: 'Опытный', management: 6, speed: 8, reliability: 8 },
  { templateId: 'comms_kirill', name: 'Кирилл «Эфир»', role: 'Связист', rarity: 'Редкий', management: 7, speed: 9, reliability: 8 },
  { templateId: 'engineer_mira', name: 'Мира «Мост»', role: 'Инженер', rarity: 'Элитный', management: 9, speed: 6, reliability: 9 },
  { templateId: 'coord_leon', name: 'Леон «Колонна»', role: 'Координатор колонн', rarity: 'Опытный', management: 8, speed: 8, reliability: 7 },
  { templateId: 'instructor_vera', name: 'Вера «Строй»', role: 'Инструктор', rarity: 'Обычный', management: 6, speed: 7, reliability: 8 },
  { templateId: 'psych_dmitry', name: 'Дмитрий «Опора»', role: 'Психолог', rarity: 'Опытный', management: 7, speed: 5, reliability: 9 },
  { templateId: 'commander_nazar', name: 'Назар «Рубеж»', role: 'Командир', rarity: 'Легендарный', management: 12, speed: 8, reliability: 11 },
];

export const VEHICLE_TEMPLATES = [
  { templateId: 'cargo_ural', name: 'Грузовик «Урал-С»', category: 'Грузовой', capacity: 40, speed: 6, reliability: 8, fuelUse: 4 },
  { templateId: 'fuel_bowser', name: 'Топливозаправщик ТЗ-12', category: 'Топливо', capacity: 50, speed: 5, reliability: 7, fuelUse: 5 },
  { templateId: 'ambulance', name: 'Санитарный «Луч»', category: 'Медицина', capacity: 20, speed: 8, reliability: 9, fuelUse: 3 },
  { templateId: 'repair_evac', name: 'РЭМ «Тягач»', category: 'Ремонт', capacity: 25, speed: 5, reliability: 9, fuelUse: 6 },
  { templateId: 'comms_van', name: 'Мобильный узел связи', category: 'Связь', capacity: 15, speed: 7, reliability: 8, fuelUse: 4 },
  { templateId: 'eng_dozer', name: 'Инженерная машина ИМ-2', category: 'Инженерия', capacity: 30, speed: 4, reliability: 10, fuelUse: 7 },
  { templateId: 'field_kitchen', name: 'Полевая кухня ПК-7', category: 'Продовольствие', capacity: 18, speed: 5, reliability: 8, fuelUse: 3 },
  { templateId: 'loader', name: 'Погрузчик «Клин»', category: 'Склад', capacity: 35, speed: 4, reliability: 7, fuelUse: 3 },
];

export const OPERATIONS: OperationDef[] = [
  {
    id: 'op_first_column',
    title: 'Большая колонна',
    description: 'Обеспечить устойчивость учебного района одной согласованной доставкой.',
    durationSec: 90,
    difficulty: 1,
    cost: { materials: 40, fuel: 25, food: 15 },
    reward: { materials: 100, badges: 25, fuel: 10 },
    xp: 60,
    minCommandLevel: 1,
    weights: { supply: 0.35, mobility: 0.3, comms: 0.1, engineering: 0.1, morale: 0.15 },
  },
  {
    id: 'op_broken_route',
    title: 'Сломанный маршрут',
    description: 'Восстановить условный маршрут снабжения через запасной объезд.',
    durationSec: 120,
    difficulty: 2,
    cost: { materials: 55, fuel: 30, parts: 15 },
    reward: { materials: 130, parts: 20, badges: 35 },
    xp: 85,
    minCommandLevel: 2,
    weights: { supply: 0.2, mobility: 0.25, comms: 0.15, engineering: 0.3, morale: 0.1 },
  },
  {
    id: 'op_reserve_comms',
    title: 'Резервная связь',
    description: 'Поднять запасной канал и удержать связь района.',
    durationSec: 100,
    difficulty: 2,
    cost: { materials: 35, energy: 4, fuel: 15 },
    reward: { energy: 5, materials: 80, badges: 30 },
    xp: 75,
    minCommandLevel: 3,
    weights: { supply: 0.15, mobility: 0.1, comms: 0.45, engineering: 0.1, morale: 0.2 },
  },
  {
    id: 'op_night_crisis',
    title: 'Ночной кризис',
    description: 'Закрыть сразу три срочные заявки без срыва графика.',
    durationSec: 150,
    difficulty: 3,
    cost: { materials: 70, fuel: 40, medkits: 10, food: 20 },
    reward: { materials: 160, badges: 50, medkits: 8 },
    xp: 120,
    minCommandLevel: 4,
    weights: { supply: 0.25, mobility: 0.2, comms: 0.2, engineering: 0.15, morale: 0.2 },
  },
  {
    id: 'op_engineer_line',
    title: 'Инженерный рубеж',
    description: 'Укрепить логистический узел и расчистить подходные пути.',
    durationSec: 140,
    difficulty: 3,
    cost: { materials: 90, parts: 25, fuel: 25 },
    reward: { materials: 180, parts: 30, badges: 45 },
    xp: 110,
    minCommandLevel: 4,
    weights: { supply: 0.15, mobility: 0.15, comms: 0.1, engineering: 0.45, morale: 0.15 },
  },
];

export const ACHIEVEMENTS = [
  { id: 'first_cargo', title: 'Первый груз', description: 'Выполните первую заявку', metric: 'requestsTotal', target: 1, reward: { badges: 20 } },
  { id: 'hundred_requests', title: 'Сто заявок', description: 'Выполните 100 заявок', metric: 'requestsTotal', target: 100, reward: { badges: 150, materials: 200 } },
  { id: 'repair_master', title: 'Мастер ремонта', description: 'Откройте ремонтный комплекс', metric: 'repairUnlocked', target: 1, reward: { parts: 40, badges: 30 } },
  { id: 'always_online', title: 'Всегда на связи', description: 'Откройте узел связи', metric: 'commsUnlocked', target: 1, reward: { energy: 5, badges: 30 } },
  { id: 'reliable_rear', title: 'Надёжный тыл', description: 'Доведите КП до 5 уровня', metric: 'commandLevel', target: 5, reward: { badges: 80 } },
  { id: 'full_auto', title: 'Базовая автоматизация', description: 'Включите автосбор ресурсов', metric: 'autoCollect', target: 1, reward: { badges: 40 } },
  { id: 'column_ready', title: 'Колонна готова', description: 'Завершите операцию «Большая колонна»', metric: 'op_first_column', target: 1, reward: { badges: 50, fuel: 30 } },
  { id: 'no_idle', title: 'Ни минуты простоя', description: 'Соберите ресурсы 25 раз', metric: 'collectsTotal', target: 25, reward: { materials: 100, badges: 25 } },
];

export const SHOP_ITEMS = [
  { id: 'pack_materials', title: 'Ящик материалов', description: 'Срочное пополнение склада', costBadges: 40, reward: { materials: 150 } },
  { id: 'pack_fuel', title: 'Канистры топлива', description: 'Запас для колонн', costBadges: 35, reward: { fuel: 120 } },
  { id: 'pack_parts', title: 'Комплект запчастей', description: 'Для ремонтного комплекса', costBadges: 45, reward: { parts: 80 } },
  { id: 'boost_speed', title: 'Ускорение штаба', description: '+10% к скорости заявок на 30 минут', costBadges: 60, reward: {}, effect: 'speed_boost_30m' as const },
  { id: 'starter_rare', title: 'Контракт связиста', description: 'Получить специалиста «Эфир»', costBadges: 120, reward: {}, unlockSpecialist: 'comms_kirill' },
];

export const STORY_CHAPTERS = [
  { id: 1, title: 'Первый приказ', text: 'Вы прибыли на небольшой полевой пункт. Одна палатка, две машины и нестабильная связь. Первая заявка уже на столе.' },
  { id: 2, title: 'База на пустом месте', text: 'Склад растёт. Водители привыкают к маршрутам. Штаб начинает работать как система, а не как набор случайных поручений.' },
  { id: 3, title: 'Сломанный маршрут', text: 'Основной путь снабжения перекрыт непогодой. Нужен запасной объезд и холодный расчёт ресурсов.' },
  { id: 4, title: 'Резервная связь', text: 'Без связи заявки превращаются в хаос. Узел связи — нервная система всего тыла.' },
  { id: 5, title: 'Большая колонна', text: 'Первая крупная операция. Если колонна пройдёт в срок, район удержит устойчивость.' },
];

export const DAILY_QUESTS = [
  { id: 'daily_requests', title: 'Выполнить 5 заявок', target: 5, metric: 'requestsCompleted', reward: { materials: 80, badges: 20 } },
  { id: 'daily_upgrades', title: 'Улучшить объект', target: 1, metric: 'upgrades', reward: { materials: 50, fuel: 20 } },
  { id: 'daily_collect', title: 'Собрать ресурсы 3 раза', target: 3, metric: 'collects', reward: { food: 30, parts: 15 } },
  { id: 'daily_offline', title: 'Получить офлайн-доход', target: 1, metric: 'offlineClaims', reward: { badges: 15, materials: 40 } },
  { id: 'daily_assign', title: 'Назначить специалиста', target: 1, metric: 'assignments', reward: { energy: 2, materials: 25 } },
  { id: 'daily_operation', title: 'Провести одну операцию', target: 1, metric: 'operations', reward: { badges: 25, fuel: 25 } },
];

export function upgradeCost(baseCost: number, growth: number, level: number): number {
  return Math.round(baseCost * Math.pow(growth, Math.max(0, level - 1)));
}

export function upgradeDurationSec(level: number): number {
  const table = [5, 15, 30, 60, 120, 300, 600, 1800];
  return table[Math.min(level - 1, table.length - 1)] ?? 3600;
}

export function capacityFor(resource: ResourceType, warehouseLevel: number, commandLevel: number): number {
  const base: Record<ResourceType, number> = {
    materials: 500,
    fuel: 300,
    parts: 200,
    food: 300,
    medkits: 100,
    energy: 20,
    badges: 999999,
  };
  if (resource === 'badges' || resource === 'energy') {
    return base[resource] + commandLevel * (resource === 'energy' ? 2 : 0);
  }
  return Math.round(base[resource] * (1 + warehouseLevel * 0.15 + commandLevel * 0.05));
}

export function xpToLevel(level: number): number {
  return Math.round(100 * Math.pow(1.35, level - 1));
}

export function operationResultLabel(score: number): string {
  if (score < 0.45) return 'Провал без потерь личного состава';
  if (score < 0.6) return 'Частичный успех';
  if (score < 0.78) return 'Успех';
  if (score < 0.92) return 'Полный успех';
  return 'Образцовое выполнение';
}
