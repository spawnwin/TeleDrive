import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../screens/ProfileScreen';
import { colors } from '../theme';
import type { GameState } from '../types';

export function TopBar({ state, onCollectAll }: { state: GameState; onCollectAll: () => void }) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const r = state.resources;
  const boostActive =
    !!state.user.speedBoostUntil && new Date(state.user.speedBoostUntil).getTime() > Date.now();
  const boostMin = boostActive
    ? Math.max(1, Math.ceil((new Date(state.user.speedBoostUntil!).getTime() - Date.now()) / 60000))
    : 0;

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 8) + 4 }]}>
      <View style={styles.row}>
        <Pressable
          style={styles.callsignBtn}
          onPress={() => navigation.navigate('Profile', { userId: state.user.id })}
        >
          <Text style={styles.callsign}>{state.user.callsign}</Text>
          <Text style={styles.profileHint}>профиль ›</Text>
        </Pressable>
        <Text style={styles.level}>КП {state.user.level}</Text>
        <Text style={styles.xp}>
          {state.user.experience}/{state.user.xpToNext} XP
        </Text>
      </View>
      {boostActive ? (
        <Text style={styles.boost}>Ускорение штаба · ещё ~{boostMin} мин</Text>
      ) : null}
      <View style={styles.resRow}>
        <Res label="Мат" value={r.materials} />
        <Res label="Топл" value={r.fuel} />
        <Res label="Запч" value={r.parts} />
        <Res label="Еда" value={r.food} />
        <Res label="Мед" value={r.medkits} />
        <Res label="Эн" value={r.energy} />
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
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  callsignBtn: { flex: 1 },
  callsign: { color: colors.text, fontSize: 16, fontWeight: '700' },
  profileHint: { color: colors.gold, fontSize: 11, marginTop: 2, fontWeight: '700' },
  level: { color: colors.accent, fontWeight: '700' },
  xp: { color: colors.textDim, fontSize: 12 },
  boost: { color: colors.gold, fontSize: 11, fontWeight: '700', marginBottom: 6 },
  resRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  res: {
    backgroundColor: colors.bgAlt,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 3,
    minWidth: 38,
  },
  resAccent: { borderWidth: 1, borderColor: colors.gold },
  resLabel: { color: colors.textDim, fontSize: 9 },
  resValue: { color: colors.text, fontWeight: '700', fontSize: 12 },
  collectBtn: {
    marginLeft: 'auto',
    backgroundColor: colors.olive,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
  collectText: { color: colors.text, fontWeight: '700' },
});
