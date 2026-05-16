import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type EntryType = 'feed' | 'diaper' | 'pumping';
type ActiveModal = EntryType | null;
type PickerOption = { value: string; label: string };
type ColorOption  = { value: string; color: string; label: string };
type TimelineEntry = {
  id: string; rawId: string;
  table: 'feeds' | 'diaper_logs' | 'pumping_sessions';
  type: EntryType; emoji: string; label: string; detail: string; logged_at: string;
};

// ─── Options ──────────────────────────────────────────────────────────────────

const FEED_TYPE: PickerOption[] = [
  { value: 'breast',  label: 'Breast 🤱' },
  { value: 'bottle',  label: 'Bottle 🍼' },
  { value: 'solids',  label: 'Solids 🥣' },
];
const CAREGIVER: PickerOption[] = [
  { value: 'mom',       label: 'Mom'       },
  { value: 'dad',       label: 'Dad'       },
  { value: 'partner',   label: 'Partner'   },
  { value: 'caregiver', label: 'Caregiver' },
  { value: 'daycare',   label: 'Daycare'   },
  { value: 'other',     label: 'Other'     },
];
const FEED_MOOD: PickerOption[] = [
  { value: 'calm',   label: 'Calm 😊'   },
  { value: 'fussy',  label: 'Fussy 😣'  },
  { value: 'sleepy', label: 'Sleepy 😴' },
  { value: 'alert',  label: 'Alert 👀'  },
];
const FEED_POSITION: PickerOption[] = [
  { value: 'cradle',     label: 'Cradle'     },
  { value: 'football',   label: 'Football'   },
  { value: 'side_lying', label: 'Side-lying' },
  { value: 'laid_back',  label: 'Laid-back'  },
  { value: 'other',      label: 'Other…'     },
];
const FEED_LATCH: PickerOption[] = [
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
];
const FEED_SPIT_UP: PickerOption[] = [
  { value: 'none',  label: 'None'  },
  { value: 'small', label: 'Small' },
  { value: 'large', label: 'Large' },
];
const DIAPER_TYPE: PickerOption[] = [
  { value: 'wet',   label: 'Wet 💧'   },
  { value: 'dirty', label: 'Dirty 💩' },
  { value: 'both',  label: 'Both'     },
  { value: 'dry',   label: 'Dry'      },
];
const DIAPER_COLORS: ColorOption[] = [
  { value: 'yellow', color: '#F5D76E', label: 'Yellow' },
  { value: 'brown',  color: '#8B5E3C', label: 'Brown'  },
  { value: 'green',  color: '#7BC67E', label: 'Green'  },
  { value: 'black',  color: '#3D3530', label: 'Black'  },
  { value: 'red',    color: '#E57373', label: 'Red'    },
];
const DIAPER_CONSIST: PickerOption[] = [
  { value: 'watery', label: 'Watery' },
  { value: 'seedy',  label: 'Seedy'  },
  { value: 'pasty',  label: 'Pasty'  },
  { value: 'formed', label: 'Formed' },
];
const DIAPER_AMOUNT: PickerOption[] = [
  { value: 'small',   label: 'Small'      },
  { value: 'medium',  label: 'Medium'     },
  { value: 'large',   label: 'Large'      },
  { value: 'blowout', label: 'Blowout 💥' },
];
const DIAPER_RASH: PickerOption[] = [
  { value: 'none',     label: 'None'     },
  { value: 'mild',     label: 'Mild'     },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe',   label: 'Severe'   },
];
const PUMP_HOW_FEEL: PickerOption[] = [
  { value: 'comfortable',     label: 'Comfortable 😊'     },
  { value: 'mild_discomfort', label: 'Mild Discomfort 😐' },
  { value: 'uncomfortable',   label: 'Uncomfortable 😣'   },
];
const PUMP_STORAGE: PickerOption[] = [
  { value: 'fridge',           label: 'Fridge 🧊'   },
  { value: 'freezer',          label: 'Freezer ❄️'  },
  { value: 'used_immediately', label: 'Used Now 🍼' },
];
const MILK_COLORS: ColorOption[] = [
  { value: 'white',  color: '#F0EDE8', label: 'White'  },
  { value: 'yellow', color: '#F5D76E', label: 'Yellow' },
  { value: 'blue',   color: '#AED6F1', label: 'Blue'   },
  { value: 'pink',   color: '#F1AEB5', label: 'Pink'   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayRange() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end   = new Date(); end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function formatTimer(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

// ─── useTimer ─────────────────────────────────────────────────────────────────

function useTimer() {
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [paused,  setPaused]  = useState(false);

  useEffect(() => () => { if (ref.current) clearInterval(ref.current); }, []);

  const tick = () => { ref.current = setInterval(() => setElapsed(s => s + 1), 1000); };

  const start  = useCallback(() => { setRunning(true); setPaused(false); tick(); }, []);
  const pause  = useCallback(() => { if (ref.current) clearInterval(ref.current); setPaused(true); }, []);
  const resume = useCallback(() => { setPaused(false); tick(); }, []);
  const stop   = useCallback(() => { if (ref.current) clearInterval(ref.current); setRunning(false); setPaused(false); }, []);
  const reset  = useCallback(() => { if (ref.current) clearInterval(ref.current); setRunning(false); setPaused(false); setElapsed(0); }, []);

  return { elapsed, running, paused, start, pause, resume, stop, reset };
}

// ─── PickerField ──────────────────────────────────────────────────────────────

function PickerField({ label, options, value, onChange, accent }: {
  label: string; options: PickerOption[]; value: string;
  onChange: (v: string) => void; accent: string;
}) {
  return (
    <View style={pf.wrap}>
      <Text style={pf.label}>{label}</Text>
      <View style={pf.row}>
        {options.map(opt => {
          const sel = opt.value === value;
          return (
            <TouchableOpacity key={opt.value}
              style={[pf.chip, sel && { backgroundColor: accent, borderColor: accent }]}
              onPress={() => onChange(opt.value)} activeOpacity={0.75}>
              <Text style={[pf.chipText, sel && pf.chipSel]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
const pf = StyleSheet.create({
  wrap:    { marginBottom: 20 },
  label:   { fontSize: 12, fontWeight: '700', color: '#8A7E78', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
  row:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:    { borderWidth: 1.5, borderColor: '#E0D8D0', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  chipText:{ fontSize: 13, fontWeight: '600', color: '#5A544E' },
  chipSel: { color: '#fff' },
});

// ─── ColorCirclePicker ────────────────────────────────────────────────────────

function ColorCirclePicker({ label, options, value, onChange }: {
  label: string; options: ColorOption[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <View style={cp.wrap}>
      <Text style={pf.label}>{label}</Text>
      <View style={cp.row}>
        {options.map(opt => {
          const sel = opt.value === value;
          return (
            <TouchableOpacity key={opt.value}
              style={[cp.circle, { backgroundColor: opt.color }, sel && cp.selected]}
              onPress={() => onChange(opt.value)} activeOpacity={0.8}>
              {sel && <Text style={cp.check}>✓</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
const cp = StyleSheet.create({
  wrap:     { marginBottom: 20 },
  row:      { flexDirection: 'row', gap: 12 },
  circle:   { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#E0D8D0', alignItems: 'center', justifyContent: 'center' },
  selected: { borderColor: '#5A544E', borderWidth: 2.5 },
  check:    { fontSize: 16, fontWeight: '800', color: '#fff', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
});

// ─── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({ label, value, onChange, min = 0, max = 10, accent }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; accent: string;
}) {
  return (
    <View style={st.wrap}>
      <Text style={pf.label}>{label}</Text>
      <View style={st.row}>
        <TouchableOpacity style={[st.btn, { borderColor: accent }]}
          onPress={() => onChange(Math.max(min, value - 1))} activeOpacity={0.7}>
          <Text style={[st.btnText, { color: accent }]}>−</Text>
        </TouchableOpacity>
        <Text style={st.val}>{value}</Text>
        <TouchableOpacity style={[st.btn, { borderColor: accent }]}
          onPress={() => onChange(Math.min(max, value + 1))} activeOpacity={0.7}>
          <Text style={[st.btnText, { color: accent }]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const st = StyleSheet.create({
  wrap:    { marginBottom: 20 },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 16 },
  btn:     { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  btnText: { fontSize: 22, fontWeight: '600', lineHeight: 26 },
  val:     { fontSize: 24, fontWeight: '800', color: '#3D3530', minWidth: 32, textAlign: 'center' },
});

// ─── TimerWidget ──────────────────────────────────────────────────────────────

function TimerWidget({ timer, accent, useManual, onToggleManual, manualValue, onManualChange }: {
  timer: ReturnType<typeof useTimer>; accent: string;
  useManual: boolean; onToggleManual: () => void;
  manualValue: string; onManualChange: (v: string) => void;
}) {
  return (
    <View style={tw.wrap}>
      <View style={tw.header}>
        <Text style={pf.label}>Duration</Text>
        <TouchableOpacity onPress={onToggleManual}>
          <Text style={[tw.toggleLink, { color: accent }]}>
            {useManual ? 'Use timer' : 'Enter manually'}
          </Text>
        </TouchableOpacity>
      </View>

      {useManual ? (
        <View style={tw.manualRow}>
          <TextInput style={tw.manualInput} placeholder="0" placeholderTextColor="#C4BAB2"
            value={manualValue} onChangeText={onManualChange} keyboardType="number-pad" />
          <Text style={tw.manualUnit}>min</Text>
        </View>
      ) : (
        <>
          <Text style={[tw.display, { color: accent }]}>{formatTimer(timer.elapsed)}</Text>
          <View style={tw.btnRow}>
            {!timer.running && !timer.paused && (
              <TouchableOpacity style={[tw.timerBtn, { backgroundColor: accent }]} onPress={timer.start}>
                <Text style={tw.timerBtnText}>▶  Start</Text>
              </TouchableOpacity>
            )}
            {timer.running && !timer.paused && (
              <>
                <TouchableOpacity style={[tw.timerBtn, tw.outline, { borderColor: accent }]} onPress={timer.pause}>
                  <Text style={[tw.outlineText, { color: accent }]}>⏸  Pause</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[tw.timerBtn, tw.danger]} onPress={timer.stop}>
                  <Text style={tw.timerBtnText}>■  Stop</Text>
                </TouchableOpacity>
              </>
            )}
            {timer.paused && (
              <>
                <TouchableOpacity style={[tw.timerBtn, { backgroundColor: accent }]} onPress={timer.resume}>
                  <Text style={tw.timerBtnText}>▶  Resume</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[tw.timerBtn, tw.danger]} onPress={timer.reset}>
                  <Text style={tw.timerBtnText}>↺  Reset</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </>
      )}
    </View>
  );
}
const tw = StyleSheet.create({
  wrap:        { marginBottom: 20 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  toggleLink:  { fontSize: 12, fontWeight: '600' },
  display:     { fontSize: 52, fontWeight: '800', textAlign: 'center', marginBottom: 12, letterSpacing: 2 },
  btnRow:      { flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 4 },
  timerBtn:    { borderRadius: 22, paddingVertical: 10, paddingHorizontal: 22 },
  timerBtnText:{ color: '#fff', fontSize: 14, fontWeight: '700' },
  outline:     { borderWidth: 1.5, backgroundColor: 'transparent' },
  outlineText: { fontSize: 14, fontWeight: '700' },
  danger:      { backgroundColor: '#E57373' },
  manualRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  manualInput: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E0D8D0', borderRadius: 12,
                  paddingHorizontal: 14, paddingVertical: 12, fontSize: 28, fontWeight: '800',
                  color: '#3D3530', textAlign: 'center', width: 90 },
  manualUnit:  { fontSize: 16, color: '#8A7E78', fontWeight: '600' },
});

// ─── ModalSheet ───────────────────────────────────────────────────────────────

function ModalSheet({ visible, onClose, title, accent, onSave, saving, children }: {
  visible: boolean; onClose: () => void; title: string; accent: string;
  onSave: () => void; saving: boolean; children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={ms.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={ms.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[ms.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={ms.handle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            contentContainerStyle={ms.content}>
            <Text style={ms.title}>{title}</Text>
            {children}
            <TouchableOpacity style={[ms.saveBtn, { backgroundColor: accent }, saving && ms.saveBtnOff]}
              onPress={onSave} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={ms.saveBtnText}>Save</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={ms.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={ms.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const ms = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'flex-end' },
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(60,50,45,0.38)' },
  sheet:      { backgroundColor: '#FEFCF8', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, maxHeight: '92%' },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D8D0C8', alignSelf: 'center', marginBottom: 18 },
  content:    { paddingHorizontal: 24, paddingBottom: 8 },
  title:      { fontSize: 22, fontWeight: '800', color: '#3D3530', marginBottom: 24 },
  saveBtn:    { borderRadius: 14, paddingVertical: 17, alignItems: 'center', marginTop: 8, marginBottom: 12 },
  saveBtnOff: { opacity: 0.65 },
  saveBtnText:{ color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  cancelBtn:  { alignItems: 'center', paddingVertical: 12 },
  cancelText: { fontSize: 15, color: '#B0A89E', fontWeight: '600' },
});

// ─── NotesInput ───────────────────────────────────────────────────────────────

function NotesInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={pf.label}>Notes</Text>
      <TextInput style={ni.input} placeholder="Any additional notes…" placeholderTextColor="#C4BAB2"
        value={value} onChangeText={onChange} multiline numberOfLines={3} textAlignVertical="top" />
    </View>
  );
}
const ni = StyleSheet.create({
  input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E0D8D0', borderRadius: 12,
           paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: '#3D3530', minHeight: 80 },
});

// ─── Track screen ─────────────────────────────────────────────────────────────

export default function Track() {
  const [entries,    setEntries]    = useState<TimelineEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [saving,      setSaving]      = useState(false);

  // Feed form
  const [feedType,          setFeedType]          = useState('breast');
  const [feedMood,          setFeedMood]           = useState('calm');
  const [feedPosition,      setFeedPosition]       = useState('cradle');
  const [feedPositionOther, setFeedPositionOther]  = useState('');
  const [latchQuality,      setLatchQuality]       = useState('good');
  const [spitUp,            setSpitUp]             = useState('none');
  const [feedBurps,         setFeedBurps]          = useState(0);
  const [feedNotes,         setFeedNotes]          = useState('');
  const [feedCaregiver,     setFeedCaregiver]      = useState('mom');
  const [feedUseManual,     setFeedUseManual]      = useState(false);
  const [feedManualMin,     setFeedManualMin]      = useState('');
  const [breastLeft,        setBreastLeft]         = useState(true);
  const [breastRight,       setBreastRight]        = useState(false);
  const feedTimer = useTimer();

  // Diaper form
  const [diaperType,    setDiaperType]    = useState('wet');
  const [diaperColor,   setDiaperColor]   = useState('yellow');
  const [diaperConsist, setDiaperConsist] = useState('seedy');
  const [diaperAmount,  setDiaperAmount]  = useState('medium');
  const [diaperRash,    setDiaperRash]    = useState('none');
  const [diaperNotes,   setDiaperNotes]   = useState('');

  // Pumping form
  const [leftBreast,      setLeftBreast]      = useState('');
  const [rightBreast,     setRightBreast]     = useState('');
  const [suctionLevel,    setSuctionLevel]    = useState(5);
  const [howFeel,         setHowFeel]         = useState('comfortable');
  const [storageLocation, setStorageLocation] = useState('fridge');
  const [milkColor,       setMilkColor]       = useState('white');
  const [pumpUseManual,   setPumpUseManual]   = useState(false);
  const [pumpManualMin,   setPumpManualMin]   = useState('');
  const pumpTimer = useTimer();

  // ── Data ──────────────────────────────────────────────────────────────────

  const fetchTimeline = useCallback(async () => {
    setRefreshing(true);
    try {
      const { start, end } = todayRange();
      const [feedRes, diaperRes, pumpRes] = await Promise.all([
        supabase.from('feeds').select('id, feed_type, logged_at')
          .gte('logged_at', start).lte('logged_at', end).order('logged_at', { ascending: false }),
        supabase.from('diaper_logs').select('id, diaper_type, logged_at')
          .gte('logged_at', start).lte('logged_at', end).order('logged_at', { ascending: false }),
        supabase.from('pumping_sessions').select('id, total_ml, logged_at')
          .gte('logged_at', start).lte('logged_at', end).order('logged_at', { ascending: false }),
      ]);
      const merged: TimelineEntry[] = [
        ...(feedRes.data ?? []).map(r => ({
          id: `feed-${r.id}`, rawId: r.id, table: 'feeds' as const,
          type: 'feed' as EntryType, emoji: '🍼', label: 'Feed',
          detail: r.feed_type, logged_at: r.logged_at,
        })),
        ...(diaperRes.data ?? []).map(r => ({
          id: `diaper-${r.id}`, rawId: r.id, table: 'diaper_logs' as const,
          type: 'diaper' as EntryType, emoji: '💩', label: 'Diaper',
          detail: r.diaper_type, logged_at: r.logged_at,
        })),
        ...(pumpRes.data ?? []).map(r => ({
          id: `pump-${r.id}`, rawId: r.id, table: 'pumping_sessions' as const,
          type: 'pumping' as EntryType, emoji: '🤱', label: 'Pumping',
          detail: `${r.total_ml} ml`, logged_at: r.logged_at,
        })),
      ].sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime());
      setEntries(merged);
    } catch (err: any) {
      console.warn('Timeline fetch error:', err.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchTimeline(); }, [fetchTimeline]);

  async function getFirstBabyId(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('babies').select('id').eq('user_id', user.id).limit(1).maybeSingle();
    return data?.id ?? null;
  }

  // ── Modal open ────────────────────────────────────────────────────────────

  function openModal(type: EntryType) {
    if (type === 'feed') {
      setFeedType('breast'); setFeedMood('calm'); setFeedPosition('cradle');
      setFeedPositionOther(''); setLatchQuality('good'); setSpitUp('none');
      setFeedBurps(0); setFeedNotes(''); setFeedCaregiver('mom');
      setFeedUseManual(false); setFeedManualMin('');
      setBreastLeft(true); setBreastRight(false); feedTimer.reset();
    } else if (type === 'diaper') {
      setDiaperType('wet'); setDiaperColor('yellow'); setDiaperConsist('seedy');
      setDiaperAmount('medium'); setDiaperRash('none'); setDiaperNotes('');
    } else {
      setLeftBreast(''); setRightBreast(''); setSuctionLevel(5);
      setHowFeel('comfortable'); setStorageLocation('fridge'); setMilkColor('white');
      setPumpUseManual(false); setPumpManualMin(''); pumpTimer.reset();
    }
    setActiveModal(type);
  }

  function closeModal() {
    feedTimer.stop();
    pumpTimer.stop();
    setActiveModal(null);
  }

  // ── Save handlers ─────────────────────────────────────────────────────────

  async function handleSaveFeed() {
    setSaving(true);
    try {
      const baby_id = await getFirstBabyId();
      console.log('[Feed] Baby ID:', baby_id);
      if (!baby_id) throw new Error('No baby profile found — add one in the Profile tab first.');

      const durationSeconds = feedUseManual
        ? (parseFloat(feedManualMin) || 0) * 60
        : feedTimer.elapsed;

      const resolvedPosition = feedPosition === 'other'
        ? (feedPositionOther.trim() || 'other')
        : feedPosition;

      const breastSide = feedType === 'breast'
        ? (breastLeft && breastRight ? 'both' : breastLeft ? 'left' : breastRight ? 'right' : null)
        : null;

      const payload = {
        baby_id,
        feed_type:        feedType,
        mood:             feedMood,
        latch_quality:    feedType === 'breast' ? latchQuality : null,
        position:         feedType === 'breast' ? resolvedPosition : null,
        breast_side:      breastSide,
        caregiver:        feedType !== 'breast' ? feedCaregiver : null,
        spit_up:          spitUp,
        burps:            feedBurps,
        duration_seconds: durationSeconds > 0 ? durationSeconds : null,
        notes:            feedNotes.trim() || null,
        logged_at:        new Date().toISOString(),
      };
      console.log('[Feed] Attempting to save:', payload);

      const { error } = await supabase.from('feeds').insert(payload);
      if (error) throw error;
      feedTimer.stop();
      setActiveModal(null);
      await fetchTimeline();
    } catch (err: any) {
      const info = { message: err?.message, code: err?.code, details: err?.details, hint: err?.hint, name: err?.name };
      console.error('[Feed] Save failed:', info);
      Alert.alert('Save Failed', err?.message || err?.code || JSON.stringify(info) || 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDiaper() {
    setSaving(true);
    try {
      const baby_id = await getFirstBabyId();
      console.log('[Diaper] Baby ID:', baby_id);
      if (!baby_id) throw new Error('No baby profile found — add one in the Profile tab first.');

      const hasPoop = diaperType === 'dirty' || diaperType === 'both';
      const payload = {
        baby_id,
        diaper_type:  diaperType,
        color:        hasPoop ? diaperColor   : null,
        consistency:  hasPoop ? diaperConsist : null,
        amount:       hasPoop ? diaperAmount  : null,
        rash:         diaperRash,
        notes:        diaperNotes.trim() || null,
        logged_at:    new Date().toISOString(),
      };
      console.log('[Diaper] Attempting to save:', payload);

      const { error } = await supabase.from('diaper_logs').insert(payload);
      if (error) throw error;
      setActiveModal(null);
      await fetchTimeline();
    } catch (err: any) {
      const info = { message: err?.message, code: err?.code, details: err?.details, hint: err?.hint, name: err?.name };
      console.error('[Diaper] Save failed:', info);
      Alert.alert('Save Failed', err?.message || err?.code || JSON.stringify(info) || 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePumping() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('[Pump] User ID:', user?.id);
      if (!user) throw new Error('Not signed in.');

      const left  = parseFloat(leftBreast)  || 0;
      const right = parseFloat(rightBreast) || 0;
      const total_ml = left + right;
      if (total_ml === 0) throw new Error('Enter at least one breast amount.');

      const durationMinutes = pumpUseManual
        ? parseFloat(pumpManualMin) || 0
        : pumpTimer.elapsed / 60;

      const payload = {
        user_id:          user.id,
        left_breast:      left,
        right_breast:     right,
        total_ml,
        suction_level:    suctionLevel,
        how_feel:         howFeel,
        storage_location: storageLocation,
        milk_color:       milkColor,
        duration_minutes: durationMinutes > 0 ? durationMinutes : null,
        logged_at:        new Date().toISOString(),
      };
      console.log('[Pump] Attempting to save:', payload);

      const { error } = await supabase.from('pumping_sessions').insert(payload);
      if (error) throw error;
      pumpTimer.stop();
      setActiveModal(null);
      await fetchTimeline();
    } catch (err: any) {
      const info = { message: err?.message, code: err?.code, details: err?.details, hint: err?.hint, name: err?.name };
      console.error('[Pump] Save failed:', info);
      Alert.alert('Save Failed', err?.message || err?.code || JSON.stringify(info) || 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  function handleDeleteEntry(entry: TimelineEntry) {
    Alert.alert(
      'Delete Entry',
      `Remove this ${entry.label.toLowerCase()} from today's timeline?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              console.log(`[Delete] table=${entry.table} id=${entry.rawId}`);

              // .select('id') forces Supabase to return deleted rows.
              // Without it, RLS blocks silently return { error: null, data: null }
              // and the row survives in the DB despite the local state removing it.
              const { data, error } = await supabase
                .from(entry.table as any)
                .delete()
                .eq('id', entry.rawId)
                .select('id');

              console.log(`[Delete] result:`, { data, error });

              if (error) throw error;

              if (!data || data.length === 0) {
                throw new Error(
                  'Row not deleted — an RLS policy is likely blocking it.\n\n' +
                  'Run the DELETE policies SQL in your Supabase SQL editor to fix this.'
                );
              }

              setEntries(prev => prev.filter(e => e.id !== entry.id));
            } catch (err: any) {
              console.error('[Delete] error:', err);
              Alert.alert('Delete Failed', err.message);
            }
          },
        },
      ]
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const showDiaperDetail = diaperType === 'dirty' || diaperType === 'both';
  const pumpTotal = (parseFloat(leftBreast) || 0) + (parseFloat(rightBreast) || 0);

  const mainButtons = [
    { type: 'feed'    as EntryType, emoji: '🍼', label: 'Log Feed',    color: '#B8A9C9' },
    { type: 'diaper'  as EntryType, emoji: '💩', label: 'Log Diaper',  color: '#A8B8A0' },
    { type: 'pumping' as EntryType, emoji: '🤱', label: 'Log Pumping', color: '#E8B4B8' },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Track</Text>

        {/* ── Main buttons */}
        <View style={styles.buttonGroup}>
          {mainButtons.map(btn => (
            <TouchableOpacity key={btn.type}
              style={[styles.button, { backgroundColor: btn.color }]}
              activeOpacity={0.8} onPress={() => openModal(btn.type)}>
              <Text style={styles.buttonEmoji}>{btn.emoji}</Text>
              <Text style={styles.buttonLabel}>{btn.label}</Text>
              <Text style={styles.buttonArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Timeline */}
        <View style={styles.timelineHeader}>
          <Text style={styles.sectionTitle}>Today's Timeline</Text>
          {refreshing && <ActivityIndicator size="small" color="#B8A9C9" />}
        </View>
        <View style={styles.timeline}>
          {entries.length === 0 ? (
            <Text style={styles.empty}>No entries yet</Text>
          ) : (
            entries.map((entry, i) => (
              <View key={entry.id}
                style={[styles.entry, i < entries.length - 1 && styles.entryBorder]}>
                <Text style={styles.entryEmoji}>{entry.emoji}</Text>
                <View style={styles.entryBody}>
                  <Text style={styles.entryLabel}>{entry.label}</Text>
                  <Text style={styles.entryDetail}>{entry.detail}</Text>
                </View>
                <Text style={styles.entryTime}>{formatTime(entry.logged_at)}</Text>
                <TouchableOpacity style={styles.deleteBtn}
                  onPress={() => handleDeleteEntry(entry)} activeOpacity={0.7}>
                  <Text style={styles.deleteIcon}>🗑</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* ══════════ FEED MODAL ══════════ */}
      <ModalSheet visible={activeModal === 'feed'} onClose={closeModal}
        title="🍼 Log Feed" accent="#B8A9C9" onSave={handleSaveFeed} saving={saving}>

        <PickerField label="Feed type" options={FEED_TYPE}
          value={feedType} onChange={setFeedType} accent="#B8A9C9" />

        {feedType === 'breast' && (
          <>
            {/* Which breast */}
            <Text style={pf.label}>Which breast?</Text>
            <View style={styles.breastToggleRow}>
              <TouchableOpacity
                style={[styles.breastToggleBtn, breastLeft && styles.breastToggleActive]}
                onPress={() => setBreastLeft(v => !v)}
                activeOpacity={0.75}
              >
                <Text style={styles.breastToggleEmoji}>🤱</Text>
                <Text style={[styles.breastToggleLabel, breastLeft && styles.breastToggleLabelActive]}>
                  Left
                </Text>
                {breastLeft && <Text style={styles.breastToggleCheck}>✓</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.breastToggleBtn, breastRight && styles.breastToggleActive]}
                onPress={() => setBreastRight(v => !v)}
                activeOpacity={0.75}
              >
                <Text style={styles.breastToggleEmoji}>🤱</Text>
                <Text style={[styles.breastToggleLabel, breastRight && styles.breastToggleLabelActive]}>
                  Right
                </Text>
                {breastRight && <Text style={styles.breastToggleCheck}>✓</Text>}
              </TouchableOpacity>
            </View>

            <TimerWidget timer={feedTimer} accent="#B8A9C9"
              useManual={feedUseManual} onToggleManual={() => setFeedUseManual(v => !v)}
              manualValue={feedManualMin} onManualChange={setFeedManualMin} />
            <PickerField label="Position" options={FEED_POSITION}
              value={feedPosition} onChange={setFeedPosition} accent="#B8A9C9" />
            {feedPosition === 'other' && (
              <TextInput
                style={[ni.input, { marginTop: -10, marginBottom: 20 }]}
                placeholder="Describe position…"
                placeholderTextColor="#C4BAB2"
                value={feedPositionOther}
                onChangeText={setFeedPositionOther}
              />
            )}
            <PickerField label="Latch quality" options={FEED_LATCH}
              value={latchQuality} onChange={setLatchQuality} accent="#B8A9C9" />
          </>
        )}

        {(feedType === 'bottle' || feedType === 'solids') && (
          <PickerField label="Fed by" options={CAREGIVER}
            value={feedCaregiver} onChange={setFeedCaregiver} accent="#B8A9C9" />
        )}

        <PickerField label="Baby's mood" options={FEED_MOOD}
          value={feedMood} onChange={setFeedMood} accent="#B8A9C9" />
        <PickerField label="Spit-up" options={FEED_SPIT_UP}
          value={spitUp} onChange={setSpitUp} accent="#B8A9C9" />
        <Stepper label="Burps" value={feedBurps} onChange={setFeedBurps} max={15} accent="#B8A9C9" />
        <NotesInput value={feedNotes} onChange={setFeedNotes} />
      </ModalSheet>

      {/* ══════════ DIAPER MODAL ══════════ */}
      <ModalSheet visible={activeModal === 'diaper'} onClose={closeModal}
        title="💩 Log Diaper" accent="#A8B8A0" onSave={handleSaveDiaper} saving={saving}>

        <PickerField label="Type" options={DIAPER_TYPE}
          value={diaperType} onChange={setDiaperType} accent="#A8B8A0" />

        {showDiaperDetail && (
          <>
            <ColorCirclePicker label="Color" options={DIAPER_COLORS}
              value={diaperColor} onChange={setDiaperColor} />
            <PickerField label="Consistency" options={DIAPER_CONSIST}
              value={diaperConsist} onChange={setDiaperConsist} accent="#A8B8A0" />
            <PickerField label="Amount" options={DIAPER_AMOUNT}
              value={diaperAmount} onChange={setDiaperAmount} accent="#A8B8A0" />
          </>
        )}

        <PickerField label="Diaper rash" options={DIAPER_RASH}
          value={diaperRash} onChange={setDiaperRash} accent="#A8B8A0" />
        <NotesInput value={diaperNotes} onChange={setDiaperNotes} />
      </ModalSheet>

      {/* ══════════ PUMPING MODAL ══════════ */}
      <ModalSheet visible={activeModal === 'pumping'} onClose={closeModal}
        title="🤱 Log Pumping" accent="#E8B4B8" onSave={handleSavePumping} saving={saving}>

        <TimerWidget timer={pumpTimer} accent="#E8B4B8"
          useManual={pumpUseManual} onToggleManual={() => setPumpUseManual(v => !v)}
          manualValue={pumpManualMin} onManualChange={setPumpManualMin} />

        <Text style={pf.label}>Amount expressed (ml)</Text>
        <View style={styles.breastRow}>
          <View style={styles.breastField}>
            <Text style={styles.breastSideLabel}>Left</Text>
            <TextInput style={styles.breastInput} placeholder="0" placeholderTextColor="#C4BAB2"
              value={leftBreast} onChangeText={setLeftBreast} keyboardType="decimal-pad" />
            <Text style={styles.breastUnit}>ml</Text>
          </View>
          <View style={styles.breastDivider} />
          <View style={styles.breastField}>
            <Text style={styles.breastSideLabel}>Right</Text>
            <TextInput style={styles.breastInput} placeholder="0" placeholderTextColor="#C4BAB2"
              value={rightBreast} onChangeText={setRightBreast} keyboardType="decimal-pad" />
            <Text style={styles.breastUnit}>ml</Text>
          </View>
        </View>
        {pumpTotal > 0 && (
          <Text style={styles.totalPreview}>Total: {pumpTotal.toFixed(1)} ml</Text>
        )}

        <Stepper label="Suction level (1–10)" value={suctionLevel} onChange={setSuctionLevel}
          min={1} max={10} accent="#E8B4B8" />
        <ColorCirclePicker label="Milk color" options={MILK_COLORS}
          value={milkColor} onChange={setMilkColor} />
        <PickerField label="How did it feel?" options={PUMP_HOW_FEEL}
          value={howFeel} onChange={setHowFeel} accent="#E8B4B8" />
        <PickerField label="Storage" options={PUMP_STORAGE}
          value={storageLocation} onChange={setStorageLocation} accent="#E8B4B8" />
      </ModalSheet>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea:      { flex: 1, backgroundColor: '#FEFCF8' },
  scroll:        { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  heading:       { fontSize: 28, fontWeight: '800', color: '#3D3530', marginBottom: 28 },

  buttonGroup: { gap: 14, marginBottom: 36 },
  button: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 18,
    paddingVertical: 20, paddingHorizontal: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  buttonEmoji: { fontSize: 30, marginRight: 14 },
  buttonLabel: { flex: 1, fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  buttonArrow: { fontSize: 22, color: 'rgba(255,255,255,0.7)', fontWeight: '300' },

  timelineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle:   { fontSize: 18, fontWeight: '700', color: '#3D3530' },
  timeline:       { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
                    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  empty:          { fontSize: 15, color: '#B0A89E', fontStyle: 'italic', textAlign: 'center', padding: 24 },
  entry:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 18 },
  entryBorder:    { borderBottomWidth: 1, borderBottomColor: '#F3EFE9' },
  entryEmoji:     { fontSize: 24, marginRight: 14 },
  entryBody:      { flex: 1 },
  entryLabel:     { fontSize: 15, fontWeight: '700', color: '#3D3530' },
  entryDetail:    { fontSize: 12, color: '#B0A89E', marginTop: 2, textTransform: 'capitalize' },
  entryTime:      { fontSize: 13, color: '#B0A89E', fontWeight: '600', marginRight: 10 },
  deleteBtn:      { padding: 6 },
  deleteIcon:     { fontSize: 16 },

  breastToggleRow:       { flexDirection: 'row', gap: 12, marginBottom: 20 },
  breastToggleBtn:       { flex: 1, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E0D8D0',
                           borderRadius: 16, paddingVertical: 20, alignItems: 'center',
                           shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                           shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  breastToggleActive:    { backgroundColor: '#B8A9C9', borderColor: '#B8A9C9' },
  breastToggleEmoji:     { fontSize: 28, marginBottom: 6 },
  breastToggleLabel:     { fontSize: 16, fontWeight: '700', color: '#8A7E78' },
  breastToggleLabelActive:{ color: '#fff' },
  breastToggleCheck:     { position: 'absolute', top: 8, right: 10, fontSize: 14,
                           fontWeight: '800', color: '#fff' },

  breastRow:       { flexDirection: 'row', backgroundColor: '#fff', borderWidth: 1.5,
                     borderColor: '#E0D8D0', borderRadius: 14, marginBottom: 8, overflow: 'hidden' },
  breastField:     { flex: 1, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 12 },
  breastSideLabel: { fontSize: 12, fontWeight: '700', color: '#8A7E78', marginBottom: 8,
                     textTransform: 'uppercase', letterSpacing: 0.6 },
  breastInput:     { fontSize: 28, fontWeight: '800', color: '#3D3530', textAlign: 'center', minWidth: 60 },
  breastUnit:      { fontSize: 13, color: '#B0A89E', marginTop: 4, fontWeight: '600' },
  breastDivider:   { width: 1, backgroundColor: '#E0D8D0', marginVertical: 16 },
  totalPreview:    { fontSize: 13, color: '#E8B4B8', fontWeight: '700', textAlign: 'center',
                     marginBottom: 20, marginTop: 4 },
});
