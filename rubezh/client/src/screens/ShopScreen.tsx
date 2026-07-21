import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { useGame } from '../state/GameContext';
import { colors } from '../theme';

export function ShopScreen() {
  const { state, act } = useGame();
  if (!state) return null;

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
      <Text style={styles.title}>Снабжение штаба</Text>
      <Text style={styles.sub}>
        Магазин за знаки отличия. Без случайных контейнеров — только понятные пакеты и ускорения.
      </Text>
      <Text style={styles.badges}>Баланс: {Math.floor(state.resources.badges)} знаков</Text>

      <Text style={styles.section}>Автоматизация</Text>
      <View style={styles.card}>
        <Text style={styles.name}>Автосбор ресурсов</Text>
        <Text style={styles.meta}>
          {state.automation.unlockAutoCollect ? 'Доступно с КП 2' : 'Откроется на КП 2'}
        </Text>
        <Pressable
          style={[styles.btn, !state.automation.unlockAutoCollect && styles.btnDisabled]}
          disabled={!state.automation.unlockAutoCollect}
          onPress={() => act(() => api.setAutomation({ autoCollect: !state.automation.autoCollect }))}
        >
          <Text style={styles.btnText}>{state.automation.autoCollect ? 'Выключить' : 'Включить'}</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.name}>Автозаявки (простые)</Text>
        <Text style={styles.meta}>
          {state.automation.unlockAutoRequests ? 'Доступно с КП 4' : 'Откроется на КП 4'}
        </Text>
        <Pressable
          style={[styles.btn, !state.automation.unlockAutoRequests && styles.btnDisabled]}
          disabled={!state.automation.unlockAutoRequests}
          onPress={() =>
            act(() => api.setAutomation({ autoSimpleRequests: !state.automation.autoSimpleRequests }))
          }
        >
          <Text style={styles.btnText}>{state.automation.autoSimpleRequests ? 'Выключить' : 'Включить'}</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>Каталог</Text>
      {state.shop.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.name}>{item.title}</Text>
          <Text style={styles.meta}>{item.description}</Text>
          <Text style={styles.price}>{item.costBadges} знаков</Text>
          <Pressable style={styles.btn} onPress={() => act(() => api.buyShop(item.id))}>
            <Text style={styles.btnText}>Купить</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  sub: { color: colors.textDim, marginVertical: 8, lineHeight: 20 },
  badges: { color: colors.gold, fontWeight: '800', marginBottom: 8 },
  section: { color: colors.gold, fontWeight: '800', marginTop: 14, marginBottom: 6 },
  card: {
    backgroundColor: colors.panel,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { color: colors.text, fontWeight: '800', fontSize: 16 },
  meta: { color: colors.sand, marginTop: 4 },
  price: { color: colors.gold, marginTop: 8, fontWeight: '700' },
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
