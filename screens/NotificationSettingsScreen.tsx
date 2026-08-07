import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useColors } from '../lib/theme';
import {
  NOTIFICATION_CATEGORIES,
  NotificationCategory,
  CategoryPreference,
  NotificationSettings,
  getPreferences,
  updatePreference,
  getSettings,
  updateSettings,
  deliverCategorizedNotification,
} from '../lib/notificationService';

const QUIET_PRESETS: { label: string; start: number | null; end: number | null }[] = [
  { label: 'None',         start: null, end: null },
  { label: '9 PM – 6 AM',  start: 21,   end: 6   },
  { label: '10 PM – 7 AM', start: 22,   end: 7   },
  { label: '11 PM – 7 AM', start: 23,   end: 7   },
];

const DIGEST_TIMES = ['07:00', '08:00', '09:00', '12:00', '18:00'];

function digestTimeLabel(t: string): string {
  const [h] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${period}`;
}

export default function NotificationSettingsScreen({ onBack }: { onBack: () => void }) {
  const c = useColors();
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Record<NotificationCategory, CategoryPreference> | null>(null);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<NotificationCategory | null>(null);
  const [savingCategory, setSavingCategory] = useState<NotificationCategory | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const [p, s] = await Promise.all([getPreferences(user.id), getSettings(user.id)]);
      setPrefs(p);
      setSettings(s);
    } catch (err: any) {
      console.warn('[NotificationSettingsScreen] load error:', err?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function applyPreference(category: NotificationCategory, patch: Partial<CategoryPreference>) {
    if (!userId || !prefs) return;
    const next = { ...prefs, [category]: { ...prefs[category], ...patch } };
    setPrefs(next);
    setSavingCategory(category);
    try {
      await updatePreference(userId, category, patch);
    } finally {
      setSavingCategory(null);
    }
  }

  async function applySettings(patch: Partial<NotificationSettings>) {
    if (!userId || !settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await updateSettings(userId, patch);
  }

  async function sendTest(category: NotificationCategory) {
    if (!userId) return;
    const meta = NOTIFICATION_CATEGORIES.find(m => m.id === category)!;
    const decision = await deliverCategorizedNotification({
      userId,
      category,
      title: `Test: ${meta.label}`,
      body: `This is what a ${meta.label.toLowerCase()} notification looks like.`,
      identifier: `test-${category}-${Date.now()}`,
    });
    Alert.alert(
      decision.deliver ? 'Test sent' : 'Test held',
      decision.deliver
        ? 'Check your device notifications now — or find it under "What did I miss?" if digest batching is on for this category.'
        : `This was held (${decision.reason?.replace('_', ' ')}) — exactly what would happen to a real notification right now. See "What did I miss?" for the record.`,
    );
  }

  if (loading || !prefs || !settings) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={c.primary} size="large" />
      </SafeAreaView>
    );
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
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={{ fontSize: 22, color: c.textMuted }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: c.textPrimary }}>Smart Notifications</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>

        {/* ── Do Not Disturb ─────────────────────────────────────── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 14,
          backgroundColor: c.cardLavender, marginHorizontal: 20, marginTop: 20,
          borderRadius: 16, padding: 16,
        }}>
          <Text style={{ fontSize: 22 }}>🌙</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: c.textPrimary }}>Do Not Disturb</Text>
            <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>
              Hold all non-critical notifications until you turn this off
            </Text>
          </View>
          <Switch
            value={settings.do_not_disturb}
            onValueChange={v => applySettings({ do_not_disturb: v })}
            trackColor={{ false: c.separator, true: c.lavender }}
            thumbColor="#fff"
            accessibilityLabel="Do not disturb"
          />
        </View>

        {/* ── Categories ──────────────────────────────────────────── */}
        <Text style={{
          fontSize: 12, fontWeight: '700', color: c.textMuted,
          textTransform: 'uppercase', letterSpacing: 0.8,
          paddingHorizontal: 20, paddingTop: 28, paddingBottom: 8,
        }}>
          Categories
        </Text>

        <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.separator }}>
          {NOTIFICATION_CATEGORIES.map(meta => {
            const pref = prefs[meta.id];
            const isOpen = expanded === meta.id;
            const canExpand = !meta.bypassQuietHours && pref.enabled;
            return (
              <View key={meta.id} style={{ backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.separator }}>
                <TouchableOpacity
                  activeOpacity={canExpand ? 0.7 : 1}
                  onPress={() => canExpand && setExpanded(isOpen ? null : meta.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14 }}
                >
                  <Text style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{meta.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary }}>{meta.label}</Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{meta.description}</Text>
                  </View>
                  {savingCategory === meta.id && <ActivityIndicator size="small" color={c.textMuted} />}
                  {meta.bypassQuietHours ? (
                    <View style={{ backgroundColor: c.cardBlush, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: c.blush }}>ALWAYS ON</Text>
                    </View>
                  ) : (
                    <Switch
                      value={pref.enabled}
                      onValueChange={v => applyPreference(meta.id, { enabled: v })}
                      trackColor={{ false: c.separator, true: c.sage }}
                      thumbColor="#fff"
                      accessibilityLabel={`${meta.label} notifications`}
                    />
                  )}
                  {canExpand && <Text style={{ fontSize: 11, color: c.textMuted, marginLeft: 4 }}>{isOpen ? '▲' : '▼'}</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => sendTest(meta.id)}
                  activeOpacity={0.7}
                  style={{ paddingHorizontal: 20, paddingBottom: 12, paddingLeft: 62 }}
                  accessibilityRole="button" accessibilityLabel={`Send test ${meta.label} notification`}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: c.lavender }}>Send test notification</Text>
                </TouchableOpacity>

                {isOpen && canExpand && (
                  <View style={{ paddingHorizontal: 20, paddingBottom: 16, paddingLeft: 62 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>
                      Quiet hours (no notifications)
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {QUIET_PRESETS.map(p => {
                        const active = pref.quiet_hours_start === p.start && pref.quiet_hours_end === p.end;
                        return (
                          <TouchableOpacity
                            key={p.label}
                            onPress={() => applyPreference(meta.id, { quiet_hours_start: p.start, quiet_hours_end: p.end })}
                            activeOpacity={0.8}
                            style={{
                              borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5,
                              borderColor: active ? c.lavender : c.separator,
                              backgroundColor: active ? c.cardLavender : c.bg,
                            }}
                            accessibilityRole="button" accessibilityLabel={p.label}
                          >
                            <Text style={{ fontSize: 13, color: active ? c.lavender : c.textSecondary, fontWeight: active ? '700' : '400' }}>
                              {p.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* ── Daily Digest ────────────────────────────────────────── */}
        <Text style={{
          fontSize: 12, fontWeight: '700', color: c.textMuted,
          textTransform: 'uppercase', letterSpacing: 0.8,
          paddingHorizontal: 20, paddingTop: 28, paddingBottom: 8,
        }}>
          Daily Digest
        </Text>
        <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.separator }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 14,
            backgroundColor: c.card, paddingHorizontal: 20, paddingVertical: 14,
          }}>
            <Text style={{ fontSize: 20, width: 28, textAlign: 'center' }}>📨</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary }}>Batch into one digest</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>
                Community activity and insights arrive together once a day instead of one at a time
              </Text>
            </View>
            <Switch
              value={settings.digest_enabled}
              onValueChange={v => applySettings({ digest_enabled: v })}
              trackColor={{ false: c.separator, true: c.sage }}
              thumbColor="#fff"
              accessibilityLabel="Daily digest"
            />
          </View>
          {settings.digest_enabled && (
            <View style={{ backgroundColor: c.card, paddingHorizontal: 20, paddingBottom: 16, paddingLeft: 62 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: c.textSecondary, marginBottom: 8 }}>Deliver at</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {DIGEST_TIMES.map(t => {
                  const active = settings.digest_time === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => applySettings({ digest_time: t })}
                      activeOpacity={0.8}
                      style={{
                        borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5,
                        borderColor: active ? c.sage : c.separator,
                        backgroundColor: active ? c.cardBlush : c.bg,
                      }}
                      accessibilityRole="button" accessibilityLabel={digestTimeLabel(t)}
                    >
                      <Text style={{ fontSize: 13, color: active ? c.sage : c.textSecondary, fontWeight: active ? '700' : '400' }}>
                        {digestTimeLabel(t)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 16, paddingHorizontal: 32, lineHeight: 18 }}>
          Critical Alerts always get through, even during quiet hours or Do Not Disturb — they cover medication reminders, vaccine due dates, and safety alerts.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
