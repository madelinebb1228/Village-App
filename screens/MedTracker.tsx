import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { Colors, useColors } from '../lib/theme';
import TrackerHeader from '../components/TrackerHeader';
import DisclosureToggle from '../components/DisclosureToggle';
import { useCollapsed } from '../lib/useCollapsed';
import { supabase } from '../lib/supabase';
import { safeInsert, safeUpdate } from '../lib/syncService';
import { ensureNotificationPermission } from '../lib/notifications';
import { getDoseInfo, isTylenol, isMotrin, isWeightBased } from '../lib/medDosing';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Medication {
  id: string;
  name: string;
  category: 'baby' | 'postpartum' | 'pregnant' | 'other';
  dose: string | null;
  frequency_hours: number | null;
  reminder_enabled: boolean;
  color: string;
  is_prescription: boolean;
  notes: string | null;
  baby_id: string | null;
}

interface MedLog {
  id: string;
  medication_id: string;
  dose_given: string | null;
  notes: string | null;
  logged_by_name: string | null;
  taken_at: string;
}

interface PresetItem {
  name: string;
  dose: string;
  frequencyHours: number;
  color: string;
  isPrescription?: boolean;
  note?: string;
}

// ─── Presets ──────────────────────────────────────────────────────────────────

const BABY_OTC: PresetItem[] = [
  { name: 'Acetaminophen (Tylenol)',  dose: 'weight-based',  frequencyHours: 4,  color: '#E87D6A' },
  { name: 'Ibuprofen (Motrin)',       dose: 'weight-based',  frequencyHours: 6,  color: '#F5A623' },
  { name: 'Gas Drops (simethicone)', dose: '0.3 mL',        frequencyHours: 6,  color: '#6AA9E8' },
  { name: 'Gripe Water',             dose: '5 mL',          frequencyHours: 6,  color: '#88C8D4' },
  { name: 'Vitamin D Drops',         dose: '1 mL (400 IU)', frequencyHours: 24, color: '#F5DD83' },
  { name: 'Probiotic Drops',         dose: 'per label',     frequencyHours: 24, color: '#83C5A3' },
  { name: 'Saline Nasal Drops',      dose: '2–3 drops',     frequencyHours: 6,  color: '#A4C8E8' },
  { name: 'Iron Drops',              dose: 'per label',     frequencyHours: 24, color: '#C4875A' },
];

const BABY_RX: PresetItem[] = [
  { name: 'Amoxicillin',                   dose: 'per prescription', frequencyHours: 8,  color: '#E8A4C8', isPrescription: true },
  { name: 'Amoxicillin/Clavulanate',       dose: 'per prescription', frequencyHours: 12, color: '#E8A4C8', isPrescription: true },
  { name: 'Azithromycin (Z-Pack)',          dose: 'per prescription', frequencyHours: 24, color: '#B8A4E8', isPrescription: true },
  { name: 'Albuterol (nebulizer)',          dose: 'per prescription', frequencyHours: 6,  color: '#A4C8E8', isPrescription: true },
  { name: 'Fluticasone (Flonase)',          dose: 'per prescription', frequencyHours: 24, color: '#B8A4E8', isPrescription: true },
  { name: 'Famotidine / Pepcid (reflux)',   dose: 'per prescription', frequencyHours: 12, color: '#E8D4A4', isPrescription: true },
  { name: 'Cetirizine (Zyrtec)',            dose: 'per prescription', frequencyHours: 24, color: '#83C5A3', isPrescription: true },
];

const POSTPARTUM_OTC: PresetItem[] = [
  { name: 'Ibuprofen 600 mg',        dose: '600 mg',        frequencyHours: 6,  color: '#E87D6A' },
  { name: 'Acetaminophen 500 mg',    dose: '500–1000 mg',   frequencyHours: 4,  color: '#6AA9E8' },
  { name: 'Colace (docusate)',        dose: '100 mg',        frequencyHours: 12, color: '#83C5A3' },
  { name: 'Prenatal Vitamin',         dose: '1 tablet',      frequencyHours: 24, color: '#F5DD83' },
  { name: 'Iron Supplement',          dose: 'per label',     frequencyHours: 24, color: '#C4875A' },
  { name: 'Magnesium',               dose: 'per label',     frequencyHours: 24, color: '#88C8D4' },
  { name: 'MiraLax',                 dose: '17 g',          frequencyHours: 24, color: '#A4C8E8' },
  { name: 'Vitamin D',               dose: '1000–2000 IU',  frequencyHours: 24, color: '#F5DD83' },
];

const POSTPARTUM_RX: PresetItem[] = [
  { name: 'Sertraline (Zoloft)',      dose: 'per prescription', frequencyHours: 24, color: '#E8A4C8', isPrescription: true },
  { name: 'Methylergonovine',         dose: 'per prescription', frequencyHours: 6,  color: '#E87D6A', isPrescription: true },
  { name: 'Labetalol',               dose: 'per prescription', frequencyHours: 12, color: '#A4C8E8', isPrescription: true },
  { name: 'Nifedipine',              dose: 'per prescription', frequencyHours: 12, color: '#A4C8E8', isPrescription: true },
  { name: 'Oxycodone / Percocet',    dose: 'per prescription', frequencyHours: 4,  color: '#E8D4A4', isPrescription: true },
  { name: 'Escitalopram (Lexapro)',  dose: 'per prescription', frequencyHours: 24, color: '#E8A4C8', isPrescription: true },
];

