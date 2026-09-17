import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useColors } from '../lib/theme';
import { useResponsive, maxWidthFor } from '../lib/responsive';

interface NotifRow {
  id: string;
  type: 'like' | 'comment' | 'mention' | 'kudos' | 'handoff';
  actor_id: string | null;
  actor: { display_name: string | null; username: string | null; avatar_url: string | null } | null;
  post_id: string | null;
  post_preview: string | null;
  comment_preview: string | null;
  kudos_preview: string | null;
  handoff_note: string | null;
  read: boolean;
  created_at: string;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
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

function NotifIcon({ type, c }: { type: NotifRow['type']; c: ReturnType<typeof useColors> }) {
  const icon =
    type === 'like' ? 'heart' :
    type === 'comment' ? 'chatbubble' :
    type === 'kudos' ? 'heart-circle' :
    type === 'handoff' ? 'people' :
    'at';
  const color =
    type === 'like' ? c.primary :
    type === 'kudos' ? c.primary :
    c.textSecondary;
  return <Ionicons name={icon as any} size={13} color={color} />;
}

function notifText(n: NotifRow): { bold: string; rest: string; sub?: string } {
  const actor = n.actor?.display_name || n.actor?.username || 'Someone';
  if (n.type === 'like') {
    return { bold: actor, rest: ' liked your post', sub: n.post_preview ?? undefined };
  }
  if (n.type === 'comment') {
    return { bold: actor, rest: ' commented on your post', sub: n.comment_preview ? `"${n.comment_preview}"` : undefined };
  }
  if (n.type === 'kudos') {
    // Kudos is a partner-only feature (see lib/relationshipUtil.ts + the
    // "appreciation sent only to a real partner" RLS policy) — never fall
    // back to the generic "Someone" used by the other notification types.
    const kudosActor = n.actor?.display_name || n.actor?.username || 'Your partner';
    return { bold: kudosActor, rest: ' sent you kudos', sub: n.kudos_preview ?? undefined };
  }
  if (n.type === 'handoff') {
    return { bold: '', rest: n.handoff_note || `${actor} logged an update for baby` };
  }
  return { bold: actor, rest: ' mentioned you', sub: n.comment_preview ?? undefined };
}

function NotifItem({ n, onPress, c }: { n: NotifRow; onPress: () => void; c: ReturnType<typeof useColors> }) {
  const { bold, rest, sub } = notifText(n);
  const actorName = n.actor?.display_name || n.actor?.username || 'Someone';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: c.separator,
        backgroundColor: n.read ? 'transparent' : c.cardBlush,
      }}
      accessibilityRole="button"
      accessibilityLabel={`${bold}${rest}${n.read ? '' : ', unread'}`}
    >
      <View style={{ position: 'relative' }}>
        <Avatar name={actorName} url={n.actor?.avatar_url ?? null} />
        <View style={{
          position: 'absolute', bottom: -2, right: -2,
          backgroundColor: c.bg, borderRadius: 10, padding: 3,
          borderWidth: 1, borderColor: c.separator,
        }}>
          <NotifIcon type={n.type} c={c} />
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
}

function NotifSectionHeader({ title, c }: { title: string; c: ReturnType<typeof useColors> }) {
  return (
    <Text style={{
      fontSize: 12.5, fontWeight: '800', color: c.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.4,
      paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
    }}>
      {title}
    </Text>
  );
}

export default function NotificationsScreen({
  onBack,
  onOpenPost,
  onOpenProfile,
}: {
  onBack: () => void;
  onOpenPost?: (postId: string) => void;
  onOpenProfile?: (userId: string) => void;
  /** No Modal wrapper here to begin with — this prop just documents that
   * DesktopSecondaryHost renders this screen directly (no behavior change). */
  presentation?: 'modal' | 'inline';
}) {
  const c = useColors();
  const { width: windowWidth } = useResponsive();
  const columnStyle = { width: '100%' as const, maxWidth: maxWidthFor(windowWidth, 'inbox'), alignSelf: 'center' as const };
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
  const todayNotifs = useMemo(() => notifs.filter(n => isToday(n.created_at)), [notifs]);
  const earlierNotifs = useMemo(() => notifs.filter(n => !isToday(n.created_at)), [notifs]);

  function openNotif(n: NotifRow) {
    markRead(n.id);
    if ((n.type === 'like' || n.type === 'comment' || n.type === 'mention') && n.post_id) {
      onOpenPost?.(n.post_id);
    } else if (n.type === 'kudos' && n.actor_id) {
      onOpenProfile?.(n.actor_id);
    }
    // handoff notifications carry no post/profile reference to route to —
    // marking read is the only defined behavior for them today.
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: c.separator,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={24} color={c.textPrimary} />
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '800', color: c.textPrimary }}>Notifications</Text>
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
          <TouchableOpacity onPress={markAllRead} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Mark all notifications read">
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.primary }}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={c.primary} size="large" />
        </View>
      ) : notifs.length === 0 ? (
        <View style={[{ alignItems: 'center', paddingHorizontal: 32, paddingTop: 64 }, columnStyle]}>
          <Ionicons name="notifications-outline" size={34} color={c.textMuted} style={{ marginBottom: 12 }} />
          <Text style={{ fontSize: 16, fontWeight: '800', color: c.textPrimary, marginBottom: 6 }}>No notifications yet</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 }}>
            When someone likes or comments on your posts, you'll see it here.
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
          <View style={[{ paddingTop: 8 }, columnStyle]}>
            {todayNotifs.length > 0 && (
              <>
                <NotifSectionHeader title="Today" c={c} />
                {todayNotifs.map(n => (
                  <NotifItem key={n.id} n={n} onPress={() => openNotif(n)} c={c} />
                ))}
              </>
            )}
            {earlierNotifs.length > 0 && (
              <>
                <NotifSectionHeader title="Earlier" c={c} />
                {earlierNotifs.map(n => (
                  <NotifItem key={n.id} n={n} onPress={() => openNotif(n)} c={c} />
                ))}
              </>
            )}

            {/* A short list still ends on an intentional note rather than
                trailing into empty page. */}
            <View style={{ alignItems: 'center', paddingVertical: 28, gap: 6 }}>
              <Ionicons name="checkmark-circle-outline" size={18} color={c.textMuted} />
              <Text style={{ fontSize: 12.5, color: c.textMuted, fontWeight: '600' }}>You're all caught up</Text>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
