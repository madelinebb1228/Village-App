import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  TextInput, ActivityIndicator, Platform, KeyboardAvoidingView, ScrollView, Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { safeInsert, safeUpdate, safeDelete } from '../lib/syncService';
import { useColors, Colors } from '../lib/theme';
import { useBaby } from '../lib/babyContext';
import {
  VaccineReminderSettings,
  getVaccineReminderSettings,
  saveVaccineReminderSettings,
  rescheduleVaccineReminders,
} from '../lib/vaccineNotifications';
import { useCalendarSyncPrompt } from '../lib/calendarSync';
import ConfirmModal from '../components/ConfirmModal';
import { getBabyAge } from '../lib/feedUtils';
import PrepareForVisit from './PrepareForVisit';

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

// ─── Vaccine info ─────────────────────────────────────────────────────────────

const VACCINE_INFO: Record<string, string> = {
  'Hepatitis B':  'Protects against hepatitis B, a serious liver infection spread through blood and body fluids.',
  'DTaP':         'Protects against diphtheria, tetanus, and whooping cough (pertussis).',
  'Hib':          'Protects against Haemophilus influenzae type b — a leading cause of bacterial meningitis and pneumonia in infants.',
  'Polio (IPV)':  'Protects against polio, a crippling and potentially fatal infectious disease.',
  'PCV':          'Protects against pneumococcal bacteria that cause pneumonia, meningitis, and ear infections.',
  'Rotavirus':    'Protects against rotavirus, the most common cause of severe diarrhea and vomiting in babies.',
  'Influenza':    'Protects against seasonal flu viruses. Recommended every year starting at 6 months.',
  'MMR':          'Protects against measles, mumps, and rubella (German measles).',
  'Varicella':    'Protects against chickenpox (varicella-zoster virus).',
  'Hepatitis A':  'Protects against hepatitis A, a highly contagious liver disease.',
};

// ─── Vaccine schedule (CDC) ───────────────────────────────────────────────────

const VACCINE_SCHEDULE = [
  { key: 'hepb_1',  name: 'Hepatitis B',  dose: '1st dose', ageMonths: 0,  ageLabel: 'Birth' },
  { key: 'hepb_2',  name: 'Hepatitis B',  dose: '2nd dose', ageMonths: 1,  ageLabel: '1–2 months' },
  { key: 'dtap_1',  name: 'DTaP',         dose: '1st dose', ageMonths: 2,  ageLabel: '2 months' },
  { key: 'hib_1',   name: 'Hib',          dose: '1st dose', ageMonths: 2,  ageLabel: '2 months' },
  { key: 'ipv_1',   name: 'Polio (IPV)',  dose: '1st dose', ageMonths: 2,  ageLabel: '2 months' },
  { key: 'pcv_1',   name: 'PCV',          dose: '1st dose', ageMonths: 2,  ageLabel: '2 months' },
  { key: 'rv_1',    name: 'Rotavirus',    dose: '1st dose', ageMonths: 2,  ageLabel: '2 months' },
  { key: 'dtap_2',  name: 'DTaP',         dose: '2nd dose', ageMonths: 4,  ageLabel: '4 months' },
  { key: 'hib_2',   name: 'Hib',          dose: '2nd dose', ageMonths: 4,  ageLabel: '4 months' },
  { key: 'ipv_2',   name: 'Polio (IPV)',  dose: '2nd dose', ageMonths: 4,  ageLabel: '4 months' },
  { key: 'pcv_2',   name: 'PCV',          dose: '2nd dose', ageMonths: 4,  ageLabel: '4 months' },
  { key: 'rv_2',    name: 'Rotavirus',    dose: '2nd dose', ageMonths: 4,  ageLabel: '4 months' },
  { key: 'dtap_3',  name: 'DTaP',         dose: '3rd dose', ageMonths: 6,  ageLabel: '6 months' },
  { key: 'hib_3',   name: 'Hib',          dose: '3rd dose', ageMonths: 6,  ageLabel: '6 months' },
  { key: 'pcv_3',   name: 'PCV',          dose: '3rd dose', ageMonths: 6,  ageLabel: '6 months' },
  { key: 'rv_3',    name: 'Rotavirus',    dose: '3rd dose', ageMonths: 6,  ageLabel: '6 months' },
  { key: 'hepb_3',  name: 'Hepatitis B',  dose: '3rd dose', ageMonths: 6,  ageLabel: '6–18 months' },
  { key: 'ipv_3',   name: 'Polio (IPV)',  dose: '3rd dose', ageMonths: 6,  ageLabel: '6–18 months' },
  { key: 'flu_1',   name: 'Influenza',    dose: 'Annual',   ageMonths: 6,  ageLabel: '6+ months (annual)' },
  { key: 'mmr_1',   name: 'MMR',          dose: '1st dose', ageMonths: 12, ageLabel: '12–15 months' },
  { key: 'var_1',   name: 'Varicella',    dose: '1st dose', ageMonths: 12, ageLabel: '12–15 months' },
  { key: 'hib_4',   name: 'Hib',          dose: '4th dose', ageMonths: 12, ageLabel: '12–15 months' },
  { key: 'pcv_4',   name: 'PCV',          dose: '4th dose', ageMonths: 12, ageLabel: '12–15 months' },
  { key: 'hepa_1',  name: 'Hepatitis A',  dose: '1st dose', ageMonths: 12, ageLabel: '12–23 months' },
  { key: 'hepa_2',  name: 'Hepatitis A',  dose: '2nd dose', ageMonths: 18, ageLabel: '12–23 months' },
  { key: 'dtap_4',  name: 'DTaP',         dose: '4th dose', ageMonths: 15, ageLabel: '15–18 months' },
  { key: 'dtap_5',  name: 'DTaP',         dose: '5th dose', ageMonths: 48, ageLabel: '4–6 years' },
  { key: 'ipv_4',   name: 'Polio (IPV)',  dose: '4th dose', ageMonths: 48, ageLabel: '4–6 years' },
  { key: 'mmr_2',   name: 'MMR',          dose: '2nd dose', ageMonths: 48, ageLabel: '4–6 years' },
  { key: 'var_2',   name: 'Varicella',    dose: '2nd dose', ageMonths: 48, ageLabel: '4–6 years' },
] as const;