const PREGNANT_OTC: PresetItem[] = [
  { name: 'Prenatal Vitamin',         dose: '1 tablet',      frequencyHours: 24, color: '#F5DD83' },
  { name: 'Folic Acid 400 mcg',       dose: '400 mcg',       frequencyHours: 24, color: '#83C5A3' },
  { name: 'Tums / Antacid',           dose: '2–4 tablets',   frequencyHours: 4,  color: '#88C8D4' },
  { name: 'Unisom + Vitamin B6',      dose: '1 tablet',      frequencyHours: 8,  color: '#B8A4E8' },
  { name: 'Colace (docusate)',         dose: '100 mg',        frequencyHours: 12, color: '#A4C8E8' },
  { name: 'Iron Supplement',           dose: 'per label',     frequencyHours: 24, color: '#C4875A' },
  { name: 'Acetaminophen (Tylenol)',   dose: '500–1000 mg',   frequencyHours: 4,  color: '#6AA9E8', note: 'Only approved OTC pain reliever during pregnancy' },
  { name: 'Magnesium',                dose: 'per label',     frequencyHours: 24, color: '#88C8D4' },
];

const PREGNANT_RX: PresetItem[] = [
  { name: 'Zofran (ondansetron)',      dose: 'per prescription', frequencyHours: 8,  color: '#E8A4C8', isPrescription: true },
  { name: 'Diclegis / Bonjesta',       dose: 'per prescription', frequencyHours: 8,  color: '#B8A4E8', isPrescription: true },
  { name: 'Progesterone',              dose: 'per prescription', frequencyHours: 24, color: '#E8A4C8', isPrescription: true },
  { name: 'Levothyroxine (thyroid)',   dose: 'per prescription', frequencyHours: 24, color: '#F5DD83', isPrescription: true },
  { name: 'Metformin',                 dose: 'per prescription', frequencyHours: 12, color: '#83C5A3', isPrescription: true },
  { name: 'Labetalol',                dose: 'per prescription', frequencyHours: 12, color: '#A4C8E8', isPrescription: true },
  { name: 'Lovenox (enoxaparin)',      dose: 'per prescription', frequencyHours: 24, color: '#E87D6A', isPrescription: true },
  { name: 'Nifedipine',               dose: 'per prescription', frequencyHours: 12, color: '#A4C8E8', isPrescription: true },
];

