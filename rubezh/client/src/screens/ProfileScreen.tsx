import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api';
import { useScreenInsets } from '../hooks/useScreenInsets';
import { useGame } from '../state/GameContext';
import { colors } from '../theme';
import type { PlayerProfile } from '../types';

export type RootStackParamList = {
  Tabs: undefined;
  Profile: { userId?: string } | undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

function roleLabel(role?: string) {
  switch (role) {
    case 'commander':
      return 'Командир';
    case 'deputy':
      return 'Заместитель';
    case 'officer':
      return 'Офицер снабжения';
    case 'recruit':
      return 'Новобранец';
    default:
      return 'Участник';
  }
}

export function ProfileScreen({ navigation, route }: Props) {
  const { state, refresh, logout } = useGame();
  const { top, bottom } = useScreenInsets({ bottomExtra: 24 });
  const targetId = route.params?.userId || state?.user.id;
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [callsign, setCallsign] = useState('');
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);
    setError(null);
    try {
      const data =
        !route.params?.userId || route.params.userId === state?.user.id
          ? await api.profile()
          : await api.player(targetId);
      setProfile(data);
      setCallsign(data.callsign);
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить профиль');
    } finally {
      setLoading(false);
    }
  }, [targetId, route.params?.userId, state?.user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await api.updateProfile({ callsign: callsign.trim() });
      setProfile(next);
      setEditing(false);
      await refresh();
    } catch (err: any) {
      setError(err.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: top }]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.meta}>Загрузка досье…</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.center, { paddingTop: top }]}>
        <Text style={styles.error}>{error || 'Профиль не найден'}</Text>
        <Pressable style={styles.btn} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>Назад</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: top + 8, paddingHorizontal: 14, paddingBottom: bottom }}
    >
      <Pressable style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Назад</Text>
      </Pressable>

      <Text style={styles.kicker}>{profile.isSelf ? 'Ваше досье' : 'Досье командира'}</Text>
      {editing ? (
        <TextInput
          style={styles.input}
          value={callsign}
          onChangeText={setCallsign}
          autoCapitalize="words"
          maxLength={24}
          placeholder="Позывной"
          placeholderTextColor={colors.textDim}
        />
      ) : (
        <Text style={styles.title}>{profile.callsign}</Text>
      )}
      <Text style={styles.sub}>
        КП {profile.level}
        {profile.isSelf && profile.experience != null
          ? ` · ${profile.experience}/${profile.xpToNext} XP`
          : ''}
      </Text>
      <Text style={styles.meta}>
        В штабе с {new Date(profile.createdAt).toLocaleDateString('ru-RU')}
      </Text>

      {profile.clan ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            [{profile.clan.tag}] {profile.clan.name}
          </Text>
          <Text style={styles.meta}>
            {roleLabel(profile.clan.role)} · ур. союза {profile.clan.level}
          </Text>
          <Text style={styles.note}>{profile.clan.motto}</Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Без объединения</Text>
          <Text style={styles.meta}>Игрок пока не в союзе</Text>
        </View>
      )}

      <Text style={styles.section}>Статистика</Text>
      <View style={styles.grid}>
        <Stat label="Заявки" value={profile.stats.requestsTotal} />
        <Stat label="Операции" value={profile.stats.operationsTotal} />
        <Stat label="Сборы" value={profile.stats.collectsTotal} />
        <Stat label="Помощь" value={profile.stats.helpsSent} />
        <Stat label="Ремонты" value={profile.stats.repairsTotal} />
        <Stat label="Гонка дня" value={profile.stats.raceToday} />
      </View>

      <Text style={styles.section}>Прогресс</Text>
      <View style={styles.card}>
        <Text style={styles.meta}>Командный пункт: ур. {profile.progress.commandLevel}</Text>
        <Text style={styles.meta}>Здания: {profile.progress.buildingsUnlocked}</Text>
        <Text style={styles.meta}>Техника: {profile.progress.vehiclesCount}</Text>
        <Text style={styles.meta}>Специалисты: {profile.progress.specialistsCount}</Text>
        <Text style={styles.meta}>Сюжет: глава {profile.progress.storyChapter}</Text>
        <Text style={styles.meta}>Достижения: {profile.progress.achievementsUnlocked}</Text>
        <Text style={styles.meta}>Устойчивость района: {profile.progress.regionStability}%</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {profile.isSelf ? (
        editing ? (
          <View style={styles.row}>
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => setEditing(false)} disabled={saving}>
              <Text style={styles.btnText}>Отмена</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={onSave} disabled={saving}>
              <Text style={styles.btnText}>{saving ? 'Сохранение…' : 'Сохранить'}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Pressable style={styles.btn} onPress={() => setEditing(true)}>
              <Text style={styles.btnText}>Изменить позывной</Text>
            </Pressable>

            <Text style={styles.section}>Пароль для входа с другого устройства</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Новый пароль (мин. 4)"
              placeholderTextColor={colors.textDim}
              secureTextEntry
              maxLength={64}
            />
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              disabled={saving || password.trim().length < 4}
              onPress={async () => {
                setSaving(true);
                setPasswordHint(null);
                try {
                  await api.setPassword(password.trim());
                  setPassword('');
                  setPasswordHint('Пароль сохранён — можно входить по позывному');
                } catch (err: any) {
                  setError(err.message || 'Не удалось сохранить пароль');
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Text style={styles.btnText}>Сохранить пароль</Text>
            </Pressable>
            {passwordHint ? <Text style={styles.meta}>{passwordHint}</Text> : null}

            <Pressable
              style={[styles.btn, styles.btnDanger]}
              onPress={async () => {
                await logout();
              }}
            >
              <Text style={styles.btnText}>Выйти из аккаунта</Text>
            </Pressable>
          </>
        )
      ) : null}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  back: { marginBottom: 8, alignSelf: 'flex-start' },
  backText: { color: colors.sand, fontWeight: '700' },
  kicker: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 6 },
  sub: { color: colors.accent, fontWeight: '700', marginTop: 6 },
  meta: { color: colors.sand, marginTop: 6 },
  note: { color: colors.textDim, marginTop: 6, lineHeight: 18 },
  section: { color: colors.gold, fontWeight: '800', marginTop: 18, marginBottom: 8 },
  card: {
    marginTop: 12,
    backgroundColor: colors.panel,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: {
    width: '31%',
    backgroundColor: colors.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statValue: { color: colors.text, fontWeight: '800', fontSize: 18 },
  statLabel: { color: colors.textDim, fontSize: 11, marginTop: 4 },
  input: {
    marginTop: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 20,
    fontWeight: '800',
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: {
    flex: 1,
    marginTop: 14,
    backgroundColor: colors.olive,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
  },
  btnGhost: { backgroundColor: colors.graphite },
  btnDanger: { backgroundColor: colors.warn },
  btnText: { color: colors.text, fontWeight: '800' },
  error: { color: colors.warn, marginTop: 10, textAlign: 'center' },
});
