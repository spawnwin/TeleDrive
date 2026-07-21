import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../screens/ProfileScreen';
import { ResourceIcon, UiIcon } from './Icons';
import { colors } from '../theme';
import type { GameState, ResourceType } from '../types';

const RES_ORDER: Array<{ key: ResourceType; label: string }> = [
  { key: 'materials', label: 'Мат' },
  { key: 'fuel', label: 'Топл' },
  { key: 'parts', label: 'Запч' },
  { key: 'food', label: 'Еда' },
  { key: 'medkits', label: 'Мед' },
  { key: 'energy', label: 'Эн' },
  { key: 'badges', label: 'Знаки' },
];

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
          <View style={styles.callsignRow}>
            <UiIcon name="profile" size={28} />
            <View style={{ flex: 1 }}>
              <Text style={styles.callsign}>{state.user.callsign}</Text>
              <Text style={styles.profileHint}>профиль ›</Text>
            </View>
          </View>
        </Pressable>
        <Text style={styles.level}>КП {state.user.level}</Text>
        <Text style={styles.xp}>
          {state.user.experience}/{state.user.xpToNext} XP
        </Text>
      </View>
      {boostActive ? (
        <View style={styles.boostRow}>
          <UiIcon name="boost" size={16} />
          <Text style={styles.boost}>Ускорение штаба · ещё ~{boostMin} мин</Text>
        </View>
      ) : null}
      <View style={styles.resRow}>
        {RES_ORDER.map(({ key, label }) => (
          <Res key={key} type={key} label={label} value={r[key]} accent={key === 'badges'} />
        ))}
        <Pressable style={styles.collectBtn} onPress={onCollectAll}>
          <UiIcon name="collect" size={18} />
          <Text style={styles.collectText}>Сбор</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Res({
  type,
  label,
  value,
  accent,
}: {
  type: ResourceType;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <View style={[styles.res, accent && styles.resAccent]}>
      <ResourceIcon name={type} size={14} />
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
  callsignRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  callsign: { color: colors.text, fontSize: 16, fontWeight: '700' },
  profileHint: { color: colors.gold, fontSize: 11, marginTop: 2, fontWeight: '700' },
  level: { color: colors.accent, fontWeight: '700' },
  xp: { color: colors.textDim, fontSize: 12 },
  boostRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  boost: { color: colors.gold, fontSize: 11, fontWeight: '700' },
  resRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  res: {
    backgroundColor: colors.bgAlt,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 3,
    minWidth: 38,
    alignItems: 'center',
  },
  resAccent: { borderWidth: 1, borderColor: colors.gold },
  resLabel: { color: colors.textDim, fontSize: 9 },
  resValue: { color: colors.text, fontWeight: '700', fontSize: 12 },
  collectBtn: {
    marginLeft: 'auto',
    backgroundColor: colors.olive,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  collectText: { color: colors.text, fontWeight: '700', fontSize: 12 },
});
