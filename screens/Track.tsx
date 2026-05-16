import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { LineChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';

const screenWidth = Dimensions.get('window').width;

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


// ─── Chart Components ───────────────────────────────────────────────────────

type ChartPeriod = 'daily' | 'weekly' | 'monthly';

const ChartCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={chartStyles.card}>
    <Text style={chartStyles.title}>{title}</Text>
    {children}
  </View>
);

const PeriodToggle = ({ period, onChange }: { period: ChartPeriod; onChange: (p: ChartPeriod) => void }) => (
  <View style={chartStyles.toggleContainer}>
    {(['daily', 'weekly', 'monthly'] as ChartPeriod[]).map((p) => (
      <TouchableOpacity key={p} style={[chartStyles.toggle, period === p && chartStyles.toggleActive]} onPress={() => onChange(p)}>
        <Text style={[chartStyles.toggleText, period === p && chartStyles.toggleTextActive]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
      </TouchableOpacity>
    ))}
  </View>
);


// When yMax < segments (4), tick spacing becomes fractional and Math.round
// collapses multiple ticks to the same integer (e.g. 0, 0, 1, 1, 1).
// Fix: inject an invisible phantom dataset whose flat value equals segments,
// forcing tick spacing to exactly 1 unit. The phantom line is fully transparent
// with no dots so it has zero visual impact.
const padToMinYRange = (chartData: any, minRange = 4): any => {
  const allValues = (chartData.datasets as any[]).flatMap((d: any) => d.data as number[]);
  const yMax = Math.max(...allValues, 0);
  if (yMax >= minRange) return chartData;
  const len = (chartData.datasets[0]?.data as number[])?.length ?? 2;
  return {
    ...chartData,
    datasets: [
      ...chartData.datasets,
      {
        data: new Array(len).fill(minRange),
        color: () => 'rgba(0,0,0,0)',
        strokeWidth: 0,
        withDots: false,
      },
    ],
  };
};

const chartConfig = {
  backgroundColor: '#FEFCF8', backgroundGradientFrom: '#FEFCF8', backgroundGradientTo: '#FEFCF8',
  decimalPlaces: 0, 
  color: (o = 1) => `rgba(90, 84, 78, ${o})`,
  labelColor: (o = 1) => `rgba(90, 84, 78, ${o * 0.7})`,
  style: { borderRadius: 16 },
  propsForDots: { r: '4', strokeWidth: '2', stroke: '#FEFCF8' },
  propsForBackgroundLines: { strokeDasharray: '', stroke: '#F3EFE9', strokeWidth: 1 },
  propsForLabels: { fontSize: 10 },
  formatYLabel: (value) => Math.round(Number(value)).toString(),
};

const chartStyles = StyleSheet.create({
  card: { backgroundColor: '#FEFCF8', borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  title: { fontSize: 15, fontWeight: '700', color: '#5A544E', marginBottom: 12 },
  toggleContainer: { flexDirection: 'row', backgroundColor: '#F5F1EB', borderRadius: 8, padding: 3, marginBottom: 12 },
  toggle: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  toggleActive: { backgroundColor: '#B8A9C9' },
  toggleText: { fontSize: 11, color: '#8A7E78', fontWeight: '600' },
  toggleTextActive: { color: '#FFFFFF' },
  chart: { marginLeft: -16, borderRadius: 12 },
  noData: { textAlign: 'center', color: '#B0A89E', paddingVertical: 40, fontSize: 13 },
});

// Simplified chart components - full implementation would go here
// Counts sessions per feed type — avoids mixing breast (duration) with
// bottle/solids (ml) on the same Y-axis.
const FeedChartCard = ({ babyId }: { babyId: string | null }) => {
  const [period, setPeriod] = useState<ChartPeriod>('daily');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadData(); }, [babyId, period]);

  const loadData = async () => {
    if (!babyId) { setData(null); return; }
    setLoading(true);
    try {
      const now = new Date();
      const start = new Date();
      if (period === 'daily') start.setHours(0, 0, 0, 0);
      else if (period === 'weekly') start.setDate(now.getDate() - 7);
      else start.setDate(now.getDate() - 30);

      const { data: feeds, error } = await supabase
        .from('feeds')
        .select('feed_type, logged_at')
        .eq('baby_id', babyId)
        .gte('logged_at', start.toISOString())
        .order('logged_at', { ascending: true });

      if (error) console.error('Feed chart query error:', error);
      if (!feeds || feeds.length === 0) { setData(null); return; }

      const types  = ['breast', 'bottle', 'solids'];
      const colors = ['#B8A9C9', '#A8B8A0', '#E8B4B8'];
      const legend = ['Breast', 'Bottle', 'Solids'];

      if (period === 'daily') {
        const hourLabels = ['12a', '3a', '6a', '9a', '12p', '3p', '6p', '9p'];
        const counts = types.map(() => new Array(8).fill(0));
        feeds.forEach(f => {
          const bucket = Math.min(Math.floor(new Date(f.logged_at).getHours() / 3), 7);
          const idx = types.indexOf(f.feed_type ?? 'bottle');
          if (idx >= 0) counts[idx][bucket]++;
        });
        setData({ labels: hourLabels, datasets: types.map((_, i) => ({ data: counts[i], color: () => colors[i], strokeWidth: 2 })), legend });
      } else {
        const buckets: Record<string, number[]> = {};
        feeds.forEach(f => {
          const day = f.logged_at.split('T')[0];
          if (!buckets[day]) buckets[day] = [0, 0, 0];
          const idx = types.indexOf(f.feed_type ?? 'bottle');
          if (idx >= 0) buckets[day][idx]++;
        });
        const days = Object.keys(buckets).sort();
        const dayLabels = days.map(d => { const dt = new Date(d); return `${dt.getMonth() + 1}/${dt.getDate()}`; });
        const shown = dayLabels.length > 7 ? dayLabels.filter((_, i) => i % Math.ceil(dayLabels.length / 7) === 0) : dayLabels;
        setData({ labels: shown, datasets: types.map((_, i) => ({ data: days.map(d => buckets[d][i]), color: () => colors[i], strokeWidth: 2 })), legend });
      }
    } catch (err) {
      console.error('Feed chart error:', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <ChartCard title="Feeding Sessions"><ActivityIndicator color="#B8A9C9" /></ChartCard>;
  if (!data) return (
    <ChartCard title="Feeding Sessions">
      <PeriodToggle period={period} onChange={setPeriod} />
      <Text style={chartStyles.noData}>No feeding data for this period</Text>
    </ChartCard>
  );

  return (
    <ChartCard title="Feeding Sessions">
      <PeriodToggle period={period} onChange={setPeriod} />
      <LineChart data={padToMinYRange(data)} width={screenWidth - 64} height={200} chartConfig={chartConfig} bezier
        segments={4}
        style={chartStyles.chart} withDots withShadow={false} withInnerLines withOuterLines />
    </ChartCard>
  );
};

const DiaperChartCard = ({ babyId }: { babyId: string | null }) => {
  const [period, setPeriod] = useState<ChartPeriod>('daily');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [babyId, period]);

  const loadData = async () => {
    if (!babyId) { setData(null); return; }
    setLoading(true);
    try {
      const now = new Date();
      const start = new Date();
      if (period === 'daily') start.setHours(0, 0, 0, 0);
      else if (period === 'weekly') start.setDate(now.getDate() - 7);
      else start.setDate(now.getDate() - 30);

      const { data: diapers } = await supabase
        .from('diaper_logs')
        .select('diaper_type, logged_at')
        .eq('baby_id', babyId)
        .gte('logged_at', start.toISOString())
        .order('logged_at', { ascending: true });

      if (!diapers || diapers.length === 0) {
        setData(null);
        setLoading(false);
        return;
      }

      if (period === 'daily') {
        const hours = ['12a', '3a', '6a', '9a', '12p', '3p', '6p', '9p'];
        const wet = new Array(8).fill(0);
        const dirty = new Array(8).fill(0);

        diapers.forEach(d => {
          const hour = new Date(d.logged_at).getHours();
          const bucket = Math.floor(hour / 3);
          if (d.diaper_type === 'wet' || d.diaper_type === 'both') wet[bucket]++;
          if (d.diaper_type === 'dirty' || d.diaper_type === 'both') dirty[bucket]++;
        });

        setData({
          labels: hours,
          datasets: [
            { data: wet, color: () => '#A8B8A0', strokeWidth: 2 },
            { data: dirty, color: () => '#8B5E3C', strokeWidth: 2 },
          ],
          legend: ['Wet', 'Dirty'],
        });
      } else {
        const dailyData: Record<string, { wet: number; dirty: number }> = {};
        diapers.forEach(d => {
          const date = new Date(d.logged_at).toISOString().split('T')[0];
          if (!dailyData[date]) dailyData[date] = { wet: 0, dirty: 0 };
          if (d.diaper_type === 'wet' || d.diaper_type === 'both') dailyData[date].wet++;
          if (d.diaper_type === 'dirty' || d.diaper_type === 'both') dailyData[date].dirty++;
        });

        const dates = Object.keys(dailyData).sort();
        const labels = dates.map(d => {
          const date = new Date(d);
          return `${date.getMonth() + 1}/${date.getDate()}`;
        });

        setData({
          labels: labels.length > 7 ? labels.filter((_, i) => i % Math.ceil(labels.length / 7) === 0) : labels,
          datasets: [
            { data: dates.map(d => dailyData[d].wet), color: () => '#A8B8A0', strokeWidth: 2 },
            { data: dates.map(d => dailyData[d].dirty), color: () => '#8B5E3C', strokeWidth: 2 },
          ],
          legend: ['Wet', 'Dirty'],
        });
      }
    } catch (err) {
      console.error('Diaper chart error:', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <ChartCard title="Diaper Changes"><ActivityIndicator color="#B8A9C9" /></ChartCard>;
  if (!data) return (
    <ChartCard title="Diaper Changes">
      <PeriodToggle period={period} onChange={setPeriod} />
      <Text style={chartStyles.noData}>No diaper data for this period</Text>
    </ChartCard>
  );

  return (
    <ChartCard title="Diaper Changes">
      <PeriodToggle period={period} onChange={setPeriod} />
      <LineChart data={padToMinYRange(data)} width={screenWidth - 64} height={180} chartConfig={chartConfig} bezier
        segments={4}
        style={chartStyles.chart} withDots withShadow={false} withInnerLines withOuterLines />
    </ChartCard>
  );
};

const PumpingChartCard = ({ userId }: { userId: string | null }) => {
  const [period, setPeriod] = useState<ChartPeriod>('daily');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [userId, period]);

  const loadData = async () => {
    if (!userId) { setData(null); return; }
    setLoading(true);
    try {
      const now = new Date();
      const start = new Date();
      if (period === 'daily') start.setHours(0, 0, 0, 0);
      else if (period === 'weekly') start.setDate(now.getDate() - 7);
      else start.setDate(now.getDate() - 30);

      const { data: pumps, error } = await supabase
        .from('pumping_sessions')
        .select('left_breast, right_breast, total_ml, logged_at')
        .eq('user_id', userId)
        .gte('logged_at', start.toISOString())
        .order('logged_at', { ascending: true });

      if (error) console.error('Pumping chart query error:', error);

      if (!pumps || pumps.length === 0) {
        setData(null);
        setLoading(false);
        return;
      }

      // LineChart requires labels.length === dataset.data.length.
      // Never filter arrays to different lengths — blank out crowded labels instead.

      if (period === 'daily') {
        // Show each session; pad to ≥ 2 points so LineChart can draw a line
        const sessions = pumps.length < 2 ? [pumps[0], pumps[0]] : pumps;
        const step = sessions.length > 6 ? 2 : 1;
        const labels = sessions.map((p, i) => {
          if (i % step !== 0) return '';
          const d = new Date(p.logged_at);
          return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
        });
        setData({
          labels,
          datasets: [
            { data: sessions.map(p => p.left_breast  || 0), color: () => '#E8B4B8', strokeWidth: 2 },
            { data: sessions.map(p => p.right_breast || 0), color: () => '#B8A9C9', strokeWidth: 2 },
          ],
          legend: ['Left', 'Right'],
        });
      } else {
        const buckets: Record<string, { left: number; right: number }> = {};
        pumps.forEach(p => {
          const day = p.logged_at.split('T')[0];
          if (!buckets[day]) buckets[day] = { left: 0, right: 0 };
          buckets[day].left  += p.left_breast  || 0;
          buckets[day].right += p.right_breast || 0;
        });
        let days = Object.keys(buckets).sort();
        if (days.length < 2) days = [days[0], days[0]]; // pad to ≥ 2

        const step = days.length > 7 ? Math.ceil(days.length / 7) : 1;
        const labels = days.map((d, i) => {
          if (i % step !== 0) return '';
          const dt = new Date(d);
          return `${dt.getMonth() + 1}/${dt.getDate()}`;
        });
        setData({
          labels,
          datasets: [
            { data: days.map(d => buckets[d]?.left  || 0), color: () => '#E8B4B8', strokeWidth: 2 },
            { data: days.map(d => buckets[d]?.right || 0), color: () => '#B8A9C9', strokeWidth: 2 },
          ],
          legend: ['Left', 'Right'],
        });
      }
    } catch (err) {
      console.error('Pumping chart error:', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <ChartCard title="Pumping Output"><ActivityIndicator color="#B8A9C9" /></ChartCard>;
  if (!data) return (
    <ChartCard title="Pumping Output (ml)">
      <PeriodToggle period={period} onChange={setPeriod} />
      <Text style={chartStyles.noData}>No pumping data for this period</Text>
    </ChartCard>
  );

  return (
    <ChartCard title="Pumping Output (ml)">
      <PeriodToggle period={period} onChange={setPeriod} />
      <LineChart data={padToMinYRange(data)} width={screenWidth - 64} height={180} chartConfig={chartConfig} bezier
        segments={4}
        style={chartStyles.chart} withDots withShadow={false} withInnerLines withOuterLines />
    </ChartCard>
  );
};

export default function Track() {
  const [entries,    setEntries]    = useState<TimelineEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [saving,      setSaving]      = useState(false);
  const [babyId,      setBabyId]      = useState<string | null>(null);
  const [userId,      setUserId]      = useState<string | null>(null);

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
  const [pumpUseManual,    setPumpUseManual]   = useState(false);
  const [pumpManualMin,    setPumpManualMin]   = useState('');
  const [letdownAchieved, setLetdownAchieved] = useState(true);
  const pumpTimer = useTimer();

  // ── Data ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      supabase.from('babies').select('id').eq('user_id', user.id).limit(1).maybeSingle()
        .then(({ data }) => setBabyId(data?.id ?? null));
    });
  }, []);

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
      setPumpUseManual(false); setPumpManualMin(''); setLetdownAchieved(true); pumpTimer.reset();
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

      // DB column is integer — round to avoid "invalid input syntax" error
      const durationMinutes = Math.round(
        pumpUseManual ? (parseFloat(pumpManualMin) || 0) : pumpTimer.elapsed / 60
      );

      const payload = {
        user_id:          user.id,
        left_breast:      left,
        right_breast:     right,
        total_ml,
        cycle_speed:      suctionLevel,
        how_feel:         howFeel,
        storage_location: storageLocation,
        milk_color:        milkColor,
        letdown_achieved:  letdownAchieved,
        duration_minutes:  durationMinutes > 0 ? durationMinutes : null,
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

  async function doDelete(entry: TimelineEntry) {
    try {
      const { data, error } = await supabase
        .from(entry.table as any)
        .delete()
        .eq('id', entry.rawId)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Row not deleted — RLS policy may be blocking it.');
      }
      setEntries(prev => prev.filter(e => e.id !== entry.id));
    } catch (err: any) {
      console.error('[Delete] error:', err);
      Alert.alert('Delete Failed', err.message);
    }
  }

  function handleDeleteEntry(entry: TimelineEntry) {
    const message = `Remove this ${entry.label.toLowerCase()} from today's timeline?`;
    // On web, RN's multi-button Alert doesn't fire onPress callbacks —
    // the browser confirm() dialog is the reliable alternative.
    if (Platform.OS === 'web') {
      if (window.confirm(message)) doDelete(entry);
      return;
    }
    Alert.alert('Delete Entry', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => doDelete(entry) },
    ]);
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

        {/* ── Charts */}
        <FeedChartCard babyId={babyId} />
        <DiaperChartCard babyId={babyId} />
        <PumpingChartCard userId={userId} />

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

        <View style={pf.wrap}>
          <Text style={pf.label}>Letdown achieved?</Text>
          <View style={pf.row}>
            <TouchableOpacity
              style={[pf.chip, letdownAchieved && { backgroundColor: '#E8B4B8', borderColor: '#E8B4B8' }]}
              onPress={() => setLetdownAchieved(true)} activeOpacity={0.75}>
              <Text style={[pf.chipText, letdownAchieved && pf.chipSel]}>Yes ✓</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[pf.chip, !letdownAchieved && { backgroundColor: '#E8B4B8', borderColor: '#E8B4B8' }]}
              onPress={() => setLetdownAchieved(false)} activeOpacity={0.75}>
              <Text style={[pf.chipText, !letdownAchieved && pf.chipSel]}>No</Text>
            </TouchableOpacity>
          </View>
        </View>

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
