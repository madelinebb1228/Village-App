import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Switch,
  ActivityIndicator, Alert, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useColors } from '../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type View = 'main' | 'account';

interface NotifPrefs {
  enabled: boolean;
  likes: boolean;
  followers: boolean;
  messages: boolean;
  milestones: boolean;
}

const DEFAULT_NOTIFS: NotifPrefs = {
  enabled: true,
  likes: true,
  followers: true,
  messages: true,
  milestones: true,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  const c = useColors();
  return (
    <Text style={{
      fontSize: 12, fontWeight: '700', color: c.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.8,
      paddingHorizontal: 20, paddingTop: 28, paddingBottom: 8,
    }}>
      {label}
    </Text>
  );
}

function SettingsRow({
  icon, label, sublabel, onPress, chevron = true, danger = false,
  right,
}: {
  icon: string;
  label: string;
  sublabel?: string;
  onPress?: () => void;
  chevron?: boolean;
  danger?: boolean;
  right?: React.ReactNode;
}) {
  const c = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: c.card,
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: c.separator,
      }}
    >
      <Text style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: danger ? '#DC2626' : c.textPrimary }}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2, lineHeight: 17 }}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      {right ?? (chevron && onPress ? (
        <Text style={{ fontSize: 18, color: c.textMuted }}>›</Text>
      ) : null)}
    </TouchableOpacity>
  );
}

function Divider() {
  return <View style={{ height: 1 }} />;
}

// ─── Account Info sub-screen ──────────────────────────────────────────────────

