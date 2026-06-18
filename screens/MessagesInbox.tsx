import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, Image,
  Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useColors } from '../lib/theme';

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
}: {
  onBack: () => void;
  openWithUserId?: string | null;
}) {
  const c = useColors();
  const [myId, setMyId] = useState<string | null>(null);
  const [allConvs, setAllConvs] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openConv, setOpenConv] = useState<ConvRow | null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());

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
    });
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
          otherName: prof.display_name || prof.username || 'Villager',
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
      otherName: prof?.display_name || prof?.username || 'Villager',
      otherAvatar: prof?.avatar_url ?? null,
      lastMessage: '',
      lastMessageAt: existing.last_message_at,
      unread: 0,
    });
  }, [myId]);

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

  // ── Chat view ─────────────────────────────────────────────────────────────

  if (openConv) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingHorizontal: 16, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: c.separator,
        }}>
          <TouchableOpacity onPress={() => { setOpenConv(null); setRecipientBlocksMessages(false); myId && loadInbox(myId); }}>
            <Text style={{ fontSize: 22, color: c.textMuted }}>←</Text>
          </TouchableOpacity>
          <Avatar name={openConv.otherName} url={openConv.otherAvatar} size={36} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.textPrimary, flex: 1 }}>
            {openConv.otherName}
          </Text>
          <TouchableOpacity onPress={() => setShowBlockMenu(true)} style={{ padding: 4 }}>
            <Text style={{ fontSize: 20, color: c.textMuted }}>⋯</Text>
          </TouchableOpacity>
        </View>

        {/* Block menu */}
        <Modal visible={showBlockMenu} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowBlockMenu(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.separator }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary }}>{openConv.otherName}</Text>
              <TouchableOpacity onPress={() => setShowBlockMenu(false)}>
                <Text style={{ fontSize: 18, color: c.textMuted }}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 10 }}>
              <TouchableOpacity
                onPress={() => { setShowBlockMenu(false); setReportConvReason(''); setReportConvDone(false); setShowReportConv(true); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.separator }}
              >
                <Text style={{ fontSize: 20 }}>🚩</Text>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary }}>Report {openConv.otherName}</Text>
                  <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>Report inappropriate behavior</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={blockConvUser}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: '#FEF2F2', borderRadius: 14, borderWidth: 1, borderColor: '#FECACA' }}
              >
                <Text style={{ fontSize: 20 }}>🚫</Text>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#DC2626' }}>Block {openConv.otherName}</Text>
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
              <TouchableOpacity onPress={() => setShowReportConv(false)}>
                <Text style={{ fontSize: 18, color: c.textMuted }}>✕</Text>
              </TouchableOpacity>
            </View>
            {reportConvDone ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 }}>
                <Text style={{ fontSize: 40 }}>✅</Text>
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
              contentContainerStyle={{ padding: 16, gap: 8 }}
              showsVerticalScrollIndicator={false}
            >
              {messages.length === 0 && (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Text style={{ fontSize: 36, marginBottom: 10 }}>💬</Text>
                  <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'center' }}>
                    Start a conversation with {openConv.otherName}
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
                paddingHorizontal: 20, paddingVertical: 14,
                borderTopWidth: 1, borderTopColor: c.separator,
                backgroundColor: c.bg, alignItems: 'center',
              }}>
                <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 18 }}>
                  {openConv.otherName} isn't accepting messages right now.
                </Text>
              </View>
            ) : (
              <View style={{
                flexDirection: 'row', alignItems: 'flex-end', gap: 10,
                paddingHorizontal: 14, paddingVertical: 10,
                borderTopWidth: 1, borderTopColor: c.separator,
                backgroundColor: c.bg,
              }}>
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
                />
                <TouchableOpacity
                  onPress={sendMessage}
                  disabled={!draft.trim() || sending}
                  style={{
                    width: 42, height: 42, borderRadius: 21,
                    backgroundColor: draft.trim() ? c.primary : c.separator,
                    justifyContent: 'center', alignItems: 'center',
                  }}
                >
                  {sending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={{ fontSize: 18 }}>↑</Text>
                  }
                </TouchableOpacity>
              </View>
            )}
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    );
  }

  // ── Inbox view ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: c.separator,
      }}>
        <TouchableOpacity onPress={onBack} style={{ marginRight: 12 }}>
          <Text style={{ fontSize: 22, color: c.textMuted }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: c.textPrimary }}>Messages</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={c.primary} size="large" />
        </View>
      ) : convs.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>💬</Text>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary, marginBottom: 8 }}>No messages yet</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 }}>
            Tap Message on someone's profile to start a conversation.
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {convs.map(conv => (
            <TouchableOpacity
              key={conv.id}
              onPress={() => setOpenConv(conv)}
              activeOpacity={0.75}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 14,
                paddingHorizontal: 20, paddingVertical: 14,
                borderBottomWidth: 1, borderBottomColor: c.separator,
                backgroundColor: conv.unread > 0 ? c.cardBlush : 'transparent',
              }}
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
    </SafeAreaView>
  );
}
