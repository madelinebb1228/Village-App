import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useColors } from '../lib/theme';
import { NotificationCategory, NOTIFICATION_CATEGORIES } from '../lib/notificationService';
import { checkAndDeliverDueDigest } from '../lib/digestService';

interface HistoryRow {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  delivered: boolean;
  hold_reason: string | null;
  read: boolean;
  created_at: string;
}

const HOLD_REASON_LABEL: Record<string, string> = {
  category_disabled: 'category turned off',
  do_not_disturb: 'Do Not Disturb was on',
  quiet_hours: 'quiet hours',
  baby_sleeping: 'baby was asleep',
};

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function NotificationHistoryScreen({ onBack }: { onBack: () => void }) {
  const c = useColors();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await checkAndDeliverDueDigest(user.id).catch(() => {});
      const { data } = await supabase
        .from('notification_history')
        .select('id, category, title, body, delivered, hold_reason, read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(80);
      setRows((data as HistoryRow[]) ?? []);
      const unreadIds = ((data as HistoryRow[]) ?? []).filter(r => !r.read).map(r => r.id);
      if (unreadIds.length > 0) {
        await (supabase.from('notification_history') as any).update({ read: true }).in('id', unreadIds);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: c.separator,
        backgroundColor: c.card,
      }}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={{ fontSize: 22, color: c.textMuted }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: c.textPrimary }}>What did I miss?</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={c.primary} size="large" />
        </View>
      ) : rows.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔕</Text>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary, marginBottom: 8 }}>Nothing yet</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 }}>
            Reminders, insights, and community pings will show up here — including anything held during quiet hours.
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {rows.map(r => {
            const meta = NOTIFICATION_CATEGORIES.find(m => m.id === r.category);
            return (
              <View
                key={r.id}
                style={{
                  flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                  paddingHorizontal: 20, paddingVertical: 14,
                  borderBottomWidth: 1, borderBottomColor: c.separator,
                }}
              >
                <Text style={{ fontSize: 20, width: 26, textAlign: 'center' }}>{meta?.icon ?? '🔔'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }}>{r.title}</Text>
                  <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 2, lineHeight: 18 }}>{r.body}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Text style={{ fontSize: 11, color: c.textMuted }}>{timeAgo(r.created_at)}</Text>
                    {!r.delivered && (
                      <Text style={{ fontSize: 11, color: c.blush, fontWeight: '600' }}>
                        · held ({HOLD_REASON_LABEL[r.hold_reason ?? ''] ?? r.hold_reason})
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
