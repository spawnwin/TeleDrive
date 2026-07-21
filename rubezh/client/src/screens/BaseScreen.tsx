import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api';
import { BuildingNode } from '../components/BuildingNode';
import { DistrictMapCard } from '../components/DistrictMapCard';
import { BuildingModal, RequestModal } from '../components/Modals';
import { TopBar } from '../components/TopBar';
import { TutorialOverlay } from '../components/TutorialOverlay';
import { useGame } from '../state/GameContext';
import { colors } from '../theme';
import type { Building, GameRequest } from '../types';

const LAYOUT: Array<{ type: string; top: number; left: number }> = [
  { type: 'command', top: 16, left: 120 },
  { type: 'warehouse', top: 100, left: 10 },
  { type: 'motorpool', top: 100, left: 230 },
  { type: 'food_hub', top: 200, left: 20 },
  { type: 'fuel_depot', top: 200, left: 220 },
  { type: 'repair', top: 300, left: 10 },
  { type: 'medical', top: 300, left: 230 },
  { type: 'comms', top: 400, left: 20 },
  { type: 'engineering', top: 400, left: 130 },
  { type: 'training', top: 400, left: 240 },
];

export function BaseScreen() {
  const { state, act, toast, clearToast } = useGame();
  const insets = useSafeAreaInsets();
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<GameRequest | null>(null);

  const buildingsByType = useMemo(() => {
    const map: Record<string, Building> = {};
    state?.buildings.forEach((b) => {
      map[b.type] = b;
    });
    return map;
  }, [state]);

  if (!state) return null;

  const urgent = state.requests.filter((r) => r.status !== 'claimed').slice(0, 8);
  const highlightWarehouse = !state.user.tutorialDone && state.user.tutorialStep >= 2;
  const secured = state.region.nodes?.filter((n) => n.status === 'secured').length ?? 0;

  return (
    <View style={styles.root}>
      <TopBar state={state} onCollectAll={() => act(() => api.collectAll())} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 8) + 24 }]}>
        <DistrictMapCard
          compact
          name={state.region.name}
          stability={state.region.stability}
          nodes={state.region.nodes || []}
          lastEvent={state.region.lastEvent}
        />

        <View style={styles.regionRow}>
          <Text style={styles.regionMeta}>Узлы обеспечены: {secured}/{state.region.nodes?.length || 0}</Text>
          {state.region.lastEvent ? (
            <Text style={styles.regionEvent} numberOfLines={1}>
              {state.region.lastEvent}
            </Text>
          ) : (
            <Text style={styles.stability}>Район на карте</Text>
          )}
        </View>

        <View style={styles.storyCard}>
          <Text style={styles.storyTitle}>
            Глава {state.story.chapter}: {state.story.title}
          </Text>
          <Text style={styles.storyText} numberOfLines={2}>
            {state.story.objective
              ? `${state.story.objective} (${state.story.objectiveProgress ?? 0}/${state.story.objectiveTarget ?? 1})`
              : state.story.text}
          </Text>
          {state.story.canClaim ? (
            <Pressable style={styles.storyBtn} onPress={() => act(() => api.advanceStory())}>
              <Text style={styles.storyBtnText}>Получить награду главы</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.yardLabel}>Площадка базы</Text>
        <View style={styles.baseYard}>
          <View style={styles.road} />
          <View style={[styles.road, styles.roadH]} />
          {LAYOUT.map((slot) => {
            const b = buildingsByType[slot.type];
            if (!b) return null;
            return (
              <View key={b.id} style={[styles.slot, { top: slot.top, left: slot.left }]}>
                <BuildingNode
                  building={b}
                  highlight={highlightWarehouse && b.type === 'warehouse'}
                  onPress={() => setSelectedBuilding(b)}
                />
              </View>
            );
          })}
          <View style={styles.convoy}>
            <Text style={styles.convoyText}>
              {state.vehicles.some((v) => v.status === 'on_mission') ? '🚛 Колонна в пути' : '🚛 Автопарк готов'}
            </Text>
          </View>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Заявки</Text>
          <Pressable style={styles.offlineBtn} onPress={() => act(() => api.claimOffline())}>
            <Text style={styles.offlineText}>Офлайн {state.offline.hoursAvailable.toFixed(1)}ч</Text>
          </Pressable>
        </View>

        {urgent.map((req) => (
          <Pressable key={req.id} style={styles.reqCard} onPress={() => setSelectedRequest(req)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.reqTitle}>{req.title}</Text>
              <Text style={styles.reqMeta}>
                {statusLabel(req.status)} · {req.duration_sec}с · +{req.xp} XP
              </Text>
            </View>
            <Text style={styles.reqAction}>{req.status === 'ready' ? 'Получить' : 'Открыть'}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <TutorialOverlay />

      {toast && (
        <Pressable style={styles.toast} onPress={clearToast}>
          <Text style={styles.toastText}>{toast}</Text>
        </Pressable>
      )}

      <BuildingModal
        visible={!!selectedBuilding}
        building={selectedBuilding}
        onClose={() => setSelectedBuilding(null)}
        onUpgrade={() => {
          if (!selectedBuilding) return;
          act(() => api.upgrade(selectedBuilding.id)).then(() => setSelectedBuilding(null));
        }}
        onCollect={() => {
          if (!selectedBuilding) return;
          act(() => api.collect(selectedBuilding.id));
        }}
      />

      <RequestModal
        visible={!!selectedRequest}
        request={selectedRequest}
        vehicles={state.vehicles}
        onClose={() => setSelectedRequest(null)}
        onStart={(vehicleId) => {
          if (!selectedRequest) return;
          act(() => api.startRequest(selectedRequest.id, vehicleId)).then(() => setSelectedRequest(null));
        }}
        onClaim={() => {
          if (!selectedRequest) return;
          act(() => api.claimRequest(selectedRequest.id)).then(() => setSelectedRequest(null));
        }}
      />
    </View>
  );
}

function statusLabel(status: string) {
  switch (status) {
    case 'available':
      return 'Доступна';
    case 'in_progress':
      return 'Выполняется';
    case 'ready':
      return 'Готово';
    default:
      return status;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 28, paddingTop: 8 },
  regionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 8,
  },
  regionMeta: { color: colors.sand, fontWeight: '700', flexShrink: 0 },
  regionEvent: { color: colors.info, flex: 1, textAlign: 'right', fontSize: 12 },
  stability: { color: colors.info, fontSize: 12 },
  storyCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: colors.panel,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  storyTitle: { color: colors.gold, fontWeight: '800', fontSize: 13 },
  storyText: { color: colors.textDim, marginTop: 4, fontSize: 12, lineHeight: 17 },
  storyBtn: {
    marginTop: 10,
    backgroundColor: colors.olive,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  storyBtnText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  yardLabel: {
    color: colors.gold,
    fontWeight: '800',
    marginHorizontal: 14,
    marginBottom: 8,
    marginTop: 4,
  },
  baseYard: {
    marginHorizontal: 12,
    height: 540,
    borderRadius: 16,
    backgroundColor: '#2a3324',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  road: {
    position: 'absolute',
    left: '46%',
    top: 0,
    bottom: 0,
    width: 28,
    backgroundColor: '#3a4034',
    opacity: 0.9,
  },
  roadH: {
    left: 0,
    right: 0,
    top: '48%',
    bottom: undefined,
    height: 24,
    width: undefined,
  },
  slot: { position: 'absolute' },
  convoy: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 10,
    padding: 8,
  },
  convoyText: { color: colors.text, textAlign: 'center', fontWeight: '600' },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginTop: 14,
    marginBottom: 8,
  },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800', flex: 1 },
  offlineBtn: {
    backgroundColor: colors.panelSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  offlineText: { color: colors.gold, fontWeight: '700' },
  reqCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: colors.panel,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 64,
  },
  reqTitle: { color: colors.text, fontWeight: '700' },
  reqMeta: { color: colors.textDim, marginTop: 4, fontSize: 12 },
  reqAction: { color: colors.accent, fontWeight: '800' },
  toast: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    backgroundColor: colors.olive,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  toastText: { color: colors.text, fontWeight: '700' },
});
