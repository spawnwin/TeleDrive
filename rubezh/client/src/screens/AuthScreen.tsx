import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '../state/GameContext';
import { colors } from '../theme';
import { UiIcon } from '../components/Icons';

type Mode = 'login' | 'register' | 'guest';

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { login, register, guestLogin, apiUrl, setApiUrl, error, online } = useGame();
  const [mode, setMode] = useState<Mode>('login');
  const [callsign, setCallsign] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [serverUrl, setServerUrl] = useState(apiUrl);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showServer, setShowServer] = useState(false);

  const onSubmit = async () => {
    setLocalError(null);
    const name = callsign.trim();
    if (mode !== 'guest' && name.length < 2) {
      setLocalError('Введите позывной');
      return;
    }
    if (mode !== 'guest' && password.trim().length < 4) {
      setLocalError('Пароль не короче 4 символов');
      return;
    }
    if (mode === 'register' && password !== password2) {
      setLocalError('Пароли не совпадают');
      return;
    }
    setBusy(true);
    try {
      if (serverUrl.trim() && serverUrl.trim().replace(/\/$/, '') !== apiUrl) {
        await setApiUrl(serverUrl.trim());
      }
      if (mode === 'login') await login(name, password.trim());
      else if (mode === 'register') await register(name, password.trim());
      else await guestLogin(name || undefined);
    } catch (err: any) {
      setLocalError(err.message || 'Ошибка авторизации');
    } finally {
      setBusy(false);
    }
  };

  return (
    <LinearGradient colors={['#142016', '#1c241c', '#243024']} style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + 28,
            paddingBottom: insets.bottom + 28,
            paddingHorizontal: 20,
            flexGrow: 1,
            justifyContent: 'center',
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <UiIcon name="auth" size={72} />
            <Text style={styles.title}>Рубеж</Text>
            <Text style={styles.subtitle}>Тыл Победы</Text>
            <Text style={styles.tagline}>Авторизация в штаб снабжения</Text>
          </View>

          <View style={styles.modes}>
            {(
              [
                ['login', 'Вход'],
                ['register', 'Регистрация'],
                ['guest', 'Гость'],
              ] as const
            ).map(([id, label]) => (
              <Pressable
                key={id}
                style={[styles.modeBtn, mode === id && styles.modeActive]}
                onPress={() => {
                  setMode(id);
                  setLocalError(null);
                }}
              >
                <Text style={styles.modeText}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Позывной</Text>
            <TextInput
              style={styles.input}
              value={callsign}
              onChangeText={setCallsign}
              placeholder={mode === 'guest' ? 'Необязательно' : 'Например: Волк-7'}
              placeholderTextColor={colors.textDim}
              autoCapitalize="words"
              maxLength={24}
            />

            {mode !== 'guest' ? (
              <>
                <Text style={styles.label}>Пароль</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Минимум 4 символа"
                  placeholderTextColor={colors.textDim}
                  secureTextEntry
                  maxLength={64}
                />
              </>
            ) : null}

            {mode === 'register' ? (
              <>
                <Text style={styles.label}>Повтор пароля</Text>
                <TextInput
                  style={styles.input}
                  value={password2}
                  onChangeText={setPassword2}
                  placeholder="Ещё раз"
                  placeholderTextColor={colors.textDim}
                  secureTextEntry
                  maxLength={64}
                />
              </>
            ) : null}

            {mode === 'guest' ? (
              <Text style={styles.note}>
                Гостевой вход сохраняется на этом устройстве. Чтобы войти с другого телефона — зарегистрируйтесь с
                паролем.
              </Text>
            ) : (
              <Text style={styles.note}>
                Позывной и пароль позволяют продолжить игру на другом устройстве.
              </Text>
            )}

            {(localError || error) && !busy ? (
              <Text style={styles.error}>{localError || error}</Text>
            ) : null}

            <Pressable style={[styles.submit, busy && styles.disabled]} disabled={busy} onPress={onSubmit}>
              {busy ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.submitText}>
                  {mode === 'login' ? 'Войти в штаб' : mode === 'register' ? 'Создать командира' : 'Играть как гость'}
                </Text>
              )}
            </Pressable>
          </View>

          <Pressable onPress={() => setShowServer((v) => !v)} style={styles.serverToggle}>
            <Text style={styles.serverToggleText}>
              {showServer ? 'Скрыть сервер' : 'Настройки сервера'} · {online ? 'онлайн' : 'офлайн'}
            </Text>
          </Pressable>
          {showServer ? (
            <View style={styles.card}>
              <Text style={styles.label}>Адрес API</Text>
              <TextInput
                style={styles.input}
                value={serverUrl}
                onChangeText={setServerUrl}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="http://IP/api"
                placeholderTextColor={colors.textDim}
              />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  brand: { alignItems: 'center', marginBottom: 22 },
  title: {
    color: colors.gold,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 10,
    textTransform: 'uppercase',
  },
  subtitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 2 },
  tagline: { color: colors.sand, marginTop: 8, fontSize: 13 },
  modes: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeBtn: {
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
  modeActive: { backgroundColor: colors.olive, borderColor: colors.gold },
  modeText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  card: {
    backgroundColor: 'rgba(44,56,44,0.92)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.gold, fontWeight: '800', marginTop: 8, marginBottom: 6, fontSize: 12 },
  input: {
    backgroundColor: colors.bgAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 48,
    fontSize: 16,
  },
  note: { color: colors.textDim, marginTop: 12, lineHeight: 18, fontSize: 12 },
  error: { color: colors.warn, marginTop: 10, fontWeight: '700' },
  submit: {
    marginTop: 16,
    backgroundColor: colors.olive,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  disabled: { opacity: 0.6 },
  submitText: { color: colors.text, fontWeight: '900', fontSize: 15 },
  serverToggle: { marginTop: 16, alignItems: 'center' },
  serverToggleText: { color: colors.sand, fontSize: 12, fontWeight: '700' },
});
