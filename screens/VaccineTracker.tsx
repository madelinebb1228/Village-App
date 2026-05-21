import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  TextInput, ActivityIndicator, Platform, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VaccineRecord {
  vaccine_key: string;
  given_date: string | null;
  notes: string | null;
}

interface Appointment {
  id: string;
  title: string;
  doctor_name: string | null;
  scheduled_date: string;
  notes: string | null;
  completed: boolean;
}

// ─── Vaccine schedule (CDC) ───────────────────────────────────────────────────

const VACCINE_SCHEDULE = [
  { key: 'hepb_1',  name: 'Hepatitis B',      dose: '1st dose', ageMonths: 0,  ageLabel: 'Birth' },
  { key: 'hepb_2',  name: 'Hepatitis B',      dose: '2nd dose', ageMonths: 1,  ageLabel: '1–2 months' },
  { key: 'dtap_1',  name: 'DTaP',             dose: '1st dose', ageMonths: 2,  ageLabel: '2 months' },
  { key: 'hib_1',   name: 'Hib',              dose: '1st dose', ageMonths: 2,  ageLabel: '2 months' },
  { key: 'ipv_1',   name: 'Polio (IPV)',       dose: '1st dose', ageMonths: 2,  ageLabel: '2 months' },
  { key: 'pcv_1',   name: 'PCV',              dose: '1st dose', ageMonths: 2,  ageLabel: '2 months' },
  { key: 'rv_1',    name: 'Rotavirus',         dose: '1st dose', ageMonths: 2,  ageLabel: '2 months' },
  { key: 'dtap_2',  name: 'DTaP',             dose: '2nd dose', ageMonths: 4,  ageLabel: '4 months' },
  { key: 'hib_2',   name: 'Hib',              dose: '2nd dose', ageMonths: 4,  ageLabel: '4 months' },
  { key: 'ipv_2',   name: 'Polio (IPV)',       dose: '2nd dose', ageMonths: 4,  ageLabel: '4 months' },
  { key: 'pcv_2',   name: 'PCV',              dose: '2nd dose', ageMonths: 4,  ageLabel: '4 months' },
  { key: 'rv_2',    name: 'Rotavirus',         dose: '2nd dose', ageMonths: 4,  ageLabel: '4 months' },
  { key: 'dtap_3',  name: 'DTaP',             dose: '3rd dose', ageMonths: 6,  ageLabel: '6 months' },
  { key: 'hib_3',   name: 'Hib',              dose: '3rd dose', ageMonths: 6,  ageLabel: '6 months' },
  { key: 'pcv_3',   name: 'PCV',              dose: '3rd dose', ageMonths: 6,  ageLabel: '6 months' },
  { key: 'rv_3',    name: 'Rotavirus',         dose: '3rd dose', ageMonths: 6,  ageLabel: '6 months' },
  { key: 'hepb_3',  name: 'Hepatitis B',      dose: '3rd dose', ageMonths: 6,  ageLabel: '6–18 months' },
  { key: 'ipv_3',   name: 'Polio (IPV)',       dose: '3rd dose', ageMonths: 6,  ageLabel: '6–18 months' },
  { key: 'flu_1',   name: 'Influenza',         dose: 'Annual',   ageMonths: 6,  ageLabel: '6+ months (annual)' },
  { key: 'mmr_1',   name: 'MMR',              dose: '1st dose', ageMonths: 12, ageLabel: '12–15 months' },
  { key: 'var_1',   name: 'Varicella',         dose: '1st dose', ageMonths: 12, ageLabel: '12–15 months' },
  { key: 'hib_4',   name: 'Hib',              dose: '4th dose', ageMonths: 12, ageLabel: '12–15 months' },
  { key: 'pcv_4',   name: 'PCV',              dose: '4th dose', ageMonths: 12, ageLabel: '12–15 months' },
  { key: 'hepa_1',  name: 'Hepatitis A',       dose: '1st dose', ageMonths: 12, ageLabel: '12–23 months' },
  { key: 'hepa_2',  name: 'Hepatitis A',       dose: '2nd dose', ageMonths: 18, ageLabel: '12–23 months' },
  { key: 'dtap_4',  name: 'DTaP',             dose: '4th dose', ageMonths: 15, ageLabel: '15–18 months' },
  { key: 'dtap_5',  name: 'DTaP',             dose: '5th dose', ageMonths: 48, ageLabel: '4–6 years' },
  { key: 'ipv_4',   name: 'Polio (IPV)',       dose: '4th dose', ageMonths: 48, ageLabel: '4–6 years' },
  { key: 'mmr_2',   name: 'MMR',              dose: '2nd dose', ageMonths: 48, ageLabel: '4–6 years' },
  { key: 'var_2',   name: 'Varicella',         dose: '2nd dose', ageMonths: 48, ageLabel: '4–6 years' },
] as const;

