import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors, useColors } from '../lib/theme';
import TrackerHeader from '../components/TrackerHeader';
import { useCollapsed } from '../lib/useCollapsed';
import { supabase } from '../lib/supabase';
import { safeInsert, safeUpdate, safeDelete } from '../lib/syncService';
import { computeCycleStats } from '../lib/cycleUtils';

// ─── Constants ────────────────────────────────────────────────────────────────

const FLOW_OPTS = [
  { value: 'none',     label: '⚪ None',     color: '#6B7280' },
  { value: 'spotting', label: '🩸 Spotting', color: '#DB2777' },
  { value: 'light',    label: '🩸 Light',    color: '#DC2626' },
  { value: 'moderate', label: '🩸 Moderate', color: '#B91C1C' },
  { value: 'heavy',    label: '🩸 Heavy',    color: '#7F1D1D' },
];

const SYMPTOMS = ['Cramping','Bloating','Breast tenderness','Mood swings','Headache','Fatigue','Back pain','Spotting only'];

function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface PeriodLog {
  id: string;
  logged_date: string;
  flow_level: string | null;
  symptoms: string[];
  notes: string | null;
}

export default function PeriodReturnTracker({ userId }: { userId: string | null }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [logs,     setLogs]     = useState<PeriodLog[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [adding,   setAdding]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [expanded, toggleExpanded] = useCollapsed('period_return_collapsed');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [flow,     setFlow]     = useState('spotting');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [notes,    setNotes]    = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await (supabase.from('mom_period_logs') as any)
      .select('*').eq('user_id', userId)
      .gte('logged_date', daysAgo(180))
      .order('logged_date', { ascending: false });
    setLogs(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  function openEditor(existing?: PeriodLog) {
    setEditingId(existing?.id ?? null);
    setFlow(existing?.flow_level ?? 'spotting');
    setSymptoms(existing?.symptoms ?? []);
    setNotes(existing?.notes ?? '');
    setAdding(true);
  }

  async function save() {
    if (!userId) return;
    setSaving(true);
    const payload = { flow_level: flow, symptoms, notes: notes.trim() || null };
    if (editingId) {
      await safeUpdate('mom_period_logs', editingId, payload);
    } else {
      await safeInsert('mom_period_logs', { user_id: userId, logged_date: todayStr(), ...payload });
    }
    setSaving(false);
    setAdding(false);
    setEditingId(null);
    setFlow('spotting'); setSymptoms([]); setNotes('');
    load();
  }

  async function deleteEntry(id: string) {
    await safeDelete('mom_period_logs', id);
    setLogs(prev => prev.filter(l => l.id !== id));
  }

  function toggleSym(sym: string) {
    setSymptoms(prev => prev.includes(sym) ? prev.filter(x => x !== sym) : [...prev, sym]);
  }

  const todayLog  = logs.find(l => l.logged_date === todayStr());
  const lastEntry = logs[0];
  const hasReturned = logs.length > 0;

  const cycle = useMemo(() => computeCycleStats(logs), [logs]);

  if (loading) return <ActivityIndicator color={c.primary} style={{ margin: 24 }} />;

  return (
    <View style={s.wrap}>
      <TrackerHeader
        emoji="🩸" title="Period Return"
        subtitle={hasReturned
          ? `Last logged: ${fmtDate(lastEntry.logged_date)} · ${lastEntry.flow_level}`
          : 'Track when your cycle returns'}
        collapsed={!expanded} onToggle={toggleExpanded}
        accentBg={c.cardHoney} accentColor={c.honey}
      />

      {expanded && (
        <View style={s.body}>
          {!hasReturned && !adding && (
            <View style={s.infoCard}>
              <Text style={s.infoText}>
                Postpartum periods can return anywhere from 6 weeks to 18 months. Start logging when you notice spotting or flow.
              </Text>
            </View>
          )}

          {/* Cycle prediction */}
          {hasReturned && !adding && (
            <View style={s.cycleCard}>
              {cycle.avgCycleLength ? (
                <>
                  <Text style={s.cycleLine}>
                    Avg cycle: <Text style={s.cycleBold}>{cycle.avgCycleLength} days</Text>
                    {cycle.cycleDay ? `  ·  Cycle day ${cycle.cycleDay}` : ''}
                  </Text>
                  {cycle.predictedNextStart && (
                    <Text style={s.cycleSub}>
                      Next period expected around {fmtDate(cycle.predictedNextStart)} (postpartum cycles vary — treat this as a rough estimate)
                    </Text>
                  )}
                </>
              ) : (
                <Text style={s.cycleLine}>
                  Tracking your first cycle since return{cycle.cycleDay ? ` · Cycle day ${cycle.cycleDay}` : ''} — predictions appear after your next period.
                </Text>
              )}
            </View>
          )}

          {/* Today's entry */}
          {todayLog && !adding && (
            <View style={s.todayCard}>
              <Text style={s.todayLabel}>Today</Text>
              <Text style={s.todayFlow}>{FLOW_OPTS.find(f => f.value === todayLog.flow_level)?.label ?? todayLog.flow_level}</Text>
              {todayLog.symptoms?.length > 0 && <Text style={s.todaySyms}>{todayLog.symptoms.join(' · ')}</Text>}
            </View>
          )}

          {/* Recent log list */}
          {!adding && logs.slice(0, 10).map(l => (
            <View key={l.id} style={s.logRow}>
              <Text style={s.logDate}>{fmtDate(l.logged_date)}</Text>
              <Text style={[s.logFlow, { color: FLOW_OPTS.find(f => f.value === l.flow_level)?.color ?? c.textPrimary }]}>
                {FLOW_OPTS.find(f => f.value === l.flow_level)?.label ?? l.flow_level}
              </Text>
              {l.symptoms?.length > 0 && <Text style={s.logSyms} numberOfLines={1}>{l.symptoms.join(', ')}</Text>}
              <TouchableOpacity onPress={() => openEditor(l)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button" accessibilityLabel="Edit period log">
                <Text style={s.logAction}>✎</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteEntry(l.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button" accessibilityLabel="Delete period log">
                <Text style={[s.logAction, { color: c.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {!adding ? (
            <TouchableOpacity style={s.logBtn} onPress={() => openEditor(todayLog)}
              accessibilityRole="button" accessibilityLabel={todayLog ? 'Update today' : 'Log today'}>
              <Text style={s.logBtnText}>{todayLog ? '✏️ Update Today' : '+ Log Today'}</Text>
            </TouchableOpacity>
          ) : (
            <View>
              <Text style={s.formLabel}>Flow level</Text>
              <View style={s.flowRow}>
                {FLOW_OPTS.map(f => (
                  <TouchableOpacity key={f.value}
                    style={[s.flowBtn, flow === f.value && { backgroundColor: f.color + '22', borderColor: f.color }]}
                    onPress={() => setFlow(f.value)}
                    accessibilityRole="button" accessibilityLabel={f.label}>
                    <Text style={[s.flowBtnText, flow === f.value && { color: f.color, fontWeight: '700' }]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>Symptoms <Text style={s.optional}>(pick any)</Text></Text>
              <View style={s.chipRow}>
                {SYMPTOMS.map(sym => (
                  <TouchableOpacity key={sym}
                    style={[s.chip, symptoms.includes(sym) && { backgroundColor: '#FEE2E2', borderColor: '#DC2626' }]}
                    onPress={() => toggleSym(sym)}
                    accessibilityRole="button" accessibilityLabel={sym}>
                    <Text style={[s.chipText, symptoms.includes(sym) && { color: '#DC2626', fontWeight: '700' }]}>{sym}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>Notes <Text style={s.optional}>(optional)</Text></Text>
              <TextInput style={s.notesInput} placeholder="Anything else..."
                placeholderTextColor={c.textMuted} value={notes} onChangeText={setNotes}
                multiline maxLength={300} textAlignVertical="top" />

              <View style={s.btnRow}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => { setAdding(false); setEditingId(null); }}
                  accessibilityRole="button" accessibilityLabel="Cancel">
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}
                  accessibilityRole="button" accessibilityLabel={editingId ? 'Save changes' : 'Save'}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>{editingId ? 'Save Changes' : 'Save'}</Text>}
                </TouchableOpacity>
              </View>
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

    infoCard:   { backgroundColor: c.cardBlue, borderRadius: 12, padding: 14, marginBottom: 14 },
    infoText:   { fontSize: 13, color: '#1E3A8A', lineHeight: 19 },

    cycleCard: { backgroundColor: c.cardBlush, borderRadius: 12, padding: 14, marginBottom: 12 },
    cycleLine: { fontSize: 13, color: c.textPrimary, fontWeight: '600' },
    cycleBold: { fontWeight: '800', color: '#DC2626' },
    cycleSub:  { fontSize: 12, color: c.textMuted, marginTop: 4, lineHeight: 17 },

    todayCard:  { backgroundColor: '#FEE2E2', borderRadius: 12, padding: 14, marginBottom: 12 },
    todayLabel: { fontSize: 11, fontWeight: '700', color: '#7F1D1D', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
    todayFlow:  { fontSize: 16, fontWeight: '800', color: '#DC2626', marginBottom: 4 },
    todaySyms:  { fontSize: 12, color: '#B91C1C' },

    logRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.separator },
    logDate:   { fontSize: 12, color: c.textMuted, width: 70 },
    logFlow:   { fontSize: 13, fontWeight: '700', width: 90 },
    logSyms:   { flex: 1, fontSize: 11, color: c.textMuted },
    logAction: { fontSize: 15, color: '#DC2626', paddingHorizontal: 2 },

    logBtn:     { backgroundColor: '#FEE2E2', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 12, borderWidth: 1.5, borderColor: '#FECACA' },
    logBtnText: { fontSize: 14, fontWeight: '700', color: '#DC2626' },

    formLabel: { fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 8, marginTop: 14 },
    optional:  { fontWeight: '400', color: c.textMuted },
    flowRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    flowBtn:   { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    flowBtnText: { fontSize: 12, color: c.textSecondary },
    chipRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip:      { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    chipText:  { fontSize: 12, color: c.textSecondary },
    notesInput:{ backgroundColor: c.bg, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, padding: 12, fontSize: 14, color: c.textPrimary, minHeight: 60, marginBottom: 16 },
    btnRow:    { flexDirection: 'row', gap: 10 },
    cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator },
    cancelBtnText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    saveBtn:   { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#DC2626' },
    saveBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  });
}