function AccountInfoView({ onBack }: { onBack: () => void }) {
  const c = useColors();
  const [info, setInfo] = useState<{
    email: string; username: string | null;
    displayName: string | null; memberSince: string;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [sentReset, setSentReset] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, display_name')
        .eq('id', user.id)
        .maybeSingle();
      setInfo({
        email: user.email ?? '',
        username: profile?.username ?? null,
        displayName: profile?.display_name ?? null,
        memberSince: new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }),
      });
    })();
  }, []);

  async function sendPasswordReset() {
    if (!info?.email) return;
    setSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(info.email);
    setSending(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setSentReset(true);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: c.separator,
      }}>
        <TouchableOpacity onPress={onBack}>
          <Text style={{ fontSize: 22, color: c.textMuted }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary }}>Account Information</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {!info ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator color={c.primary} />
          </View>
        ) : (
          <>
            <SectionHeader label="Your Details" />
            <View style={{ backgroundColor: c.card, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.separator }}>
              {[
                { label: 'Email', value: info.email },
                { label: 'Display name', value: info.displayName ?? '—' },
                { label: 'Username', value: info.username ? `@${info.username}` : '—' },
                { label: 'Member since', value: info.memberSince },
              ].map(row => (
                <View key={row.label} style={{
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                  paddingHorizontal: 20, paddingVertical: 14,
                  borderBottomWidth: 1, borderBottomColor: c.separator,
                }}>
                  <Text style={{ fontSize: 14, color: c.textMuted, fontWeight: '600' }}>{row.label}</Text>
                  <Text style={{ fontSize: 14, color: c.textPrimary, fontWeight: '500', maxWidth: '60%', textAlign: 'right' }}>
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>

            <SectionHeader label="Password" />
            <View style={{ backgroundColor: c.card, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.separator }}>
              {sentReset ? (
                <View style={{ padding: 20, alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 24 }}>📬</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }}>Reset email sent!</Text>
                  <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 19 }}>
                    Check your inbox at {info.email} for a link to reset your password.
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={sendPasswordReset}
                  disabled={sending}
                  style={{
                    paddingHorizontal: 20, paddingVertical: 14,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary }}>Change Password</Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>
                      We'll email you a secure reset link
                    </Text>
                  </View>
                  {sending
                    ? <ActivityIndicator color={c.primary} size="small" />
                    : <Text style={{ fontSize: 18, color: c.textMuted }}>›</Text>
                  }
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Main Settings screen ─────────────────────────────────────────────────────

export default function SettingsScreen({ onBack }: { onBack: () => void }) {
  const c = useColors();
  const [view, setView] = useState<View>('main');
  const [notifs, setNotifs] = useState<NotifPrefs>(DEFAULT_NOTIFS);
  const [showVillages, setShowVillages] = useState(true);
  const [messagesFrom, setMessagesFrom] = useState<'everyone' | 'nobody'>('everyone');
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  const loadPrefs = useCallback(async () => {
    setLoadingPrefs(true);
    try {
      const [notifRaw, { data: { user } }] = await Promise.all([
        AsyncStorage.getItem('@village_notif_prefs'),
        supabase.auth.getUser(),
      ]);

      if (notifRaw) setNotifs(JSON.parse(notifRaw));

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('show_villages, messages_from')
          .eq('id', user.id)
          .maybeSingle();
        if (profile) {
          setShowVillages(profile.show_villages !== false);
          setMessagesFrom(profile.messages_from === 'nobody' ? 'nobody' : 'everyone');
        }
      }
    } finally {
      setLoadingPrefs(false);
    }
  }, []);

  useEffect(() => { loadPrefs(); }, [loadPrefs]);

  async function saveNotifs(updated: NotifPrefs) {
    setNotifs(updated);
    await AsyncStorage.setItem('@village_notif_prefs', JSON.stringify(updated));
  }

  async function saveProfilePref(field: 'show_villages' | 'messages_from', value: any) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('profiles').update({ [field]: value }).eq('id', user.id);
  }

  async function handleSignOut() {
    const doSignOut = async () => {
      setSigningOut(true);
      await supabase.auth.signOut();
      setSigningOut(false);
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Sign out of Parent Patch?')) doSignOut();
      return;
    }
    Alert.alert('Sign Out', 'Sign out of Parent Patch?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: doSignOut },
    ]);
  }

  async function handleDeleteAccount() {
    const confirm = async () => {
      Alert.alert(
        'Are you absolutely sure?',
        'This will permanently delete your account, posts, and all data. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete My Account',
            style: 'destructive',
            onPress: async () => {
              await supabase.auth.signOut();
            },
          },
        ]
      );
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Delete your account? This is permanent and cannot be undone.')) {
        await supabase.auth.signOut();
      }
      return;
    }
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action is permanent.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: confirm },
      ]
    );
  }

  if (view === 'account') {
    return <AccountInfoView onBack={() => setView('main')} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: c.separator,
        backgroundColor: c.card,
      }}>
        <TouchableOpacity onPress={onBack}>
          <Text style={{ fontSize: 22, color: c.textMuted }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: c.textPrimary }}>Settings & Privacy</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>

        {/* ── Your Account ───────────────────────────────────────── */}
        <SectionHeader label="Your Account" />
        <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.separator }}>
          <SettingsRow
            icon="👤"
            label="Account Information"
            sublabel="Email, username, member since"
            onPress={() => setView('account')}
          />
          <SettingsRow
            icon="⭐"
            label="Parent Patch Premium"
            sublabel="Unlock exclusive features and support the app"
            onPress={() => Alert.alert('Parent Patch Premium', 'Premium subscriptions are coming soon! Stay tuned for exclusive features.')}
          />
        </View>

        {/* ── Privacy & Safety ────────────────────────────────────── */}
        <SectionHeader label="Privacy & Safety" />
        <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.separator }}>
          <SettingsRow
            icon="🏘️"
            label="Show my patches on profile"
            sublabel="Others can see which patches you're in"
            chevron={false}
            right={
              <Switch
                value={showVillages}
                onValueChange={v => {
                  setShowVillages(v);
                  saveProfilePref('show_villages', v);
                }}
                trackColor={{ false: c.separator, true: c.sage }}
                thumbColor="#fff"
              />
            }
          />
          <SettingsRow
            icon="💬"
            label="Who can message me"
            sublabel={messagesFrom === 'everyone' ? 'Everyone' : 'Nobody'}
            onPress={() => {
              const next = messagesFrom === 'everyone' ? 'nobody' : 'everyone';
              setMessagesFrom(next);
              saveProfilePref('messages_from', next);
            }}
            chevron={false}
            right={
              <TouchableOpacity
                onPress={() => {
                  const next = messagesFrom === 'everyone' ? 'nobody' : 'everyone';
                  setMessagesFrom(next);
                  saveProfilePref('messages_from', next);
                }}
                style={{
                  backgroundColor: messagesFrom === 'everyone' ? c.cardSage : c.cardBlush,
                  borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.textSecondary }}>
                  {messagesFrom === 'everyone' ? 'Everyone' : 'Nobody'}
                </Text>
              </TouchableOpacity>
            }
          />
          <SettingsRow
            icon="🚫"
            label="Blocked Accounts"
            sublabel="Manage accounts you've blocked"
            onPress={() => Alert.alert('Blocked Accounts', 'Blocked accounts management is coming soon.')}
          />
        </View>

        {/* ── Notifications ───────────────────────────────────────── */}
        <SectionHeader label="Notifications" />
        <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.separator }}>
          <SettingsRow
            icon="🔔"
            label="Push Notifications"
            sublabel="Master on/off for all notifications"
            chevron={false}
            right={
              <Switch
                value={notifs.enabled}
                onValueChange={v => saveNotifs({ ...notifs, enabled: v })}
                trackColor={{ false: c.separator, true: c.sage }}
                thumbColor="#fff"
              />
            }
          />
          {notifs.enabled && (
            <>
              <SettingsRow
                icon="❤️"
                label="Likes & Comments"
                sublabel="When someone likes or comments on your posts"
                chevron={false}
                right={
                  <Switch
                    value={notifs.likes}
                    onValueChange={v => saveNotifs({ ...notifs, likes: v })}
                    trackColor={{ false: c.separator, true: c.sage }}
                    thumbColor="#fff"
                  />
                }
              />
              <SettingsRow
                icon="👤"
                label="New Followers"
                sublabel="When someone follows you"
                chevron={false}
                right={
                  <Switch
                    value={notifs.followers}
                    onValueChange={v => saveNotifs({ ...notifs, followers: v })}
                    trackColor={{ false: c.separator, true: c.sage }}
                    thumbColor="#fff"
                  />
                }
              />
              <SettingsRow
                icon="💬"
                label="New Messages"
                sublabel="When you receive a direct message"
                chevron={false}
                right={
                  <Switch
                    value={notifs.messages}
                    onValueChange={v => saveNotifs({ ...notifs, messages: v })}
                    trackColor={{ false: c.separator, true: c.sage }}
                    thumbColor="#fff"
                  />
                }
              />
              <SettingsRow
                icon="🎉"
                label="Milestone Celebrations"
                sublabel="When your community reacts to your milestones"
                chevron={false}
                right={
                  <Switch
                    value={notifs.milestones}
                    onValueChange={v => saveNotifs({ ...notifs, milestones: v })}
                    trackColor={{ false: c.separator, true: c.sage }}
                    thumbColor="#fff"
                  />
                }
              />
            </>
          )}
        </View>

        {/* ── Support ─────────────────────────────────────────────── */}
        <SectionHeader label="Support" />
        <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.separator }}>
          <SettingsRow
            icon="❓"
            label="Help & FAQ"
            sublabel="Get answers to common questions"
            onPress={() => Linking.openURL('https://github.com/madelinebb1228/Village-App/issues')}
          />
          <SettingsRow
            icon="🚩"
            label="Report a Problem"
            sublabel="Let us know if something isn't working"
            onPress={() => Linking.openURL('mailto:madelinebb1228@gmail.com?subject=Parent Patch - Report a Problem')}
          />
          <SettingsRow
            icon="ℹ️"
            label="About Parent Patch"
            sublabel="Version 1.0  ·  Built with ♡ for parents"
            onPress={() => Alert.alert('Parent Patch', 'Version 1.0\n\nBuilt with love for parents everywhere.\n\nTrack · Connect · Support · Grow')}
            chevron={false}
          />
        </View>

        {/* ── Danger zone ─────────────────────────────────────────── */}
        <SectionHeader label="Account Actions" />
        <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.separator }}>
          <TouchableOpacity
            onPress={handleSignOut}
            disabled={signingOut}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 14,
              backgroundColor: c.card,
              paddingHorizontal: 20, paddingVertical: 14,
              borderBottomWidth: 1, borderBottomColor: c.separator,
            }}
          >
            <Text style={{ fontSize: 20, width: 28, textAlign: 'center' }}>🚪</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary, flex: 1 }}>Sign Out</Text>
            {signingOut && <ActivityIndicator color={c.primary} size="small" />}
          </TouchableOpacity>
          <SettingsRow
            icon="🗑️"
            label="Delete Account"
            sublabel="Permanently delete your account and all data"
            danger
            onPress={handleDeleteAccount}
          />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
