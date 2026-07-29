import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Colors, useColors } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { safeInsert, safeUpdate, safeDelete } from '../lib/syncService';

// ─── Constants ────────────────────────────────────────────────────────────────

const LOCHIA_OPTS  = ['none','spotting','light','moderate','heavy'];
const INCISION_OPTS = [
  { value: 'na',            label: 'N/A' },
  { value: 'healing',       label: '✅ Healing well' },
  { value: 'some_redness',  label: '⚠️ Some redness' },
  { value: 'concerning',    label: '🚨 Concerning' },
];
const PF_SYMPTOMS  = ['Leaking','Pressure','Pain','Tightness','Muscle weakness'];
const OTHER_SYMPTOMS = ['Headache','Fever','Swelling','Fatigue','Hair loss','Night sweats','Constipation'];

const SW = Dimensions.get('window').width;

function todayStr() { return new Date().toISOString().slice(0, 10); }

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmtShort(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface RecoveryLog {
  id: string;
  logged_date: string;
  pain_level: number | null;
  lochia: string | null;
  incision_status: string | null;
  pf_symptoms: string[];
  breast_pain: number | null;
  other_symptoms: string[];
  notes: string | null;
}

// ─── Red-flag detection ───────────────────────────────────────────────────────
// Rule-based, most-urgent-first. Not a diagnosis — just a nudge to call a provider.

interface RedFlag { level: 'urgent' | 'warn'; icon: string; text: string; }

function detectRedFlag(log: Pick<RecoveryLog, 'lochia' | 'incision_status' | 'other_symptoms' | 'pain_level'>): RedFlag | null {
  const hasFever = (log.other_symptoms ?? []).includes('Fever');

  if (log.lochia === 'heavy') {
    return {
      level: 'urgent', icon: '🩸',
      text: 'Heavy bleeding today. Soaking a pad in under an hour, passing clots larger than a golf ball, or feeling dizzy can signal postpartum hemorrhage — contact your provider or go to the ER now.',
    };
  }
  if (log.pain_level != null && log.pain_level >= 8) {
    return {
      level: 'urgent', icon: '⚠️',
      text: `Pain at ${log.pain_level}/10 is significant. If it's new, worsening, or not relieved by your usual pain control, contact your provider today.`,
    };
  }
  if (log.incision_status === 'concerning' && hasFever) {
    return {
      level: 'urgent', icon: '🌡️',
      text: 'Fever along with incision changes (redness, swelling, drainage) can indicate infection — contact your provider today.',
    };
  }
  if (log.incision_status === 'concerning') {
    return {
      level: 'warn', icon: '⚠️',
      text: 'Keep an eye on your incision or perineum. Worsening redness, swelling, warmth, or drainage should be checked by your provider.',
    };
  }
  if (hasFever) {
    return {
      level: 'warn', icon: '🌡️',
      text: 'A fever this postpartum is worth a same-day call to your provider, even without other symptoms.',
    };
  }
  return null;
}

export default function PostpartumRecoveryTracker({
  userId, babyBirthDate,
}: {
  userId: string | null;
  babyBirthDate?: string | null;
}) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const chartWidth = Platform.OS === 'web' ? Math.min(SW - 96, 480) : SW - 96;

  const [history,  setHistory]  = useState<RecoveryLog[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [expanded, setExpanded] = useState(false);

  const [pain,       setPain]       = useState(0);
  const [lochia,     setLochia]     = useState('none');
  const [incision,   setIncision]   = useState('na');
  const [pfSyms,     setPfSyms]     = useState<string[]>([]);
  const [breastPain, setBreastPain] = useState(0);
  const [otherSyms,  setOtherSyms]  = useState<string[]>([]);
  const [notes,      setNotes]      = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await (supabase.from('mom_recovery_logs') as any)
      .select('*').eq('user_id', userId)
      .gte('logged_date', daysAgo(13))
      .order('logged_date', { ascending: false });
    setHistory(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const todayLog = useMemo(() => history.find(l => l.logged_date === todayStr()) ?? null, [history]);
  const pastLogs = useMemo(() => history.filter(l => l.logged_date !== todayStr()), [history]);

  const daysPostpartum = useMemo(() => {
    if (!babyBirthDate) return null;
    const diff = Math.floor((Date.now() - new Date(babyBirthDate).getTime()) / 86_400_000) + 1;
    return diff >= 1 ? diff : null;
  }, [babyBirthDate]);

  const todayFlag = todayLog ? detectRedFlag(todayLog) : null;

  const chartLogs = useMemo(
    () => [...history].filter(l => l.pain_level != null).sort((a, b) => a.logged_date.localeCompare(b.logged_date)),
    [history],
  );

  function startEdit(existing?: RecoveryLog | null) {
    setPain(existing?.pain_level ?? 0);
    setLochia(existing?.lochia ?? 'none');
    setIncision(existing?.incision_status ?? 'na');
    setPfSyms(existing?.pf_symptoms ?? []);
    setBreastPain(existing?.breast_pain ?? 0);
    setOtherSyms(existing?.other_symptoms ?? []);
    setNotes(existing?.notes ?? '');
    setEditing(true);
  }

  function toggle<T>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
  }

  async function save() {
    if (!userId) return;
    setSaving(true);
    const payload = {
      user_id: userId, logged_date: todayStr(),
      pain_level: pain, lochia, incision_status: incision,
      pf_symptoms: pfSyms, breast_pain: breastPain,
      other_symptoms: otherSyms, notes: notes.trim() || null,
    };
    if (todayLog) {
      await safeUpdate('mom_recovery_logs', todayLog.id, payload);
    } else {
      await safeInsert('mom_recovery_logs', payload);
    }
    setSaving(false);
    setEditing(false);
    load();
  }

  async function deleteEntry(id: string) {
    await safeDelete('mom_recovery_logs', id);
    setHistory(prev => prev.filter(l => l.id !== id));
  }

  const PAIN_COLORS = ['#6B7280','#6B7280','#D97706','#D97706','#EA580C','#EA580C','#DC2626','#DC2626','#B91C1C','#B91C1C','#7F1D1D'];

  if (loading) return <ActivityIndicator color={c.primary} style={{ margin: 24 }} />;

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.header} onPress={() => setExpanded(p => !p)} activeOpacity={0.8}>
        <View style={s.headerLeft}>
          <Text style={s.headerEmoji}>🌸</Text>
          <View>
            <Text style={s.headerTitle}>Postpartum Recovery</Text>
            <Text style={s.headerSub}>
              {daysPostpartum != null ? `Day ${daysPostpartum} · ` : ''}
              {todayLog ? `Pain ${todayLog.pain_level ?? 0}/10 · ${todayLog.lochia ?? '—'} flow` : 'Log how you\'re healing'}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {todayFlag && <Text style={s.flagDot}>●</Text>}
          <Text style={s.chevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={s.body}>
          {!editing ? (
            <>
              {todayFlag && (
                <View style={[s.flagBanner, todayFlag.level === 'urgent' ? s.flagBannerUrgent : s.flagBannerWarn]}>
                  <Text style={s.flagBannerIcon}>{todayFlag.icon}</Text>
                  <Text style={[s.flagBannerText, todayFlag.level === 'urgent' && s.flagBannerTextUrgent]}>
                    {todayFlag.text}
                  </Text>
                </View>
              )}

              {todayLog ? (
                <View style={s.summaryCard}>
                  <Text style={s.summaryTitle}>Today's check-in</Text>
                  <View style={s.summaryRow}>
                    <View style={s.summaryItem}>
                      <Text style={[s.summaryNum, { color: PAIN_COLORS[todayLog.pain_level ?? 0] }]}>
                        {todayLog.pain_level ?? 0}/10
                      </Text>
                      <Text style={s.summaryLbl}>Pain</Text>
                    </View>
                    <View style={s.summaryDivider} />
                    <View style={s.summaryItem}>
                      <Text style={s.summaryNum}>{todayLog.lochia ?? '—'}</Text>
                      <Text style={s.summaryLbl}>Lochia</Text>
                    </View>
                    {todayLog.incision_status !== 'na' && (
                      <>
                        <View style={s.summaryDivider} />
                        <View style={s.summaryItem}>
                          <Text style={s.summaryNum}>{INCISION_OPTS.find(i => i.value === todayLog.incision_status)?.label}</Text>
                          <Text style={s.summaryLbl}>Incision</Text>
                        </View>
                      </>
                    )}
                  </View>
                  {(todayLog.pf_symptoms?.length > 0 || todayLog.other_symptoms?.length > 0) && (
                    <Text style={s.summaryTags}>
                      {[...(todayLog.pf_symptoms ?? []), ...(todayLog.other_symptoms ?? [])].join(' · ')}
                    </Text>
                  )}
                  <TouchableOpacity style={s.editBtn} onPress={() => startEdit(todayLog)}>
                    <Text style={s.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={s.logBtn} onPress={() => startEdit()}>
                  <Text style={s.logBtnText}>🌸  Log Today's Recovery</Text>
                </TouchableOpacity>
              )}

              {/* Pain trend */}
              {chartLogs.length >= 2 ? (
                <View style={{ marginTop: 16 }}>
                  <Text style={s.chartLabel}>PAIN TREND (14 DAYS)</Text>
                  <LineChart
                    data={{
                      labels: chartLogs.map(l => fmtShort(l.logged_date)),
                      datasets: [{ data: chartLogs.map(l => l.pain_level ?? 0), color: () => '#DB2777', strokeWidth: 2.5 }],
                    }}
                    width={chartWidth}
                    height={140}
                    fromZero
                    segments={4}
                    chartConfig={{
                      backgroundColor: c.card,
                      backgroundGradientFrom: c.card,
                      backgroundGradientTo: c.card,
                      decimalPlaces: 0,
                      color: (opacity = 1) => `rgba(219,39,119,${opacity})`,
                      labelColor: () => c.textMuted,
                      propsForDots: { r: '3.5', strokeWidth: '2' },
                    }}
                    bezier
                    style={{ borderRadius: 14 }}
                    withInnerLines={false}
                    withOuterLines={false}
                  />
                </View>
              ) : null}

              {/* History */}
              {pastLogs.length > 0 && (
                <View style={s.histWrap}>
                  <Text style={s.histTitle}>Recent check-ins</Text>
                  {pastLogs.map(log => {
                    const flag = detectRedFlag(log);
                    return (
                      <View key={log.id} style={s.histRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.histDate}>
                            {fmtShort(log.logged_date)}{flag ? `  ${flag.icon}` : ''}
                          </Text>
                          <Text style={s.histMeta}>
                            Pain {log.pain_level ?? 0}/10 · {log.lochia ?? '—'} flow
                            {log.incision_status && log.incision_status !== 'na' ? ` · ${INCISION_OPTS.find(i => i.value === log.incision_status)?.label}` : ''}
                          </Text>
                          {(log.pf_symptoms?.length > 0 || log.other_symptoms?.length > 0) && (
                            <Text style={s.histTags}>{[...(log.pf_symptoms ?? []), ...(log.other_symptoms ?? [])].join(' · ')}</Text>
                          )}
                        </View>
                        <TouchableOpacity onPress={() => deleteEntry(log.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={s.histDelete}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          ) : (
            <View>
              {/* Pain level */}
              <Text style={s.formLabel}>Overall pain (0 = none)</Text>
              <View style={s.painRow}>
                {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[s.painBtn, pain === n && { backgroundColor: PAIN_COLORS[n], borderColor: PAIN_COLORS[n] }]}
                    onPress={() => setPain(n)}
                  >
                    <Text style={[s.painBtnText, pain === n && { color: '#fff', fontWeight: '800' }]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Lochia */}
              <Text style={s.formLabel}>Lochia / bleeding</Text>
              <View style={s.chipRow}>
                {LOCHIA_OPTS.map(l => (
                  <TouchableOpacity key={l} style={[s.chip, lochia === l && s.chipActive]} onPress={() => setLochia(l)}>
                    <Text style={[s.chipText, lochia === l && s.chipTextActive]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Incision */}
              <Text style={s.formLabel}>Incision / perineum</Text>
              <View style={s.chipRow}>
                {INCISION_OPTS.map(i => (
                  <TouchableOpacity key={i.value} style={[s.chip, incision === i.value && s.chipActive]} onPress={() => setIncision(i.value)}>
                    <Text style={[s.chipText, incision === i.value && s.chipTextActive]}>{i.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Pelvic floor */}
              <Text style={s.formLabel}>Pelvic floor <Text style={s.optional}>(pick any)</Text></Text>
              <View style={s.chipRow}>
                {PF_SYMPTOMS.map(sym => (
                  <TouchableOpacity key={sym} style={[s.chip, pfSyms.includes(sym) && s.chipActive]} onPress={() => setPfSyms(toggle(pfSyms, sym))}>
                    <Text style={[s.chipText, pfSyms.includes(sym) && s.chipTextActive]}>{sym}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Breast pain */}
              <Text style={s.formLabel}>Breast/nipple pain (0 = none)</Text>
              <View style={s.chipRow}>
                {[0,1,2,3,4,5].map(n => (
                  <TouchableOpacity key={n}
                    style={[s.smallChip, breastPain === n && { backgroundColor: '#FBCFE8', borderColor: '#DB2777' }]}
                    onPress={() => setBreastPain(n)}>
                    <Text style={[s.smallChipText, breastPain === n && { color: '#DB2777', fontWeight: '700' }]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Other symptoms */}
              <Text style={s.formLabel}>Other symptoms <Text style={s.optional}>(pick any)</Text></Text>
              <View style={s.chipRow}>
                {OTHER_SYMPTOMS.map(sym => (
                  <TouchableOpacity key={sym} style={[s.chip, otherSyms.includes(sym) && s.chipActive]} onPress={() => setOtherSyms(toggle(otherSyms, sym))}>
                    <Text style={[s.chipText, otherSyms.includes(sym) && s.chipTextActive]}>{sym}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Notes */}
              <Text style={s.formLabel}>Notes <Text style={s.optional}>(optional)</Text></Text>
              <TextInput style={s.notesInput} placeholder="Anything else worth noting..."
                placeholderTextColor={c.textMuted} value={notes} onChangeText={setNotes}
                multiline maxLength={300} textAlignVertical="top" />

              <View style={s.btnRow}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setEditing(false)}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Save</Text>}
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
    wrap: { backgroundColor: c.card, borderRadius: 16, marginBottom: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: c.separator },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderLeftWidth: 4, borderLeftColor: '#DB2777' },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerEmoji: { fontSize: 28 },
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    headerSub:   { fontSize: 12, color: c.textMuted, marginTop: 2 },
    chevron:     { fontSize: 12, color: c.textMuted },
    flagDot:     { fontSize: 10, color: '#DC2626' },
    body:        { padding: 16, borderTopWidth: 1, borderTopColor: c.separator },

    flagBanner: { flexDirection: 'row', gap: 10, borderRadius: 12, padding: 12, marginBottom: 12, alignItems: 'flex-start' },
    flagBannerWarn:   { backgroundColor: c.cardHoney, borderWidth: 1.5, borderColor: c.honey },
    flagBannerUrgent: { backgroundColor: '#FEE2E2', borderWidth: 1.5, borderColor: '#DC2626' },
    flagBannerIcon:   { fontSize: 18 },
    flagBannerText:   { flex: 1, fontSize: 12.5, color: c.textPrimary, lineHeight: 18, fontWeight: '600' },
    flagBannerTextUrgent: { color: '#7F1D1D' },

    summaryCard:  { backgroundColor: c.cardBlush, borderRadius: 12, padding: 14, marginBottom: 12 },
    summaryTitle: { fontSize: 11, fontWeight: '700', color: '#831843', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
    summaryRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    summaryItem:  { flex: 1, alignItems: 'center' },
    summaryNum:   { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    summaryLbl:   { fontSize: 10, color: c.textMuted, marginTop: 2 },
    summaryDivider: { width: 1, height: 28, backgroundColor: '#FBCFE8' },
    summaryTags:  { fontSize: 12, color: '#831843', marginBottom: 8 },
    editBtn:      { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, borderWidth: 1.5, borderColor: '#DB2777' },
    editBtnText:  { fontSize: 12, fontWeight: '700', color: '#DB2777' },

    logBtn:     { backgroundColor: c.cardBlush, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 8, borderWidth: 1.5, borderColor: '#FBCFE8' },
    logBtnText: { fontSize: 15, fontWeight: '700', color: '#831843' },

    chartLabel: { fontSize: 11, color: c.textMuted, fontWeight: '600', marginBottom: 6 },

    histWrap:  { marginTop: 16 },
    histTitle: { fontSize: 12, fontWeight: '700', color: c.textMuted, marginBottom: 8 },
    histRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.separator },
    histDate:  { fontSize: 13, fontWeight: '700', color: c.textPrimary, marginBottom: 2 },
    histMeta:  { fontSize: 12, color: c.textSecondary },
    histTags:  { fontSize: 12, color: c.textMuted, marginTop: 2 },
    histDelete:{ fontSize: 15, color: c.textMuted, paddingHorizontal: 2 },

    formLabel: { fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 8, marginTop: 14 },
    optional:  { fontWeight: '400', color: c.textMuted },

    painRow:    { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
    painBtn:    { minWidth: 34, paddingHorizontal: 6, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: c.separator, alignItems: 'center', backgroundColor: c.bg },
    painBtnText:{ fontSize: 13, color: c.textSecondary },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    chip:      { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    chipActive: { backgroundColor: c.cardBlush, borderColor: '#DB2777' },
    chipText:  { fontSize: 12, color: c.textSecondary },
    chipTextActive: { color: '#DB2777', fontWeight: '700' },

    smallChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    smallChipText: { fontSize: 13, color: c.textSecondary },

    notesInput: { backgroundColor: c.bg, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, padding: 12, fontSize: 14, color: c.textPrimary, minHeight: 70, marginBottom: 16 },
    btnRow:    { flexDirection: 'row', gap: 10 },
    cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator },
    cancelBtnText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    saveBtn:   { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#DB2777' },
    saveBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  });
}
