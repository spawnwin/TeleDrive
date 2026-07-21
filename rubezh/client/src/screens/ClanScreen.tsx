import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../api';
import { useScreenInsets } from '../hooks/useScreenInsets';
import { useGame } from '../state/GameContext';
import { colors } from '../theme';
import type { SocialState } from '../types';

function roleLabel(role: string) {
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

export function ClanScreen() {
  const { state, act, toast, clearToast } = useGame();
  const { top, bottom } = useScreenInsets({ bottomExtra: 28 });
  const [social, setSocial] = useState<SocialState | null>(state?.social || null);
  const [name, setName] = useState('Надёжный Тыл');
  const [tag, setTag] = useState('ТЫЛ');
  const [motto, setMotto] = useState('Снабжение без срывов');
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'clan' | 'race' | 'board'>('clan');

  const refreshSocial = async () => {
    try {
      const s = await api.social();
      setSocial(s);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (state?.social) setSocial(state.social);
  }, [state?.social]);

  useEffect(() => {
    refreshSocial();
    const t = setInterval(refreshSocial, 5000);
    return () => clearInterval(t);
  }, []);

  if (!state) return null;
  const data = social || state.social;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: top + 8, paddingHorizontal: 14, paddingBottom: bottom }}
    >
      <Text style={styles.title}>Онлайн-штаб</Text>
      <Text style={styles.sub}>
        Объединения, помощь союзникам, чат и логистическая гонка. Прямых атак на базы нет.
      </Text>

      <View style={styles.tabs}>
        {([
          ['clan', 'Союз'],
          ['race', 'Гонка'],
          ['board', 'Рейтинг'],
        ] as const).map(([id, label]) => (
          <Pressable key={id} style={[styles.tab, tab === id && styles.tabActive]} onPress={() => setTab(id)}>
            <Text style={styles.tabText}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'clan' && (
        <>
          {!data?.clan ? (
            <View>
              <Text style={styles.section}>Создать объединение</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Название" placeholderTextColor={colors.textDim} />
              <TextInput style={styles.input} value={tag} onChangeText={setTag} placeholder="Тег" placeholderTextColor={colors.textDim} autoCapitalize="characters" />
              <TextInput style={styles.input} value={motto} onChangeText={setMotto} placeholder="Девиз" placeholderTextColor={colors.textDim} />
              <Pressable
                style={styles.btn}
                onPress={() => act(() => api.createClan(name.trim(), tag.trim(), motto.trim())).then(refreshSocial)}
              >
                <Text style={styles.btnText}>Создать союз</Text>
              </Pressable>

              <Text style={styles.section}>Открытые объединения</Text>
              {(data?.openClans || []).map((c) => (
                <View key={c.id} style={styles.card}>
                  <Text style={styles.name}>
                    [{c.tag}] {c.name}
                  </Text>
                  <Text style={styles.meta}>
                    Ур.{c.level} · {c.member_count}/30 · план {c.weekly_progress}/{c.weekly_goal}
                  </Text>
                  <Text style={styles.meta}>{c.motto}</Text>
                  <Pressable style={styles.btn} onPress={() => act(() => api.joinClan(c.id)).then(refreshSocial)}>
                    <Text style={styles.btnText}>Вступить</Text>
                  </Pressable>
                </View>
              ))}
              {!data?.openClans?.length && <Text style={styles.meta}>Пока нет открытых союзов — создайте первый.</Text>}
            </View>
          ) : (
            <View>
              <View style={styles.card}>
                <Text style={styles.name}>
                  [{data.clan.tag}] {data.clan.name}
                </Text>
                <Text style={styles.meta}>{data.clan.motto}</Text>
                <Text style={styles.meta}>
                  Ур.{data.clan.level} · {data.clan.memberCount}/{data.clan.maxMembers} · ваша роль:{' '}
                  {roleLabel(data.clan.myRole || 'member')}
                </Text>
                <View style={styles.barBg}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.min(100, (data.clan.weeklyProgress / Math.max(1, data.clan.weeklyGoal)) * 100)}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.meta}>
                  Недельный план снабжения: {data.clan.weeklyProgress}/{data.clan.weeklyGoal}
                </Text>
                <Pressable
                  style={styles.btn}
                  onPress={() => act(() => api.clanWeeklyClaim()).then(refreshSocial)}
                >
                  <Text style={styles.btnText}>Забрать недельную награду</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnDanger]} onPress={() => act(() => api.leaveClan()).then(refreshSocial)}>
                  <Text style={styles.btnText}>Покинуть объединение</Text>
                </Pressable>
              </View>

              <Text style={styles.section}>Помощь союзникам</Text>
              {data.clan.helpTargets.map((t) => (
                <View key={t.userId} style={styles.card}>
                  <Text style={styles.name}>{t.callsign}</Text>
                  <Text style={styles.meta}>
                    {t.upgradingBuilding
                      ? `Строит: ${t.upgradingBuilding.type}`
                      : 'Нет активного строительства'}
                  </Text>
                  <Pressable
                    style={[styles.btn, !t.canHelp && styles.btnDisabled]}
                    disabled={!t.canHelp}
                    onPress={() => act(() => api.clanHelp(t.userId)).then(refreshSocial)}
                  >
                    <Text style={styles.btnText}>{t.canHelp ? 'Ускорить строительство (−30%)' : 'Недоступно сегодня'}</Text>
                  </Pressable>
                </View>
              ))}

              <Text style={styles.section}>Участники</Text>
              {data.clan.members.map((m) => (
                <View key={m.userId} style={styles.rowCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{m.callsign}</Text>
                    <Text style={styles.meta}>
                      {roleLabel(m.role)} · вклад {m.contribution} · заявок {m.requestsTotal}
                    </Text>
                  </View>
                </View>
              ))}

              <Text style={styles.section}>Чат объединения</Text>
              <View style={styles.chatBox}>
                {data.clan.messages.map((msg) => (
                  <Text key={msg.id} style={styles.chatLine}>
                    <Text style={styles.chatAuthor}>{msg.callsign}: </Text>
                    {msg.body}
                  </Text>
                ))}
              </View>
              <TextInput
                style={styles.input}
                value={message}
                onChangeText={setMessage}
                placeholder="Сообщение союзу…"
                placeholderTextColor={colors.textDim}
              />
              <Pressable
                style={styles.btn}
                onPress={async () => {
                  if (!message.trim()) return;
                  const res = await api.clanChat(message.trim());
                  setSocial(res.social);
                  setMessage('');
                }}
              >
                <Text style={styles.btnText}>Отправить</Text>
              </Pressable>
            </View>
          )}
        </>
      )}

      {tab === 'race' && data && (
        <View>
          <Text style={styles.section}>{data.race.title}</Text>
          <Text style={styles.sub}>{data.race.description}</Text>
          <Text style={styles.badges}>Ваш счёт сегодня: {data.race.myScore} заявок</Text>
          {data.race.top.map((row, idx) => (
            <View key={row.user_id} style={styles.rowCard}>
              <Text style={styles.rank}>#{idx + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {row.callsign} {row.clan_tag ? `[${row.clan_tag}]` : ''}
                </Text>
                <Text style={styles.meta}>{row.requests} заявок</Text>
              </View>
            </View>
          ))}
          {!data.race.top.length && <Text style={styles.meta}>Пока никто не выполнил заявки сегодня.</Text>}
        </View>
      )}

      {tab === 'board' && data && (
        <View>
          <Text style={styles.section}>Глобальный рейтинг эффективности</Text>
          {data.leaderboard.map((row, idx) => (
            <View key={row.id} style={styles.rowCard}>
              <Text style={styles.rank}>#{idx + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {row.callsign} {row.clan_tag ? `[${row.clan_tag}]` : ''}
                </Text>
                <Text style={styles.meta}>
                  Ур.{row.level} · заявок {row.requests_total} · операций {row.operations_total} · помощи {row.helps_sent}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {toast && (
        <Pressable style={styles.toast} onPress={clearToast}>
          <Text style={styles.btnText}>{toast}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  sub: { color: colors.textDim, marginVertical: 8, lineHeight: 20 },
  section: { color: colors.gold, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 8 },
  tab: {
    flex: 1,
    backgroundColor: colors.panel,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 44,
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: colors.olive },
  tabText: { color: colors.text, fontWeight: '700' },
  card: {
    backgroundColor: colors.panel,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowCard: {
    backgroundColor: colors.panel,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  name: { color: colors.text, fontWeight: '800', fontSize: 16 },
  meta: { color: colors.sand, marginTop: 4, fontSize: 12 },
  badges: { color: colors.gold, fontWeight: '800', marginBottom: 8 },
  rank: { color: colors.accent, fontWeight: '800', width: 36 },
  input: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 48,
    marginTop: 8,
  },
  btn: {
    marginTop: 10,
    backgroundColor: colors.olive,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
  },
  btnDanger: { backgroundColor: colors.warn },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: colors.text, fontWeight: '700' },
  barBg: { height: 8, backgroundColor: colors.bgAlt, borderRadius: 4, marginTop: 10, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: colors.accent },
  chatBox: {
    backgroundColor: colors.bgAlt,
    borderRadius: 10,
    padding: 10,
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chatLine: { color: colors.sand, marginBottom: 6, lineHeight: 18 },
  chatAuthor: { color: colors.gold, fontWeight: '700' },
  toast: {
    marginTop: 16,
    backgroundColor: colors.olive,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
});
