import React from 'react';
import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

const tabIcons = {
  base: require('../../assets/icons/tab-base.png'),
  map: require('../../assets/icons/tab-map.png'),
  clan: require('../../assets/icons/tab-clan.png'),
  staff: require('../../assets/icons/tab-staff.png'),
  more: require('../../assets/icons/tab-more.png'),
};

const uiIcons = {
  auth: require('../../assets/icons/auth-shield.png'),
  profile: require('../../assets/icons/profile.png'),
  collect: require('../../assets/icons/collect.png'),
  offline: require('../../assets/icons/offline.png'),
  boost: require('../../assets/icons/boost.png'),
};

const resourceIcons = {
  materials: require('../../assets/resources/materials.png'),
  fuel: require('../../assets/resources/fuel.png'),
  parts: require('../../assets/resources/parts.png'),
  food: require('../../assets/resources/food.png'),
  medkits: require('../../assets/resources/medkits.png'),
  energy: require('../../assets/resources/energy.png'),
  badges: require('../../assets/resources/badges.png'),
};

const buildingIcons: Record<string, number> = {
  command: require('../../assets/buildings/command.png'),
  warehouse: require('../../assets/buildings/warehouse.png'),
  motorpool: require('../../assets/buildings/motorpool.png'),
  repair: require('../../assets/buildings/repair.png'),
  fuel_depot: require('../../assets/buildings/fuel_depot.png'),
  food_hub: require('../../assets/buildings/food_hub.png'),
  medical: require('../../assets/buildings/medical.png'),
  comms: require('../../assets/buildings/comms.png'),
  engineering: require('../../assets/buildings/engineering.png'),
  training: require('../../assets/buildings/training.png'),
};

export function TabIcon({
  name,
  focused,
  size = 24,
}: {
  name: keyof typeof tabIcons;
  focused?: boolean;
  size?: number;
}) {
  return (
    <Image
      source={tabIcons[name]}
      style={[
        { width: size, height: size },
        !focused && styles.dim,
      ]}
      resizeMode="contain"
    />
  );
}

export function UiIcon({
  name,
  size = 28,
  style,
}: {
  name: keyof typeof uiIcons;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return <Image source={uiIcons[name]} style={[{ width: size, height: size }, style]} resizeMode="contain" />;
}

export function ResourceIcon({
  name,
  size = 18,
}: {
  name: keyof typeof resourceIcons;
  size?: number;
}) {
  return <Image source={resourceIcons[name]} style={{ width: size, height: size }} resizeMode="contain" />;
}

export function BuildingIcon({ type, size = 40 }: { type: string; size?: number }) {
  const src = buildingIcons[type] || buildingIcons.command;
  return <Image source={src} style={{ width: size, height: size }} resizeMode="contain" />;
}

const styles = StyleSheet.create({
  dim: { opacity: 0.55 },
});
