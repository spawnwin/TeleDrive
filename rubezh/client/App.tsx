import React from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GameProvider, useGame } from './src/state/GameContext';
import { BaseScreen } from './src/screens/BaseScreen';
import { MapScreen } from './src/screens/MapScreen';
import { SpecialistsScreen } from './src/screens/SpecialistsScreen';
import { ClanScreen } from './src/screens/ClanScreen';
import { MoreScreen } from './src/screens/MoreScreen';
import { ProfileScreen, type RootStackParamList } from './src/screens/ProfileScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { UpdateModal } from './src/components/UpdateModal';
import { TabIcon } from './src/components/Icons';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<RootStackParamList>();

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
  const insets = useSafeAreaInsets();
  const tabPad = Math.max(insets.bottom, 10);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.panel,
          borderTopColor: colors.border,
          height: 58 + tabPad,
          paddingBottom: tabPad,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textDim,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}
    >
      <Tab.Screen
        name="База"
        component={BaseScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="base" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Карта"
        component={MapScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="map" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Союз"
        component={ClanScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="clan" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Штаб"
        component={SpecialistsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="staff" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Ещё"
        component={MoreScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="more" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { loading, error, state, needsAuth } = useGame();
  const insets = useSafeAreaInsets();

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loading}>Подключение к штабу…</Text>
      </View>
    );
  }

  if (needsAuth || !state) {
    if (needsAuth) return <AuthScreen />;
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.errorTitle}>Нет связи с сервером</Text>
        <Text style={styles.errorText}>
          {error || 'Идёт автоматическое переподключение. Проверьте интернет.'}
          {error?.includes('CLEARTEXT')
            ? '\n\nНужна сборка 0.2.2+: Android блокирует HTTP. Скачайте новый APK с сайта.'
            : ''}
        </Text>
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="Tabs" component={RootTabs} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GameProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
          <RootNavigator />
          <UpdateModal />
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
});
