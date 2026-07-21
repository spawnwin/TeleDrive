/** Russian labels for raw server enums / building type ids */

export const BUILDING_TYPE_LABELS: Record<string, string> = {
  command: 'Командный пункт',
  warehouse: 'Склад',
  motorpool: 'Автопарк',
  repair: 'Ремонтный комплекс',
  fuel_depot: 'Топливный склад',
  food_hub: 'Продпункт',
  medical: 'Медпункт',
  comms: 'Узел связи',
  engineering: 'Инженерия',
  training: 'Учебный центр',
};

export const BUILDING_STATE_LABELS: Record<string, string> = {
  idle: 'В строю',
  upgrading: 'Строится',
  locked: 'Не развёрнуто',
  producing: 'Работает',
};

export const VEHICLE_STATUS_LABELS: Record<string, string> = {
  idle: 'Свободен',
  on_mission: 'На задании',
  repairing: 'В ремонте',
};

export function buildingTypeLabel(type: string) {
  return BUILDING_TYPE_LABELS[type] || type;
}

export function buildingStateLabel(state: string) {
  return BUILDING_STATE_LABELS[state] || state;
}

export function vehicleStatusLabel(status: string) {
  return VEHICLE_STATUS_LABELS[status] || status;
}
