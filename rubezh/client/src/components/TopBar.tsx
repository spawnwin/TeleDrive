import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import type { GameState } from '../types';

export function TopBar({ state, onCollectAll }: { state: GameState; onCollectAll: () => void }) {
  const insets = useSafeAreaInsets();
  const r = state.resources;
  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) + 4 }]}>
      <View style={styles.row}>
        <Text style={styles.callsign}>{state.user.callsign}</Text>
        <Text style={styles.level}>КП {state.user.level}</Text>
        <Text style={styles.xp}>
          {state.user.experience}/{state.user.xpToNext} XP
        </Text>
      </View>
      <View style={styles.resRow}>
        <Res label="Мат" value={r.materials} />
        <Res label="Топл" value={r.fuel} />
        <Res label="Запч" value={r.parts} />
        <Res label="Еда" value={r.food} />
        <Res label="Знаки" value={r.badges} accent />
        <Pressable style={styles.collectBtn} onPress={onCollectAll}>
          <Text style={styles.collectText}>Сбор</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Res({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <View style={[styles.res, accent && styles.resAccent]}>
      <Text style={styles.resLabel}>{label}</Text>
      <Text style={styles.resValue}>{Math.floor(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.panel,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  callsign: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
  level: { color: colors.accent, fontWeight: '700' },
  xp: { color: colors.textDim, fontSize: 12 },
  resRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  res: {
    backgroundColor: colors.bgAlt,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    minWidth: 44,
  },
  resAccent: { borderWidth: 1, borderColor: colors.gold },
  resLabel: { color: colors.textDim, fontSize: 10 },
  resValue: { color: colors.text, fontWeight: '700', fontSize: 13 },
  collectBtn: {
    marginLeft: 'auto',
    backgroundColor: colors.olive,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  collectText: { color: colors.text, fontWeight: '700' },
});
