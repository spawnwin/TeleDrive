import React, { useEffect, useState } from 'react';
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { useScreenInsets } from '../hooks/useScreenInsets';
import { useGame } from '../state/GameContext';
import { colors } from '../theme';
import { RESOURCE_LABELS } from '../types';

const DISTRICT_MAP = require('../../assets/training-district-map.jpg');

const NODE_PINS: Record<string, { top: string; left: string }> = {
  camp: { top: '58%', left: '22%' },
  depot: { top: '42%', left: '68%' },
  bridge: { top: '48%', left: '48%' },
  comms_node: { top: '28%', left: '34%' },
  med: { top: '70%', left: '72%' },
};

export function MapScreen() {
  const { state, error, act, online, syncing, lastSyncedAt } = useGame();
  const { top, bottom } = useScreenInsets({ bottomExtra: 28 });

  if (!state) return null;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: top + 8, paddingHorizontal: 14, paddingBottom: bottom }}
    >
      <Text style={styles.title}>Оперативная карта</Text>
      <Text style={styles.subtitle}>Учебный район «Сосновый тыл»</Text>

      <View style={[styles.syncChip, !online && styles.syncChipWarn]}>
        <View style={[styles.dot, online ? styles.dotOn : styles.dotOff]} />
        <SyncLabel online={online} syncing={syncing} lastSyncedAt={lastSyncedAt} />
      </View>

      <View style={styles.mapCard}>
        <ImageBackground source={DISTRICT_MAP} style={styles.mapImage} imageStyle={styles.mapImageInner}>
          <View style={styles.mapFog} />
          {state.region.nodes?.map((n) => {
            const pin = NODE_PINS[n.id] || { top: '50%', left: '50%' };
            return (
              <View key={n.id} style={[styles.pin, { top: pin.top as any, left: pin.left as any }]}>
                <View style={[styles.pinDot, statusColor(n.status)]} />
                <Text style={styles.pinLabel} numberOfLines={1}>
                  {n.name}
                </Text>
              </View>
            );
          })}
          <View style={styles.mapFooter}>
            <Text style={styles.mapTitle}>{state.region.name}</Text>
            <Text style={styles.mapMeta}>Устойчивость снабжения {state.region.stability}%</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${Math.min(100, state.region.stability)}%` }]} />
            </View>
          </View>
        </ImageBackground>
      </View>

      <Text style={styles.section}>Узлы района</Text>
      {state.region.nodes?.map((n) => (
        <View key={n.id} style={styles.nodeRow}>
          <View style={[styles.nodeMark, statusColor(n.status)]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.nodeName}>{n.name}</Text>
            <Text style={styles.nodeHint}>{nodeHint(n.id)}</Text>
          </View>
          <Text style={styles.nodeStatus}>{nodeLabel(n.status)}</Text>
        </View>
      ))}

      <Text style={styles.section}>
        Сюжет · глава {state.story.chapter}/{state.story.total}
      </Text>
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

      {error && !online ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.hint}>
        Прогресс сохраняется на сервере автоматически. Карта условная: реальные координаты и части не используются.
      </Text>
    </ScrollView>
  );
}

function SyncLabel({
  online,
  syncing,
  lastSyncedAt,
}: {
  online: boolean;
  syncing: boolean;
  lastSyncedAt: number | null;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  let label = 'Подключение…';
  if (syncing) label = 'Синхронизация…';
  else if (!online) label = 'Нет связи · повтор через несколько секунд';
  else if (lastSyncedAt) {
    const sec = Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000));
    label = sec < 2 ? 'Связь со штабом · актуально' : `Связь со штабом · ${sec}с назад`;
  }
  return <Text style={styles.syncText}>{label}</Text>;
}

function nodeLabel(status: string) {
  if (status === 'secured') return 'Обеспечен';
  if (status === 'active') return 'Активен';
  if (status === 'watch') return 'На контроле';
  return 'Ожидает';
}

function nodeHint(id: string) {
  if (id === 'camp') return 'Штабной лагерь и жилой сектор';
  if (id === 'depot') return 'Складской двор и погрузка';
  if (id === 'bridge') return 'Переправа колонн через реку';
  if (id === 'comms_node') return 'Антенны и радиосеть района';
  if (id === 'med') return 'Медпункт и санитарный пост';
  return 'Узел обеспечения';
}

function statusColor(status: string) {
  if (status === 'secured') return { backgroundColor: colors.accent };
  if (status === 'active') return { backgroundColor: colors.gold };
  if (status === 'watch') return { backgroundColor: colors.info };
  return { backgroundColor: colors.textDim };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: colors.sand, marginTop: 4, marginBottom: 10, fontWeight: '600' },
  syncChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  syncChipWarn: { borderColor: colors.warn },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { backgroundColor: colors.accent },
  dotOff: { backgroundColor: colors.warn },
  syncText: { color: colors.sand, fontSize: 12, fontWeight: '700' },
  mapCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    backgroundColor: colors.panel,
  },
  mapImage: { width: '100%', aspectRatio: 16 / 10, justifyContent: 'flex-end' },
  mapImageInner: { resizeMode: 'cover' },
  mapFog: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(18,24,18,0.12)',
  },
  pin: {
    position: 'absolute',
    transform: [{ translateX: -40 }, { translateY: -18 }],
    width: 120,
    alignItems: 'center',
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#f2ebe0',
    marginBottom: 4,
  },
  pinLabel: {
    color: '#f4efe4',
    fontSize: 10,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    textAlign: 'center',
  },
  mapFooter: { padding: 14, paddingTop: 28 },
  mapTitle: { color: '#f4efe4', fontSize: 18, fontWeight: '800' },
  mapMeta: { color: '#d8cfb8', marginTop: 4, fontWeight: '600' },
  barBg: { height: 8, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 4, marginTop: 10, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: colors.info },
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
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.panel,
    padding: 12,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nodeMark: { width: 10, height: 10, borderRadius: 5 },
  nodeName: { color: colors.text, fontWeight: '700' },
  nodeHint: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  nodeStatus: { color: colors.accent, fontWeight: '700', fontSize: 12 },
  timer: { color: colors.gold, marginTop: 8, fontWeight: '700' },
  ready: { color: colors.medical, marginTop: 8, fontWeight: '700' },
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
  hint: { color: colors.textDim, marginTop: 14, fontSize: 12, lineHeight: 18 },
});
