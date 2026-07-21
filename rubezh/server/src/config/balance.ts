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
  | 'medical';

export type RequestType =
  | 'supply_food'
  | 'supply_fuel'
  | 'supply_gear'
  | 'urgent_repair'
  | 'medevac'
  | 'restore_comms'
  | 'tutorial_delivery';

export type RequestStatus = 'available' | 'in_progress' | 'ready' | 'claimed';

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

export const OFFLINE_CAP_HOURS = 4;

export const BUILDINGS: BuildingDef[] = [
  { type: 'command', name: 'Командный пункт', baseCost: 50, growth: 1.15, ratePerHour: 0, unlockLevel: 1 },
  { type: 'warehouse', name: 'Центральный склад', baseCost: 40, growth: 1.1, produces: 'materials', ratePerHour: 60, unlockLevel: 1 },
  { type: 'motorpool', name: 'Автопарк', baseCost: 55, growth: 1.15, produces: 'fuel', ratePerHour: 24, unlockLevel: 1 },
  { type: 'repair', name: 'Ремонтный комплекс', baseCost: 70, growth: 1.15, produces: 'parts', ratePerHour: 18, unlockLevel: 2 },
  { type: 'fuel_depot', name: 'Склад горючего', baseCost: 60, growth: 1.12, produces: 'fuel', ratePerHour: 36, unlockLevel: 2 },
  { type: 'food_hub', name: 'Продовольственный узел', baseCost: 45, growth: 1.12, produces: 'food', ratePerHour: 30, unlockLevel: 1 },
  { type: 'medical', name: 'Медицинский пункт', baseCost: 80, growth: 1.15, produces: 'medkits', ratePerHour: 12, unlockLevel: 3 },
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
  },
];

export const SPECIALIST_TEMPLATES = [
  { templateId: 'logistics_ivan', name: 'Иван «Склад»', role: 'Тыловик', rarity: 'Опытный', management: 8, speed: 6, reliability: 9 },
  { templateId: 'driver_olga', name: 'Ольга «Маршрут»', role: 'Водитель', rarity: 'Обычный', management: 5, speed: 10, reliability: 7 },
  { templateId: 'mechanic_petr', name: 'Пётр «Ключ»', role: 'Ремонтник', rarity: 'Редкий', management: 7, speed: 7, reliability: 10 },
  { templateId: 'medic_anna', name: 'Анна «Щит»', role: 'Медик', rarity: 'Опытный', management: 6, speed: 8, reliability: 8 },
];

export const VEHICLE_TEMPLATES = [
  { templateId: 'cargo_ural', name: 'Грузовик «Урал-С»', category: 'Грузовой', capacity: 40, speed: 6, reliability: 8, fuelUse: 4 },
  { templateId: 'fuel_bowser', name: 'Топливозаправщик ТЗ-12', category: 'Топливо', capacity: 50, speed: 5, reliability: 7, fuelUse: 5 },
  { templateId: 'ambulance', name: 'Санитарный «Луч»', category: 'Медицина', capacity: 20, speed: 8, reliability: 9, fuelUse: 3 },
];

export const DAILY_QUESTS = [
  { id: 'daily_requests', title: 'Выполнить 5 заявок', target: 5, metric: 'requestsCompleted', reward: { materials: 80, badges: 20 } },
  { id: 'daily_upgrades', title: 'Улучшить объект', target: 1, metric: 'upgrades', reward: { materials: 50, fuel: 20 } },
  { id: 'daily_collect', title: 'Собрать ресурсы 3 раза', target: 3, metric: 'collects', reward: { food: 30, parts: 15 } },
  { id: 'daily_offline', title: 'Получить офлайн-доход', target: 1, metric: 'offlineClaims', reward: { badges: 15, materials: 40 } },
  { id: 'daily_assign', title: 'Назначить специалиста', target: 1, metric: 'assignments', reward: { energy: 2, materials: 25 } },
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