const MED_PALETTE = [
  '#8878A8', '#6AA9E8', '#83C5A3', '#F5A623',
  '#E8A4C8', '#E87D6A', '#88C8D4', '#F5DD83',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ago48h() {
  return new Date(Date.now() - 48 * 3600 * 1000).toISOString();
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatCountdown(ms: number): string {
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

interface MedStatus {
  canGive: boolean;
  countdown: string | null;
  nextAt: Date | null;
  lastLog: MedLog | null;
}

function getMedStatus(med: Medication, logs: MedLog[]): MedStatus {
  const medLogs = logs
    .filter(l => l.medication_id === med.id)
    .sort((a, b) => new Date(b.taken_at).getTime() - new Date(a.taken_at).getTime());
  const lastLog = medLogs[0] ?? null;

  if (!lastLog || !med.frequency_hours) {
    return { canGive: true, countdown: null, nextAt: null, lastLog };
  }
  const nextAt  = new Date(new Date(lastLog.taken_at).getTime() + med.frequency_hours * 3600000);
  const msLeft  = nextAt.getTime() - Date.now();
  if (msLeft <= 0) return { canGive: true, countdown: null, nextAt: null, lastLog };
  return { canGive: false, countdown: formatCountdown(msLeft), nextAt, lastLog };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  type: 'baby' | 'parent';
  userId: string | null;
  babyId?: string | null;
  babyName?: string | null;
  babyWeightLbs?: number | null;
  userName?: string | null;
}

export default function MedTracker({ type, userId, babyId, babyName, babyWeightLbs, userName }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [meds,         setMeds]         = useState<Medication[]>([]);
  const [logs,         setLogs]         = useState<MedLog[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [expanded, toggleExpanded] = useCollapsed(`med_${type}_collapsed`);
  const [showHistory,  setShowHistory]  = useState(false);

  // Give modal
  const [givingMed,    setGivingMed]    = useState<Medication | null>(null);
  const [giveNote,     setGiveNote]     = useState('');
  const [giveDose,     setGiveDose]     = useState('');
  const [giving,       setGiving]       = useState(false);

  // Add modal – step 1: pick, step 2: configure
  const [addOpen,      setAddOpen]      = useState(false);
  const [addStep,      setAddStep]      = useState<'pick' | 'configure'>('pick');
  const [showRx,       setShowRx]       = useState(false);
  const [parentCat,    setParentCat]    = useState<'postpartum' | 'pregnant'>('postpartum');
  const [pickedPreset, setPickedPreset] = useState<PresetItem | null>(null);
  const [customName,   setCustomName]   = useState('');
  const [editingMed,   setEditingMed]   = useState<Medication | null>(null);
  const [cfgDose,      setCfgDose]      = useState('');
  const [cfgFreq,      setCfgFreq]      = useState<number>(24);
  const [cfgFreqCustom, setCfgFreqCustom] = useState('');
  const [cfgReminder,  setCfgReminder]  = useState(false);
  const [cfgColor,     setCfgColor]     = useState(MED_PALETTE[0]);
  const [cfgIsPrx,     setCfgIsPrx]     = useState(false);
  const [saving,       setSaving]       = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    const medsFilter = type === 'baby'
      ? (supabase.from('medications') as any).select('*').eq('user_id', userId).eq('category', 'baby').eq('active', true).order('created_at')
      : (supabase.from('medications') as any).select('*').eq('user_id', userId).neq('category', 'baby').eq('active', true).order('created_at');

    const [medsRes, logsRes] = await Promise.all([
      medsFilter,
      (supabase.from('medication_logs') as any)
        .select('*').eq('user_id', userId).gte('taken_at', ago48h()).order('taken_at', { ascending: false }),
    ]);

    setMeds(medsRes.data ?? []);
    setLogs(logsRes.data ?? []);
    setLoading(false);
  }, [userId, type]);

  useEffect(() => { load(); }, [load]);

  // Realtime – re-load logs when a new dose is logged (caregiver coordination)
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`med-logs-${type}-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'medication_logs',
        filter: `user_id=eq.${userId}`,
      }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, type, load]);

  // ── Schedule reminder notification ────────────────────────────────────────

  async function scheduleReminder(med: Medication, nextAt: Date) {
    if (!med.reminder_enabled) return;
    if (nextAt.getTime() <= Date.now()) return;
    const ok = await ensureNotificationPermission();
    if (!ok) return;
    await Notifications.cancelScheduledNotificationAsync(`med-${med.id}`).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: `med-${med.id}`,
      content: {
        title: type === 'baby'
          ? `${babyName || 'Baby'}'s medication`
          : 'Medication reminder',
        body: `Time to ${type === 'baby' ? 'give' : 'take'} ${med.name}`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: nextAt,
      },
    });
  }

  async function cancelReminder(medId: string) {
    await Notifications.cancelScheduledNotificationAsync(`med-${medId}`).catch(() => {});
  }

  // ── Log a dose ────────────────────────────────────────────────────────────

  async function confirmGive() {
    if (!givingMed || !userId) return;
    setGiving(true);
    const doseGiven = giveDose.trim() || givingMed.dose || null;
    const nextAt = givingMed.frequency_hours
      ? new Date(Date.now() + givingMed.frequency_hours * 3600000)
      : null;

    await safeInsert('medication_logs', {
      medication_id:  givingMed.id,
      user_id:        userId,
      baby_id:        type === 'baby' ? (babyId ?? null) : null,
      dose_given:     doseGiven,
      notes:          giveNote.trim() || null,
      logged_by_name: userName ?? null,
      taken_at:       new Date().toISOString(),
    });

    if (nextAt) await scheduleReminder(givingMed, nextAt);
    setGiving(false);
    setGivingMed(null);
    setGiveNote('');
    setGiveDose('');
    load();
  }

  // ── Open give modal ───────────────────────────────────────────────────────

  function openGive(med: Medication) {
    const status = getMedStatus(med, logs);
    if (!status.canGive) {
      Alert.alert(
        'Too soon',
        `${med.name} can be given again in ${status.countdown}.\n\nLog anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log anyway', onPress: () => startGive(med) },
        ],
      );
      return;
    }
    startGive(med);
  }

  function startGive(med: Medication) {
    const doseInfo = getDoseInfo(med.name, babyWeightLbs);
    setGiveDose(doseInfo && !doseInfo.needsDoctorConsult ? `${doseInfo.mlMax} mL` : (med.dose ?? ''));
    setGiveNote('');
    setGivingMed(med);
  }

  // ── Remove medication ─────────────────────────────────────────────────────

  function archiveMed(med: Medication) {
    Alert.alert('Remove medication?', 'This hides it from your list but keeps the log history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await safeUpdate('medications', med.id, { active: false });
        await cancelReminder(med.id);
        load();
      }},
    ]);
  }

  // ── Add medication ────────────────────────────────────────────────────────

  function pickPreset(preset: PresetItem) {
    setPickedPreset(preset);
    setCfgDose(preset.dose === 'weight-based' ? '' : preset.dose);
    setCfgFreq(preset.frequencyHours);
    setCfgColor(preset.color);
    setCfgIsPrx(preset.isPrescription ?? false);
    setCfgReminder(false);
    setCustomName('');
    setAddStep('configure');
  }

  function pickCustom() {
    setPickedPreset(null);
    setCfgDose('');
    setCfgFreq(24);
    setCfgColor(MED_PALETTE[0]);
    setCfgIsPrx(false);
    setCfgReminder(false);
    setAddStep('configure');
  }

  function openEditMed(med: Medication) {
    setEditingMed(med);
    setPickedPreset(null);
    setCustomName(med.name);
    setCfgDose(med.dose ?? '');
    const knownFreq = [4, 6, 8, 12, 24, 0].includes(med.frequency_hours ?? -2);
    setCfgFreq(med.frequency_hours == null ? 0 : knownFreq ? med.frequency_hours : -1);
    setCfgFreqCustom(med.frequency_hours != null && !knownFreq ? String(med.frequency_hours) : '');
    setCfgReminder(med.reminder_enabled);
    setCfgColor(med.color);
    setCfgIsPrx(med.is_prescription);
    setAddStep('configure');
    setAddOpen(true);
  }

  async function saveMed() {
    if (!userId) return;
    const name = editingMed ? editingMed.name : pickedPreset ? pickedPreset.name : customName.trim();
    if (!name) return;
    setSaving(true);

    const frequencyHours = cfgFreq === -1 ? (parseFloat(cfgFreqCustom) || null) : (cfgFreq || null);

    if (editingMed) {
      await safeUpdate('medications', editingMed.id, {
        dose:             cfgDose.trim() || null,
        frequency_hours:  frequencyHours,
        reminder_enabled: cfgReminder,
        color:            cfgColor,
        is_prescription:  cfgIsPrx,
      });
      if (!cfgReminder) await cancelReminder(editingMed.id);
    } else {
      const cat: Medication['category'] = type === 'baby' ? 'baby' : (parentCat as any);
      await safeInsert('medications', {
        user_id:          userId,
        baby_id:          type === 'baby' ? (babyId ?? null) : null,
        name,
        category:         cat,
        dose:             cfgDose.trim() || null,
        frequency_hours:  frequencyHours,
        reminder_enabled: cfgReminder,
        color:            cfgColor,
        is_prescription:  cfgIsPrx,
      });
    }

    setSaving(false);
    closeAdd();
    load();
  }

  function closeAdd() {
    setAddOpen(false);
    setAddStep('pick');
    setPickedPreset(null);
    setCustomName('');
    setShowRx(false);
    setCfgFreq(24);
    setCfgFreqCustom('');
    setEditingMed(null);
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const takenCount = meds.filter(m => {
    const last = logs.find(l => l.medication_id === m.id);
    if (!last) return false;
    return new Date(last.taken_at) >= new Date(new Date().setHours(0, 0, 0, 0));
  }).length;

  // Alternating tracker – baby only, when both Tylenol + Motrin are active
  const tylenolMed = type === 'baby' ? meds.find(m => isTylenol(m.name)) : undefined;
  const motrinMed  = type === 'baby' ? meds.find(m => isMotrin(m.name))  : undefined;
  const showAlt    = !!(tylenolMed && motrinMed);

  const tylenolStatus = tylenolMed ? getMedStatus(tylenolMed, logs) : null;
  const motrinStatus  = motrinMed  ? getMedStatus(motrinMed,  logs) : null;

  // Which alternating med to suggest next
  const altNext: 'tylenol' | 'motrin' | null = showAlt
    ? motrinStatus?.canGive && !tylenolStatus?.canGive ? 'motrin'
    : tylenolStatus?.canGive && !motrinStatus?.canGive ? 'tylenol'
    : motrinStatus?.canGive  ? 'motrin'  // both safe: suggest motrin (longer interval)
    : null
    : null;

  // Presets for add modal
  const otcList  = type === 'baby' ? BABY_OTC  : parentCat === 'postpartum' ? POSTPARTUM_OTC  : PREGNANT_OTC;
  const rxList   = type === 'baby' ? BABY_RX   : parentCat === 'postpartum' ? POSTPARTUM_RX   : PREGNANT_RX;
  const alreadyAdded = new Set(meds.map(m => m.name));

  // ── Render ────────────────────────────────────────────────────────────────

  const headerSub = loading
    ? 'Loading…'
    : meds.length === 0
    ? `Tap to add ${type === 'baby' ? "baby's" : 'your'} medications`
    : `${takenCount}/${meds.length} taken today`;

  return (
    <View style={s.wrap}>

      {/* ── Collapsed header ── */}
      <TrackerHeader
        emoji="💊" title={type === 'baby' ? 'Baby Medications' : 'Meds & Supplements'}
        subtitle={headerSub}
        collapsed={!expanded} onToggle={toggleExpanded}
        accentBg={c.cardHoney} accentColor={c.honey}
      />

      {expanded && (
        <View style={s.body}>

          {/* ── Baby weight note ── */}
          {type === 'baby' && !babyWeightLbs && (
            <View style={s.weightNote}>
              <Text style={s.weightNoteText}>
                ⚖️  Set baby's current weight in the Baby Profile to enable the dosing calculator.
              </Text>
            </View>
          )}

          {/* ── Alternating Tylenol / Motrin tracker ── */}
          {showAlt && tylenolMed && motrinMed && tylenolStatus && motrinStatus && (
            <View style={s.altCard}>
              <Text style={s.altTitle}>🔄  Alternating Tracker</Text>
              <View style={s.altRow}>
                {/* Tylenol column */}
                <View style={[s.altCol, { borderColor: '#E87D6A33', backgroundColor: '#E87D6A10' }]}>
                  <Text style={s.altMedName}>Tylenol</Text>
                  {tylenolStatus.lastLog ? (
                    <>
                      <Text style={[s.altStatus, { color: tylenolStatus.canGive ? '#22c55e' : '#E87D6A' }]}>
                        {tylenolStatus.canGive ? '✓ Safe now' : `⏱ ${tylenolStatus.countdown}`}
                      </Text>
                      <Text style={s.altAgo}>{formatTimeAgo(tylenolStatus.lastLog.taken_at)}</Text>
                    </>
                  ) : (
                    <Text style={s.altAgo}>Not yet given</Text>
                  )}
                </View>

                <Text style={s.altDivider}>↔</Text>

                {/* Motrin column */}
                <View style={[s.altCol, { borderColor: '#F5A62333', backgroundColor: '#F5A62310' }]}>
                  <Text style={s.altMedName}>Motrin</Text>
                  {motrinStatus.lastLog ? (
                    <>
                      <Text style={[s.altStatus, { color: motrinStatus.canGive ? '#22c55e' : '#F5A623' }]}>
                        {motrinStatus.canGive ? '✓ Safe now' : `⏱ ${motrinStatus.countdown}`}
                      </Text>
                      <Text style={s.altAgo}>{formatTimeAgo(motrinStatus.lastLog.taken_at)}</Text>
                    </>
                  ) : (
                    <Text style={s.altAgo}>Not yet given</Text>
                  )}
                </View>
              </View>

              {altNext && (
                <TouchableOpacity
                  style={[s.altGiveBtn, { backgroundColor: altNext === 'tylenol' ? '#E87D6A' : '#F5A623' }]}
                  onPress={() => openGive(altNext === 'tylenol' ? tylenolMed : motrinMed)}
                  activeOpacity={0.8}
                >
                  <Text style={s.altGiveBtnText}>
                    Give {altNext === 'tylenol' ? 'Tylenol' : 'Motrin'} now →
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Parent category toggle ── */}
          {type === 'parent' && (
            <View style={s.catToggleRow}>
              <TouchableOpacity
                style={[s.catToggleBtn, parentCat === 'postpartum' && s.catToggleActive]}
                onPress={() => setParentCat('postpartum')} activeOpacity={0.8}>
                <Text style={[s.catToggleText, parentCat === 'postpartum' && s.catToggleTextActive]}>Postpartum</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.catToggleBtn, parentCat === 'pregnant' && s.catToggleActive]}
                onPress={() => setParentCat('pregnant')} activeOpacity={0.8}>
                <Text style={[s.catToggleText, parentCat === 'pregnant' && s.catToggleTextActive]}>Pregnant</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Med list ── */}
          {loading ? (
            <ActivityIndicator color={c.primary} style={{ margin: 16 }} />
          ) : meds.length === 0 ? (
            <Text style={s.emptyText}>No medications added yet.</Text>
          ) : (
            meds.map(med => {
              const status   = getMedStatus(med, logs);
              const doseInfo = getDoseInfo(med.name, babyWeightLbs);
              const doseLine = doseInfo?.needsDoctorConsult
                ? 'Ask a doctor for dosing'
                : doseInfo
                ? `${doseInfo.mlMin}–${doseInfo.mlMax} mL  (${doseInfo.mgMin}–${doseInfo.mgMax} mg)`
                : med.dose;

              return (
                <View key={med.id} style={s.medCard}>
                  <View style={[s.medColorBar, { backgroundColor: med.color }]} />
                  <View style={s.medBody}>
                    <View style={s.medTopRow}>
                      <Text style={s.medName} numberOfLines={1}>
                        {med.is_prescription ? '℞ ' : ''}{med.name}
                      </Text>
                      <TouchableOpacity onPress={() => openEditMed(med)} style={s.medRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button" accessibilityLabel={`Edit ${med.name}`}>
                        <Text style={s.medEditText}>✎</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => archiveMed(med)} style={s.medRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button" accessibilityLabel={`Remove ${med.name}`}>
                        <Text style={s.medRemoveText}>×</Text>
                      </TouchableOpacity>
                    </View>

                    {doseLine ? (
                      <Text style={s.medDose}>
                        {doseLine}
                        {doseInfo ? ` · ${doseInfo.concentration}` : ''}
                      </Text>
                    ) : null}

                    <View style={s.medBottomRow}>
                      {/* Status chip */}
                      <View style={[
                        s.statusChip,
                        { backgroundColor: status.canGive ? '#22c55e18' : '#E87D6A18' },
                      ]}>
                        <Text style={[s.statusText, { color: status.canGive ? '#22c55e' : '#E87D6A' }]}>
                          {status.canGive
                            ? status.lastLog ? '✓ Safe now' : '+ Give first dose'
                            : `⏱ ${status.countdown}`}
                        </Text>
                      </View>

                      {/* Last logged */}
                      {status.lastLog && (
                        <Text style={s.lastGiven}>
                          {formatTimeAgo(status.lastLog.taken_at)}
                          {status.lastLog.logged_by_name ? ` · ${status.lastLog.logged_by_name}` : ''}
                        </Text>
                      )}

                      {/* Give button */}
                      <TouchableOpacity
                        style={[s.giveBtn, { backgroundColor: med.color }]}
                        onPress={() => openGive(med)}
                        activeOpacity={0.8}
                      >
                        <Text style={s.giveBtnText}>{type === 'baby' ? 'Give' : 'Take'}</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Reminder badge */}
                    {med.reminder_enabled && (
                      <Text style={s.reminderBadge}>🔔 Reminder set</Text>
                    )}
                  </View>
                </View>
              );
            })
          )}

          {/* ── Add button ── */}
          <TouchableOpacity style={s.addBtn} onPress={() => { setAddOpen(true); setAddStep('pick'); }} activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel="Add medication">
            <Text style={s.addBtnText}>+ Add Medication</Text>
          </TouchableOpacity>

          {/* ── History ── */}
          <DisclosureToggle
            label="Dose history (48h)" expanded={showHistory}
            onPress={() => setShowHistory(p => !p)}
            style={{ alignItems: 'center', paddingVertical: 6 }}
          />

          {showHistory && (
            <View style={s.historyList}>
              {logs.length === 0 ? (
                <Text style={s.emptyText}>No doses logged yet.</Text>
              ) : (
                logs.map(log => {
                  const med = meds.find(m => m.id === log.medication_id);
                  if (!med) return null;
                  return (
                    <View key={log.id} style={s.historyRow}>
                      <View style={[s.historyDot, { backgroundColor: med.color }]} />
                      <View style={s.historyInfo}>
                        <Text style={s.historyMedName}>{med.name}</Text>
                        <Text style={s.historyMeta}>
                          {formatClockTime(log.taken_at)}
                          {log.dose_given ? ` · ${log.dose_given}` : ''}
                          {log.logged_by_name ? ` · ${log.logged_by_name}` : ''}
                        </Text>
                        {log.notes ? <Text style={s.historyNote}>{log.notes}</Text> : null}
                      </View>
                      <Text style={s.historyAgo}>{formatTimeAgo(log.taken_at)}</Text>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </View>
      )}

      {/* ══ Give / Take modal ══════════════════════════════════════════════════ */}
      <Modal visible={!!givingMed} transparent animationType="fade" onRequestClose={() => setGivingMed(null)}>
        <View style={s.modalOverlay}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setGivingMed(null)}
            accessibilityRole="button" accessibilityLabel="Close" />
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>
              {type === 'baby' ? 'Give' : 'Take'} {givingMed?.name}
            </Text>

            {givingMed && (() => {
              const doseInfo = getDoseInfo(givingMed.name, babyWeightLbs);
              if (!doseInfo) return null;
              if (doseInfo.needsDoctorConsult) {
                return (
                  <View style={s.doseCalcCard}>
                    <Text style={s.doseCalcLabel}>📐 Calculated dose for {babyWeightLbs} lbs</Text>
                    <Text style={s.doseCalcNote}>⚠️  {doseInfo.note}</Text>
                  </View>
                );
              }
              return (
                <View style={s.doseCalcCard}>
                  <Text style={s.doseCalcLabel}>📐 Calculated dose for {babyWeightLbs} lbs</Text>
                  <Text style={s.doseCalcValue}>{doseInfo.mlMin}–{doseInfo.mlMax} mL</Text>
                  <Text style={s.doseCalcSub}>
                    ({doseInfo.mgMin}–{doseInfo.mgMax} mg · {doseInfo.concentration})
                  </Text>
                  {doseInfo.note ? <Text style={s.doseCalcNote}>⚠️  {doseInfo.note}</Text> : null}
                </View>
              );
            })()}

            <Text style={s.inputLabel}>Dose given</Text>
            <TextInput
              style={s.input}
              value={giveDose}
              onChangeText={setGiveDose}
              placeholder={givingMed?.dose ?? 'e.g. 2.5 mL'}
              placeholderTextColor={c.textMuted}
            />

            <Text style={s.inputLabel}>Notes <Text style={s.optional}>(optional)</Text></Text>
            <TextInput
              style={[s.input, { height: 72, textAlignVertical: 'top' }]}
              value={giveNote}
              onChangeText={setGiveNote}
              placeholder="e.g. temp was 101.4, spit some out…"
              placeholderTextColor={c.textMuted}
              multiline
            />

            <View style={s.modalBtnRow}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setGivingMed(null)}
                accessibilityRole="button" accessibilityLabel="Cancel">
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirmBtn, { backgroundColor: givingMed?.color ?? c.primary }]}
                onPress={confirmGive}
                disabled={giving}
                accessibilityRole="button" accessibilityLabel="Confirm dose given"
                activeOpacity={0.8}
              >
                {giving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.modalConfirmText}>✓ Confirm</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══ Add medication modal ══════════════════════════════════════════════ */}
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={closeAdd}>
        <View style={s.modalOverlay}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={closeAdd}
            accessibilityRole="button" accessibilityLabel="Close" />
          <View style={[s.modalSheet, { maxHeight: '85%' }]}>
            <View style={s.modalHandle} />

            {addStep === 'pick' ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={s.modalHeader}>
                  <Text style={s.modalTitle}>Add Medication</Text>
                </View>

                {/* Parent category filter */}
                {type === 'parent' && (
                  <View style={s.catToggleRow}>
                    <TouchableOpacity
                      style={[s.catToggleBtn, parentCat === 'postpartum' && s.catToggleActive]}
                      onPress={() => setParentCat('postpartum')} activeOpacity={0.8}>
                      <Text style={[s.catToggleText, parentCat === 'postpartum' && s.catToggleTextActive]}>Postpartum</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.catToggleBtn, parentCat === 'pregnant' && s.catToggleActive]}
                      onPress={() => setParentCat('pregnant')} activeOpacity={0.8}>
                      <Text style={[s.catToggleText, parentCat === 'pregnant' && s.catToggleTextActive]}>Pregnant</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <Text style={s.pickSection}>Common medications</Text>
                <View style={s.presetGrid}>
                  {otcList.filter(p => !alreadyAdded.has(p.name)).map(p => (
                    <TouchableOpacity key={p.name} style={[s.presetChip, { borderColor: p.color, backgroundColor: p.color + '20' }]}
                      onPress={() => pickPreset(p)} activeOpacity={0.8}>
                      <Text style={[s.presetChipText, { color: p.color }]}>{p.name}</Text>
                      <Text style={[s.presetChipSub, { color: p.color + 'AA' }]}>Every {p.frequencyHours}h</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <DisclosureToggle
                  label="Show prescription medications (Rx)" expanded={showRx}
                  onPress={() => setShowRx(p => !p)}
                  style={{ alignItems: 'center', paddingVertical: 10, marginTop: 4 }}
                />

                {showRx && (
                  <View style={[s.presetGrid, { marginTop: 4 }]}>
                    {rxList.filter(p => !alreadyAdded.has(p.name)).map(p => (
                      <TouchableOpacity key={p.name} style={[s.presetChip, { borderColor: p.color, backgroundColor: p.color + '20' }]}
                        onPress={() => pickPreset(p)} activeOpacity={0.8}>
                        <Text style={[s.presetChipText, { color: p.color }]}>℞ {p.name}</Text>
                        <Text style={[s.presetChipSub, { color: p.color + 'AA' }]}>Every {p.frequencyHours}h</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <Text style={s.pickSection}>Or enter a custom medication</Text>
                <View style={s.customRow}>
                  <TextInput
                    style={[s.input, { flex: 1 }]}
                    placeholder="Medication name…"
                    placeholderTextColor={c.textMuted}
                    value={customName}
                    onChangeText={setCustomName}
                  />
                  <TouchableOpacity
                    style={[s.customGoBtn, { opacity: customName.trim() ? 1 : 0.4 }]}
                    onPress={pickCustom} disabled={!customName.trim()} activeOpacity={0.8}>
                    <Text style={s.customGoBtnText}>Next →</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={s.modalHeader}>
                  {!editingMed && (
                    <TouchableOpacity onPress={() => setAddStep('pick')} style={s.backBtn}
                      accessibilityRole="button" accessibilityLabel="Back">
                      <Text style={s.backBtnText}>← Back</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={s.modalTitle}>
                    {editingMed ? `Edit ${editingMed.name}` : pickedPreset ? pickedPreset.name : customName}
                  </Text>
                </View>

                {pickedPreset?.note && (
                  <View style={s.presetNote}>
                    <Text style={s.presetNoteText}>ℹ️  {pickedPreset.note}</Text>
                  </View>
                )}

                <Text style={s.inputLabel}>Dose</Text>
                <TextInput
                  style={s.input}
                  value={cfgDose}
                  onChangeText={setCfgDose}
                  placeholder={isWeightBased(pickedPreset?.name ?? customName) ? 'Calculated by baby weight above' : 'e.g. 1 tablet, 5 mL'}
                  placeholderTextColor={c.textMuted}
                />

                <Text style={s.inputLabel}>How often?</Text>
                <View style={s.freqGrid}>
                  {[
                    { h: 4,  label: 'Every 4h' },
                    { h: 6,  label: 'Every 6h' },
                    { h: 8,  label: 'Every 8h' },
                    { h: 12, label: 'Every 12h' },
                    { h: 24, label: 'Daily' },
                    { h: 0,  label: 'As needed' },
                    { h: -1, label: 'Other…' },
                  ].map(f => (
                    <TouchableOpacity
                      key={f.h}
                      style={[s.freqChip, (cfgFreq === f.h || (f.h === -1 && cfgFreq === -1)) && { backgroundColor: c.cardSage, borderColor: c.sage }]}
                      onPress={() => { setCfgFreq(f.h); if (f.h !== -1) setCfgFreqCustom(''); }}
                      activeOpacity={0.8}>
                      <Text style={[s.freqChipText, (cfgFreq === f.h || (f.h === -1 && cfgFreq === -1)) && { color: c.sage, fontWeight: '700' }]}>{f.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {cfgFreq === -1 && (
                  <View style={s.customFreqRow}>
                    <TextInput
                      style={[s.input, { flex: 1 }]}
                      placeholder="Number of hours"
                      placeholderTextColor={c.textMuted}
                      keyboardType="numeric"
                      value={cfgFreqCustom}
                      onChangeText={v => setCfgFreqCustom(v.replace(/[^0-9]/g, ''))}
                    />
                    <Text style={s.customFreqLabel}>hours</Text>
                  </View>
                )}

                <View style={s.switchRow}>
                  <Text style={s.inputLabel}>🔔 Remind me after each dose</Text>
                  <TouchableOpacity
                    style={[s.toggle, cfgReminder && { backgroundColor: c.sage }]}
                    onPress={() => setCfgReminder(p => !p)} activeOpacity={0.8}
                    accessibilityRole="switch" accessibilityLabel="Reminder" accessibilityState={{ checked: cfgReminder }}>
                    <View style={[s.toggleThumb, cfgReminder && { transform: [{ translateX: 20 }] }]} />
                  </TouchableOpacity>
                </View>

                <Text style={s.inputLabel}>Color</Text>
                <View style={s.colorRow}>
                  {MED_PALETTE.map(hex => (
                    <TouchableOpacity
                      key={hex}
                      style={[s.colorDot, { backgroundColor: hex }, cfgColor === hex && s.colorDotActive]}
                      onPress={() => setCfgColor(hex)}
                      accessibilityRole="button" accessibilityLabel="Color option" />
                  ))}
                </View>

                <View style={s.modalBtnRow}>
                  <TouchableOpacity style={s.modalCancelBtn} onPress={closeAdd}
                    accessibilityRole="button" accessibilityLabel="Cancel">
                    <Text style={s.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.modalConfirmBtn, { backgroundColor: cfgColor, opacity: saving ? 0.6 : 1 }]}
                    onPress={saveMed} disabled={saving} activeOpacity={0.8}
                    accessibilityRole="button" accessibilityLabel="Save medication">
                    {saving
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={s.modalConfirmText}>{editingMed ? 'Save Changes' : 'Add Medication'}</Text>
                    }
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    wrap:        { marginBottom: 16 },
    body:        { backgroundColor: c.card, borderRadius: 16, borderWidth: 1.5, borderColor: c.separator, padding: 14, marginTop: 14, gap: 10 },

    weightNote:     { backgroundColor: c.cardHoney, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: c.honey },
    weightNoteText: { fontSize: 13, color: c.textSecondary, lineHeight: 18 },

    // Alternating tracker
    altCard:      { backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator, padding: 12 },
    altTitle:     { fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 10 },
    altRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    altCol:       { flex: 1, borderRadius: 10, borderWidth: 1.5, padding: 10, alignItems: 'center', gap: 4 },
    altMedName:   { fontSize: 13, fontWeight: '800', color: c.textPrimary },
    altStatus:    { fontSize: 13, fontWeight: '700' },
    altAgo:       { fontSize: 11, color: c.textMuted },
    altDivider:   { fontSize: 18, color: c.textMuted },
    altGiveBtn:   { borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
    altGiveBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

    // Category toggle
    catToggleRow:        { flexDirection: 'row', gap: 8, marginBottom: 4 },
    catToggleBtn:        { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    catToggleActive:     { backgroundColor: c.cardLavender, borderColor: c.lavender },
    catToggleText:       { fontSize: 13, fontWeight: '600', color: c.textMuted },
    catToggleTextActive: { color: c.lavender, fontWeight: '700' },

    emptyText: { fontSize: 13, color: c.textMuted, textAlign: 'center', paddingVertical: 8 },

    // Med cards
    medCard:     { flexDirection: 'row', borderRadius: 12, borderWidth: 1.5, borderColor: c.separator, overflow: 'hidden', backgroundColor: c.bg },
    medColorBar: { width: 5 },
    medBody:     { flex: 1, padding: 10, gap: 4 },
    medTopRow:   { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    medName:     { flex: 1, fontSize: 14, fontWeight: '800', color: c.textPrimary },
    medRemove:   { paddingLeft: 8 },
    medRemoveText: { fontSize: 18, color: c.textMuted, lineHeight: 20 },
    medEditText: { fontSize: 15, color: c.textMuted, lineHeight: 20 },
    medDose:     { fontSize: 12, color: c.textSecondary },
    medBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    statusChip:  { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    statusText:  { fontSize: 12, fontWeight: '700' },
    lastGiven:   { fontSize: 11, color: c.textMuted, flex: 1 },
    giveBtn:     { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
    giveBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
    reminderBadge: { fontSize: 11, color: c.textMuted },

    addBtn:    { backgroundColor: c.cardSage, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#A7F3D0' },
    addBtnText:{ fontSize: 14, fontWeight: '700', color: c.sage },

    historyList:      { gap: 8 },
    historyRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    historyDot:       { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
    historyInfo:      { flex: 1 },
    historyMedName:   { fontSize: 13, fontWeight: '700', color: c.textPrimary },
    historyMeta:      { fontSize: 12, color: c.textSecondary },
    historyNote:      { fontSize: 12, color: c.textMuted, fontStyle: 'italic', marginTop: 2 },
    historyAgo:       { fontSize: 11, color: c.textMuted },

    // Modals
    modalOverlay:   { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
    modalSheet:     { backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
    modalHandle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: c.separator, alignSelf: 'center', marginBottom: 16 },
    modalHeader:    { marginBottom: 16 },
    modalTitle:     { fontSize: 18, fontWeight: '800', color: c.textPrimary },
    backBtn:        { marginBottom: 4 },
    backBtnText:    { fontSize: 13, color: c.textMuted },

    doseCalcCard:  { backgroundColor: '#E87D6A15', borderRadius: 12, borderWidth: 1.5, borderColor: '#E87D6A44', padding: 12, marginBottom: 12, alignItems: 'center' },
    doseCalcLabel: { fontSize: 12, color: '#E87D6A', fontWeight: '600', marginBottom: 4 },
    doseCalcValue: { fontSize: 24, fontWeight: '900', color: '#E87D6A' },
    doseCalcSub:   { fontSize: 12, color: '#E87D6AAA', marginTop: 2 },
    doseCalcNote:  { fontSize: 11, color: '#E87D6A', marginTop: 6, textAlign: 'center' },

    inputLabel: { fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 6, marginTop: 8 },
    optional:   { fontWeight: '400', color: c.textMuted },
    input:      { backgroundColor: c.bg, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, padding: 12, fontSize: 14, color: c.textPrimary },

    modalBtnRow:     { flexDirection: 'row', gap: 10, marginTop: 20 },
    modalCancelBtn:  { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator },
    modalCancelText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    modalConfirmBtn: { flex: 2, alignItems: 'center', paddingVertical: 13, borderRadius: 12 },
    modalConfirmText:{ fontSize: 14, fontWeight: '800', color: '#fff' },

    // Add modal - pick step
    pickSection: { fontSize: 13, fontWeight: '700', color: c.textSecondary, marginTop: 12, marginBottom: 8 },
    presetGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    presetChip:  { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '48%' },
    presetChipText: { fontSize: 13, fontWeight: '700' },
    presetChipSub:  { fontSize: 11, marginTop: 2 },

    presetNote:  { backgroundColor: c.cardHoney, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: c.honey, marginBottom: 4 },
    presetNoteText: { fontSize: 12, color: c.textSecondary },

    customRow:   { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 },
    customGoBtn: { backgroundColor: c.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
    customGoBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

    // Add modal - configure step
    freqGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    freqChip:  { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.bg },
    freqChipText: { fontSize: 13, color: c.textSecondary },
    customFreqRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
    customFreqLabel:{ fontSize: 14, color: c.textSecondary, fontWeight: '600' },

    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    toggle:    { width: 46, height: 26, borderRadius: 13, backgroundColor: c.separator, justifyContent: 'center', paddingHorizontal: 2 },
    toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },

    colorRow:      { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 4 },
    colorDot:      { width: 32, height: 32, borderRadius: 16, borderWidth: 3, borderColor: 'transparent' },
    colorDotActive:{ borderColor: c.textPrimary, transform: [{ scale: 1.15 }] },
  });
}
