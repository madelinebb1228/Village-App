import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, SafeAreaView, ActivityIndicator, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import { safeInsert } from '../lib/syncService';
import { useColors, Colors } from '../lib/theme';
import { useCouple, KUDOS_PRESETS, AppreciationMessage, timeAgoShort } from '../lib/relationshipUtil';
import CoupleLinkPrompt from '../components/CoupleLinkPrompt';

interface Props {
  userId: string | null;
}

export default function KudosTracker({ userId }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const { couple, partner, loading: coupleLoading, refresh: refreshCouple } = useCouple(userId);

  const [messages, setMessages] = useState<AppreciationMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);

  const loadMessages = useCallback(async () => {
    if (!userId || !partner) { setMessages([]); setLoadingMessages(false); return; }
    setLoadingMessages(true);
    const { data } = await supabase
      .from('appreciation_messages')
      .select('*')
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${partner.user_id}),and(sender_id.eq.${partner.user_id},recipient_id.eq.${userId})`)
      .order('sent_at', { ascending: false })
      .limit(50);
    setMessages((data as AppreciationMessage[]) ?? []);
    setLoadingMessages(false);
  }, [userId, partner]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  async function sendKudos() {
    const text = draft.trim();
    if (!text || !userId || !partner) return;
    setSending(true);
    try {
      await safeInsert('appreciation_messages', {
        sender_id: userId,
        recipient_id: partner.user_id,
        message: text,
      });
      setDraft('');
      setComposerOpen(false);
      setJustSent(true);
      setTimeout(() => setJustSent(false), 1500);
      loadMessages();
    } finally {
      setSending(false);
    }
  }

  async function markRead(msg: AppreciationMessage) {
    if (msg.recipient_id !== userId || msg.read_at) return;
    const readAt = new Date().toISOString();
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read_at: readAt } : m));
    await supabase.from('appreciation_messages').update({ read_at: readAt }).eq('id', msg.id);
  }

  if (coupleLoading) {
    return (
      <View style={s.container}>
        <Text style={s.sectionTitle}>💌 Send Kudos</Text>
        <ActivityIndicator color={c.primary} style={{ marginVertical: 20 }} />
      </View>
    );
  }

  if (!partner) {
    return (
      <View style={s.container}>
        <Text style={s.sectionTitle}>💌 Send Kudos</Text>
        <CoupleLinkPrompt
          userId={userId!}
          title="Connect to send kudos"
          existingInviteCode={couple?.invite_code}
          onLinked={refreshCouple}
        />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.headerRow}>
        <View>
          <Text style={s.sectionTitle}>💌 Send Kudos</Text>
          <Text style={s.sectionSubtitle}>Appreciation between you and {partner.name}</Text>
        </View>
      </View>

      <TouchableOpacity style={s.sendBtn} onPress={() => setComposerOpen(true)} activeOpacity={0.85}
        accessibilityRole="button" accessibilityLabel="Send kudos">
        <Text style={s.sendBtnText}>💌 Send Kudos</Text>
      </TouchableOpacity>

      <Text style={s.groupLabel}>Appreciation bank</Text>
      {loadingMessages ? (
        <ActivityIndicator color={c.primary} style={{ marginVertical: 12 }} />
      ) : messages.length === 0 ? (
        <Text style={s.emptyText}>No kudos yet — send the first one to {partner.name}.</Text>
      ) : (
        messages.map(m => {
          const received = m.recipient_id === userId;
          const unread = received && !m.read_at;
          return (
            <TouchableOpacity
              key={m.id}
              style={[s.msgRow, unread && s.msgRowUnread]}
              onPress={() => markRead(m)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={received ? `Received: ${m.message}` : `Sent: ${m.message}`}
            >
              <Text style={s.msgDirection}>{received ? `From ${partner.name}` : 'You sent'}</Text>
              <Text style={s.msgText}>{m.message}</Text>
              <View style={s.msgFooter}>
                <Text style={s.msgTime}>{timeAgoShort(m.sent_at)}</Text>
                {unread && <View style={s.unreadDot} />}
              </View>
            </TouchableOpacity>
          );
        })
      )}

      {/* ── Composer ─────────────────────────────────────────────────── */}
      <Modal visible={composerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setComposerOpen(false)}>
        <SafeAreaView style={s.modalSafe}>
          <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Send Kudos to {partner.name}</Text>
              <TouchableOpacity onPress={() => setComposerOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button" accessibilityLabel="Close">
                <Text style={s.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.modalPrompt}>Quick ones</Text>
            <View style={s.presetWrap}>
              {KUDOS_PRESETS.map(preset => (
                <TouchableOpacity key={preset} style={s.presetChip} onPress={() => setDraft(preset)} activeOpacity={0.8}
                  accessibilityRole="button" accessibilityLabel={preset}>
                  <Text style={s.presetChipText}>{preset}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.modalPrompt}>Or write your own</Text>
            <TextInput
              style={s.textArea}
              placeholder="Say something nice..."
              placeholderTextColor={c.textMuted}
              value={draft}
              onChangeText={setDraft}
              multiline
              numberOfLines={4}
            />

            <TouchableOpacity
              style={[s.sendBtn, { opacity: draft.trim() ? 1 : 0.45 }]}
              onPress={sendKudos}
              disabled={sending || !draft.trim()}
              activeOpacity={0.85}
              accessibilityRole="button" accessibilityLabel="Send"
            >
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={s.sendBtnText}>Send</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Confirmation ─────────────────────────────────────────────── */}
      <Modal transparent visible={justSent} animationType="fade" onRequestClose={() => setJustSent(false)}>
        <View style={s.confirmOverlay}>
          <View style={s.confirmCard}>
            <Text style={s.confirmEmoji}>💌</Text>
            <Text style={s.confirmText}>Kudos sent!</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { marginBottom: 16 },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
    sectionSubtitle: { fontSize: 12, color: c.textMuted, fontWeight: '500', marginTop: 2 },
    emptyText: { fontSize: 13, color: c.textMuted, fontWeight: '500', lineHeight: 18 },

    sendBtn: { backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 18 },
    sendBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

    groupLabel: { fontSize: 13, fontWeight: '700', color: c.textPrimary, marginBottom: 10 },

    msgRow: {
      backgroundColor: c.card, borderRadius: 14, borderWidth: 1.5, borderColor: c.separator,
      padding: 14, marginBottom: 8,
    },
    msgRowUnread: { borderColor: c.primary, backgroundColor: c.cardBlush },
    msgDirection: { fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
    msgText: { fontSize: 14.5, color: c.textPrimary, fontWeight: '600', lineHeight: 20 },
    msgFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    msgTime: { fontSize: 11, color: c.textMuted },
    unreadDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.primary },

    modalSafe: { flex: 1, backgroundColor: c.bg },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    modalBody: { padding: 20, paddingBottom: 40 },
    modalTitle: { fontSize: 18, fontWeight: '800', color: c.textPrimary, flex: 1 },
    modalClose: { fontSize: 15, color: c.textMuted, fontWeight: '600' },
    modalPrompt: { fontSize: 13, fontWeight: '700', color: c.textPrimary, marginTop: 18, marginBottom: 10 },

    presetWrap: { gap: 8 },
    presetChip: {
      backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5, borderColor: c.cardBorder,
      paddingVertical: 12, paddingHorizontal: 14,
    },
    presetChipText: { fontSize: 13.5, fontWeight: '600', color: c.textPrimary },

    textArea: {
      backgroundColor: c.inputBg, borderRadius: 14, padding: 14, fontSize: 15, color: c.textPrimary,
      minHeight: 100, textAlignVertical: 'top',
    },

    confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
    confirmCard: {
      backgroundColor: c.bg, borderRadius: 24, paddingVertical: 28, paddingHorizontal: 36,
      alignItems: 'center', gap: 8, borderWidth: 2, borderColor: c.lavender,
    },
    confirmEmoji: { fontSize: 40 },
    confirmText: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
  });
}
