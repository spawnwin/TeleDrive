import React from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GameProvider, useGame } from './src/state/GameContext';
import { BaseScreen } from './src/screens/BaseScreen';
import { MapScreen } from './src/screens/MapScreen';
import { SpecialistsScreen } from './src/screens/SpecialistsScreen';
import { QuestsScreen } from './src/screens/QuestsScreen';
import { ShopScreen } from './src/screens/ShopScreen';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.panel,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

function RootTabs() {
  const { loading, error, state } = useGame();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loading}>Подключение к штабу…</Text>
      </View>
    );
  }

  if (!state) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Нет связи с сервером</Text>
        <Text style={styles.errorText}>{error || 'Запустите rubezh/server и укажите API URL на вкладке «Карта».'}</Text>
      </View>
    );
  }

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textDim,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}
    >
      <Tab.Screen name="База" component={BaseScreen} />
      <Tab.Screen name="Карта" component={MapScreen} />
      <Tab.Screen name="Штаб" component={SpecialistsScreen} />
      <Tab.Screen name="Задания" component={QuestsScreen} />
      <Tab.Screen name="Склад" component={ShopScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GameProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar barStyle="light-content" />
          <RootTabs />
        </NavigationContainer>
      </GameProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loading: { color: colors.sand, marginTop: 12 },
  errorTitle: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  errorText: { color: colors.textDim, marginTop: 10, textAlign: 'center', lineHeight: 20 },
  tabBar: {
    backgroundColor: colors.panel,
    borderTopColor: colors.border,
    height: 64,
    paddingBottom: 8,
    paddingTop: 6,
  },
});
