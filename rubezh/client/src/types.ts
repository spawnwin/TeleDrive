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
    speedBoostUntil?: string | null;
  };
  resources: Record<ResourceType, number>;
  capacities: Record<string, number>;
  buildings: Building[];
  specialists: Specialist[];
  vehicles: Vehicle[];
  requests: GameRequest[];
  quests: Quest[];
  operations: Operation[];
  availableOperations: AvailableOperation[];
  achievements: Achievement[];
  shop: ShopItem[];
  automation: {
    autoCollect: boolean;
    autoSimpleRequests: boolean;
    unlockAutoCollect: boolean;
    unlockAutoRequests: boolean;
    lastAction?: string | null;
  };
  story: {
    chapter: number;
    title: string;
    text: string;
    total: number;
    objective?: string;
    objectiveProgress?: number;
    objectiveTarget?: number;
    objectiveDone?: boolean;
    canClaim?: boolean;
    reward?: Partial<Record<ResourceType, number>>;
  };
  social?: SocialState;
  offline: {
    hoursAvailable: number;
    capHours: number;
    lastClaimAt: string;
  };
  region: {
    id: string;
    name: string;
    stability: number;
    lastEvent?: string | null;
    nodes: Array<{ id: string; name: string; status: string }>;
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
  unlockLevel?: number;
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

export interface Operation {
  id: string;
  def_id: string;
  title: string;
  status: string;
  score: number | null;
  result_label: string | null;
  reward: Partial<Record<ResourceType, number>>;
  ends_at: string | null;
  claimed: boolean;
}

export interface AvailableOperation {
  id: string;
  title: string;
  description: string;
  durationSec: number;
  difficulty: number;
  cost: Partial<Record<ResourceType, number>>;
  reward: Partial<Record<ResourceType, number>>;
  xp: number;
  minCommandLevel: number;
  locked?: boolean;
  active: Operation | null;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  unlocked: boolean;
  claimed: boolean;
  reward: Partial<Record<ResourceType, number>>;
}

export interface ShopItem {
  id: string;
  title: string;
  description: string;
  costBadges: number;
}

export interface SocialState {
  clan: ClanInfo | null;
  openClans: Array<{
    id: string;
    name: string;
    tag: string;
    motto: string;
    level: number;
    weekly_progress: number;
    weekly_goal: number;
    member_count: number;
  }>;
  leaderboard: Array<{
    id: string;
    callsign: string;
    level: number;
    requests_total: number;
    operations_total: number;
    helps_sent: number;
    clan_tag: string | null;
  }>;
  race: {
    dayKey: string;
    myScore: number;
    title: string;
    description: string;
    top: Array<{ user_id: string; requests: number; callsign: string; clan_tag: string | null }>;
  };
}

export interface ClanInfo {
  id: string;
  name: string;
  tag: string;
  motto: string;
  level: number;
  xp: number;
  xpToNext: number;
  memberCount: number;
  maxMembers: number;
  weeklyGoal: number;
  weeklyProgress: number;
  weekKey: string;
  myRole: string | null;
  members: Array<{
    userId: string;
    callsign: string;
    role: string;
    contribution: number;
    level: number;
    requestsTotal: number;
  }>;
  messages: Array<{ id: string; user_id: string; callsign: string; body: string; created_at: string }>;
  helpTargets: Array<{
    userId: string;
    callsign: string;
    role: string;
    canHelp: boolean;
    upgradingBuilding: { id: string; type: string; endsAt: string } | null;
  }>;
}

export interface PlayerProfile {
  id: string;
  callsign: string;
  nickname: string;
  level: number;
  experience?: number;
  xpToNext?: number;
  createdAt: string;
  lastSeenAt: string;
  isSelf: boolean;
  tutorialDone?: boolean;
  clan: {
    id: string;
    name: string;
    tag: string;
    motto: string;
    role: string;
    level: number;
  } | null;
  stats: {
    requestsTotal: number;
    collectsTotal: number;
    operationsTotal: number;
    helpsSent: number;
    repairsTotal: number;
    raceToday: number;
  };
  progress: {
    commandLevel: number;
    buildingsUnlocked: number;
    vehiclesCount: number;
    specialistsCount: number;
    storyChapter: number;
    achievementsUnlocked: number;
    regionStability: number;
  };
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
  comms: '#2f4f6a',
  engineering: '#5a4a35',
  training: '#3f4a3a',
};