type VaccineEntry = typeof VACCINE_SCHEDULE[number];

const AGE_GROUPS: { label: string; vaccines: VaccineEntry[] }[] = [];
for (const v of VACCINE_SCHEDULE) {
  const group = AGE_GROUPS.find(g => g.label === v.ageLabel);
  if (group) group.vaccines.push(v);
  else AGE_GROUPS.push({ label: v.ageLabel, vaccines: [v] });
}

// ─── Reaction encoding ────────────────────────────────────────────────────────

const RXNS_PFX = '[RXNS:';

const REACTION_OPTIONS = [
  { key: 'none',         label: 'No reactions',         emoji: '✅' },
  { key: 'fever',        label: 'Fever',                emoji: '🌡️' },
  { key: 'fussy',        label: 'Fussy / Crying',       emoji: '😢' },
  { key: 'sleepy',       label: 'Extra sleepy',         emoji: '😴' },
  { key: 'site_red',     label: 'Redness at site',      emoji: '🔴' },
  { key: 'site_swell',   label: 'Swelling at site',     emoji: '🫧' },
  { key: 'no_appetite',  label: 'Loss of appetite',     emoji: '🍽️' },
  { key: 'vomiting',     label: 'Vomiting',             emoji: '🤢' },
];

function decodeReactions(notes: string | null): { reactions: string[]; text: string } {
  if (!notes || !notes.startsWith(RXNS_PFX)) return { reactions: [], text: notes ?? '' };
  const end = notes.indexOf(']');
  if (end === -1) return { reactions: [], text: notes };
  const reactions = notes.slice(RXNS_PFX.length, end).split(',').filter(Boolean);
  return { reactions, text: notes.slice(end + 1).replace(/^\n/, '') };
}

