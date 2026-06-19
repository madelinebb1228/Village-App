import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors, useColors } from '../lib/theme';
import { supabase } from '../lib/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────

const MOOD_OPTS  = ['😔','😕','😐','🙂','😊'] as const;
const ENERGY_OPTS = ['🪫','🔋','🔋','⚡','⚡⚡'] as const;

const EMOTION_CHIPS = [
  'Grateful','Hopeful','Connected','Calm',
  'Anxious','Overwhelmed','Lonely','Irritable',
  'Exhausted','Proud','Numb','Weepy',
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MoodLog {
  id: string;
  logged_date: string;
  mood_score: number;
  energy_score: number;
  emotions: string[];
  notes: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MoodEnergyTracker({ userId }: { userId: string | null }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [todayLog, setTodayLog]   = useState<MoodLog | null>(null);
  const [history,  setHistory]    = useState<MoodLog[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [saving,   setSaving]     = useState(false);
  const [expanded, setExpanded]   = useState(false);
  const [editing,  setEditing]    = useState(false);

  const [mood,     setMood]     = useState(3);
  const [energy,   setEnergy]   = useState(3);
  const [emotions, setEmotions] = useState<string[]>([]);
  const [notes,    setNotes]    = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [todayRes, histRes] = await Promise.all([
      (supabase.from('mom_mood_logs') as any)
        .select('*').eq('user_id', userId).eq('logged_date', todayStr()).maybeSingle(),
      (supabase.from('mom_mood_logs') as any)
        .select('*').eq('user_id', userId)
        .order('logged_date', { ascending: false }).limit(7),
    ]);
    setTodayLog(todayRes.data ?? null);
    setHistory(histRes.data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  function startLog(existing?: MoodLog) {
    setMood(existing?.mood_score ?? 3);
    setEnergy(existing?.energy_score ?? 3);
    setEmotions(existing?.emotions ?? []);
    setNotes(existing?.notes ?? '');
    setEditing(true);
  }

  function toggleEmotion(e: string) {
    setEmotions(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  }

  async function save() {
    if (!userId) return;
    setSaving(true);
    const payload = { user_id: userId, logged_date: todayStr(), mood_score: mood, energy_score: energy, emotions, notes: notes.trim() || null };
    if (todayLog) {
      await (supabase.from('mom_mood_logs') as any).update(payload).eq('id', todayLog.id);
    } else {
      await (supabase.from('mom_mood_logs') as any).insert(payload);
    }
    setSaving(false);
    setEditing(false);
    load();
  }

  if (loading) return <ActivityIndicator color={c.primary} style={{ margin: 24 }} />;

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.header} onPress={() => setExpanded(p => !p)} activeOpacity={0.8}>
        <View style={s.headerLeft}>
          <Text style={s.headerEmoji}>🌈</Text>
          <View>
            <Text style={s.headerTitle}>Mood & Energy</Text>
            {todayLog && !editing && (
              <Text style={s.headerSub}>
                Today: {MOOD_OPTS[todayLog.mood_score - 1]}  Energy: {todayLog.energy_score}/5
              </Text>
            )}
            {!todayLog && <Text style={s.headerSub}>How are you feeling today?</Text>}
          </View>
        </View>
        <Text style={s.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={s.body}>
          {!editing ? (
            <>
              {/* Today's entry summary */}
              {todayLog ? (
                <View style={s.todayCard}>
                  <Text style={s.todayLabel}>Today's check-in</Text>
                  <View style={s.scaleRow}>
                    <Text style={s.scaleEmoji}>{MOOD_OPTS[todayLog.mood_score - 1]}</Text>
                    <Text style={s.scaleMeta}>Mood {todayLog.mood_score}/5  ·  Energy {todayLog.energy_score}/5</Text>
                  </View>
                  {todayLog.emotions.length > 0 && (
                    <Text style={s.todayEmotions}>{todayLog.emotions.join(' · ')}</Text>
                  )}
                  {todayLog.notes ? <Text style={s.todayNotes}>"{todayLog.notes}"</Text> : null}
                  <TouchableOpacity style={s.editBtn} onPress={() => startLog(todayLog)}>
                    <Text style={s.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={s.logBtn} onPress={() => startLog()}>
                  <Text style={s.logBtnText}>✏️  Log How You're Feeling</Text>
                </TouchableOpacity>
              )}

              {/* History sparkline */}
              {history.length > 1 && (
                <View style={s.histWrap}>
                  <Text style={s.histTitle}>Last {history.length} days</Text>
                  <View style={s.sparkRow}>
                    {[...history].reverse().map(h => (
                      <View key={h.id} style={s.sparkCol}>
                        <Text style={s.sparkEmoji}>{MOOD_OPTS[h.mood_score - 1]}</Text>
                        <Text style={s.sparkDate}>{new Date(h.logged_date).toLocaleDateString('en-US',{weekday:'short'}).slice(0,1)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </>
          ) : (
            /* ── Log form ── */
            <View>
              <Text style={s.formLabel}>How's your mood?</Text>
              <View style={s.emojiRow}>
                {MOOD_OPTS.map((e, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.emojiBtn, mood === i + 1 && { backgroundColor: c.cardLavender, borderColor: c.lavender }]}
                    onPress={() => setMood(i + 1)}
                  >
                    <Text style={s.emojiBtnText}>{e}</Text>
                    <Text style={s.emojiBtnNum}>{i + 1}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>Energy level?</Text>
              <View style={s.emojiRow}>
                {ENERGY_OPTS.map((e, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.emojiBtn, energy === i + 1 && { backgroundColor: c.cardSage, borderColor: c.sage }]}
                    onPress={() => setEnergy(i + 1)}
                  >
                    <Text style={s.emojiBtnText}>{e}</Text>
                    <Text style={s.emojiBtnNum}>{i + 1}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>How are you feeling? <Text style={s.optional}>(pick any)</Text></Text>
              <View style={s.chipsWrap}>
                {EMOTION_CHIPS.map(e => (
                  <TouchableOpacity
                    key={e}
                    style={[s.chip, emotions.includes(e) && { backgroundColor: c.cardBlush, borderColor: c.blush }]}
                    onPress={() => toggleEmotion(e)}
                  >
                    <Text style={[s.chipText, emotions.includes(e) && { color: c.blush, fontWeight: '700' }]}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>Any notes? <Text style={s.optional}>(optional)</Text></Text>
              <TextInput
                style={s.notesInput}
                placeholder="Just a few words..."
                placeholderTextColor={c.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                maxLength={300}
              />

              <View style={s.btnRow}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setEditing(false)}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Save Check-In</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    wrap: { backgroundColor: c.card, borderRadius: 16, marginBottom: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: c.separator },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderLeftWidth: 4, borderLeftColor: '#DB2777' },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerEmoji: { fontSize: 28 },
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    headerSub:   { fontSize: 12, color: c.textMuted, marginTop: 2 },
    chevron:     { fontSize: 12, color: c.textMuted },
    body:        { padding: 16, borderTopWidth: 1, borderTopColor: c.separator },

    todayCard:   { backgroundColor: c.cardBlush, borderRadius: 12, padding: 14, marginBottom: 14 },
    todayLabel:  { fontSize: 11, fontWeight: '700', color: '#831843', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    scaleRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    scaleEmoji:  { fontSize: 28 },
    scaleMeta:   { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    todayEmotions: { fontSize: 12, color: c.textSecondary, marginBottom: 4 },
    todayNotes:  { fontSize: 12, color: c.textMuted, fontStyle: 'italic', marginBottom: 8 },
    editBtn:     { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, borderWidth: 1.5, borderColor: '#DB2777' },
    editBtnText: { fontSize: 12, fontWeight: '700', color: '#DB2777' },

    logBtn:     { backgroundColor: c.cardBlush, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 14, borderWidth: 1.5, borderColor: '#FBCFE8' },
    logBtnText: { fontSize: 15, fontWeight: '700', color: '#831843' },

    histWrap: { marginTop: 8 },
    histTitle: { fontSize: 12, fontWeight: '700', color: c.textMuted, marginBottom: 8 },
    sparkRow:  { flexDirection: 'row', gap: 4 },
    sparkCol:  { alignItems: 'center', flex: 1 },
    sparkEmoji:{ fontSize: 18 },
    sparkDate: { fontSize: 10, color: c.textMuted, marginTop: 2 },

    formLabel:  { fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 10, marginTop: 12 },
    optional:   { fontWeight: '400', color: c.textMuted },
    emojiRow:   { flexDirection: 'row', gap: 8, marginBottom: 4 },
    emojiBtn:   { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    emojiBtnText: { fontSize: 22 },
    emojiBtnNum:  { fontSize: 10, color: c.textMuted, marginTop: 2 },

    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    chip:      { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    chipText:  { fontSize: 13, color: c.textSecondary },

    notesInput: { backgroundColor: c.bg, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, padding: 12, fontSize: 14, color: c.textPrimary, minHeight: 70, textAlignVertical: 'top', marginBottom: 16 },
    btnRow:     { flexDirection: 'row', gap: 10 },
    cancelBtn:  { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator },
    cancelBtnText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    saveBtn:    { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#DB2777' },
    saveBtnText:{ fontSize: 14, fontWeight: '800', color: '#fff' },
  });
}
