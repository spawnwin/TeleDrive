import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { useGame } from '../state/GameContext';
import { colors } from '../theme';
import { RESOURCE_LABELS } from '../types';

export function QuestsScreen() {
  const { state, act } = useGame();
  if (!state) return null;

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
      <Text style={styles.title}>Задания дня</Text>
      <Text style={styles.sub}>Ежедневные задачи снабжения и награды штаба.</Text>

      {state.quests.map((q) => (
        <View key={q.id} style={styles.card}>
          <Text style={styles.name}>{q.title}</Text>
          <Text style={styles.meta}>
            Прогресс {q.progress}/{q.target}
          </Text>
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${Math.min(100, (q.progress / q.target) * 100)}%` }]} />
          </View>
          <Text style={styles.reward}>
            Награда:{' '}
            {Object.entries(q.reward)
              .map(([k, v]) => `${RESOURCE_LABELS[k as keyof typeof RESOURCE_LABELS] || k} ${v}`)
              .join(', ')}
          </Text>
          <Pressable
            style={[styles.btn, (q.claimed || q.progress < q.target) && styles.btnDisabled]}
            disabled={q.claimed || q.progress < q.target}
            onPress={() => act(() => api.claimQuest(q.id))}
          >
            <Text style={styles.btnText}>{q.claimed ? 'Получено' : 'Забрать'}</Text>
          </Pressable>
        </View>
      ))}

      <Text style={[styles.title, { marginTop: 18 }]}>Достижения</Text>
      {state.achievements.map((a) => (
        <View key={a.id} style={styles.card}>
          <Text style={styles.name}>{a.title}</Text>
          <Text style={styles.meta}>{a.description}</Text>
          <Text style={styles.meta}>
            {a.progress}/{a.target}
          </Text>
          <Pressable
            style={[styles.btn, (!a.unlocked || a.claimed) && styles.btnDisabled]}
            disabled={!a.unlocked || a.claimed}
            onPress={() => act(() => api.claimAchievement(a.id))}
          >
            <Text style={styles.btnText}>{a.claimed ? 'Получено' : a.unlocked ? 'Забрать' : 'Закрыто'}</Text>
          </Pressable>
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
  barBg: { height: 8, backgroundColor: colors.bgAlt, borderRadius: 4, marginTop: 8, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: colors.accent },
  reward: { color: colors.textDim, marginTop: 8, fontSize: 12 },
  btn: {
    marginTop: 10,
    backgroundColor: colors.olive,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: colors.text, fontWeight: '700' },
});
