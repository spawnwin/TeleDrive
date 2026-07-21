import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QuestsScreen } from './QuestsScreen';
import { ShopScreen } from './ShopScreen';
import { useGame } from '../state/GameContext';
import { colors } from '../theme';

export function MoreScreen() {
  const insets = useSafeAreaInsets();
  const { apiUrl, setApiUrl, online, syncing, lastSyncedAt } = useGame();
  const [tab, setTab] = useState<'quests' | 'shop'>('quests');
  const [url, setUrl] = useState(apiUrl);
  const [savedHint, setSavedHint] = useState<string | null>(null);

  useEffect(() => {
    setUrl(apiUrl);
  }, [apiUrl]);

  useEffect(() => {
    const trimmed = url.trim().replace(/\/$/, '');
    if (!trimmed || trimmed === apiUrl) return;
    const t = setTimeout(async () => {
      await setApiUrl(trimmed);
      setSavedHint('Адрес сервера сохранён автоматически');
      setTimeout(() => setSavedHint(null), 2500);
    }, 900);
    return () => clearTimeout(t);
  }, [url, apiUrl, setApiUrl]);

  let syncText = 'Автосинхронизация активна';
  if (syncing) syncText = 'Синхронизация…';
  else if (!online) syncText = 'Нет связи · идёт повтор';
  else if (lastSyncedAt) {
    const sec = Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000));
    syncText = sec < 2 ? 'Данные актуальны' : `Обновлено ${sec}с назад`;
  }

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 8) }]}>
      <View style={styles.syncBox}>
        <View style={[styles.dot, online ? styles.dotOn : styles.dotOff]} />
        <Text style={styles.syncText}>{syncText}</Text>
      </View>
      <View style={styles.tabs}>
        <Pressable style={[styles.tab, tab === 'quests' && styles.active]} onPress={() => setTab('quests')}>
          <Text style={styles.tabText}>Задания</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'shop' && styles.active]} onPress={() => setTab('shop')}>
          <Text style={styles.tabText}>Склад</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1 }}>{tab === 'quests' ? <QuestsScreen /> : <ShopScreen />}</View>
      <View style={[styles.serverBox, { paddingBottom: Math.max(insets.bottom, 8) + 8 }]}>
        <Text style={styles.serverLabel}>Сервер (сохраняется сам)</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="http://IP/api"
          placeholderTextColor={colors.textDim}
        />
        {savedHint ? <Text style={styles.saved}>{savedHint}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  syncBox: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { backgroundColor: colors.accent },
  dotOff: { backgroundColor: colors.warn },
  syncText: { color: colors.sand, fontSize: 12, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 0 },
  tab: {
    flex: 1,
    backgroundColor: colors.panel,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 44,
    justifyContent: 'center',
  },
  active: { backgroundColor: colors.olive },
  tabText: { color: colors.text, fontWeight: '700' },
  serverBox: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: colors.panel,
  },
  serverLabel: { color: colors.textDim, fontSize: 11, marginBottom: 6, fontWeight: '700' },
  input: {
    backgroundColor: colors.bgAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  saved: { color: colors.accent, marginTop: 6, fontSize: 12 },
});
