import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { BUILDING_COLORS, type Building } from '../types';

type Props = {
  building: Building;
  onPress: () => void;
  highlight?: boolean;
};

export function BuildingNode({ building, onPress, highlight }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!highlight && building.stored < 1) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [highlight, building.stored, pulse]);

  const color = BUILDING_COLORS[building.type] || colors.graphite;
  const locked = building.level <= 0 && building.state === 'locked';
  const size = 72 + Math.min(Math.max(building.level, 0), 6) * 6;

  return (
    <Pressable onPress={onPress} style={styles.wrap}>
      <Animated.View
        style={[
          styles.node,
          {
            backgroundColor: color,
            width: size,
            height: size * 0.72,
            opacity: locked ? 0.4 : 1,
            transform: [{ scale: pulse }],
            borderColor: highlight ? colors.gold : building.stored > 0 ? colors.accent : colors.border,
          },
        ]}
      >
        <Text style={styles.level}>{building.level > 0 ? `ур.${building.level}` : 'палатка'}</Text>
        {building.state === 'upgrading' && <Text style={styles.badge}>⬆</Text>}
        {building.stored > 0 && <Text style={styles.stored}>●</Text>}
      </Animated.View>
      <Text style={styles.name} numberOfLines={2}>
        {building.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', width: 110, marginVertical: 6 },
  node: {
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  level: { color: colors.text, fontWeight: '800', fontSize: 13 },
  badge: { position: 'absolute', top: 4, right: 6, color: colors.gold, fontWeight: '700' },
  stored: { position: 'absolute', top: 4, left: 8, color: colors.accent, fontSize: 14 },
  name: { color: colors.sand, fontSize: 11, textAlign: 'center', marginTop: 4, minHeight: 28 },
});