function encodeReactions(reactions: string[], text: string): string {
  if (!reactions.length) return text;
  return `${RXNS_PFX}${reactions.join(',')}]\n${text}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAgeMonths(birthDate: string): number {
  return getBabyAge(birthDate).monthsOld;
}

function formatDate(iso: string): string {
  const dateOnly = iso.split('T')[0];
  return new Date(dateOnly + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function todayDisplay(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
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

function autoFormatDate(raw: string, prev: string): string {
  // Allow deleting freely
  if (raw.length < prev.length) return raw;
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VaccineTracker({ userId }: { userId: string | null }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [collapsed,    setCollapsed]    = useState(false);
  const [tab,          setTab]          = useState<'vaccines' | 'appointments'>('vaccines');
  const [babyId,       setBabyId]       = useState<string | null>(null);
  const [birthDate,    setBirthDate]    = useState<string | null>(null);
  const [records,      setRecords]      = useState<VaccineRecord[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [reminderSettings, setReminderSettings] = useState<VaccineReminderSettings>({ enabled: false, quietStart: null, quietEnd: null });

  // Vaccine modal
  const [vaccineTarget,   setVaccineTarget]   = useState<VaccineEntry | null>(null);
  const [vaccineStep,     setVaccineStep]     = useState<'log' | 'reactions'>('log');
  const [givenDate,       setGivenDate]       = useState('');
  const [vaccineNotes,    setVaccineNotes]    = useState('');
  const [savingVaccine,   setSavingVaccine]   = useState(false);
  const [linkedApptId,    setLinkedApptId]    = useState<string | null>(null);
  const [showApptPicker,  setShowApptPicker]  = useState(false);
  const [reactions,       setReactions]       = useState<string[]>([]);
  const [reactionNotes,   setReactionNotes]   = useState('');
  const [savingReactions, setSavingReactions] = useState(false);
  const [showVaccineInfo, setShowVaccineInfo] = useState(false);

  // Prepare for Visit
  const [prepareVisitAppt, setPrepareVisitAppt] = useState<Appointment | null>(null);

  // Appointment modal
  const [apptOpen,    setApptOpen]    = useState(false);
  const [editApptId,  setEditApptId]  = useState<string | null>(null);
  const [apptTitle,   setApptTitle]   = useState('');
  const [apptDoctor,  setApptDoctor]  = useState('');
  const [apptDate,    setApptDate]    = useState('');
  const [apptNotes,   setApptNotes]   = useState('');
  const [savingAppt,  setSavingAppt]  = useState(false);

  const { pending: pendingCalSync, saving: savingCalSync, promptAddToCalendar, dismiss: dismissCalSync, addTo: addToCalendar } = useCalendarSyncPrompt();

  const { activeBaby } = useBaby();
  useEffect(() => { if (userId) loadAll(); }, [userId, activeBaby?.id]);

  async function loadAll() {
    if (!userId) return;
    setLoading(true);
    try {
      const bid = activeBaby?.id ?? null;
      const bbd = activeBaby?.birth_date ?? null;
      setBabyId(bid);
      setBirthDate(bbd);
      if (bid) {
        const [{ data: vData }, { data: aData }, rs] = await Promise.all([
          supabase.from('vaccine_records').select('vaccine_key,given_date,notes').eq('baby_id', bid),
          supabase.from('pediatric_appointments')
            .select('id,title,doctor_name,scheduled_date,notes,completed')
            .eq('baby_id', bid).order('scheduled_date', { ascending: true }),
          getVaccineReminderSettings(userId, bid),
        ]);
        const vRecords = vData ?? [];
        setRecords(vRecords);
        setAppointments((aData as Appointment[]) ?? []);
        setReminderSettings(rs);
        await rescheduleVaccineReminders(bid, bbd, vRecords, VACCINE_SCHEDULE, rs);
      }
    } finally {
      setLoading(false);
    }
  }

  async function toggleVaccineReminders() {
    if (!userId || !babyId) return;
    const next = { ...reminderSettings, enabled: !reminderSettings.enabled };
    setReminderSettings(next);
    await saveVaccineReminderSettings(userId, babyId, next);
    await rescheduleVaccineReminders(babyId, birthDate, records, VACCINE_SCHEDULE, next);
  }

  // ── Vaccine helpers ──────────────────────────────────────────────────────────

  function vaccineStatus(v: VaccineEntry, ageMo: number): 'done' | 'overdue' | 'due' | 'upcoming' {
    if (records.find(r => r.vaccine_key === v.key)?.given_date) return 'done';
    if (ageMo >= v.ageMonths + 2) return 'overdue';
    if (ageMo >= v.ageMonths)     return 'due';
    return 'upcoming';
  }

  function openVaccineModal(v: VaccineEntry) {
    const existing = records.find(r => r.vaccine_key === v.key);
    const { reactions: rxns, text } = decodeReactions(existing?.notes ?? null);
    setVaccineTarget(v);
    setVaccineStep('log');
    setGivenDate(existing?.given_date
      ? formatDate(existing.given_date).replace(/,/g, '')  // keep readable
      : todayDisplay());
    setVaccineNotes(text);
    setLinkedApptId(null);
    setShowApptPicker(false);
    setShowVaccineInfo(false);
    setReactions(rxns);
    setReactionNotes('');
  }

  async function saveVaccineLog() {
    if (!vaccineTarget || !babyId || !userId) return;
    const parsed = parseDate(givenDate);
    if (!parsed) {
      Alert.alert('Invalid Date', 'Enter date as MM/DD/YYYY');
      return;
    }
    setSavingVaccine(true);
    try {
      const encodedNotes = encodeReactions(reactions, vaccineNotes.trim());
      const existing = records.find(r => r.vaccine_key === vaccineTarget.key);
      if (existing) {
        await safeUpdate('vaccine_records',
          { baby_id: babyId, vaccine_key: vaccineTarget.key },
          { given_date: parsed, notes: encodedNotes || null },
        );
      } else {
        await safeInsert('vaccine_records', {
          user_id: userId, baby_id: babyId,
          vaccine_key: vaccineTarget.key,
          given_date: parsed,
          notes: encodedNotes || null,
        });
      }
      await loadAll();
      setVaccineStep('reactions');
      setReactions([]);
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message ?? 'Could not save this vaccine record. Please try again.');
    } finally {
      setSavingVaccine(false);
    }
  }

  async function saveReactions() {
    if (!vaccineTarget || !babyId) return;
    setSavingReactions(true);
    const existing = records.find(r => r.vaccine_key === vaccineTarget.key);
    const notesText = existing ? decodeReactions(existing.notes).text : vaccineNotes.trim();
    const allNotes  = reactionNotes.trim()
      ? `${notesText}\n${reactionNotes.trim()}`.trim()
      : notesText;
    const encoded = encodeReactions(reactions, allNotes);
    await safeUpdate('vaccine_records',
      { baby_id: babyId, vaccine_key: vaccineTarget.key },
      { notes: encoded || null },
    );
    await loadAll();
    setSavingReactions(false);
    setVaccineTarget(null);
  }

  function toggleReaction(key: string) {
    if (key === 'none') {
      setReactions(['none']);
    } else {
      setReactions(prev => {
        const without = prev.filter(r => r !== 'none');
        return without.includes(key) ? without.filter(r => r !== key) : [...without, key];
      });
    }
  }

  async function clearVaccineRecord(key: string) {
    if (!babyId) return;
    await safeDelete('vaccine_records', { baby_id: babyId, vaccine_key: key });
    await loadAll();
  }

  // ── Appointment helpers ──────────────────────────────────────────────────────

  function openAddAppt() {
    setEditApptId(null);
    setApptTitle(''); setApptDoctor(''); setApptDate(todayDisplay()); setApptNotes('');
    setApptOpen(true);
  }

  function openEditAppt(a: Appointment) {
    setEditApptId(a.id);
    setApptTitle(a.title);
    setApptDoctor(a.doctor_name ?? '');
    const raw = a.scheduled_date.split('T')[0];
    const [y, m, d] = raw.split('-');
    setApptDate(`${m}/${d}/${y}`);
    setApptNotes(a.notes ?? '');
    setApptOpen(true);
  }

  async function saveAppt() {
    if (!babyId || !userId || !apptTitle.trim() || !apptDate.trim()) return;
    const parsed = parseDate(apptDate);
    if (!parsed) {
      Alert.alert('Invalid Date', 'Enter date as MM/DD/YYYY');
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
        await safeUpdate('pediatric_appointments', editApptId, fields);
      } else {
        const { id: newApptId } = await safeInsert('pediatric_appointments', { ...fields, user_id: userId, baby_id: babyId, completed: false });
        promptAddToCalendar({
          title: fields.title,
          startsAt: new Date(`${fields.scheduled_date}T00:00:00`),
          notes: fields.doctor_name ? `With ${fields.doctor_name}` : null,
          allDay: true,
          sourceType: 'appointment',
          sourceId: newApptId,
        });
      }
      await loadAll();
      setApptOpen(false);
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message ?? 'Could not save this appointment. Please try again.');
    } finally {
      setSavingAppt(false);
    }
  }

  async function toggleComplete(a: Appointment) {
    try {
      await safeUpdate('pediatric_appointments', a.id, { completed: !a.completed });
      setAppointments(prev => prev.map(x => x.id === a.id ? { ...x, completed: !x.completed } : x));
    } catch (err: any) {
      Alert.alert('Update Failed', err?.message ?? 'Could not update this appointment. Please try again.');
    }
  }

  async function deleteAppt(id: string) {
    Alert.alert('Delete appointment?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await safeDelete('pediatric_appointments', id);
            setAppointments(prev => prev.filter(a => a.id !== id));
          } catch (err: any) {
            Alert.alert('Delete Failed', err?.message ?? 'Could not delete this appointment. Please try again.');
          }
        },
      },
    ]);
  }

  // ── Derived state ────────────────────────────────────────────────────────────

  const ageMonths = birthDate ? getAgeMonths(birthDate) : -1;

  const stats = useMemo(() => {
    let done = 0, due = 0, overdue = 0;
    for (const v of VACCINE_SCHEDULE) {
      const st = vaccineStatus(v, ageMonths);
      if (st === 'done') done++;
      else if (st === 'due') due++;
      else if (st === 'overdue') overdue++;
    }
    return { done, due, overdue, total: VACCINE_SCHEDULE.length };
  }, [records, ageMonths]);

  const nextUp = useMemo(() => {
    return VACCINE_SCHEDULE.filter(v => {
      const st = vaccineStatus(v, ageMonths);
      return st === 'due' || st === 'overdue';
    }).slice(0, 6);
  }, [records, ageMonths]);

  const progressPct = stats.total > 0 ? stats.done / stats.total : 0;
  const progressColor = stats.overdue > 0 ? '#dc2626' : stats.due > 0 ? '#f59e0b' : '#16a34a';

  // Recent/upcoming appointments for linking
  const linkableAppts = useMemo(() =>
    appointments.filter(a => !a.completed).slice(0, 6),
    [appointments]);

  const linkedAppt = linkedApptId ? appointments.find(a => a.id === linkedApptId) : null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>

      {/* ── Collapsible header with progress ── */}
      <TouchableOpacity style={s.collapseHeader} onPress={() => setCollapsed(v => !v)} activeOpacity={0.75}
        accessibilityRole="button" accessibilityLabel={collapsed ? 'Expand vaccines and appointments' : 'Collapse vaccines and appointments'}>
        <View style={{ flex: 1 }}>
          <View style={s.headerTopRow}>
            <Text style={s.heading}>💉 Vaccines & Appointments</Text>
            <Text style={s.collapseChevron}>{collapsed ? '›' : '⌄'}</Text>
          </View>
          {!collapsed && (
            <View style={s.progressWrap}>
              <View style={s.progressBar}>
                <View style={[s.progressFill, { width: `${Math.round(progressPct * 100)}%` as any, backgroundColor: progressColor }]} />
              </View>
              <Text style={s.progressLabel}>
                {stats.done}/{stats.total} complete
                {stats.overdue > 0 ? `  ·  ${stats.overdue} overdue` : stats.due > 0 ? `  ·  ${stats.due} due now` : ''}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {!collapsed && (
        <>
          <View style={s.tabRow}>
            {(['vaccines', 'appointments'] as const).map(t => (
              <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabBtnActive]} onPress={() => setTab(t)} activeOpacity={0.8}
                accessibilityRole="button" accessibilityLabel={t === 'vaccines' ? 'Vaccines' : 'Appointments'}>
                <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                  {t === 'vaccines' ? 'Vaccines' : 'Appointments'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.reminderRow}>
            <Text style={s.reminderLabel}>🔔 Remind me when vaccines are due</Text>
            <TouchableOpacity
              style={[s.toggle, reminderSettings.enabled && { backgroundColor: c.primary }]}
              onPress={toggleVaccineReminders}
              activeOpacity={0.8}
              accessibilityRole="switch" accessibilityLabel="Vaccine reminders" accessibilityState={{ checked: reminderSettings.enabled }}
            >
              <View style={[s.toggleThumb, reminderSettings.enabled && { transform: [{ translateX: 20 }] }]} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color={c.primary} />
          ) : tab === 'vaccines' ? (
            <>
              {!birthDate && (
                <Text style={s.hint}>Add your baby's birth date in Profile to see vaccine status.</Text>
              )}

              {/* ── Next up banner ── */}
              {nextUp.length > 0 && (
                <View style={s.nextUpBox}>
                  <Text style={s.nextUpTitle}>
                    {stats.overdue > 0 ? '⚠️ Overdue vaccines' : '🔜 Due now'}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.nextUpRow}>
                    {nextUp.map(v => {
                      const st = vaccineStatus(v, ageMonths);
                      return (
                        <TouchableOpacity
                          key={v.key}
                          style={[s.nextUpChip, st === 'overdue' && s.nextUpChipOverdue]}
                          onPress={() => openVaccineModal(v)}
                          activeOpacity={0.8}
                        >
                          <Text style={[s.nextUpChipName, st === 'overdue' && s.nextUpChipNameOverdue]}>
                            {v.name}
                          </Text>
                          <Text style={[s.nextUpChipDose, st === 'overdue' && s.nextUpChipNameOverdue]}>
                            {v.dose}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* ── Age groups ── */}
              {AGE_GROUPS.map(group => {
                const rows = group.vaccines.map(v => ({
                  v,
                  status: vaccineStatus(v, ageMonths),
                  rec: records.find(r => r.vaccine_key === v.key),
                }));
                const allDone  = rows.every(r => r.status === 'done');
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
                    {rows.map(({ v, status, rec }) => {
                      const { reactions: rxns } = decodeReactions(rec?.notes ?? null);
                      return (
                        <TouchableOpacity key={v.key} style={s.vaccineRow} onPress={() => openVaccineModal(v)} activeOpacity={0.75}>
                          <View style={s.vaccineInfo}>
                            <Text style={s.vaccineName}>{v.name}</Text>
                            <Text style={s.vaccineDose}>{v.dose}</Text>
                            {rxns.length > 0 && rxns[0] !== 'none' && (
                              <Text style={s.reactionsHint}>
                                {rxns.map(r => REACTION_OPTIONS.find(o => o.key === r)?.emoji ?? '').join(' ')}
                              </Text>
                            )}
                          </View>
                          <View style={[
                            s.badge,
                            status === 'done'     && s.badgeDone,
                            status === 'due'      && s.badgeDue,
                            status === 'overdue'  && s.badgeOverdue,
                            status === 'upcoming' && s.badgeUpcoming,
                          ]}>
                            <Text style={[
                              s.badgeText,
                              status === 'done'     && s.badgeDoneText,
                              status === 'due'      && s.badgeDueText,
                              status === 'overdue'  && s.badgeOverdueText,
                              status === 'upcoming' && s.badgeUpcomingText,
                            ]}>
                              {status === 'done'
                                ? `✓ ${rec?.given_date ? formatDate(rec.given_date) : 'Given'}`
                                : status === 'overdue' ? 'Overdue'
                                : status === 'due'     ? 'Due now'
                                : 'Upcoming'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
            </>
          ) : (
            <>
              <TouchableOpacity style={s.addBtn} onPress={openAddAppt} activeOpacity={0.85}
                accessibilityRole="button" accessibilityLabel="Add appointment">
                <Text style={s.addBtnText}>+ Add Appointment</Text>
              </TouchableOpacity>

              {appointments.length === 0 ? (
                <Text style={s.emptyText}>No appointments yet</Text>
              ) : (
                appointments.map(a => {
                  const isPast = new Date(a.scheduled_date) < new Date() && !a.completed;
                  return (
                    <View key={a.id} style={[s.apptCard, a.completed && s.apptCardDone]}>
                      <TouchableOpacity style={s.checkbox} onPress={() => toggleComplete(a)} activeOpacity={0.7}
                        accessibilityRole="checkbox" accessibilityLabel={`Mark ${a.title} ${a.completed ? 'incomplete' : 'complete'}`} accessibilityState={{ checked: a.completed }}>
                        <Text style={s.checkboxIcon}>{a.completed ? '✅' : '⬜'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.apptBody} onPress={() => openEditAppt(a)} activeOpacity={0.75}
                        accessibilityRole="button" accessibilityLabel={`Edit ${a.title}`}>
                        <Text style={[s.apptTitle, a.completed && s.apptTitleDone]}>{a.title}</Text>
                        <Text style={[s.apptMeta, isPast && !a.completed && s.apptMetaOverdue]}>
                          📅 {formatDate(a.scheduled_date)}{a.doctor_name ? `  ·  👨‍⚕️ ${a.doctor_name}` : ''}
                        </Text>
                        {a.notes ? <Text style={s.apptNotes} numberOfLines={2}>{a.notes}</Text> : null}
                        {!a.completed && (
                          <TouchableOpacity onPress={() => setPrepareVisitAppt(a)} activeOpacity={0.7}
                            accessibilityRole="button" accessibilityLabel={`Prepare visit summary for ${a.title}`}>
                            <Text style={s.prepareVisitLink}>📋 Prepare visit summary</Text>
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteAppt(a.id)} style={s.deleteBtn} activeOpacity={0.7}
                        accessibilityRole="button" accessibilityLabel={`Delete ${a.title}`}>
                        <Text style={s.deleteIcon}>🗑</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </>
          )}

          {/* ── Vaccine modal ── */}
          <Modal visible={vaccineTarget !== null} animationType="slide" transparent onRequestClose={() => setVaccineTarget(null)}>
            <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setVaccineTarget(null)}
                accessibilityRole="button" accessibilityLabel="Close" />
              <View style={s.sheet}>
                <View style={s.handle} />
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                  {vaccineStep === 'log' && vaccineTarget && (
                    <>
                      <Text style={s.modalTitle}>{vaccineTarget.name}</Text>
                      <Text style={s.modalSubtitle}>{vaccineTarget.dose}</Text>

                      {/* Vaccine info toggle */}
                      <TouchableOpacity style={s.infoToggle} onPress={() => setShowVaccineInfo(v => !v)} activeOpacity={0.8}>
                        <Text style={s.infoToggleText}>ℹ️ What does this vaccine protect against?</Text>
                        <Text style={s.infoChevron}>{showVaccineInfo ? '▲' : '▼'}</Text>
                      </TouchableOpacity>
                      {showVaccineInfo && (
                        <View style={s.infoBox}>
                          <Text style={s.infoText}>
                            {VACCINE_INFO[vaccineTarget.name] ?? 'Part of the CDC recommended childhood immunization schedule.'}
                          </Text>
                        </View>
                      )}

                      {/* Appointment link */}
                      {linkableAppts.length > 0 && (
                        <View style={s.apptLinkWrap}>
                          <TouchableOpacity style={s.apptLinkToggle} onPress={() => setShowApptPicker(v => !v)} activeOpacity={0.8}>
                            <Text style={s.apptLinkLabel}>
                              {linkedAppt ? `📅 ${linkedAppt.title}` : '📅 Link to appointment (optional)'}
                            </Text>
                            <Text style={s.infoChevron}>{showApptPicker ? '▲' : '▼'}</Text>
                          </TouchableOpacity>
                          {showApptPicker && (
                            <View style={s.apptPickerList}>
                              {linkedApptId && (
                                <TouchableOpacity
                                  style={s.apptPickerItem}
                                  onPress={() => { setLinkedApptId(null); setShowApptPicker(false); }}
                                  activeOpacity={0.8}
                                >
                                  <Text style={[s.apptPickerItemText, { color: c.textMuted }]}>✕  Clear link</Text>
                                </TouchableOpacity>
                              )}
                              {linkableAppts.map(a => (
                                <TouchableOpacity
                                  key={a.id}
                                  style={[s.apptPickerItem, linkedApptId === a.id && s.apptPickerItemActive]}
                                  onPress={() => {
                                    setLinkedApptId(a.id);
                                    // Auto-fill date from appointment
                                    const raw = a.scheduled_date.split('T')[0];
                                    const [y, m, d] = raw.split('-');
                                    setGivenDate(`${m}/${d}/${y}`);
                                    setShowApptPicker(false);
                                  }}
                                  activeOpacity={0.8}
                                >
                                  <Text style={[s.apptPickerItemText, linkedApptId === a.id && { color: c.primary, fontWeight: '700' }]}>
                                    {a.title}
                                  </Text>
                                  <Text style={s.apptPickerItemDate}>{formatDate(a.scheduled_date)}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </View>
                      )}

                      <Text style={s.label}>Date given</Text>
                      <TextInput
                        style={s.input}
                        value={givenDate}
                        onChangeText={v => setGivenDate(autoFormatDate(v, givenDate))}
                        placeholder="MM/DD/YYYY"
                        placeholderTextColor={c.textMuted}
                        keyboardType="numeric"
                        maxLength={10}
                      />
                      {givenDate.length > 0 && !parseDate(givenDate) && (
                        <Text style={s.inputHint}>Use MM/DD/YYYY format</Text>
                      )}

                      <Text style={s.label}>Notes (optional)</Text>
                      <TextInput
                        style={[s.input, s.inputMulti]}
                        value={vaccineNotes}
                        onChangeText={setVaccineNotes}
                        placeholder="Clinic, batch number, anything to remember..."
                        placeholderTextColor={c.textMuted}
                        multiline textAlignVertical="top"
                      />

                      <TouchableOpacity
                        style={[s.saveBtn, savingVaccine && s.saveBtnDisabled]}
                        onPress={saveVaccineLog} disabled={savingVaccine} activeOpacity={0.85}
                        accessibilityRole="button" accessibilityLabel="Save"
                      >
                        {savingVaccine
                          ? <ActivityIndicator color="#fff" />
                          : <Text style={s.saveBtnText}>Mark as Given →</Text>}
                      </TouchableOpacity>

                      {records.find(r => r.vaccine_key === vaccineTarget?.key)?.given_date && (
                        <TouchableOpacity
                          style={s.clearBtn}
                          onPress={() => { if (vaccineTarget) { clearVaccineRecord(vaccineTarget.key); setVaccineTarget(null); } }}
                          activeOpacity={0.7}
                          accessibilityRole="button" accessibilityLabel="Clear vaccine record"
                        >
                          <Text style={s.clearBtnText}>Remove record</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={s.cancelBtn} onPress={() => setVaccineTarget(null)} activeOpacity={0.7}
                        accessibilityRole="button" accessibilityLabel="Cancel">
                        <Text style={s.cancelText}>Cancel</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {vaccineStep === 'reactions' && vaccineTarget && (
                    <>
                      <Text style={s.modalTitle}>✅ Saved!</Text>
                      <Text style={s.reactionsIntro}>
                        Any reactions to {vaccineTarget.name}? Tap all that apply.
                      </Text>

                      <View style={s.reactionChips}>
                        {REACTION_OPTIONS.map(opt => {
                          const active = reactions.includes(opt.key);
                          return (
                            <TouchableOpacity
                              key={opt.key}
                              style={[s.reactionChip, active && s.reactionChipActive]}
                              onPress={() => toggleReaction(opt.key)}
                              activeOpacity={0.8}
                            >
                              <Text style={s.reactionChipEmoji}>{opt.emoji}</Text>
                              <Text style={[s.reactionChipText, active && s.reactionChipTextActive]}>
                                {opt.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {reactions.length > 0 && !reactions.includes('none') && (
                        <>
                          <Text style={s.label}>Additional notes (optional)</Text>
                          <TextInput
                            style={[s.input, s.inputMulti]}
                            value={reactionNotes}
                            onChangeText={setReactionNotes}
                            placeholder="Duration, severity, doctor called..."
                            placeholderTextColor={c.textMuted}
                            multiline textAlignVertical="top"
                          />
                        </>
                      )}

                      <View style={s.reactionBtns}>
                        <TouchableOpacity style={s.skipBtn} onPress={() => setVaccineTarget(null)} activeOpacity={0.8}
                          accessibilityRole="button" accessibilityLabel="Skip">
                          <Text style={s.skipBtnText}>Skip</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.saveBtn, { flex: 1 }, (savingReactions || reactions.length === 0) && s.saveBtnDisabled]}
                          onPress={saveReactions}
                          disabled={savingReactions || reactions.length === 0}
                          activeOpacity={0.85}
                        >
                          {savingReactions
                            ? <ActivityIndicator color="#fff" />
                            : <Text style={s.saveBtnText}>Save reactions</Text>}
                        </TouchableOpacity>
                      </View>
                    </>
                  )}

                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </Modal>

          {/* ── Appointment modal ── */}
          <Modal visible={apptOpen} animationType="slide" transparent onRequestClose={() => setApptOpen(false)}>
            <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setApptOpen(false)}
                accessibilityRole="button" accessibilityLabel="Close" />
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

                  <Text style={s.label}>Date *</Text>
                  <TextInput
                    style={s.input}
                    value={apptDate}
                    onChangeText={v => setApptDate(autoFormatDate(v, apptDate))}
                    placeholder="MM/DD/YYYY"
                    placeholderTextColor={c.textMuted}
                    keyboardType="numeric"
                    maxLength={10}
                  />
                  {apptDate.length > 0 && !parseDate(apptDate) && (
                    <Text style={s.inputHint}>Use MM/DD/YYYY format</Text>
                  )}

                  <Text style={s.label}>Notes</Text>
                  <TextInput style={[s.input, s.inputMulti]} value={apptNotes} onChangeText={setApptNotes}
                    placeholder="Any notes..." placeholderTextColor={c.textMuted}
                    multiline textAlignVertical="top" />

                  <TouchableOpacity
                    style={[s.saveBtn, (savingAppt || !apptTitle.trim() || !apptDate.trim()) && s.saveBtnDisabled]}
                    onPress={saveAppt} disabled={savingAppt || !apptTitle.trim() || !apptDate.trim()} activeOpacity={0.85}
                    accessibilityRole="button" accessibilityLabel="Save appointment"
                  >
                    {savingAppt ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Save Appointment</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => setApptOpen(false)} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityLabel="Cancel">
                    <Text style={s.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        </>
      )}

      <ConfirmModal
        visible={!!pendingCalSync}
        title="Add to your calendar?"
        message={pendingCalSync ? `Want to add "${pendingCalSync.title}" to your calendar?` : undefined}
        onRequestClose={dismissCalSync}
        buttons={[
          { label: '👥 Shared Calendar', variant: 'primary', loading: savingCalSync, onPress: () => addToCalendar('shared') },
          { label: '🔒 Personal Calendar', loading: savingCalSync, onPress: () => addToCalendar('personal') },
          { label: 'Not now', onPress: dismissCalSync },
        ]}
      />

      <PrepareForVisit
        visible={!!prepareVisitAppt}
        onClose={() => setPrepareVisitAppt(null)}
        initialDate={prepareVisitAppt?.scheduled_date}
        initialTitle={prepareVisitAppt?.title}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { marginBottom: 16 },

    collapseHeader: {
      backgroundColor: c.cardLavender, borderRadius: 14, borderWidth: 2, borderColor: c.lavender,
      paddingHorizontal: 16, paddingTop: 13, paddingBottom: 10, marginBottom: 14,
    },
    headerTopRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    collapseChevron:{ fontSize: 20, color: c.lavender, fontWeight: '700' },
    heading:        { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    progressWrap:   { gap: 4 },
    progressBar:    { height: 6, borderRadius: 3, backgroundColor: c.separator, overflow: 'hidden' },
    progressFill:   { height: 6, borderRadius: 3 },
    progressLabel:  { fontSize: 11, color: c.textMuted, fontWeight: '600' },

    tabRow: {
      flexDirection: 'row', backgroundColor: c.inputBg,
      borderRadius: 12, padding: 4, marginBottom: 16,
    },
    tabBtn:       { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
    tabBtnActive: { backgroundColor: c.card, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
    tabText:      { fontSize: 14, fontWeight: '600', color: c.textMuted },
    tabTextActive:{ color: c.textPrimary },

    reminderRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    reminderLabel: { fontSize: 13, fontWeight: '600', color: c.textPrimary, flex: 1, marginRight: 10 },
    toggle:        { width: 46, height: 26, borderRadius: 13, backgroundColor: c.separator, justifyContent: 'center', paddingHorizontal: 2 },
    toggleThumb:   { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },

    hint: { fontSize: 13, color: c.textMuted, fontStyle: 'italic', textAlign: 'center', marginVertical: 12 },

    // Next up banner
    nextUpBox:   { backgroundColor: c.cardHoney, borderRadius: 14, borderWidth: 1.5, borderColor: c.honey, padding: 12, marginBottom: 16 },
    nextUpTitle: { fontSize: 12, fontWeight: '800', color: c.textSecondary, marginBottom: 10 },
    nextUpRow:   { gap: 8 },
    nextUpChip:  { backgroundColor: c.card, borderRadius: 10, borderWidth: 1.5, borderColor: c.honey, paddingHorizontal: 12, paddingVertical: 8, minWidth: 100, alignItems: 'center' },
    nextUpChipOverdue:       { borderColor: '#dc2626', backgroundColor: '#fee2e2' },
    nextUpChipName:          { fontSize: 12, fontWeight: '700', color: c.textSecondary, textAlign: 'center' },
    nextUpChipNameOverdue:   { color: '#dc2626' },
    nextUpChipDose:          { fontSize: 10, color: c.textMuted, textAlign: 'center', marginTop: 2 },

    ageGroup: { marginBottom: 12, backgroundColor: c.card, borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
    ageGroupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: c.cardLavender, borderBottomWidth: 1, borderBottomColor: c.separator },
    ageGroupLabel: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    alertDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f59e0b' },

    vaccineRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.separator },
    vaccineInfo:  { flex: 1 },
    vaccineName:  { fontSize: 14, fontWeight: '600', color: c.textSecondary },
    vaccineDose:  { fontSize: 12, color: c.textMuted, marginTop: 1 },
    reactionsHint:{ fontSize: 11, marginTop: 3 },

    badge:              { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginLeft: 10 },
    badgeDone:          { backgroundColor: '#dcfce7' },
    badgeDue:           { backgroundColor: c.cardHoney },
    badgeOverdue:       { backgroundColor: '#fee2e2' },
    badgeUpcoming:      { backgroundColor: c.inputBg },
    badgeText:          { fontSize: 11, fontWeight: '700' },
    badgeDoneText:      { color: '#16a34a' },
    badgeDueText:       { color: '#92400e' },
    badgeOverdueText:   { color: '#dc2626' },
    badgeUpcomingText:  { color: c.textMuted },

    addBtn:     { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 14 },
    addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    emptyText:  { textAlign: 'center', color: c.textMuted, fontSize: 14, marginTop: 8 },

    apptCard:     { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: c.card, borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
    apptCardDone: { opacity: 0.55 },
    checkbox:     { marginRight: 10, paddingTop: 1 },
    checkboxIcon: { fontSize: 20 },
    apptBody:     { flex: 1 },
    apptTitle:         { fontSize: 15, fontWeight: '700', color: c.textSecondary, marginBottom: 3 },
    apptTitleDone:     { textDecorationLine: 'line-through', color: c.textMuted },
    apptMeta:          { fontSize: 12, color: c.textMuted, marginBottom: 3 },
    apptMetaOverdue:   { color: '#dc2626' },
    apptNotes:         { fontSize: 12, color: c.textMuted, fontStyle: 'italic' },
    prepareVisitLink:  { fontSize: 12, fontWeight: '700', color: c.primary, marginTop: 4 },
    deleteBtn: { paddingLeft: 10 },
    deleteIcon: { fontSize: 16 },

    // Modal base
    overlay:  { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
    sheet:    { backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '90%' },
    handle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: c.separator, alignSelf: 'center', marginBottom: 20 },
    modalTitle:    { fontSize: 19, fontWeight: '800', color: c.textPrimary, marginBottom: 2 },
    modalSubtitle: { fontSize: 13, color: c.textMuted, marginBottom: 14 },
    label:         { fontSize: 13, fontWeight: '600', color: c.textMuted, marginBottom: 6 },
    input:         { backgroundColor: c.inputBg, borderRadius: 12, padding: 12, fontSize: 15, color: c.textSecondary, marginBottom: 4 },
    inputMulti:    { minHeight: 72, marginBottom: 16 },
    inputHint:     { fontSize: 11, color: c.textMuted, marginBottom: 12, marginTop: 2 },

    saveBtn:         { backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8, marginBottom: 10 },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText:     { color: '#fff', fontWeight: '700', fontSize: 16 },
    clearBtn:        { alignItems: 'center', paddingVertical: 10, marginBottom: 4 },
    clearBtnText:    { color: '#dc2626', fontWeight: '600', fontSize: 14 },
    cancelBtn:       { alignItems: 'center', paddingVertical: 10 },
    cancelText:      { color: c.textMuted, fontSize: 15 },

    // Vaccine info
    infoToggle:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.inputBg, borderRadius: 10, padding: 10, marginBottom: 8 },
    infoToggleText: { fontSize: 13, color: c.textSecondary, fontWeight: '600', flex: 1 },
    infoChevron:    { fontSize: 11, color: c.textMuted, marginLeft: 6 },
    infoBox:        { backgroundColor: c.cardBlue, borderRadius: 10, padding: 12, marginBottom: 14 },
    infoText:       { fontSize: 13, color: c.textSecondary, lineHeight: 20 },

    // Appointment link
    apptLinkWrap:       { marginBottom: 14 },
    apptLinkToggle:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.inputBg, borderRadius: 10, padding: 10 },
    apptLinkLabel:      { fontSize: 13, color: c.textSecondary, fontWeight: '600', flex: 1 },
    apptPickerList:     { backgroundColor: c.card, borderRadius: 10, marginTop: 4, borderWidth: 1, borderColor: c.separator, overflow: 'hidden' },
    apptPickerItem:     { padding: 12, borderBottomWidth: 1, borderBottomColor: c.separator },
    apptPickerItemActive:{ backgroundColor: c.cardLavender },
    apptPickerItemText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    apptPickerItemDate: { fontSize: 11, color: c.textMuted, marginTop: 2 },

    // Reactions
    reactionsIntro:  { fontSize: 14, color: c.textMuted, marginBottom: 16, lineHeight: 20 },
    reactionChips:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    reactionChip:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.inputBg },
    reactionChipActive:    { backgroundColor: c.cardLavender, borderColor: c.lavender },
    reactionChipEmoji:     { fontSize: 16 },
    reactionChipText:      { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    reactionChipTextActive:{ color: c.primary },
    reactionBtns:    { flexDirection: 'row', gap: 10, marginTop: 4 },
    skipBtn:         { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, backgroundColor: c.inputBg, justifyContent: 'center', alignItems: 'center' },
    skipBtnText:     { fontSize: 15, fontWeight: '600', color: c.textMuted },
  });
}
