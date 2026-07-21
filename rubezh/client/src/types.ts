export type ResourceType =
  | 'materials'
  | 'fuel'
  | 'parts'
  | 'food'
  | 'medkits'
  | 'energy'
  | 'badges';

export interface GameState {
  user: {
    id: string;
    nickname: string;
    callsign: string;
    level: number;
    experience: number;
    xpToNext: number;
    tutorialStep: number;
    tutorialDone: boolean;
    stateVersion: number;
    serverNow: string;
  };
  resources: Record<ResourceType, number>;
  capacities: Record<string, number>;
  buildings: Building[];
  specialists: Specialist[];
  vehicles: Vehicle[];
  requests: GameRequest[];
  quests: Quest[];
  offline: {
    hoursAvailable: number;
    capHours: number;
    lastClaimAt: string;
  };
  region: {
    id: string;
    name: string;
    stability: number;
  };
  lastQuality?: string;
  offlineGained?: Partial<Record<ResourceType, number>>;
  offlineHours?: number;
}

export interface Building {
  id: string;
  type: string;
  name: string;
  level: number;
  state: string;
  upgrade_ends_at: string | null;
  stored: number;
  produces: string | null;
  ratePerHour: number;
  nextUpgradeCost: number;
  nextUpgradeDurationSec: number;
  unlocked: boolean;
  assigned_specialist_id: string | null;
}

export interface Specialist {
  id: string;
  name: string;
  role: string;
  rarity: string;
  level: number;
  management: number;
  speed: number;
  reliability: number;
  assigned_building_id: string | null;
}

export interface Vehicle {
  id: string;
  name: string;
  category: string;
  level: number;
  condition: number;
  capacity: number;
  speed: number;
  reliability: number;
  fuel_use: number;
  status: string;
}

export interface GameRequest {
  id: string;
  type: string;
  title: string;
  description: string;
  status: string;
  difficulty: number;
  duration_sec: number;
  cost: Partial<Record<ResourceType, number>>;
  reward: Partial<Record<ResourceType, number>>;
  xp: number;
  required_building: string | null;
  vehicle_id: string | null;
  ends_at: string | null;
  quality: string | null;
}

export interface Quest {
  id: string;
  quest_def_id: string;
  title: string;
  metric: string;
  target: number;
  progress: number;
  claimed: boolean;
  reward: Partial<Record<ResourceType, number>>;
}

export const RESOURCE_LABELS: Record<ResourceType, string> = {
  materials: 'Материалы',
  fuel: 'Топливо',
  parts: 'Запчасти',
  food: 'Продовольствие',
  medkits: 'Медкомплекты',
  energy: 'Энергия',
  badges: 'Знаки',
};

export const BUILDING_COLORS: Record<string, string> = {
  command: '#3d5a3d',
  warehouse: '#6b5b3e',
  motorpool: '#4a5560',
  repair: '#5c4a3a',
  fuel_depot: '#5a5030',
  food_hub: '#4a5a3a',
  medical: '#3a5a6a',
};
