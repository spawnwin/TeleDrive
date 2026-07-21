import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api';
import { useGame } from '../state/GameContext';
import { colors } from '../theme';
import { RESOURCE_LABELS } from '../types';

export function MapScreen() {
  const { state, apiUrl, setApiUrl, refresh, error, act } = useGame();
  const [url, setUrl] = useState(apiUrl);

  if (!state) return null;

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
      <Text style={styles.title}>Оперативная карта</Text>
      <View style={styles.card}>
        <Text style={styles.region}>{state.region.name}</Text>
        <Text style={styles.meta}>Художественный учебный район</Text>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${Math.min(100, state.region.stability)}%` }]} />
        </View>
        <Text style={styles.meta}>Устойчивость снабжения: {state.region.stability}%</Text>
        <Text style={styles.note}>
          Конкретные координаты и действующие части не используются. Показаны условные узлы обеспечения.
        </Text>
      </View>

      <Text style={styles.section}>Узлы района</Text>
      {state.region.nodes?.map((n) => (
        <View key={n.id} style={styles.nodeRow}>
          <Text style={styles.nodeName}>{n.name}</Text>
          <Text style={styles.nodeStatus}>{nodeLabel(n.status)}</Text>
        </View>
      ))}

      <Text style={styles.section}>Сюжет · глава {state.story.chapter}/{state.story.total}</Text>
      <View style={styles.card}>
        <Text style={styles.region}>{state.story.title}</Text>
        <Text style={styles.note}>{state.story.text}</Text>
      </View>

      <Text style={styles.section}>Операции</Text>
      {state.availableOperations.map((op) => {
        const active = op.active;
        const remaining = active?.ends_at
          ? Math.max(0, Math.ceil((new Date(active.ends_at).getTime() - Date.now()) / 1000))
          : 0;
        return (
          <View key={op.id} style={styles.card}>
            <Text style={styles.opTitle}>{op.title}</Text>
            <Text style={styles.note}>{op.description}</Text>
            <Text style={styles.meta}>
              Сложность {op.difficulty} · {op.durationSec}с · КП {op.minCommandLevel}+ · +{op.xp} XP
            </Text>
            <Text style={styles.meta}>
              Стоимость:{' '}
              {Object.entries(op.cost)
                .map(([k, v]) => `${RESOURCE_LABELS[k as keyof typeof RESOURCE_LABELS] || k} ${v}`)
                .join(', ')}
            </Text>
            {active?.status === 'in_progress' && <Text style={styles.timer}>Идёт операция: {remaining}с</Text>}
            {active?.status === 'ready' && (
              <Text style={styles.ready}>Готово: {active.result_label || 'результат рассчитан'}</Text>
            )}
            {!active && (
              <Pressable style={styles.btn} onPress={() => act(() => api.startOperation(op.id))}>
                <Text style={styles.btnText}>Запустить</Text>
              </Pressable>
            )}
            {active?.status === 'ready' && (
              <Pressable style={styles.btn} onPress={() => act(() => api.claimOperation(active.id))}>
                <Text style={styles.btnText}>Получить итог</Text>
              </Pressable>
            )}
          </View>
        );
      })}

      <Text style={styles.section}>Сервер</Text>
      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        placeholder="http://IP:8787"
        placeholderTextColor={colors.textDim}
      />
      <Pressable
        style={styles.btn}
        onPress={async () => {
          await setApiUrl(url.trim());
          await refresh();
        }}
      >
        <Text style={styles.btnText}>Сохранить и синхронизировать</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.hint}>Для APK укажите IP машины с сервером, например http://192.168.0.10:8787</Text>
    </ScrollView>
  );
}

function nodeLabel(status: string) {
  if (status === 'secured') return 'Обеспечен';
  if (status === 'active') return 'Активен';
  if (status === 'watch') return 'На контроле';
  return 'Ожидает';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 10 },
  section: { color: colors.gold, fontSize: 16, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  card: {
    backgroundColor: colors.panel,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  region: { color: colors.gold, fontSize: 18, fontWeight: '800' },
  opTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  meta: { color: colors.sand, marginTop: 8 },
  note: { color: colors.textDim, marginTop: 10, lineHeight: 20, fontSize: 13 },
  barBg: { height: 10, backgroundColor: colors.bgAlt, borderRadius: 5, marginTop: 12, overflow: 'hidden' },
  barFill: { height: 10, backgroundColor: colors.info },
  nodeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.panel,
    padding: 12,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nodeName: { color: colors.text, fontWeight: '700' },
  nodeStatus: { color: colors.accent },
  timer: { color: colors.gold, marginTop: 8, fontWeight: '700' },
  ready: { color: colors.medical, marginTop: 8, fontWeight: '700' },
  input: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 48,
  },
  btn: {
    marginTop: 10,
    backgroundColor: colors.olive,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
  },
  btnText: { color: colors.text, fontWeight: '700' },
  error: { color: colors.warn, marginTop: 10 },
  hint: { color: colors.textDim, marginTop: 10, fontSize: 12, lineHeight: 18 },
});