type VaccineEntry = typeof VACCINE_SCHEDULE[number];

// Group by ageLabel, preserving order
const AGE_GROUPS: { label: string; vaccines: VaccineEntry[] }[] = [];
for (const v of VACCINE_SCHEDULE) {
  const group = AGE_GROUPS.find(g => g.label === v.ageLabel);
  if (group) group.vaccines.push(v);
  else AGE_GROUPS.push({ label: v.ageLabel, vaccines: [v] });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAgeMonths(birthDate: string): number {
  const now = new Date();
  const dob = new Date(birthDate);
  return (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());
}

function formatDate(iso: string): string {
  // Append noon so UTC→local conversion never crosses a day boundary
  const dateOnly = iso.split('T')[0];
  return new Date(dateOnly + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function parseDate(input: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const m = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = new Date(+m[3], +m[1] - 1, +m[2]);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VaccineTracker({ userId }: { userId: string | null }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<'vaccines' | 'appointments'>('vaccines');
  const [babyId, setBabyId] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [records, setRecords] = useState<VaccineRecord[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Vaccine modal
  const [vaccineTarget, setVaccineTarget] = useState<VaccineEntry | null>(null);
  const [givenDate, setGivenDate] = useState('');
  const [vaccineNotes, setVaccineNotes] = useState('');
  const [savingVaccine, setSavingVaccine] = useState(false);

  // Appointment modal
  const [apptOpen, setApptOpen] = useState(false);
  const [editApptId, setEditApptId] = useState<string | null>(null);
  const [apptTitle, setApptTitle] = useState('');
  const [apptDoctor, setApptDoctor] = useState('');
  const [apptDate, setApptDate] = useState('');
  const [apptNotes, setApptNotes] = useState('');
  const [savingAppt, setSavingAppt] = useState(false);

  useEffect(() => { if (userId) loadAll(); }, [userId]);

  async function loadAll() {
    if (!userId) return;
    setLoading(true);
    try {
      const { data: baby } = await supabase
        .from('babies').select('id, birth_date')
        .eq('user_id', userId).limit(1).maybeSingle();

      const bid = baby?.id ?? null;
      const bbd = baby?.birth_date ?? null;
      setBabyId(bid);
      setBirthDate(bbd);

      if (bid) {
        const [{ data: vData }, { data: aData }] = await Promise.all([
          supabase.from('vaccine_records').select('vaccine_key,given_date,notes').eq('baby_id', bid),
          supabase.from('pediatric_appointments')
            .select('id,title,doctor_name,scheduled_date,notes,completed')
            .eq('baby_id', bid).order('scheduled_date', { ascending: true }),
        ]);
        setRecords(vData ?? []);
        setAppointments((aData as Appointment[]) ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Vaccine helpers ────────────────────────────────────────────────────────

  function vaccineStatus(v: VaccineEntry, ageMonths: number): 'done' | 'overdue' | 'due' | 'upcoming' {
    const rec = records.find(r => r.vaccine_key === v.key);
    if (rec?.given_date) return 'done';
    if (ageMonths >= v.ageMonths + 2) return 'overdue';
    if (ageMonths >= v.ageMonths) return 'due';
    return 'upcoming';
  }

  function openVaccineModal(v: VaccineEntry) {
    const existing = records.find(r => r.vaccine_key === v.key);
    setVaccineTarget(v);
    setGivenDate(existing?.given_date ?? todayISO());
    setVaccineNotes(existing?.notes ?? '');
  }

  async function saveVaccine() {
    if (!vaccineTarget || !babyId || !userId) return;
    const parsed = parseDate(givenDate);
    if (!parsed) {
      if (Platform.OS === 'web') window.alert('Enter date as YYYY-MM-DD or MM/DD/YYYY');
      return;
    }
    setSavingVaccine(true);
    try {
      const existing = records.find(r => r.vaccine_key === vaccineTarget.key);
      if (existing) {
        const { error } = await supabase.from('vaccine_records')
          .update({ given_date: parsed, notes: vaccineNotes.trim() || null })
          .eq('baby_id', babyId).eq('vaccine_key', vaccineTarget.key);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('vaccine_records').insert({
          user_id: userId, baby_id: babyId,
          vaccine_key: vaccineTarget.key,
          given_date: parsed,
          notes: vaccineNotes.trim() || null,
        });
        if (error) throw error;
      }
      await loadAll();
      setVaccineTarget(null);
    } catch (err: any) {
      const msg = err?.message ?? 'Unknown error';
      if (Platform.OS === 'web') window.alert('Save failed: ' + msg);
    } finally {
      setSavingVaccine(false);
    }
  }

  async function clearVaccineRecord(key: string) {
    if (!babyId) return;
    await supabase.from('vaccine_records').delete().eq('baby_id', babyId).eq('vaccine_key', key);
    await loadAll();
  }

  // ── Appointment helpers ────────────────────────────────────────────────────

  function openAddAppt() {
    setEditApptId(null);
    setApptTitle(''); setApptDoctor(''); setApptDate(''); setApptNotes('');
    setApptOpen(true);
  }

  function openEditAppt(a: Appointment) {
    setEditApptId(a.id);
    setApptTitle(a.title);
    setApptDoctor(a.doctor_name ?? '');
    setApptDate(a.scheduled_date.split('T')[0]);
    setApptNotes(a.notes ?? '');
    setApptOpen(true);
  }

  async function saveAppt() {
    if (!babyId || !userId || !apptTitle.trim() || !apptDate.trim()) return;
    const parsed = parseDate(apptDate);
    if (!parsed) {
      if (Platform.OS === 'web') window.alert('Enter date as YYYY-MM-DD or MM/DD/YYYY');
      return;
    }
    setSavingAppt(true);
    try {
      const fields = {
        title: apptTitle.trim(),
        doctor_name: apptDoctor.trim() || null,
        scheduled_date: parsed,
        notes: apptNotes.trim() || null,
      };
      if (editApptId) {
        await supabase.from('pediatric_appointments').update(fields).eq('id', editApptId);
      } else {
        await supabase.from('pediatric_appointments').insert({ ...fields, user_id: userId, baby_id: babyId, completed: false });
      }
      await loadAll();
      setApptOpen(false);
    } finally {
      setSavingAppt(false);
    }
  }

  async function toggleComplete(a: Appointment) {
    await supabase.from('pediatric_appointments').update({ completed: !a.completed }).eq('id', a.id);
    setAppointments(prev => prev.map(x => x.id === a.id ? { ...x, completed: !x.completed } : x));
  }

  async function deleteAppt(id: string) {
    const confirm = Platform.OS === 'web'
      ? window.confirm('Delete this appointment?')
      : true;
    if (!confirm) return;
    await supabase.from('pediatric_appointments').delete().eq('id', id);
    setAppointments(prev => prev.filter(a => a.id !== id));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const ageMonths = birthDate ? getAgeMonths(birthDate) : -1;

  return (
    <View style={s.container}>
      <TouchableOpacity style={s.collapseHeader} onPress={() => setCollapsed(v => !v)} activeOpacity={0.75}>
        <Text style={s.heading}>💉 Vaccines & Appointments</Text>
        <Text style={s.collapseChevron}>{collapsed ? '›' : '⌄'}</Text>
      </TouchableOpacity>

      {!collapsed && (
      <><View style={s.tabRow}>
        {(['vaccines', 'appointments'] as const).map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabBtnActive]} onPress={() => setTab(t)} activeOpacity={0.8}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t === 'vaccines' ? 'Vaccines' : 'Appointments'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginVertical: 24 }} color={c.primary} />
      ) : tab === 'vaccines' ? (
        <>
          {!birthDate && (
            <Text style={s.hint}>Add your baby's birth date in Profile to see vaccine status.</Text>
          )}
          {AGE_GROUPS.map(group => {
            const rows = group.vaccines.map(v => ({ v, status: vaccineStatus(v, ageMonths), rec: records.find(r => r.vaccine_key === v.key) }));
            const allDone = rows.every(r => r.status === 'done');
            const hasAlert = rows.some(r => r.status === 'due' || r.status === 'overdue');

            return (
              <View key={group.label} style={s.ageGroup}>
                <View style={s.ageGroupHeader}>
                  <Text style={s.ageGroupLabel}>{group.label}</Text>
                  {allDone
                    ? <Text style={s.badgeDoneText}>✓ Complete</Text>
                    : hasAlert
                    ? <View style={s.alertDot} />
                    : null}
                </View>
                {rows.map(({ v, status, rec }) => (
                  <TouchableOpacity key={v.key} style={s.vaccineRow} onPress={() => openVaccineModal(v)} activeOpacity={0.75}>
                    <View style={s.vaccineInfo}>
                      <Text style={s.vaccineName}>{v.name}</Text>
                      <Text style={s.vaccineDose}>{v.dose}</Text>
                    </View>
                    <View style={[s.badge,
                      status === 'done' && s.badgeDone,
                      status === 'due' && s.badgeDue,
                      status === 'overdue' && s.badgeOverdue,
                      status === 'upcoming' && s.badgeUpcoming,
                    ]}>
                      <Text style={[s.badgeText,
                        status === 'done' && s.badgeDoneText,
                        status === 'due' && s.badgeDueText,
                        status === 'overdue' && s.badgeOverdueText,
                        status === 'upcoming' && s.badgeUpcomingText,
                      ]}>
                        {status === 'done'
                          ? `✓ ${rec?.given_date ? formatDate(rec.given_date) : 'Given'}`
                          : status === 'overdue' ? 'Overdue'
                          : status === 'due' ? 'Due now'
                          : 'Upcoming'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            );
          })}
        </>
      ) : (
        <>
          <TouchableOpacity style={s.addBtn} onPress={openAddAppt} activeOpacity={0.85}>
            <Text style={s.addBtnText}>+ Add Appointment</Text>
          </TouchableOpacity>

          {appointments.length === 0 ? (
            <Text style={s.emptyText}>No appointments yet</Text>
          ) : (
            appointments.map(a => {
              const isPast = new Date(a.scheduled_date) < new Date() && !a.completed;
              return (
                <View key={a.id} style={[s.apptCard, a.completed && s.apptCardDone]}>
                  <TouchableOpacity style={s.checkbox} onPress={() => toggleComplete(a)} activeOpacity={0.7}>
                    <Text style={s.checkboxIcon}>{a.completed ? '✅' : '⬜'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.apptBody} onPress={() => openEditAppt(a)} activeOpacity={0.75}>
                    <Text style={[s.apptTitle, a.completed && s.apptTitleDone]}>{a.title}</Text>
                    <Text style={[s.apptMeta, isPast && s.apptMetaOverdue]}>
                      📅 {formatDate(a.scheduled_date)}{a.doctor_name ? `  ·  👨‍⚕️ ${a.doctor_name}` : ''}
                    </Text>
                    {a.notes ? <Text style={s.apptNotes} numberOfLines={2}>{a.notes}</Text> : null}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteAppt(a.id)} style={s.deleteBtn} activeOpacity={0.7}>
                    <Text style={s.deleteIcon}>🗑</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </>
      )}

      {/* ── Vaccine modal ─────────────────────────────────────────────────────── */}
      <Modal visible={vaccineTarget !== null} animationType="slide" transparent onRequestClose={() => setVaccineTarget(null)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setVaccineTarget(null)} />
          <View style={s.sheet}>
            <View style={s.handle} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.modalTitle}>{vaccineTarget?.name}</Text>
              <Text style={s.modalSubtitle}>{vaccineTarget?.dose}</Text>

              <Text style={s.label}>Date given</Text>
              <TextInput style={s.input} value={givenDate} onChangeText={setGivenDate}
                placeholder="YYYY-MM-DD" placeholderTextColor={c.textMuted} />

              <Text style={s.label}>Notes (optional)</Text>
              <TextInput style={[s.input, s.inputMulti]} value={vaccineNotes} onChangeText={setVaccineNotes}
                placeholder="Clinic, reactions, doctor..." placeholderTextColor={c.textMuted}
                multiline textAlignVertical="top" />

              <TouchableOpacity style={[s.saveBtn, savingVaccine && s.saveBtnDisabled]}
                onPress={saveVaccine} disabled={savingVaccine} activeOpacity={0.85}>
                {savingVaccine ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Mark as Given</Text>}
              </TouchableOpacity>

              {records.find(r => r.vaccine_key === vaccineTarget?.key)?.given_date && (
                <TouchableOpacity style={s.clearBtn}
                  onPress={() => { if (vaccineTarget) { clearVaccineRecord(vaccineTarget.key); setVaccineTarget(null); } }}
                  activeOpacity={0.7}>
                  <Text style={s.clearBtnText}>Remove record</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.cancelBtn} onPress={() => setVaccineTarget(null)} activeOpacity={0.7}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Appointment modal ─────────────────────────────────────────────────── */}
      <Modal visible={apptOpen} animationType="slide" transparent onRequestClose={() => setApptOpen(false)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setApptOpen(false)} />
          <View style={s.sheet}>
            <View style={s.handle} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.modalTitle}>{editApptId ? 'Edit Appointment' : 'New Appointment'}</Text>

              <Text style={s.label}>Title *</Text>
              <TextInput style={s.input} value={apptTitle} onChangeText={setApptTitle}
                placeholder="e.g. 6-month checkup" placeholderTextColor={c.textMuted} />

              <Text style={s.label}>Doctor / clinic</Text>
              <TextInput style={s.input} value={apptDoctor} onChangeText={setApptDoctor}
                placeholder="Dr. Smith" placeholderTextColor={c.textMuted} />

              <Text style={s.label}>Date * (YYYY-MM-DD)</Text>
              <TextInput style={s.input} value={apptDate} onChangeText={setApptDate}
                placeholder="YYYY-MM-DD" placeholderTextColor={c.textMuted} />

              <Text style={s.label}>Notes</Text>
              <TextInput style={[s.input, s.inputMulti]} value={apptNotes} onChangeText={setApptNotes}
                placeholder="Any notes..." placeholderTextColor={c.textMuted}
                multiline textAlignVertical="top" />

              <TouchableOpacity
                style={[s.saveBtn, (savingAppt || !apptTitle.trim() || !apptDate.trim()) && s.saveBtnDisabled]}
                onPress={saveAppt} disabled={savingAppt || !apptTitle.trim() || !apptDate.trim()} activeOpacity={0.85}>
                {savingAppt ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Save Appointment</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setApptOpen(false)} activeOpacity={0.7}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      </>)}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { marginBottom: 28 },
    collapseHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.cardLavender, borderRadius: 14, borderWidth: 2, borderColor: c.lavender,
      paddingHorizontal: 16, paddingVertical: 13, marginBottom: 14,
    },
    collapseChevron: { fontSize: 20, color: c.lavender, fontWeight: '700' },
    heading: { fontSize: 16, fontWeight: '800', color: c.textPrimary },

    tabRow: {
      flexDirection: 'row', backgroundColor: c.inputBg,
      borderRadius: 12, padding: 4, marginBottom: 16,
    },
    tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
    tabBtnActive: {
      backgroundColor: c.card,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2,
    },
    tabText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    tabTextActive: { color: c.textPrimary },

    hint: { fontSize: 13, color: c.textMuted, fontStyle: 'italic', textAlign: 'center', marginVertical: 12 },

    ageGroup: {
      marginBottom: 12, backgroundColor: c.card, borderRadius: 14, overflow: 'hidden',
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
    },
    ageGroupHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 14, paddingVertical: 10,
      backgroundColor: c.cardLavender, borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    ageGroupLabel: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    alertDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f59e0b' },

    vaccineRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 14, paddingVertical: 11,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    vaccineInfo: { flex: 1 },
    vaccineName: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
    vaccineDose: { fontSize: 12, color: c.textMuted, marginTop: 1 },

    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginLeft: 10 },
    badgeDone: { backgroundColor: '#dcfce7' },
    badgeDue: { backgroundColor: c.cardHoney },
    badgeOverdue: { backgroundColor: '#fee2e2' },
    badgeUpcoming: { backgroundColor: c.inputBg },
    badgeText: { fontSize: 11, fontWeight: '700' },
    badgeDoneText: { color: '#16a34a' },
    badgeDueText: { color: '#92400e' },
    badgeOverdueText: { color: '#dc2626' },
    badgeUpcomingText: { color: c.textMuted },

    addBtn: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 14 },
    addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    emptyText: { textAlign: 'center', color: c.textMuted, fontSize: 14, marginTop: 8 },

    apptCard: {
      flexDirection: 'row', alignItems: 'flex-start',
      backgroundColor: c.card, borderRadius: 14, padding: 14, marginBottom: 10,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
    },
    apptCardDone: { opacity: 0.55 },
    checkbox: { marginRight: 10, paddingTop: 1 },
    checkboxIcon: { fontSize: 20 },
    apptBody: { flex: 1 },
    apptTitle: { fontSize: 15, fontWeight: '700', color: c.textSecondary, marginBottom: 3 },
    apptTitleDone: { textDecorationLine: 'line-through', color: c.textMuted },
    apptMeta: { fontSize: 12, color: c.textMuted, marginBottom: 3 },
    apptMetaOverdue: { color: '#dc2626' },
    apptNotes: { fontSize: 12, color: c.textMuted, fontStyle: 'italic' },
    deleteBtn: { paddingLeft: 10 },
    deleteIcon: { fontSize: 16 },

    overlay: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
    sheet: {
      backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 24, paddingBottom: 40, maxHeight: '85%',
    },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.separator, alignSelf: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 19, fontWeight: '800', color: c.textPrimary, marginBottom: 2 },
    modalSubtitle: { fontSize: 13, color: c.textMuted, marginBottom: 20 },
    label: { fontSize: 13, fontWeight: '600', color: c.textMuted, marginBottom: 6 },
    input: { backgroundColor: c.inputBg, borderRadius: 12, padding: 12, fontSize: 15, color: c.textSecondary, marginBottom: 16 },
    inputMulti: { minHeight: 72 },
    saveBtn: { backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4, marginBottom: 10 },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    clearBtn: { alignItems: 'center', paddingVertical: 10, marginBottom: 4 },
    clearBtnText: { color: '#dc2626', fontWeight: '600', fontSize: 14 },
    cancelBtn: { alignItems: 'center', paddingVertical: 10 },
    cancelText: { color: c.textMuted, fontSize: 15 },
  });
}
