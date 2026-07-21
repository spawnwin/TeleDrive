import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../theme';
import {
  checkForUpdate,
  downloadAndInstallApk,
  getLocalVersionName,
  type AppVersionInfo,
} from '../updates';

type Props = {
  enabled?: boolean;
};

export function UpdateModal({ enabled = true }: Props) {
  const [info, setInfo] = useState<AppVersionInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const remote = await checkForUpdate();
      if (!cancelled && remote) setInfo(remote);
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled]);

  if (!info) return null;

  const onUpdate = async () => {
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      await downloadAndInstallApk(info.apkUrl, setProgress);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось скачать обновление');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="fade" transparent onRequestClose={() => !info.force && setInfo(null)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.kicker}>Обновление штаба</Text>
          <Text style={styles.title}>Версия {info.versionName} готова</Text>
          <Text style={styles.sub}>
            У вас {getLocalVersionName()}. Android попросит подтвердить установку — это нормально.
          </Text>
          {info.changelog?.length ? (
            <View style={styles.list}>
              {info.changelog.map((line) => (
                <Text key={line} style={styles.item}>
                  • {line}
                </Text>
              ))}
            </View>
          ) : null}
          {busy ? (
            <View style={styles.progressWrap}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.progressText}>Загрузка… {Math.round(progress * 100)}%</Text>
            </View>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
            onPress={onUpdate}
            disabled={busy}
          >
            <Text style={styles.btnPrimaryText}>Обновить сейчас</Text>
          </Pressable>
          {!info.force ? (
            <Pressable style={styles.btn} onPress={() => setInfo(null)} disabled={busy}>
              <Text style={styles.btnText}>Позже</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 14, 10, 0.72)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  kicker: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  sub: {
    color: colors.textDim,
    lineHeight: 20,
  },
  list: { gap: 4, marginTop: 4 },
  item: { color: colors.sand, lineHeight: 20 },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  progressText: { color: colors.khaki },
  error: { color: colors.warn },
  btn: {
    marginTop: 4,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  btnPrimary: {
    backgroundColor: colors.olive,
  },
  btnDisabled: { opacity: 0.6 },
  btnPrimaryText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 16,
  },
  btnText: {
    color: colors.textDim,
    fontWeight: '600',
  },
});
