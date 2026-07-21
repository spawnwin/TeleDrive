import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useGame } from '../state/GameContext';
import { colors } from '../theme';

export function MapScreen() {
  const { state, apiUrl, setApiUrl, refresh, error } = useGame();
  const [url, setUrl] = useState(apiUrl);

  if (!state) return null;

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Оперативная карта</Text>
      <View style={styles.card}>
        <Text style={styles.region}>{state.region.name}</Text>
        <Text style={styles.meta}>Художественный учебный район</Text>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${state.region.stability}%` }]} />
        </View>
        <Text style={styles.meta}>Устойчивость снабжения: {state.region.stability}%</Text>
        <Text style={styles.note}>
          Конкретные координаты, реальные маршруты и действующие части не используются. Показаны условные узлы
          обеспечения.
        </Text>
      </View>

      <Text style={styles.title}>Сервер</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 14 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 10, marginTop: 8 },
  card: {
    backgroundColor: colors.panel,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  region: { color: colors.gold, fontSize: 18, fontWeight: '800' },
  meta: { color: colors.sand, marginTop: 8 },
  note: { color: colors.textDim, marginTop: 12, lineHeight: 20, fontSize: 13 },
  barBg: { height: 10, backgroundColor: colors.bgAlt, borderRadius: 5, marginTop: 12, overflow: 'hidden' },
  barFill: { height: 10, backgroundColor: colors.info },
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
