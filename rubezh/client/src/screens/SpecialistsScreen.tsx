import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { useScreenInsets } from '../hooks/useScreenInsets';
import { useGame } from '../state/GameContext';
import { colors } from '../theme';

export function SpecialistsScreen() {
  const { state, act } = useGame();
  const { top, bottom } = useScreenInsets({ bottomExtra: 28 });
  if (!state) return null;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: top + 8, paddingHorizontal: 14, paddingBottom: bottom }}
    >
      <Text style={styles.title}>Специалисты</Text>
      <Text style={styles.sub}>Назначьте офицеров на объекты базы для ускорения работ.</Text>

      {state.specialists.map((s) => (
        <View key={s.id} style={styles.card}>
          <Text style={styles.name}>{s.name}</Text>
          <Text style={styles.meta}>
            {s.role} · {s.rarity} · ур.{s.level}
          </Text>
          <Text style={styles.stats}>
            Упр {s.management} · Скор {s.speed} · Над {s.reliability}
          </Text>
          <View style={styles.row}>
            {state.buildings
              .filter((b) => b.level > 0)
              .slice(0, 4)
              .map((b) => (
                <Pressable
                  key={b.id}
                  style={[styles.assignBtn, s.assigned_building_id === b.id && styles.assignActive]}
                  onPress={() => act(() => api.assign(s.id, b.id))}
                >
                  <Text style={styles.assignText}>{b.name.split(' ')[0]}</Text>
                </Pressable>
              ))}
            <Pressable style={styles.assignBtn} onPress={() => act(() => api.assign(s.id, null))}>
              <Text style={styles.assignText}>Снять</Text>
            </Pressable>
          </View>
        </View>
      ))}

      <Text style={[styles.title, { marginTop: 18 }]}>Техника</Text>
      {state.vehicles.map((v) => (
        <View key={v.id} style={styles.card}>
          <Text style={styles.name}>{v.name}</Text>
          <Text style={styles.meta}>
            {v.category} · {v.status === 'idle' ? 'Свободен' : 'На задании'} · сост. {v.condition}%
          </Text>
          <Text style={styles.stats}>
            Груз {v.capacity} · Скор {v.speed} · Расход {v.fuel_use}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  sub: { color: colors.textDim, marginVertical: 8 },
  card: {
    backgroundColor: colors.panel,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { color: colors.text, fontWeight: '800', fontSize: 16 },
  meta: { color: colors.sand, marginTop: 4 },
  stats: { color: colors.textDim, marginTop: 4, fontSize: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  assignBtn: {
    backgroundColor: colors.bgAlt,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
  assignActive: { backgroundColor: colors.olive },
  assignText: { color: colors.text, fontSize: 12, fontWeight: '700' },
});
