import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { QuestsScreen } from './QuestsScreen';
import { ShopScreen } from './ShopScreen';
import { colors } from '../theme';

export function MoreScreen() {
  const [tab, setTab] = useState<'quests' | 'shop'>('quests');

  return (
    <View style={styles.root}>
      <View style={styles.tabs}>
        <Pressable style={[styles.tab, tab === 'quests' && styles.active]} onPress={() => setTab('quests')}>
          <Text style={styles.tabText}>Задания</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'shop' && styles.active]} onPress={() => setTab('shop')}>
          <Text style={styles.tabText}>Склад</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1 }}>{tab === 'quests' ? <QuestsScreen /> : <ShopScreen />}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
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
});
