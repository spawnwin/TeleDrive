import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { api } from '../api';
import { useGame } from '../state/GameContext';

const STEPS = [
  'Поступила заявка — нажмите на неё.',
  'Примите заявку кнопкой «Принять».',
  'Осмотрите склад на базе.',
  'Соберите груз / дождитесь комплектации.',
  'Выберите транспорт и отправьте колонну.',
  'Дождитесь доставки.',
  'Получите награду за заявку.',
  'Разверните или улучшите склад.',
];

export function TutorialOverlay() {
  const { state, act } = useGame();
  const insets = useSafeAreaInsets();
  if (!state || state.user.tutorialDone) return null;
  const step = Math.min(state.user.tutorialStep, STEPS.length - 1);

  return (
    <View
      style={[styles.wrap, { bottom: 56 + Math.max(insets.bottom, 10) + 12 }]}
      pointerEvents="box-none"
    >
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Глава 1 · Первый приказ</Text>
        <Text style={styles.title}>Шаг {step + 1}/8</Text>
        <Text style={styles.text}>{STEPS[step]}</Text>
        <Pressable
          style={styles.btn}
          onPress={() => act(() => api.advanceTutorial(Math.min(8, step + 1)))}
        >
          <Text style={styles.btnText}>{step >= 7 ? 'Завершить обучение' : 'Далее'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12 },
  card: {
    backgroundColor: 'rgba(28,36,28,0.94)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  eyebrow: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  title: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 4 },
  text: { color: colors.sand, marginTop: 6, lineHeight: 20 },
  btn: {
    marginTop: 12,
    backgroundColor: colors.olive,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: colors.text, fontWeight: '800' },
});
