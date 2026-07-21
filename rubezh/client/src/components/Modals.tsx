import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { RESOURCE_LABELS, type Building, type GameRequest, type Vehicle } from '../types';

type Props = {
  visible: boolean;
  request: GameRequest | null;
  vehicles: Vehicle[];
  onClose: () => void;
  onStart: (vehicleId?: string) => void;
  onClaim: () => void;
};

export function RequestModal({ visible, request, vehicles, onClose, onStart, onClaim }: Props) {
  if (!request) return null;
  const idle = vehicles.filter((v) => v.status === 'idle');
  const remaining = request.ends_at ? Math.max(0, Math.ceil((new Date(request.ends_at).getTime() - Date.now()) / 1000)) : 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{request.title}</Text>
          <Text style={styles.desc}>{request.description}</Text>
          <Text style={styles.meta}>
            Сложность {request.difficulty} · {request.duration_sec}с · +{request.xp} XP
          </Text>

          <Text style={styles.section}>Стоимость</Text>
          <Text style={styles.line}>{formatBag(request.cost)}</Text>
          <Text style={styles.section}>Награда</Text>
          <Text style={styles.line}>{formatBag(request.reward)}</Text>

          {request.status === 'in_progress' && (
            <Text style={styles.timer}>В пути: {remaining}с</Text>
          )}
          {request.status === 'ready' && <Text style={styles.ready}>Груз доставлен. Можно принять отчёт.</Text>}

          {request.status === 'available' && (
            <ScrollView horizontal style={{ marginVertical: 8 }}>
              {idle.map((v) => (
                <Pressable key={v.id} style={styles.vehicle} onPress={() => onStart(v.id)}>
                  <Text style={styles.vehicleName}>{v.name}</Text>
                  <Text style={styles.vehicleMeta}>
                    сп.{v.speed} · сост.{v.condition}%
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View style={styles.actions}>
            <Pressable style={styles.secondary} onPress={onClose}>
              <Text style={styles.btnText}>Закрыть</Text>
            </Pressable>
            {request.status === 'available' && (
              <Pressable style={styles.primary} onPress={() => onStart()}>
                <Text style={styles.btnText}>Принять</Text>
              </Pressable>
            )}
            {request.status === 'ready' && (
              <Pressable style={styles.primary} onPress={onClaim}>
                <Text style={styles.btnText}>Получить</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function BuildingModal({
  visible,
  building,
  onClose,
  onUpgrade,
  onCollect,
}: {
  visible: boolean;
  building: Building | null;
  onClose: () => void;
  onUpgrade: () => void;
  onCollect: () => void;
}) {
  if (!building) return null;
  const ends = building.upgrade_ends_at
    ? Math.max(0, Math.ceil((new Date(building.upgrade_ends_at).getTime() - Date.now()) / 1000))
    : 0;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{building.name}</Text>
          <Text style={styles.meta}>
            Уровень {building.level} · {building.state}
          </Text>
          {building.produces && (
            <Text style={styles.line}>
              Производит: {RESOURCE_LABELS[building.produces as keyof typeof RESOURCE_LABELS] || building.produces} (
              {Math.round(building.ratePerHour)}/ч)
            </Text>
          )}
          <Text style={styles.line}>Накоплено: {Math.floor(building.stored)}</Text>
          <Text style={styles.line}>
            Улучшение: {building.nextUpgradeCost} мат. · {building.nextUpgradeDurationSec}с
          </Text>
          {building.state === 'upgrading' && <Text style={styles.timer}>До завершения: {ends}с</Text>}

          <View style={styles.actions}>
            <Pressable style={styles.secondary} onPress={onClose}>
              <Text style={styles.btnText}>Закрыть</Text>
            </Pressable>
            {building.stored > 0 && (
              <Pressable style={styles.secondary} onPress={onCollect}>
                <Text style={styles.btnText}>Собрать</Text>
              </Pressable>
            )}
            {building.state !== 'upgrading' && (
              <Pressable style={styles.primary} onPress={onUpgrade}>
                <Text style={styles.btnText}>{building.level <= 0 ? 'Развернуть' : 'Улучшить'}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function formatBag(map: Record<string, number | undefined>) {
  return Object.entries(map)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([k, v]) => `${RESOURCE_LABELS[k as keyof typeof RESOURCE_LABELS] || k}: ${v}`)
    .join(' · ');
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: colors.panel,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    borderColor: colors.border,
    borderWidth: 1,
    maxHeight: '80%',
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  desc: { color: colors.sand, marginTop: 8, lineHeight: 20 },
  meta: { color: colors.textDim, marginTop: 8 },
  section: { color: colors.accent, marginTop: 12, fontWeight: '700' },
  line: { color: colors.text, marginTop: 4 },
  timer: { color: colors.gold, marginTop: 10, fontWeight: '700' },
  ready: { color: colors.medical, marginTop: 10, fontWeight: '700' },
  vehicle: {
    backgroundColor: colors.bgAlt,
    padding: 10,
    borderRadius: 10,
    marginRight: 8,
    minWidth: 140,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vehicleName: { color: colors.text, fontWeight: '700' },
  vehicleMeta: { color: colors.textDim, fontSize: 12, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primary: {
    flex: 1,
    backgroundColor: colors.olive,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 48,
  },
  secondary: {
    flex: 1,
    backgroundColor: colors.graphite,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 48,
  },
  btnText: { color: colors.text, fontWeight: '700' },
});
