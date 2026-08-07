import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, SafeAreaView, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import { safeInsert } from '../lib/syncService';
import { useColors, Colors } from '../lib/theme';
import {
  useCouple, US_TIME_PRESETS, MICRO_DATE_IDEAS, CoupleActivity,
  usTimeBannerText, timeAgoShort,
} from '../lib/relationshipUtil';
import CoupleLinkPrompt from '../components/CoupleLinkPrompt';

interface Props {
  userId: string | null;
}

function todaysIdea(): string {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return MICRO_DATE_IDEAS[dayOfYear % MICRO_DATE_IDEAS.length];
}

export default function UsTimeTracker({ userId }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const { couple, partner, loading: coupleLoading, refresh: refreshCouple } = useCouple(userId);

  const [entries, setEntries] = useState<CoupleActivity[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [logging, setLogging] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [note, setNote] = useState('');
  const [minutes, setMinutes] = useState('');
  const [saving, setSaving] = useState(false);
  const [justLogged, setJustLogged] = useState(false);

  const loadEntries = useCallback(async () => {
    if (!couple) { setEntries([]); setLoadingEntries(false); return; }
    setLoadingEntries(true);
    const { data } = await supabase
      .from('couple_activities')
      .select('*')
      .eq('couple_id', couple.id)
      .order('completed_at', { ascending: false })
      .limit(30);
    setEntries((data as CoupleActivity[]) ?? []);
    setLoadingEntries(false);
  }, [couple]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  async function logActivity(activityType: string, noteText: string | null, durationMinutes: number | null) {
    if (!couple || !userId) return;
    setLogging(activityType);
    try {
      await safeInsert('couple_activities', {
        couple_id: couple.id,
        logged_by: userId,
        activity_type: activityType,
        note: noteText,
        duration_minutes: durationMinutes,
        completed_at: new Date().toISOString(),
      });
      setJustLogged(true);
      setTimeout(() => setJustLogged(false), 1500);
      loadEntries();
    } finally {
      setLogging(null);
    }
  }

  async function submitCustom() {
    setSaving(true);
    try {
      const mins = minutes.trim() ? parseInt(minutes.trim(), 10) : null;
      await logActivity('custom', note.trim() || null, Number.isFinite(mins as number) ? mins : null);
      setNote('');
      setMinutes('');
      setCustomOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const lastEntry = entries[0] ?? null;

  if (coupleLoading) {
    return (
      <View style={s.container}>
        <Text style={s.sectionTitle}>💞 Us Time</Text>
        <ActivityIndicator color={c.primary} style={{ marginVertical: 20 }} />
      </View>
    );
  }

  if (!partner) {
    return (
      <View style={s.container}>
        <Text style={s.sectionTitle}>💞 Us Time</Text>
        <CoupleLinkPrompt
          userId={userId!}
          title="Connect to track Us Time"
          existingInviteCode={couple?.invite_code}
          onLinked={refreshCouple}
        />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <Text style={s.sectionTitle}>💞 Us Time</Text>

      <View style={s.banner}>
        <Text style={s.bannerText}>{usTimeBannerText(lastEntry?.completed_at ?? null)}</Text>
      </View>

      <Text style={s.groupLabel}>Log time together</Text>
      <View style={s.presetGrid}>
        {US_TIME_PRESETS.map(p => (
          <TouchableOpacity
            key={p.type}
            style={s.presetBtn}
            onPress={() => logActivity(p.type, null, null)}
            disabled={logging !== null}
            activeOpacity={0.85}
            accessibilityRole="button" accessibilityLabel={p.label}
          >
            {logging === p.type ? <ActivityIndicator color={c.primary} /> : (
              <>
                <Text style={s.presetEmoji}>{p.emoji}</Text>
                <Text style={s.presetLabel}>{p.label}</Text>
              </>
            )}
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={s.presetBtn} onPress={() => setCustomOpen(true)} activeOpacity={0.85}
          accessibilityRole="button" accessibilityLabel="Log something else">
          <Text style={s.presetEmoji}>➕</Text>
          <Text style={s.presetLabel}>Something else</Text>
        </TouchableOpacity>
      </View>

      <View style={s.ideaCard}>
        <Text style={s.ideaLabel}>💡 Idea</Text>
        <Text style={s.ideaText}>{todaysIdea()}</Text>
      </View>

      <Text style={s.groupLabel}>History</Text>
      {loadingEntries ? (
        <ActivityIndicator color={c.primary} style={{ marginVertical: 12 }} />
      ) : entries.length === 0 ? (
        <Text style={s.emptyText}>Nothing logged yet — try one of the buttons above.</Text>
      ) : (
        entries.map(e => {
          const preset = US_TIME_PRESETS.find(p => p.type === e.activity_type);
          const who = e.logged_by === userId ? 'You' : partner.name;
          return (
            <View key={e.id} style={s.historyRow}>
              <Text style={s.historyEmoji}>{preset?.emoji ?? '💞'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.historyTitle}>{preset?.label ?? (e.note || 'Us Time')}</Text>
                <Text style={s.historyMeta}>
                  {who} · {timeAgoShort(e.completed_at)}{e.duration_minutes ? ` · ${e.duration_minutes}m` : ''}
                </Text>
              </View>
            </View>
          );
        })
      )}

      {/* ── Custom log modal ─────────────────────────────────────────── */}
      <Modal visible={customOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCustomOpen(false)}>
        <SafeAreaView style={s.modalSafe}>
          <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Log Us Time</Text>
              <TouchableOpacity onPress={() => setCustomOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button" accessibilityLabel="Close">
                <Text style={s.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.modalPrompt}>What did you do?</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. 15-min coffee together"
              placeholderTextColor={c.textMuted}
              value={note}
              onChangeText={setNote}
            />

            <Text style={s.modalPrompt}>Minutes (optional)</Text>
            <TextInput
              style={s.input}
              placeholder="0"
              placeholderTextColor={c.textMuted}
              value={minutes}
              onChangeText={t => setMinutes(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
            />

            <TouchableOpacity
              style={[s.presetBtn, s.saveBtn, { opacity: note.trim() ? 1 : 0.45 }]}
              onPress={submitCustom}
              disabled={saving || !note.trim()}
              activeOpacity={0.85}
              accessibilityRole="button" accessibilityLabel="Save"
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Confirmation ─────────────────────────────────────────────── */}
      <Modal transparent visible={justLogged} animationType="fade" onRequestClose={() => setJustLogged(false)}>
        <View style={s.confirmOverlay}>
          <View style={s.confirmCard}>
            <Text style={s.confirmEmoji}>💞</Text>
            <Text style={s.confirmText}>Us Time logged!</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary, marginBottom: 14 },
    emptyText: { fontSize: 13, color: c.textMuted, fontWeight: '500', lineHeight: 18 },

    banner: { backgroundColor: c.cardBlush, borderRadius: 14, padding: 14, marginBottom: 18 },
    bannerText: { fontSize: 14.5, fontWeight: '700', color: c.textPrimary },

    groupLabel: { fontSize: 13, fontWeight: '700', color: c.textPrimary, marginBottom: 10 },

    presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
    presetBtn: {
      flexBasis: '47%', flexGrow: 1, backgroundColor: c.card, borderRadius: 14, borderWidth: 1.5, borderColor: c.cardBorder,
      paddingVertical: 16, alignItems: 'center', gap: 6, minHeight: 76, justifyContent: 'center',
    },
    presetEmoji: { fontSize: 24 },
    presetLabel: { fontSize: 12.5, fontWeight: '700', color: c.textSecondary, textAlign: 'center' },

    ideaCard: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1.5, borderColor: c.separator, padding: 14, marginBottom: 18 },
    ideaLabel: { fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
    ideaText: { fontSize: 14, color: c.textPrimary, fontWeight: '600', lineHeight: 20 },

    historyRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    historyEmoji: { fontSize: 22 },
    historyTitle: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    historyMeta: { fontSize: 11.5, color: c.textMuted, marginTop: 2 },

    modalSafe: { flex: 1, backgroundColor: c.bg },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    modalBody: { padding: 20, paddingBottom: 40 },
    modalTitle: { fontSize: 18, fontWeight: '800', color: c.textPrimary, flex: 1 },
    modalClose: { fontSize: 15, color: c.textMuted, fontWeight: '600' },
    modalPrompt: { fontSize: 13, fontWeight: '700', color: c.textPrimary, marginTop: 18, marginBottom: 10 },
    input: { backgroundColor: c.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: c.textPrimary },
    saveBtn: { backgroundColor: c.primary, marginTop: 24, flexBasis: 'auto' },
    saveBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

    confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
    confirmCard: {
      backgroundColor: c.bg, borderRadius: 24, paddingVertical: 28, paddingHorizontal: 36,
      alignItems: 'center', gap: 8, borderWidth: 2, borderColor: c.lavender,
    },
    confirmEmoji: { fontSize: 40 },
    confirmText: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
  });
}
