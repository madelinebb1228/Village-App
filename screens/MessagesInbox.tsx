import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, Image,
  Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useColors } from '../lib/theme';
import { useResponsive, maxWidthFor } from '../lib/responsive';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConvRow {
  id: string;
  otherUserId: string;
  otherName: string;
  otherAvatar: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
}

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(iso).getDay()];
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function initial(name: string) {
  return name.charAt(0).toUpperCase();
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, url, size = 44 }: { name: string; url: string | null; size?: number }) {
  const c = useColors();
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: c.cardBlush, justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
    }}>
      {url
        ? <Image source={{ uri: url }} style={{ width: size, height: size }} />
        : <Text style={{ fontSize: size * 0.4, fontWeight: '700', color: c.primary }}>{initial(name)}</Text>
      }
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MessagesInbox({
  onBack,
  openWithUserId,
  presentation = 'modal',
}: {
  onBack: () => void;
  openWithUserId?: string | null;
  /** 'modal' (default): existing mobile full-screen single-panel behavior.
   * 'inline': desktop two-panel inbox (list | active conversation), rendered
   * by DesktopSecondaryHost beside the persistent sidebar — no Modal, no
   * second sidebar. */
  presentation?: 'modal' | 'inline';
}) {
  const c = useColors();
  const { width: windowWidth } = useResponsive();
  const columnStyle = { width: '100%' as const, maxWidth: maxWidthFor(windowWidth, 'inbox'), alignSelf: 'center' as const };
  const [myId, setMyId] = useState<string | null>(null);
  const [allConvs, setAllConvs] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openConv, setOpenConv] = useState<ConvRow | null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());

  // New Message compose — reuses the same people-search query SearchSheet's
  // People tab uses (profiles.username/display_name ilike), not a second
  // search implementation.
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [newMsgQuery, setNewMsgQuery] = useState('');
  const [newMsgResults, setNewMsgResults] = useState<{ id: string; username: string | null; display_name: string | null; avatar_url: string | null }[]>([]);
  const [newMsgSearching, setNewMsgSearching] = useState(false);
  const newMsgDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const convs = React.useMemo(
    () => allConvs.filter(c => !blockedUserIds.has(c.otherUserId)),
    [allConvs, blockedUserIds]
  );

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const [recipientBlocksMessages, setRecipientBlocksMessages] = useState(false);

  // Block/report state
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [reportConvReason, setReportConvReason] = useState('');
  const [reportConvSubmitting, setReportConvSubmitting] = useState(false);
  const [reportConvDone, setReportConvDone] = useState(false);
  const [showReportConv, setShowReportConv] = useState(false);

  // ── Load current user + inbox ──────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setMyId(user.id);
        loadInbox(user.id);
        loadBlockedUsers(user.id);
      }
    }).catch(() => {});
  }, []);

  async function loadBlockedUsers(uid: string) {
    const { data } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', uid);
    if (data) setBlockedUserIds(new Set(data.map((r: any) => r.blocked_id)));
  }

  // If a target user was passed in (from "Message" button on a profile), open/create that convo
  useEffect(() => {
    if (!openWithUserId || !myId) return;
    openOrCreateConvo(openWithUserId);
  }, [openWithUserId, myId]);

  const loadInbox = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      const { data: rows } = await supabase
        .from('conversations')
        .select('id, participant_1, participant_2, last_message_at')
        .or(`participant_1.eq.${uid},participant_2.eq.${uid}`)
        .order('last_message_at', { ascending: false });

      if (!rows || rows.length === 0) { setAllConvs([]); return; }

      const otherIds = rows.map((r: any) => r.participant_1 === uid ? r.participant_2 : r.participant_1);

      const [profilesRes, ...lastMsgRes] = await Promise.all([
        supabase.from('profiles').select('id, display_name, username, avatar_url').in('id', otherIds),
        ...rows.map((r: any) =>
          supabase
            .from('direct_messages')
            .select('content, created_at, sender_id, read_at')
            .eq('conversation_id', r.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        ),
      ]);

      const profileMap: Record<string, any> = {};
      (profilesRes.data ?? []).forEach((p: any) => { profileMap[p.id] = p; });

      const built: ConvRow[] = rows.map((r: any, i: number) => {
        const otherId = r.participant_1 === uid ? r.participant_2 : r.participant_1;
        const prof = profileMap[otherId] ?? {};
        const lastMsg = (lastMsgRes[i] as any)?.data;
        return {
          id: r.id,
          otherUserId: otherId,
          otherName: prof.display_name || prof.username || 'Parent',
          otherAvatar: prof.avatar_url ?? null,
          lastMessage: lastMsg?.content ?? '',
          lastMessageAt: lastMsg?.created_at ?? r.last_message_at,
          unread: lastMsg && lastMsg.sender_id !== uid && !lastMsg.read_at ? 1 : 0,
        };
      });

      setAllConvs(built);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Open or create a conversation ─────────────────────────────────────────

  const openOrCreateConvo = useCallback(async (otherId: string) => {
    if (!myId) return;

    // Deterministic participant ordering to avoid duplicate convos
    const [p1, p2] = myId < otherId ? [myId, otherId] : [otherId, myId];

    let { data: existing } = await supabase
      .from('conversations')
      .select('id, participant_1, participant_2, last_message_at')
      .eq('participant_1', p1)
      .eq('participant_2', p2)
      .maybeSingle();

    if (!existing) {
      const { data: created } = await supabase
        .from('conversations')
        .insert({ participant_1: p1, participant_2: p2 })
        .select()
        .single();
      existing = created;
    }

    if (!existing) return;

    const { data: prof } = await supabase
      .from('profiles')
      .select('display_name, username, avatar_url, messages_from')
      .eq('id', otherId)
      .maybeSingle();

    setRecipientBlocksMessages((prof as any)?.messages_from === 'nobody');
    setOpenConv({
      id: existing.id,
      otherUserId: otherId,
      otherName: prof?.display_name || prof?.username || 'Parent',
      otherAvatar: prof?.avatar_url ?? null,
      lastMessage: '',
      lastMessageAt: existing.last_message_at,
      unread: 0,
    });
  }, [myId]);

  // ── New Message: search people to start a conversation with ──────────────

  useEffect(() => {
    if (!showNewMessage) return;
    if (newMsgDebounce.current) clearTimeout(newMsgDebounce.current);
    const q = newMsgQuery.trim();
    if (q.length < 2) { setNewMsgResults([]); setNewMsgSearching(false); return; }
    setNewMsgSearching(true);
    newMsgDebounce.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(25);
      setNewMsgResults(((data ?? []) as any[]).filter(p => p.id !== myId && !blockedUserIds.has(p.id)));
      setNewMsgSearching(false);
    }, 350);
    return () => { if (newMsgDebounce.current) clearTimeout(newMsgDebounce.current); };
  }, [newMsgQuery, showNewMessage, myId, blockedUserIds]);

  function startConversationWith(userId: string) {
    setShowNewMessage(false);
    setNewMsgQuery('');
    setNewMsgResults([]);
    openOrCreateConvo(userId);
  }

  // ── Load messages for open conversation ───────────────────────────────────

  useEffect(() => {
    if (!openConv) return;
    loadMessages(openConv.id);

    const channel = supabase
      .channel(`dm:${openConv.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${openConv.id}` },
        (payload: any) => {
          setMessages(prev => [...prev, payload.new as Message]);
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [openConv?.id]);

  const loadMessages = async (convId: string) => {
    setChatLoading(true);
    const { data } = await supabase
      .from('direct_messages')
      .select('id, sender_id, content, created_at, read_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    setMessages(data ?? []);
    setChatLoading(false);

    // Mark unread messages as read
    if (myId) {
      await supabase
        .from('direct_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('conversation_id', convId)
        .neq('sender_id', myId)
        .is('read_at', null);
    }

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 150);
  };

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || !openConv || !myId || sending || recipientBlocksMessages) return;
    setSending(true);
    setDraft('');

    await supabase.from('direct_messages').insert({
      conversation_id: openConv.id,
      sender_id: myId,
      content: text,
    });

    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', openConv.id);

    setSending(false);
  };

  async function blockConvUser() {
    if (!myId || !openConv) return;
    const otherId = openConv.otherUserId;
    const name = openConv.otherName;
    const doBlock = async () => {
      await supabase.from('user_blocks').insert({ blocker_id: myId, blocked_id: otherId });
      setBlockedUserIds(prev => new Set([...prev, otherId]));
      setShowBlockMenu(false);
      setOpenConv(null);
      loadInbox(myId);
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Block ${name}? They won't be able to message you.`)) doBlock();
    } else {
      Alert.alert('Block User', `Block ${name}?\n\nThey won't be able to send you messages.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: doBlock },
      ]);
    }
    setShowBlockMenu(false);
  }

  async function submitConvReport() {
    if (!myId || !openConv || !reportConvReason) return;
    setReportConvSubmitting(true);
    await supabase.from('user_reports').insert({
      reporter_id: myId,
      reported_id: openConv.otherUserId,
      reason: reportConvReason,
    });
    setReportConvSubmitting(false);
    setReportConvDone(true);
  }

  // ── Shared panel content ───────────────────────────────────────────────────
  // Each panel is plain content (no SafeAreaView/Modal wrapper) so it can be
  // composed either as a single full-screen mobile "page" or as one half of
  // the desktop two-panel layout below.

  function ListPanel() {
    return (
      <>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: c.separator,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={onBack} style={{ marginRight: 8 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="chevron-back" size={24} color={c.textPrimary} />
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: '800', color: c.textPrimary }}>Messages</Text>
          </View>
          <TouchableOpacity onPress={() => setShowNewMessage(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="New message">
            <Ionicons name="create-outline" size={23} color={c.primary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={c.primary} size="large" />
          </View>
        ) : convs.length === 0 ? (
          <View style={[{ alignItems: 'center', paddingHorizontal: 32, paddingTop: 64 }, columnStyle]}>
            <Ionicons name="chatbubbles-outline" size={34} color={c.textMuted} style={{ marginBottom: 12 }} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: c.textPrimary, marginBottom: 6 }}>No messages yet</Text>
            <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 18 }}>
              Start a conversation with another parent.
            </Text>
            <TouchableOpacity
              onPress={() => setShowNewMessage(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.primary, borderRadius: 22, paddingHorizontal: 20, paddingVertical: 11 }}
              accessibilityRole="button" accessibilityLabel="New message"
            >
              <Ionicons name="create-outline" size={17} color="#fff" />
              <Text style={{ fontSize: 14.5, fontWeight: '700', color: '#fff' }}>New Message</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={columnStyle}>
            {convs.map(conv => (
              <TouchableOpacity
                key={conv.id}
                onPress={() => setOpenConv(conv)}
                activeOpacity={0.75}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  paddingHorizontal: 16, paddingVertical: 14,
                  borderBottomWidth: 1, borderBottomColor: c.separator,
                  backgroundColor: conv.unread > 0 ? c.cardBlush : (openConv?.id === conv.id ? c.card : 'transparent'),
                }}
                accessibilityRole="button"
                accessibilityLabel={`Conversation with ${conv.otherName}${conv.unread > 0 ? ', unread' : ''}`}
              >
                <Avatar name={conv.otherName} url={conv.otherAvatar} size={48} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 15, fontWeight: conv.unread > 0 ? '800' : '600', color: c.textPrimary }}>
                      {conv.otherName}
                    </Text>
                    <Text style={{ fontSize: 12, color: c.textMuted }}>{timeAgo(conv.lastMessageAt)}</Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 13, color: conv.unread > 0 ? c.textPrimary : c.textMuted, fontWeight: conv.unread > 0 ? '600' : '400' }}
                  >
                    {conv.lastMessage || 'Start a conversation'}
                  </Text>
                </View>
                {conv.unread > 0 && (
                  <View style={{
                    width: 10, height: 10, borderRadius: 5,
                    backgroundColor: c.primary,
                  }} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </>
    );
  }

  function ComposePanel() {
    const q = newMsgQuery.trim();
    return (
      <>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: c.separator,
        }}>
          <TouchableOpacity onPress={() => { setShowNewMessage(false); setNewMsgQuery(''); setNewMsgResults([]); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={{ fontSize: 15, color: c.primary, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '800', color: c.textPrimary }}>New Message</Text>
          <View style={{ width: 56 }} />
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: c.inputBg, borderRadius: 14, paddingHorizontal: 12, height: 44,
          }}>
            <Ionicons name="search" size={16} color={c.textMuted} />
            <TextInput
              value={newMsgQuery}
              onChangeText={setNewMsgQuery}
              placeholder="Search people..."
              placeholderTextColor={c.textMuted}
              style={{ flex: 1, fontSize: 15, color: c.textPrimary }}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 8 }} keyboardShouldPersistTaps="handled">
          {newMsgSearching ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator color={c.primary} />
            </View>
          ) : q.length < 2 ? (
            <View style={{ paddingTop: 40, alignItems: 'center', paddingHorizontal: 32 }}>
              <Ionicons name="person-outline" size={30} color={c.textMuted} style={{ marginBottom: 10 }} />
              <Text style={{ fontSize: 13.5, color: c.textMuted, textAlign: 'center', lineHeight: 19 }}>
                Search by username or name to start a conversation.
              </Text>
            </View>
          ) : newMsgResults.length === 0 ? (
            <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'center', marginTop: 32 }}>No people found for "{q}"</Text>
          ) : (
            newMsgResults.map(p => {
              const name = p.display_name || p.username || 'Parent';
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => startConversationWith(p.id)}
                  activeOpacity={0.75}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingHorizontal: 16, paddingVertical: 12,
                    borderBottomWidth: 1, borderBottomColor: c.separator,
                  }}
                  accessibilityRole="button" accessibilityLabel={`Message ${name}`}
                >
                  <Avatar name={name} url={p.avatar_url} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14.5, fontWeight: '700', color: c.textPrimary }}>{name}</Text>
                    {p.username ? <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 1 }}>@{p.username}</Text> : null}
                  </View>
                  <Ionicons name="chatbubble-outline" size={17} color={c.textMuted} />
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </>
    );
  }

  function ChatPanel({ conv }: { conv: ConvRow }) {
    return (
      <>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingHorizontal: 16, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: c.separator,
        }}>
          {presentation === 'modal' && (
            <TouchableOpacity onPress={() => { setOpenConv(null); setRecipientBlocksMessages(false); myId && loadInbox(myId); }} accessibilityRole="button" accessibilityLabel="Back to inbox">
              <Ionicons name="chevron-back" size={24} color={c.textPrimary} />
            </TouchableOpacity>
          )}
          <Avatar name={conv.otherName} url={conv.otherAvatar} size={36} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.textPrimary, flex: 1 }}>
            {conv.otherName}
          </Text>
          <TouchableOpacity onPress={() => setShowBlockMenu(true)} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel="Conversation options">
            <Ionicons name="ellipsis-horizontal" size={20} color={c.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Block menu */}
        <Modal visible={showBlockMenu} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowBlockMenu(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.separator }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary }}>{conv.otherName}</Text>
              <TouchableOpacity onPress={() => setShowBlockMenu(false)} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={20} color={c.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 10 }}>
              <TouchableOpacity
                onPress={() => { setShowBlockMenu(false); setReportConvReason(''); setReportConvDone(false); setShowReportConv(true); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.separator }}
              >
                <Ionicons name="flag-outline" size={20} color={c.textSecondary} />
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary }}>Report {conv.otherName}</Text>
                  <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>Report inappropriate behavior</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={blockConvUser}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: '#FEF2F2', borderRadius: 14, borderWidth: 1, borderColor: '#FECACA' }}
              >
                <Ionicons name="person-remove-outline" size={20} color="#DC2626" />
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#DC2626' }}>Block {conv.otherName}</Text>
                  <Text style={{ fontSize: 12, color: '#EF4444', marginTop: 2 }}>They won't be able to message you</Text>
                </View>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>

        {/* Report user from DM modal */}
        <Modal visible={showReportConv} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowReportConv(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.separator }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary }}>Report User</Text>
              <TouchableOpacity onPress={() => setShowReportConv(false)} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={20} color={c.textMuted} />
              </TouchableOpacity>
            </View>
            {reportConvDone ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 }}>
                <Ionicons name="checkmark-circle" size={40} color={c.sage} />
                <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary }}>Report Submitted</Text>
                <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 }}>Thank you for keeping the community safe.</Text>
                <TouchableOpacity onPress={() => setShowReportConv(false)} style={{ marginTop: 8, backgroundColor: c.primary, borderRadius: 20, paddingHorizontal: 28, paddingVertical: 12 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Close</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }}>
                <Text style={{ fontSize: 15, color: c.textSecondary, marginBottom: 4 }}>Why are you reporting this user?</Text>
                {['Spam or fake account', 'Inappropriate content', 'Harassment or bullying', 'Impersonation', 'Other'].map(reason => (
                  <TouchableOpacity
                    key={reason}
                    onPress={() => setReportConvReason(reason)}
                    style={{ padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: reportConvReason === reason ? c.primary : c.separator, backgroundColor: c.card }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: c.textPrimary }}>{reason}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={submitConvReport}
                  disabled={!reportConvReason || reportConvSubmitting}
                  style={{ marginTop: 8, backgroundColor: c.primary, borderRadius: 20, paddingVertical: 14, alignItems: 'center', opacity: !reportConvReason || reportConvSubmitting ? 0.4 : 1 }}
                >
                  {reportConvSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Submit Report</Text>}
                </TouchableOpacity>
              </ScrollView>
            )}
          </SafeAreaView>
        </Modal>

        {chatLoading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={c.primary} />
          </View>
        ) : (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
          >
            <ScrollView
              ref={scrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={[{ padding: 16, gap: 8 }, columnStyle]}
              showsVerticalScrollIndicator={false}
            >
              {messages.length === 0 && (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="chatbubbles-outline" size={32} color={c.textMuted} style={{ marginBottom: 10 }} />
                  <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'center' }}>
                    Start a conversation with {conv.otherName}
                  </Text>
                </View>
              )}
              {messages.map((msg, i) => {
                const isMe = msg.sender_id === myId;
                const prevMsg = messages[i - 1];
                const showTime = !prevMsg || new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() > 5 * 60 * 1000;
                return (
                  <View key={msg.id}>
                    {showTime && (
                      <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center', marginVertical: 6 }}>
                        {timeAgo(msg.created_at)}
                      </Text>
                    )}
                    <View style={{ alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                      <View style={{
                        maxWidth: '75%',
                        backgroundColor: isMe ? c.primary : c.card,
                        borderRadius: 18,
                        borderBottomRightRadius: isMe ? 4 : 18,
                        borderBottomLeftRadius: isMe ? 18 : 4,
                        paddingHorizontal: 14, paddingVertical: 10,
                      }}>
                        <Text style={{ fontSize: 15, color: isMe ? '#fff' : c.textPrimary, lineHeight: 21 }}>
                          {msg.content}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {recipientBlocksMessages ? (
              <View style={{
                borderTopWidth: 1, borderTopColor: c.separator,
                backgroundColor: c.bg, paddingVertical: 14,
              }}>
                <View style={[{ paddingHorizontal: 20, alignItems: 'center' }, columnStyle]}>
                  <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 18 }}>
                    {conv.otherName} isn't accepting messages right now.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={{
                borderTopWidth: 1, borderTopColor: c.separator,
                backgroundColor: c.bg, paddingVertical: 10,
              }}>
                <View style={[{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 14 }, columnStyle]}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Message..."
                    placeholderTextColor={c.textMuted}
                    multiline
                    style={{
                      flex: 1, backgroundColor: c.card, borderRadius: 20,
                      borderWidth: 1.5, borderColor: c.separator,
                      paddingHorizontal: 14, paddingVertical: 10,
                      fontSize: 15, color: c.textPrimary, maxHeight: 120,
                    }}
                    onSubmitEditing={sendMessage}
                    blurOnSubmit={false}
                    accessibilityLabel="Write a message"
                  />
                  <TouchableOpacity
                    onPress={sendMessage}
                    disabled={!draft.trim() || sending}
                    style={{
                      width: 42, height: 42, borderRadius: 21,
                      backgroundColor: draft.trim() ? c.primary : c.separator,
                      justifyContent: 'center', alignItems: 'center',
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Send message"
                  >
                    {sending
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Ionicons name="arrow-up" size={20} color="#fff" />
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </KeyboardAvoidingView>
        )}
      </>
    );
  }

  function EmptyRightPanel() {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Ionicons name="chatbubble-ellipses-outline" size={36} color={c.textMuted} style={{ marginBottom: 14 }} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: c.textPrimary, marginBottom: 6 }}>Select a conversation</Text>
        <Text style={{ fontSize: 13.5, color: c.textMuted, textAlign: 'center', lineHeight: 19, marginBottom: 18 }}>
          Choose someone from your messages, or start a new conversation.
        </Text>
        <TouchableOpacity
          onPress={() => setShowNewMessage(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.cardLavender, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10 }}
          accessibilityRole="button" accessibilityLabel="New message"
        >
          <Ionicons name="create-outline" size={16} color={c.lavender} />
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: c.lavender }}>New Message</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Desktop: two-panel inbox (list | active conversation) ─────────────────

  if (presentation === 'inline') {
    return (
      <SafeAreaView style={{ flex: 1, flexDirection: 'row', backgroundColor: c.bg }}>
        <View style={{ width: 340, borderRightWidth: 1, borderRightColor: c.separator }}>
          {showNewMessage ? <ComposePanel /> : <ListPanel />}
        </View>
        <View style={{ flex: 1 }}>
          {openConv ? <ChatPanel conv={openConv} /> : <EmptyRightPanel />}
        </View>
      </SafeAreaView>
    );
  }

  // ── Mobile: single full-screen panel at a time ─────────────────────────────

  if (showNewMessage) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <ComposePanel />
      </SafeAreaView>
    );
  }

  if (openConv) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <ChatPanel conv={openConv} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ListPanel />
    </SafeAreaView>
  );
}
