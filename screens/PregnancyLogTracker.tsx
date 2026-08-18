import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors, useColors } from '../lib/theme';
import TrackerHeader from '../components/TrackerHeader';
import { useCollapsed } from '../lib/useCollapsed';
import { supabase } from '../lib/supabase';
import { safeInsert, safeUpdate, safeDelete } from '../lib/syncService';

const SYMPTOMS = [
  'Nausea', 'Heartburn', 'Fatigue', 'Swelling', 'Back pain', 'Braxton Hicks',
  'Headache', 'Vision changes', 'Decreased movement', 'Vaginal bleeding', 'Fever', 'Severe abdominal pain',
];

function todayStr() { return new Date().toISOString().slice(0, 10); }

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmtShort(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface PregnancyLog {
  id: string;
  logged_date: string;
  weight_lbs: number | null;
  symptoms: string[];
  notes: string | null;
}

// Rule-based nudge, most-urgent-first. Not a diagnosis — these are widely
// recognized pregnancy warning signs worth a same-day call to a provider.
interface RedFlag { text: string }

function detectRedFlag(symptoms: string[]): RedFlag | null {
  if (symptoms.includes('Vaginal bleeding')) {
    return { text: 'Vaginal bleeding during pregnancy should be checked by your provider today, or go to the ER if heavy.' };
  }
  if (symptoms.includes('Decreased movement')) {
    return { text: "Decreased fetal movement is worth a call to your provider — they may want you to do a kick count or come in." };
  }
  if (symptoms.includes('Severe abdominal pain')) {
    return { text: 'Severe abdominal pain is worth a same-day call to your provider or a trip to the ER.' };
  }
  if (symptoms.includes('Vision changes') || (symptoms.includes('Headache') && symptoms.includes('Swelling'))) {
    return { text: 'Vision changes, or a headache together with swelling, can be signs of preeclampsia — contact your provider today.' };
  }
  if (symptoms.includes('Fever')) {
    return { text: 'A fever during pregnancy is worth a same-day call to your provider.' };
  }
  return null;
}

export default function PregnancyLogTracker({ userId }: { userId: string | null }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [history,  setHistory]  = useState<PregnancyLog[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [expanded, toggleExpanded] = useCollapsed('pregnancy_log_collapsed');

  const [weight,   setWeight]   = useState('');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [notes,    setNotes]    = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await (supabase.from('mom_pregnancy_logs') as any)
      .select('*').eq('user_id', userId)
      .gte('logged_date', daysAgo(13))
      .order('logged_date', { ascending: false });
    setHistory(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const todayLog = useMemo(() => history.find(h => h.logged_date === todayStr()), [history]);

  function toggleSymptom(sym: string) {
    setSymptoms(prev => prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]);
  }

  function openEditor() {
    setWeight(todayLog?.weight_lbs != null ? String(todayLog.weight_lbs) : '');
    setSymptoms(todayLog?.symptoms ?? []);
    setNotes(todayLog?.notes ?? '');
    setEditing(true);
  }

  async function save() {
    if (!userId) return;
    setSaving(true);
    const payload = {
      user_id: userId,
      logged_date: todayStr(),
      weight_lbs: weight.trim() ? parseFloat(weight) : null,
      symptoms,
      notes: notes.trim() || null,
    };
    if (todayLog) {
      await safeUpdate('mom_pregnancy_logs', todayLog.id, payload);
    } else {
      await safeInsert('mom_pregnancy_logs', payload);
    }
    setSaving(false);
    setEditing(false);
    load();
  }

  async function deleteEntry(id: string) {
    await safeDelete('mom_pregnancy_logs', id);
    setHistory(prev => prev.filter(h => h.id !== id));
  }

  const redFlag = todayLog ? detectRedFlag(todayLog.symptoms) : null;

  if (loading) return <ActivityIndicator color={c.primary} style={{ margin: 24 }} />;

  return (
    <View style={s.wrap}>
      <TrackerHeader
        emoji="📝" title="Symptoms & Weight"
        subtitle={todayLog ? `Logged today · ${todayLog.symptoms.length} symptom${todayLog.symptoms.length === 1 ? '' : 's'}` : 'Not logged today'}
        collapsed={!expanded} onToggle={toggleExpanded}
        accentBg={c.cardHoney} accentColor={c.honey}
      />

      {expanded && (
        <View style={s.body}>
          {redFlag && (
            <View style={s.flagBanner}>
              <Text style={s.flagText}>⚠️ {redFlag.text}</Text>
            </View>
          )}

          {!editing ? (
            <TouchableOpacity style={s.logBtn} onPress={openEditor} activeOpacity={0.85}
              accessibilityRole="button" accessibilityLabel={todayLog ? 'Edit today\'s log' : 'Log today'}>
              <Text style={s.logBtnText}>{todayLog ? "Edit Today's Log" : '+ Log Today'}</Text>
            </TouchableOpacity>
          ) : (
            <View>
              <Text style={s.formLabel}>Weight (lbs) <Text style={s.optional}>(optional)</Text></Text>
              <TextInput
                style={s.weightInput}
                placeholder="e.g. 148"
                placeholderTextColor={c.textMuted}
                keyboardType="decimal-pad"
                value={weight}
                onChangeText={setWeight}
                accessibilityLabel="Weight in pounds"
              />

              <Text style={s.formLabel}>Symptoms</Text>
              <View style={s.chipGrid}>
                {SYMPTOMS.map(sym => (
                  <TouchableOpacity
                    key={sym}
                    style={[s.chip, symptoms.includes(sym) && s.chipActive]}
                    onPress={() => toggleSymptom(sym)}
                    accessibilityRole="button" accessibilityLabel={sym}
                  >
                    <Text style={[s.chipText, symptoms.includes(sym) && { color: c.lavender, fontWeight: '700' }]}>{sym}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>Notes <Text style={s.optional}>(optional)</Text></Text>
              <TextInput style={s.notesInput} placeholder="Anything else to remember?"
                placeholderTextColor={c.textMuted} value={notes} onChangeText={setNotes} maxLength={300} multiline />

              <View style={s.btnRow}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setEditing(false)}
                  accessibilityRole="button" accessibilityLabel="Cancel">
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}
                  accessibilityRole="button" accessibilityLabel="Save log">
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {history.length > 0 && (
            <View style={s.histWrap}>
              <Text style={s.histTitle}>Recent days</Text>
              {history.map(h => (
                <View key={h.id} style={s.entryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.entryName}>{fmtShort(h.logged_date)}</Text>
                    <Text style={s.histMeta}>
                      {h.weight_lbs != null ? `${h.weight_lbs} lbs` : ''}
                      {h.symptoms.length > 0 ? `${h.weight_lbs != null ? ' · ' : ''}${h.symptoms.join(', ')}` : ''}
                      {h.weight_lbs == null && h.symptoms.length === 0 ? 'No symptoms' : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => deleteEntry(h.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button" accessibilityLabel="Delete entry">
                    <Text style={[s.entryAction, { color: c.textMuted }]}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    wrap: { marginBottom: 16 },
    body: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1.5, borderColor: c.separator, padding: 16, marginTop: 14 },

    flagBanner: { backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#FDE68A' },
    flagText: { fontSize: 12, fontWeight: '600', color: '#92400E', lineHeight: 17 },

    logBtn: { backgroundColor: c.cardHoney, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: c.honey },
    logBtnText: { fontSize: 14, fontWeight: '700', color: c.honey },

    formLabel: { fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 8, marginTop: 14 },
    optional:  { fontWeight: '400', color: c.textMuted },

    weightInput: { backgroundColor: c.bg, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, padding: 12, fontSize: 16, color: c.textPrimary, width: 120 },

    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip:      { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    chipActive:{ backgroundColor: c.cardLavender, borderColor: c.lavender },
    chipText:  { fontSize: 12, color: c.textSecondary },

    notesInput:{ backgroundColor: c.bg, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, padding: 12, fontSize: 14, color: c.textPrimary, marginBottom: 4, minHeight: 60, textAlignVertical: 'top' },

    btnRow:    { flexDirection: 'row', gap: 10, marginTop: 16 },
    cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator },
    cancelBtnText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    saveBtn:   { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: c.honey },
    saveBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

    entryRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.separator },
    entryName: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    entryAction: { fontSize: 15, paddingHorizontal: 2 },

    histWrap:  { marginTop: 16 },
    histTitle: { fontSize: 12, fontWeight: '700', color: c.textMuted, marginBottom: 4 },
    histMeta:  { fontSize: 11, color: c.textMuted, marginTop: 1 },
  });
}
