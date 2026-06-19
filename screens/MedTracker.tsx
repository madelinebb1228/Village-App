import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors, useColors } from '../lib/theme';
import { supabase } from '../lib/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────

const FREQ_OPTS = [
  { value: 'daily',       label: 'Daily'        },
  { value: 'twice_daily', label: 'Twice Daily'  },
  { value: 'as_needed',   label: 'As Needed'    },
  { value: 'weekly',      label: 'Weekly'       },
];

const MED_COLORS = [
  { value: 'lavender', bg: '#DDD6FE', border: '#7C3AED' },
  { value: 'sage',     bg: '#A7F3D0', border: '#059669' },
  { value: 'honey',    bg: '#FDE68A', border: '#D97706' },
  { value: 'blush',    bg: '#FBCFE8', border: '#DB2777' },
  { value: 'blue',     bg: '#BFDBFE', border: '#2563EB' },
];

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Medication {
  id: string;
  name: string;
  dose: string | null;
  frequency: string | null;
  color: string;
  active: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MedTracker({ userId }: { userId: string | null }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [meds,      setMeds]      = useState<Medication[]>([]);
  const [takenToday,setTakenToday]= useState<Set<string>>(new Set()); // med_ids taken today
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState(false);
  const [adding,    setAdding]    = useState(false);
  const [saving,    setSaving]    = useState(false);

  const [medName,  setMedName]  = useState('');
  const [medDose,  setMedDose]  = useState('');
  const [medFreq,  setMedFreq]  = useState('daily');
  const [medColor, setMedColor] = useState('lavender');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [medsRes, logsRes] = await Promise.all([
      (supabase.from('mom_medications') as any)
        .select('*').eq('user_id', userId).eq('active', true).order('created_at'),
      (supabase.from('mom_medication_logs') as any)
        .select('med_id').eq('user_id', userId).gte('taken_at', todayStart()),
    ]);
    setMeds(medsRes.data ?? []);
    setTakenToday(new Set((logsRes.data ?? []).map((r: any) => r.med_id as string)));
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function toggleTaken(med: Medication) {
    if (!userId) return;
    if (takenToday.has(med.id)) {
      // Remove most recent log for this med today
      const { data } = await (supabase.from('mom_medication_logs') as any)
        .select('id').eq('med_id', med.id).eq('user_id', userId)
        .gte('taken_at', todayStart()).order('taken_at', { ascending: false }).limit(1).maybeSingle();
      if (data) await (supabase.from('mom_medication_logs') as any).delete().eq('id', data.id);
      setTakenToday(prev => { const n = new Set(prev); n.delete(med.id); return n; });
    } else {
      await (supabase.from('mom_medication_logs') as any).insert({ med_id: med.id, user_id: userId });
      setTakenToday(prev => new Set([...prev, med.id]));
    }
  }

  async function addMed() {
    if (!userId || !medName.trim()) return;
    setSaving(true);
    await (supabase.from('mom_medications') as any).insert({
      user_id: userId, name: medName.trim(),
      dose: medDose.trim() || null, frequency: medFreq, color: medColor,
    });
    setSaving(false);
    setAdding(false);
    setMedName(''); setMedDose(''); setMedFreq('daily'); setMedColor('lavender');
    load();
  }

  async function archiveMed(id: string) {
    Alert.alert('Remove medication?', 'This will hide it from your daily list.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await (supabase.from('mom_medications') as any).update({ active: false }).eq('id', id);
        load();
      }},
    ]);
  }

  const takenCount = meds.filter(m => takenToday.has(m.id)).length;

  if (loading) return <ActivityIndicator color={c.primary} style={{ margin: 24 }} />;

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.header} onPress={() => setExpanded(p => !p)} activeOpacity={0.8}>
        <View style={s.headerLeft}>
          <Text style={s.headerEmoji}>💊</Text>
          <View>
            <Text style={s.headerTitle}>Meds & Supplements</Text>
            <Text style={s.headerSub}>
              {meds.length > 0 ? `${takenCount}/${meds.length} taken today` : 'Track your daily meds'}
            </Text>
          </View>
        </View>
        <Text style={s.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={s.body}>
          {/* Daily checklist */}
          {meds.map(med => {
            const palatte = MED_COLORS.find(mc => mc.value === med.color) ?? MED_COLORS[0];
            const taken = takenToday.has(med.id);
            return (
              <View key={med.id} style={s.medRow}>
                <TouchableOpacity
                  style={[s.checkbox, taken && { backgroundColor: palatte.border, borderColor: palatte.border }]}
                  onPress={() => toggleTaken(med)}
                >
                  {taken && <Text style={s.checkmark}>✓</Text>}
                </TouchableOpacity>
                <View style={[s.medPill, { backgroundColor: palatte.bg, borderColor: palatte.border }]}>
                  <Text style={[s.medName, { color: palatte.border }]}>{med.name}</Text>
                  {med.dose ? <Text style={[s.medDose, { color: palatte.border + 'AA' }]}>{med.dose}</Text> : null}
                </View>
                {med.frequency ? <Text style={s.medFreq}>{FREQ_OPTS.find(f => f.value === med.frequency)?.label}</Text> : null}
                <TouchableOpacity onPress={() => archiveMed(med.id)} style={{ padding: 4 }}>
                  <Text style={s.removeBtn}>×</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {!adding ? (
            <TouchableOpacity style={s.addBtn} onPress={() => setAdding(true)}>
              <Text style={s.addBtnText}>+ Add Medication or Supplement</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.form}>
              <Text style={s.formLabel}>Name</Text>
              <TextInput style={s.input} placeholder="e.g. Prenatal vitamin, Iron, Stool softener"
                placeholderTextColor={c.textMuted} value={medName} onChangeText={setMedName} />

              <Text style={s.formLabel}>Dose <Text style={s.optional}>(optional)</Text></Text>
              <TextInput style={s.input} placeholder="e.g. 1 tablet, 65mg"
                placeholderTextColor={c.textMuted} value={medDose} onChangeText={setMedDose} />

              <Text style={s.formLabel}>Frequency</Text>
              <View style={s.chipRow}>
                {FREQ_OPTS.map(f => (
                  <TouchableOpacity key={f.value}
                    style={[s.chip, medFreq === f.value && { backgroundColor: c.cardSage, borderColor: c.sage }]}
                    onPress={() => setMedFreq(f.value)}>
                    <Text style={[s.chipText, medFreq === f.value && { color: c.sage, fontWeight: '700' }]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>Color</Text>
              <View style={s.colorRow}>
                {MED_COLORS.map(mc => (
                  <TouchableOpacity key={mc.value}
                    style={[s.colorDot, { backgroundColor: mc.bg, borderColor: mc.border }, medColor === mc.value && { borderWidth: 3 }]}
                    onPress={() => setMedColor(mc.value)} />
                ))}
              </View>

              <View style={s.btnRow}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setAdding(false)}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.saveBtn, !medName.trim() && { opacity: 0.45 }]}
                  onPress={addMed} disabled={!medName.trim() || saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Add</Text>}
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
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderLeftWidth: 4, borderLeftColor: '#059669' },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerEmoji: { fontSize: 28 },
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    headerSub:   { fontSize: 12, color: c.textMuted, marginTop: 2 },
    chevron:     { fontSize: 12, color: c.textMuted },
    body:        { padding: 16, borderTopWidth: 1, borderTopColor: c.separator },

    medRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    checkbox:  { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: c.separator, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
    checkmark: { fontSize: 14, color: '#fff', fontWeight: '800' },
    medPill:   { flex: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5 },
    medName:   { fontSize: 14, fontWeight: '700' },
    medDose:   { fontSize: 11, marginTop: 1 },
    medFreq:   { fontSize: 11, color: c.textMuted, width: 70 },
    removeBtn: { fontSize: 18, color: c.textMuted, lineHeight: 22 },

    addBtn:    { backgroundColor: c.cardSage, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8, borderWidth: 1.5, borderColor: '#A7F3D0' },
    addBtnText:{ fontSize: 14, fontWeight: '700', color: c.sage },

    form:     { marginTop: 8 },
    formLabel:{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 8, marginTop: 14 },
    optional: { fontWeight: '400', color: c.textMuted },
    input:    { backgroundColor: c.bg, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, padding: 12, fontSize: 14, color: c.textPrimary, marginBottom: 4 },
    chipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip:     { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    chipText: { fontSize: 12, color: c.textSecondary },
    colorRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
    colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2 },

    btnRow:    { flexDirection: 'row', gap: 10, marginTop: 16 },
    cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator },
    cancelBtnText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    saveBtn:   { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: c.sage },
    saveBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  });
}
