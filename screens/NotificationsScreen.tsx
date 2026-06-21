import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useColors } from '../lib/theme';

interface NotifRow {
  id: string;
  type: 'like' | 'comment' | 'mention';
  actor_id: string | null;
  actor: { display_name: string | null; username: string | null; avatar_url: string | null } | null;
  post_id: string | null;
  post_preview: string | null;
  comment_preview: string | null;
  read: boolean;
  created_at: string;
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const c = useColors();
  return (
    <View style={{
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: c.cardBlush, justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
    }}>
      {url
        ? <Image source={{ uri: url }} style={{ width: 44, height: 44 }} />
        : <Text style={{ fontSize: 18, fontWeight: '700', color: c.primary }}>{name.charAt(0).toUpperCase()}</Text>
      }
    </View>
  );
}

function NotifIcon({ type }: { type: NotifRow['type'] }) {
  if (type === 'like') return <Text style={{ fontSize: 16 }}>❤️</Text>;
  if (type === 'comment') return <Text style={{ fontSize: 16 }}>💬</Text>;
  return <Text style={{ fontSize: 16 }}>👋</Text>;
}

function notifText(n: NotifRow): { bold: string; rest: string; sub?: string } {
  const actor = n.actor?.display_name || n.actor?.username || 'Someone';
  if (n.type === 'like') {
    return { bold: actor, rest: ' liked your post', sub: n.post_preview ?? undefined };
  }
  if (n.type === 'comment') {
    return { bold: actor, rest: ' commented on your post', sub: n.comment_preview ? `"${n.comment_preview}"` : undefined };
  }
  return { bold: actor, rest: ' mentioned you', sub: n.comment_preview ?? undefined };
}

export default function NotificationsScreen({ onBack }: { onBack: () => void }) {
  const c = useColors();
  const [myId, setMyId] = useState<string | null>(null);
  const [notifs, setNotifs] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) { setMyId(user.id); load(user.id); }
    }).catch(() => {});
  }, []);

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*, actor:actor_id(display_name, username, avatar_url)')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(60);
    setNotifs((data as NotifRow[]) ?? []);
    setLoading(false);
  }, []);

  const markRead = useCallback(async (id: string) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await supabase.from('notifications').update({ read: true }).eq('id', id);
  }, []);

  const markAllRead = useCallback(async () => {
    if (!myId) return;
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    await supabase.from('notifications').update({ read: true }).eq('user_id', myId).eq('read', false);
  }, [myId]);

  const unreadCount = notifs.filter(n => !n.read).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: c.separator,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={onBack}>
            <Text style={{ fontSize: 22, color: c.textMuted }}>←</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: '800', color: c.textPrimary }}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={{
              backgroundColor: c.primary, borderRadius: 10,
              paddingHorizontal: 8, paddingVertical: 2,
            }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>{unreadCount}</Text>
            </View>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead} activeOpacity={0.7}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.primary }}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={c.primary} size="large" />
        </View>
      ) : notifs.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔔</Text>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary, marginBottom: 8 }}>No notifications yet</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 }}>
            When someone likes or comments on your posts, you'll see it here.
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {notifs.map(n => {
            const { bold, rest, sub } = notifText(n);
            const actorName = n.actor?.display_name || n.actor?.username || 'Someone';
            return (
              <TouchableOpacity
                key={n.id}
                onPress={() => markRead(n.id)}
                activeOpacity={0.75}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  paddingHorizontal: 20, paddingVertical: 14,
                  borderBottomWidth: 1, borderBottomColor: c.separator,
                  backgroundColor: n.read ? 'transparent' : c.cardBlush,
                }}
              >
                <View style={{ position: 'relative' }}>
                  <Avatar name={actorName} url={n.actor?.avatar_url ?? null} />
                  <View style={{
                    position: 'absolute', bottom: -2, right: -2,
                    backgroundColor: c.bg, borderRadius: 10, padding: 1,
                  }}>
                    <NotifIcon type={n.type} />
                  </View>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, color: c.textPrimary, lineHeight: 20 }}>
                    <Text style={{ fontWeight: '800' }}>{bold}</Text>
                    <Text style={{ fontWeight: '400' }}>{rest}</Text>
                  </Text>
                  {sub && (
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}
                    >
                      {sub}
                    </Text>
                  )}
                  <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 3 }}>{timeAgo(n.created_at)}</Text>
                </View>

                {!n.read && (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary }} />
                )}
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
