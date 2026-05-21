import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { LineChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import SuppliesSection, { addToSupply, addToMilkStash, deductFromSupply, incrementPumpPartSessions } from './SuppliesSection';
import MilestoneTracker from './MilestoneTracker';
import VaccineTracker from './VaccineTracker';
import NutritionTracker from './NutritionTracker';
import GrowthTracker from './GrowthTracker';
import { useColors, Colors } from '../lib/theme';

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
  const c = useColors();
  const pf = useMemo(() => makePfStyles(c), [c]);
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

// ─── ColorCirclePicker ────────────────────────────────────────────────────────

function ColorCirclePicker({ label, options, value, onChange }: {
  label: string; options: ColorOption[]; value: string; onChange: (v: string) => void;
}) {
  const c = useColors();
  const pf = useMemo(() => makePfStyles(c), [c]);
  const cp = useMemo(() => makeCpStyles(c), [c]);
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

// ─── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({ label, value, onChange, min = 0, max = 10, accent }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; accent: string;
}) {
  const c = useColors();
  const pf = useMemo(() => makePfStyles(c), [c]);
  const st = useMemo(() => makeStStyles(c), [c]);
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

// ─── TimerWidget ──────────────────────────────────────────────────────────────

function TimerWidget({ timer, accent, useManual, onToggleManual, manualValue, onManualChange }: {
  timer: ReturnType<typeof useTimer>; accent: string;
  useManual: boolean; onToggleManual: () => void;
  manualValue: string; onManualChange: (v: string) => void;
}) {
  const c = useColors();
  const pf = useMemo(() => makePfStyles(c), [c]);
  const tw = useMemo(() => makeTwStyles(c), [c]);
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
          <TextInput style={tw.manualInput} placeholder="0" placeholderTextColor={c.textMuted}
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

// ─── ModalSheet ───────────────────────────────────────────────────────────────

function ModalSheet({ visible, onClose, title, accent, onSave, saving, children }: {
  visible: boolean; onClose: () => void; title: string; accent: string;
  onSave: () => void; saving: boolean; children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const ms = useMemo(() => makeMsStyles(c), [c]);
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

// ─── NotesInput ───────────────────────────────────────────────────────────────

function NotesInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = useColors();
  const pf = useMemo(() => makePfStyles(c), [c]);
  const ni = useMemo(() => makeNiStyles(c), [c]);
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={pf.label}>Notes</Text>
      <TextInput style={ni.input} placeholder="Any additional notes…" placeholderTextColor={c.textMuted}
        value={value} onChangeText={onChange} multiline numberOfLines={3} textAlignVertical="top" />
    </View>
  );
}

// ─── Track screen ─────────────────────────────────────────────────────────────


// ─── Chart Components ───────────────────────────────────────────────────────

type ChartPeriod = 'daily' | 'weekly' | 'monthly';

const ChartCard = ({ title, children }: { title: string; children: React.ReactNode }) => {
  const c = useColors();
  const chartStyles = useMemo(() => makeChartStyles(c), [c]);
  return (
    <View style={chartStyles.card}>
      <Text style={chartStyles.title}>{title}</Text>
      {children}
    </View>
  );
};

const PeriodToggle = ({ period, onChange }: { period: ChartPeriod; onChange: (p: ChartPeriod) => void }) => {
  const c = useColors();
  const chartStyles = useMemo(() => makeChartStyles(c), [c]);
  return (
    <View style={chartStyles.toggleContainer}>
      {(['daily', 'weekly', 'monthly'] as ChartPeriod[]).map((p) => (
        <TouchableOpacity key={p} style={[chartStyles.toggle, period === p && chartStyles.toggleActive]} onPress={() => onChange(p)}>
          <Text style={[chartStyles.toggleText, period === p && chartStyles.toggleTextActive]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};


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

function makeChartConfig(c: Colors) {
  return {
    backgroundColor: c.bg, backgroundGradientFrom: c.bg, backgroundGradientTo: c.bg,
    decimalPlaces: 0,
    color: (o = 1) => `rgba(90, 84, 78, ${o})`,
    labelColor: (o = 1) => `rgba(90, 84, 78, ${o * 0.7})`,
    style: { borderRadius: 16 },
    propsForDots: { r: '4', strokeWidth: '2', stroke: c.bg },
    propsForBackgroundLines: { strokeDasharray: '', stroke: c.inputBg, strokeWidth: 1 },
    propsForLabels: { fontSize: 10 },
    formatYLabel: (value) => Math.round(Number(value)).toString(),
  };
}

// Simplified chart components - full implementation would go here
// Counts sessions per feed type — avoids mixing breast (duration) with
// bottle/solids (ml) on the same Y-axis.
const FeedChartCard = ({ babyId }: { babyId: string | null }) => {
  const [period, setPeriod] = useState<ChartPeriod>('daily');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const c = useColors();
  const chartStyles = useMemo(() => makeChartStyles(c), [c]);
  const chartConfig = useMemo(() => makeChartConfig(c), [c]);

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
      const colors = [c.trackFeed, c.trackDiaper, c.trackPump];
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

  if (loading) return <ChartCard title="Feeding Sessions"><ActivityIndicator color={c.trackFeed} /></ChartCard>;
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
  const c = useColors();
  const chartStyles = useMemo(() => makeChartStyles(c), [c]);
  const chartConfig = useMemo(() => makeChartConfig(c), [c]);

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
            { data: wet, color: () => c.trackDiaper, strokeWidth: 2 },
            { data: dirty, color: () => c.honey, strokeWidth: 2 },
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
            { data: dates.map(d => dailyData[d].wet), color: () => c.trackDiaper, strokeWidth: 2 },
            { data: dates.map(d => dailyData[d].dirty), color: () => c.honey, strokeWidth: 2 },
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

  if (loading) return <ChartCard title="Diaper Changes"><ActivityIndicator color={c.trackFeed} /></ChartCard>;
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
  const c = useColors();
  const chartStyles = useMemo(() => makeChartStyles(c), [c]);
  const chartConfig = useMemo(() => makeChartConfig(c), [c]);

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
            { data: sessions.map(p => p.left_breast  || 0), color: () => c.blush, strokeWidth: 2 },
            { data: sessions.map(p => p.right_breast || 0), color: () => c.lavender, strokeWidth: 2 },
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
            { data: days.map(d => buckets[d]?.left  || 0), color: () => c.blush, strokeWidth: 2 },
            { data: days.map(d => buckets[d]?.right || 0), color: () => c.lavender, strokeWidth: 2 },
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

  if (loading) return <ChartCard title="Pumping Output"><ActivityIndicator color={c.trackPump} /></ChartCard>;
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
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const cal = useMemo(() => makeCalStyles(c), [c]);
  const det = useMemo(() => makeDetStyles(c), [c]);
  const pf = useMemo(() => makePfStyles(c), [c]);

  const [entries,    setEntries]    = useState<TimelineEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [saving,      setSaving]      = useState(false);
  const [babyId,        setBabyId]        = useState<string | null>(null);
  const [userId,        setUserId]        = useState<string | null>(null);
  const [babyBirthDate, setBabyBirthDate] = useState<string | null>(null);
  const [babyGender,    setBabyGender]    = useState<string | null>(null);

  const scrollRef    = useRef<ScrollView>(null);
  const sectionY     = useRef<Record<string, number>>({});
  const sectionRefs  = useRef<Record<string, View | null>>({});

  const scrollToSection = useCallback((key: string) => {
    const view = sectionRefs.current[key];
    if (!view) {
      const y = sectionY.current[key];
      if (y !== undefined) scrollRef.current?.scrollTo({ y, animated: true });
      return;
    }
    try {
      (view as any).measureLayout(
        scrollRef.current as any,
        (_x: number, y: number) => {
          scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
        },
        () => {
          const y = sectionY.current[key];
          if (y !== undefined) scrollRef.current?.scrollTo({ y, animated: true });
        },
      );
    } catch {
      const y = sectionY.current[key];
      if (y !== undefined) scrollRef.current?.scrollTo({ y, animated: true });
    }
  }, []);
  const [suppliesRefreshKey, setSuppliesRefreshKey] = useState(0);
  const [pumpChartKey,      setPumpChartKey]       = useState(0);
  const [editingId,         setEditingId]          = useState<string | null>(null);

  // History navigation
  const [selectedDate,  setSelectedDate]  = useState(() => new Date());
  const [detailEntry,   setDetailEntry]   = useState<TimelineEntry | null>(null);
  const [detailData,    setDetailData]    = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Calendar picker
  const [showCalendar, setShowCalendar] = useState(false);
  const [calViewDate,  setCalViewDate]  = useState(() => new Date());
  const [calMode,      setCalMode]      = useState<'month' | 'year'>('month');

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
  const [feedAmount,        setFeedAmount]         = useState('');
  const [bottleSource,      setBottleSource]       = useState<'breastmilk' | 'formula'>('breastmilk');
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
      supabase.from('babies').select('id,birth_date,gender').eq('user_id', user.id).limit(1).maybeSingle()
        .then(({ data }) => {
          setBabyId(data?.id ?? null);
          setBabyBirthDate(data?.birth_date ?? null);
          setBabyGender(data?.gender ?? null);
        });
    });
  }, []);

  const fetchTimeline = useCallback(async () => {
    setRefreshing(true);
    try {
      const dayStart = new Date(selectedDate); dayStart.setHours(0, 0, 0, 0);
      const dayEnd   = new Date(selectedDate); dayEnd.setHours(23, 59, 59, 999);
      const start = dayStart.toISOString();
      const end   = dayEnd.toISOString();
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
  }, [selectedDate]);

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
      setBreastLeft(true); setBreastRight(false);
      setFeedAmount(''); setBottleSource('breastmilk');
      feedTimer.reset();
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
    setEditingId(null);
  }

  // ── Save handlers ─────────────────────────────────────────────────────────

  async function handleSaveFeed() {
    setSaving(true);
    try {
      const durationSeconds = feedUseManual
        ? (parseFloat(feedManualMin) || 0) * 60
        : feedTimer.elapsed;

      const resolvedPosition = feedPosition === 'other'
        ? (feedPositionOther.trim() || 'other')
        : feedPosition;

      const breastSide = feedType === 'breast'
        ? (breastLeft && breastRight ? 'both' : breastLeft ? 'left' : breastRight ? 'right' : null)
        : null;

      const fields = {
        feed_type:          feedType,
        mood:               feedMood,
        latch_quality:      feedType === 'breast' ? latchQuality : null,
        position:           feedType === 'breast' ? resolvedPosition : null,
        breast_side:        breastSide,
        caregiver:          feedType !== 'breast' ? feedCaregiver : null,
        spit_up:            spitUp,
        burps:              feedBurps,
        duration_seconds:   durationSeconds > 0 ? durationSeconds : null,
        notes:              feedNotes.trim() || null,
        bottle_source:      feedType === 'bottle' ? bottleSource : null,
        bottle_amount_oz:   feedType === 'bottle' && feedAmount ? (parseFloat(feedAmount) || null) : null,
      };

      if (editingId) {
        const { error } = await supabase.from('feeds').update(fields).eq('id', editingId);
        if (error) throw error;
      } else {
        const baby_id = await getFirstBabyId();
        if (!baby_id) throw new Error('No baby profile found — add one in the Profile tab first.');
        const { error } = await supabase.from('feeds').insert({ ...fields, baby_id, logged_at: new Date().toISOString() });
        if (error) throw error;
        try {
          if (feedType === 'bottle' && feedAmount && userId) {
            const oz = parseFloat(feedAmount) || 0;
            if (oz > 0) {
              if (bottleSource === 'breastmilk') {
                await deductFromSupply(userId, 'breastmilk', oz * 29.5735);
              } else {
                await deductFromSupply(userId, 'formula', oz);
              }
              setSuppliesRefreshKey(k => k + 1);
            }
          }
        } catch (supplyErr: any) {
          console.warn('[Feed] Supply update failed (feed still saved):', supplyErr?.message);
        }
      }

      feedTimer.stop();
      setActiveModal(null);
      setEditingId(null);
      await fetchTimeline();
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message || 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDiaper() {
    setSaving(true);
    try {
      const hasPoop = diaperType === 'dirty' || diaperType === 'both';
      const fields = {
        diaper_type:  diaperType,
        color:        hasPoop ? diaperColor   : null,
        consistency:  hasPoop ? diaperConsist : null,
        amount:       hasPoop ? diaperAmount  : null,
        rash:         diaperRash,
        notes:        diaperNotes.trim() || null,
      };

      if (editingId) {
        const { error } = await supabase.from('diaper_logs').update(fields).eq('id', editingId);
        if (error) throw error;
      } else {
        const baby_id = await getFirstBabyId();
        if (!baby_id) throw new Error('No baby profile found — add one in the Profile tab first.');
        const { error } = await supabase.from('diaper_logs').insert({ ...fields, baby_id, logged_at: new Date().toISOString() });
        if (error) throw error;
        try {
          if (userId) {
            await deductFromSupply(userId, 'diapers', 1);
            setSuppliesRefreshKey(k => k + 1);
          }
        } catch (supplyErr: any) {
          console.warn('[Diaper] Supply update failed (diaper still saved):', supplyErr?.message);
        }
      }

      setActiveModal(null);
      setEditingId(null);
      await fetchTimeline();
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message || 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePumping() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in.');

      const left     = parseFloat(leftBreast)  || 0;
      const right    = parseFloat(rightBreast) || 0;
      const total_ml = left + right;
      if (total_ml === 0) throw new Error('Enter at least one breast amount.');

      const durationMinutes = Math.round(
        pumpUseManual ? (parseFloat(pumpManualMin) || 0) : pumpTimer.elapsed / 60
      );

      const fields = {
        left_breast:      left,
        right_breast:     right,
        total_ml,
        cycle_speed:      suctionLevel,
        how_feel:         howFeel,
        storage_location: storageLocation,
        milk_color:       milkColor,
        letdown_achieved: letdownAchieved,
        duration_minutes: durationMinutes > 0 ? durationMinutes : null,
      };

      if (editingId) {
        const { error } = await supabase.from('pumping_sessions').update(fields).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('pumping_sessions').insert({
          ...fields, user_id: user.id, logged_at: new Date().toISOString(),
        });
        if (error) throw error;
        try {
          if (storageLocation === 'fridge' || storageLocation === 'freezer') {
            await addToMilkStash(user.id, total_ml, storageLocation);
          }
          await incrementPumpPartSessions(user.id);
          setSuppliesRefreshKey(k => k + 1);
        } catch (supplyErr: any) {
          console.warn('[Pump] Supply update failed (session still saved):', supplyErr?.message);
        }
      }

      pumpTimer.stop();
      setActiveModal(null);
      setEditingId(null);
      await fetchTimeline();
      setPumpChartKey(k => k + 1);
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message || 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function doDelete(entry: TimelineEntry) {
    try {
      // For feeds, read supply info before deleting so we can restore it
      let bottleSourceToRestore: string | null = null;
      let bottleOzToRestore: number | null = null;
      if (entry.type === 'feed') {
        const { data: feedRow } = await supabase
          .from('feeds')
          .select('bottle_source, bottle_amount_oz')
          .eq('id', entry.rawId)
          .maybeSingle();
        bottleSourceToRestore = feedRow?.bottle_source ?? null;
        bottleOzToRestore     = feedRow?.bottle_amount_oz ?? null;
      }

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

      // Restore supplies after successful delete
      try {
        if (entry.type === 'feed' && bottleSourceToRestore && bottleOzToRestore && userId) {
          if (bottleSourceToRestore === 'breastmilk') {
            await addToSupply(userId, 'breastmilk', bottleOzToRestore * 29.5735);
          } else {
            await addToSupply(userId, 'formula', bottleOzToRestore);
          }
          setSuppliesRefreshKey(k => k + 1);
        }
        if (entry.type === 'diaper' && userId) {
          await addToSupply(userId, 'diapers', 1);
          setSuppliesRefreshKey(k => k + 1);
        }
      } catch (supplyErr: any) {
        console.warn('[Delete] Supply restore failed (entry still deleted):', supplyErr?.message);
      }
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

  // ── Edit entry ────────────────────────────────────────────────────────────

  async function openEdit(entry: TimelineEntry) {
    setDetailEntry(null);
    const data = detailData ?? await (async () => {
      let fields = '';
      if (entry.type === 'feed') {
        fields = 'feed_type,mood,position,latch_quality,breast_side,caregiver,spit_up,burps,duration_seconds,notes,bottle_source,bottle_amount_oz';
      } else if (entry.type === 'diaper') {
        fields = 'diaper_type,color,consistency,amount,rash,notes';
      } else {
        fields = 'left_breast,right_breast,total_ml,duration_minutes,cycle_speed,how_feel,milk_color,letdown_achieved,storage_location';
      }
      const { data: fetched } = await supabase.from(entry.table as any).select(fields).eq('id', entry.rawId).maybeSingle();
      return fetched;
    })();
    if (!data) { Alert.alert('Error', 'Could not load entry'); return; }

    setEditingId(entry.rawId);

    if (entry.type === 'feed') {
      setFeedType(data.feed_type || 'breast');
      setFeedMood(data.mood || 'calm');
      const knownPos = FEED_POSITION.map(p => p.value);
      const pos = data.position || 'cradle';
      setFeedPosition(knownPos.includes(pos) ? pos : 'other');
      setFeedPositionOther(knownPos.includes(pos) ? '' : pos);
      setLatchQuality(data.latch_quality || 'good');
      setSpitUp(data.spit_up || 'none');
      setFeedBurps(data.burps || 0);
      setFeedNotes(data.notes || '');
      setFeedCaregiver(data.caregiver || 'mom');
      setFeedUseManual(true);
      setFeedManualMin(data.duration_seconds ? String(Math.round(data.duration_seconds / 60)) : '');
      setBreastLeft(data.breast_side === 'left' || data.breast_side === 'both');
      setBreastRight(data.breast_side === 'right' || data.breast_side === 'both');
      setFeedAmount(data.bottle_amount_oz != null ? String(data.bottle_amount_oz) : '');
      setBottleSource(data.bottle_source || 'breastmilk');
      feedTimer.reset();
    } else if (entry.type === 'diaper') {
      setDiaperType(data.diaper_type || 'wet');
      setDiaperColor(data.color || 'yellow');
      setDiaperConsist(data.consistency || 'seedy');
      setDiaperAmount(data.amount || 'medium');
      setDiaperRash(data.rash || 'none');
      setDiaperNotes(data.notes || '');
    } else {
      setLeftBreast(data.left_breast != null ? String(data.left_breast) : '');
      setRightBreast(data.right_breast != null ? String(data.right_breast) : '');
      setSuctionLevel(data.cycle_speed || 5);
      setHowFeel(data.how_feel || 'comfortable');
      setStorageLocation(data.storage_location || 'fridge');
      setMilkColor(data.milk_color || 'white');
      setLetdownAchieved(data.letdown_achieved ?? true);
      setPumpUseManual(true);
      setPumpManualMin(data.duration_minutes ? String(data.duration_minutes) : '');
      pumpTimer.reset();
    }

    setActiveModal(entry.type);
  }

  // ── Date navigation ───────────────────────────────────────────────────────

  function goToPrevDay() {
    setSelectedDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
  }
  function goToNextDay() {
    setSelectedDate(d => {
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0,0,0,0);
      return next < tomorrow ? next : d;
    });
  }

  const isToday = (() => {
    const t = new Date();
    return selectedDate.getDate() === t.getDate() &&
      selectedDate.getMonth() === t.getMonth() &&
      selectedDate.getFullYear() === t.getFullYear();
  })();
  const dateLabel = isToday
    ? 'Today'
    : selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  function openCalendar() {
    setCalViewDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    setCalMode('month');
    setShowCalendar(true);
  }
  function calPrevMonth() {
    setCalViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function calNextMonth() {
    setCalViewDate(d => {
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const now  = new Date();
      return next.getFullYear() < now.getFullYear() ||
        (next.getFullYear() === now.getFullYear() && next.getMonth() <= now.getMonth())
        ? next : d;
    });
  }
  function selectCalYear(year: number) {
    setCalViewDate(new Date(year, calViewDate.getMonth(), 1));
    setCalMode('month');
  }
  function selectCalDay(day: number) {
    setSelectedDate(new Date(calViewDate.getFullYear(), calViewDate.getMonth(), day, 12, 0, 0));
    setShowCalendar(false);
  }
  const calYear  = calViewDate.getFullYear();
  const calMonth = calViewDate.getMonth();
  const daysInCalMonth    = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayOfCalWeek = new Date(calYear, calMonth, 1).getDay();
  const todayDate = new Date();
  const calYearRange = Array.from({ length: todayDate.getFullYear() - 2019 }, (_, i) => 2020 + i);

  // ── Entry detail ───────────────────────────────────────────────────────────

  async function openDetail(entry: TimelineEntry) {
    setDetailEntry(entry);
    setDetailData(null);
    setDetailLoading(true);
    let fields = '';
    if (entry.type === 'feed') {
      fields = 'feed_type,mood,position,latch_quality,breast_side,caregiver,spit_up,burps,duration_seconds,notes,bottle_source,bottle_amount_oz,logged_at';
    } else if (entry.type === 'diaper') {
      fields = 'diaper_type,color,consistency,amount,rash,notes,logged_at';
    } else {
      fields = 'left_breast,right_breast,total_ml,duration_minutes,cycle_speed,how_feel,milk_color,letdown_achieved,storage_location,logged_at';
    }
    const { data } = await supabase.from(entry.table as any).select(fields).eq('id', entry.rawId).maybeSingle();
    setDetailData(data);
    setDetailLoading(false);
  }

  function getDetailRows(type: EntryType, data: any): Array<{ label: string; value: string }> {
    if (!data) return [];
    const fmt = (v: any) => {
      if (v === null || v === undefined || v === '') return '—';
      if (typeof v === 'boolean') return v ? 'Yes' : 'No';
      if (typeof v === 'number') return String(v);
      return String(v).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    };
    if (type === 'feed') {
      const rows: Array<{ label: string; value: string }> = [{ label: 'Feed Type', value: fmt(data.feed_type) }];
      if (data.feed_type === 'bottle') {
        rows.push({ label: 'Source', value: fmt(data.bottle_source) });
        if (data.bottle_amount_oz) rows.push({ label: 'Amount', value: `${data.bottle_amount_oz} oz` });
      }
      if (data.feed_type === 'breast') {
        if (data.breast_side) rows.push({ label: 'Side', value: fmt(data.breast_side) });
        if (data.duration_seconds) {
          const m = Math.floor(data.duration_seconds / 60);
          const s = data.duration_seconds % 60;
          rows.push({ label: 'Duration', value: s > 0 ? `${m}m ${s}s` : `${m}m` });
        }
        if (data.position) rows.push({ label: 'Position', value: fmt(data.position) });
        if (data.latch_quality) rows.push({ label: 'Latch', value: fmt(data.latch_quality) });
      }
      rows.push({ label: 'Baby Mood', value: fmt(data.mood) });
      rows.push({ label: 'Spit Up', value: fmt(data.spit_up) });
      if (data.burps > 0) rows.push({ label: 'Burps', value: String(data.burps) });
      if (data.caregiver) rows.push({ label: 'Caregiver', value: fmt(data.caregiver) });
      rows.push({ label: 'Notes', value: data.notes || '—' });
      return rows;
    }
    if (type === 'diaper') {
      const rows: Array<{ label: string; value: string }> = [{ label: 'Type', value: fmt(data.diaper_type) }];
      if (data.diaper_type === 'dirty' || data.diaper_type === 'both') {
        if (data.color) rows.push({ label: 'Color', value: fmt(data.color) });
        if (data.consistency) rows.push({ label: 'Consistency', value: fmt(data.consistency) });
        if (data.amount) rows.push({ label: 'Amount', value: fmt(data.amount) });
      }
      rows.push({ label: 'Rash', value: fmt(data.rash) });
      rows.push({ label: 'Notes', value: data.notes || '—' });
      return rows;
    }
    return [
      { label: 'Left Breast',   value: `${data.left_breast  || 0} ml` },
      { label: 'Right Breast',  value: `${data.right_breast || 0} ml` },
      { label: 'Total',         value: `${data.total_ml     || 0} ml` },
      ...(data.duration_minutes ? [{ label: 'Duration', value: `${data.duration_minutes} min` }] : []),
      ...(data.cycle_speed      ? [{ label: 'Suction Level', value: String(data.cycle_speed) }] : []),
      { label: 'How It Felt',   value: fmt(data.how_feel) },
      { label: 'Milk Color',    value: fmt(data.milk_color) },
      { label: 'Letdown',       value: typeof data.letdown_achieved === 'boolean' ? (data.letdown_achieved ? 'Yes' : 'No') : '—' },
      { label: 'Storage',       value: fmt(data.storage_location) },
    ];
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const showDiaperDetail = diaperType === 'dirty' || diaperType === 'both';
  const pumpTotal = (parseFloat(leftBreast) || 0) + (parseFloat(rightBreast) || 0);

  const mainButtons = [
    { type: 'feed'    as EntryType, emoji: '🍼', label: 'Log Feed',    bgColor: c.cardLavender, accent: c.lavender },
    { type: 'diaper'  as EntryType, emoji: '💩', label: 'Log Diaper',  bgColor: c.cardSage,     accent: c.sage },
    { type: 'pumping' as EntryType, emoji: '🤱', label: 'Log Pumping', bgColor: c.cardBlush,    accent: c.blush },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Track</Text>

        {/* ── Quick nav */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 20, marginHorizontal: -4 }}
          contentContainerStyle={{ paddingHorizontal: 4, gap: 8, flexDirection: 'row' }}
        >
          {([
            { key: 'logging',    label: '📋 Logging' },
            { key: 'supplies',   label: '🧴 Supplies' },
            { key: 'milestones', label: '⭐ Milestones' },
            { key: 'vaccines',   label: '💉 Vaccines' },
            { key: 'growth',     label: '📈 Growth' },
            { key: 'nutrition',  label: '💧 Nutrition' },
            { key: 'timeline',   label: '🕐 Timeline' },
          ] as const).map(sec => (
            <TouchableOpacity
              key={sec.key}
              onPress={() => scrollToSection(sec.key)}
              style={{
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                backgroundColor: c.card, borderWidth: 1.5, borderColor: c.separator,
              }}
              activeOpacity={0.75}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.textSecondary }}>{sec.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Main buttons */}
        <View
          style={styles.buttonGroup}
          ref={ref => { sectionRefs.current['logging'] = ref; }}
          onLayout={e => { sectionY.current['logging'] = e.nativeEvent.layout.y; }}
        >
          {mainButtons.map(btn => (
            <TouchableOpacity key={btn.type}
              style={[styles.button, { backgroundColor: btn.bgColor, borderWidth: 2, borderColor: btn.accent }]}
              activeOpacity={0.8} onPress={() => openModal(btn.type)}>
              <Text style={styles.buttonEmoji}>{btn.emoji}</Text>
              <Text style={[styles.buttonLabel, { color: btn.accent }]}>{btn.label}</Text>
              <Text style={[styles.buttonArrow, { color: btn.accent }]}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Charts */}
        <FeedChartCard babyId={babyId} />
        <DiaperChartCard babyId={babyId} />
        <PumpingChartCard key={pumpChartKey} userId={userId} />

        {/* ── Supplies */}
        <View ref={ref => { sectionRefs.current['supplies'] = ref; }} onLayout={e => { sectionY.current['supplies'] = e.nativeEvent.layout.y; }}>
          <SuppliesSection userId={userId} refreshKey={suppliesRefreshKey} />
        </View>

        {/* ── Development Tracker */}
        <View ref={ref => { sectionRefs.current['milestones'] = ref; }} onLayout={e => { sectionY.current['milestones'] = e.nativeEvent.layout.y; }}>
          <MilestoneTracker userId={userId} />
        </View>

        {/* ── Vaccines & Appointments */}
        <View ref={ref => { sectionRefs.current['vaccines'] = ref; }} onLayout={e => { sectionY.current['vaccines'] = e.nativeEvent.layout.y; }}>
          <VaccineTracker userId={userId} />
        </View>

        {/* ── Growth Tracker */}
        <View ref={ref => { sectionRefs.current['growth'] = ref; }} onLayout={e => { sectionY.current['growth'] = e.nativeEvent.layout.y; }}>
          <GrowthTracker
            userId={userId}
            babyId={babyId}
            babyBirthDate={babyBirthDate}
            babyGender={babyGender}
          />
        </View>

        {/* ── Nutrition & Hydration */}
        <View ref={ref => { sectionRefs.current['nutrition'] = ref; }} onLayout={e => { sectionY.current['nutrition'] = e.nativeEvent.layout.y; }}>
          <NutritionTracker userId={userId} />
        </View>

        {/* ── Timeline */}
        <View style={styles.timelineHeader} onLayout={e => { sectionY.current['timeline'] = e.nativeEvent.layout.y; }}>
          <Text style={styles.sectionTitle}>Timeline</Text>
          {refreshing && <ActivityIndicator size="small" color={c.trackFeed} />}
        </View>

        {/* Date navigation */}
        <View style={styles.dateNav}>
          <TouchableOpacity style={styles.dateNavBtn} onPress={goToPrevDay} activeOpacity={0.7}>
            <Text style={styles.dateNavArrow}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dateNavCenter} onPress={openCalendar} activeOpacity={0.7}>
            <Text style={styles.dateNavLabel}>{dateLabel} <Text style={styles.dateNavCal}>▾</Text></Text>
            {!isToday && (
              <TouchableOpacity onPress={() => setSelectedDate(new Date())} activeOpacity={0.7}>
                <Text style={styles.dateNavToday}>Back to today</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.dateNavBtn, isToday && styles.dateNavBtnDisabled]}
            onPress={goToNextDay} activeOpacity={isToday ? 1 : 0.7}>
            <Text style={[styles.dateNavArrow, isToday && styles.dateNavArrowDisabled]}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.timeline}>
          {entries.length === 0 ? (
            <Text style={styles.empty}>No entries for this day</Text>
          ) : (
            entries.map((entry, i) => (
              <TouchableOpacity key={entry.id} activeOpacity={0.75} onPress={() => openDetail(entry)}
                style={[styles.entry, i < entries.length - 1 && styles.entryBorder,
                  { backgroundColor: entry.type === 'feed' ? c.cardLavender : entry.type === 'diaper' ? c.cardSage : c.cardBlush }]}>
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
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      {/* ══════════ DETAIL MODAL ══════════ */}
      <Modal visible={detailEntry !== null} animationType="slide" transparent
        onRequestClose={() => setDetailEntry(null)}>
        <View style={det.overlay}>
          <TouchableOpacity style={det.backdrop} activeOpacity={1} onPress={() => setDetailEntry(null)} />
          <View style={det.sheet}>
            <View style={det.handle} />
            <View style={det.header}>
              <Text style={det.title}>
                {detailEntry?.emoji} {detailEntry?.label}
                {'  '}<Text style={det.titleTime}>{detailEntry ? formatTime(detailEntry.logged_at) : ''}</Text>
              </Text>
              <TouchableOpacity onPress={() => setDetailEntry(null)} activeOpacity={0.7}>
                <Text style={det.close}>✕</Text>
              </TouchableOpacity>
            </View>
            {detailLoading ? (
              <ActivityIndicator color={c.trackFeed} style={{ marginTop: 32, marginBottom: 24 }} />
            ) : (
              <ScrollView style={det.scroll} contentContainerStyle={det.content}
                showsVerticalScrollIndicator={false}>
                {detailEntry && getDetailRows(detailEntry.type, detailData).map((row, i, arr) => (
                  <View key={row.label} style={[det.row, i < arr.length - 1 && det.rowBorder]}>
                    <Text style={det.rowLabel}>{row.label}</Text>
                    <Text style={det.rowValue}>{row.value}</Text>
                  </View>
                ))}
                <TouchableOpacity style={det.editBtn} activeOpacity={0.8}
                  onPress={() => { if (detailEntry) openEdit(detailEntry); }}>
                  <Text style={det.editBtnText}>✏️  Edit Entry</Text>
                </TouchableOpacity>
                <TouchableOpacity style={det.deleteBtn} activeOpacity={0.8}
                  onPress={() => { setDetailEntry(null); if (detailEntry) handleDeleteEntry(detailEntry); }}>
                  <Text style={det.deleteBtnText}>🗑  Delete Entry</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ══════════ FEED MODAL ══════════ */}
      <ModalSheet visible={activeModal === 'feed'} onClose={closeModal}
        title={editingId ? '🍼 Edit Feed' : '🍼 Log Feed'} accent={c.trackFeed} onSave={handleSaveFeed} saving={saving}>

        <PickerField label="Feed type" options={FEED_TYPE}
          value={feedType} onChange={setFeedType} accent={c.trackFeed} />

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

            <TimerWidget timer={feedTimer} accent={c.trackFeed}
              useManual={feedUseManual} onToggleManual={() => setFeedUseManual(v => !v)}
              manualValue={feedManualMin} onManualChange={setFeedManualMin} />
            <PickerField label="Position" options={FEED_POSITION}
              value={feedPosition} onChange={setFeedPosition} accent={c.trackFeed} />
            {feedPosition === 'other' && (
              <TextInput
                style={[makeNiStyles(c).input, { marginTop: -10, marginBottom: 20 }]}
                placeholder="Describe position…"
                placeholderTextColor={c.textMuted}
                value={feedPositionOther}
                onChangeText={setFeedPositionOther}
              />
            )}
            <PickerField label="Latch quality" options={FEED_LATCH}
              value={latchQuality} onChange={setLatchQuality} accent={c.trackFeed} />
          </>
        )}

        {feedType === 'bottle' && (
          <>
            <View style={pf.wrap}>
              <Text style={pf.label}>What's in the bottle?</Text>
              <View style={pf.row}>
                <TouchableOpacity
                  style={[pf.chip, bottleSource === 'breastmilk' && { backgroundColor: c.trackFeed, borderColor: c.trackFeed }]}
                  onPress={() => setBottleSource('breastmilk')} activeOpacity={0.75}>
                  <Text style={[pf.chipText, bottleSource === 'breastmilk' && pf.chipSel]}>🤱 Breastmilk</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[pf.chip, bottleSource === 'formula' && { backgroundColor: c.trackFeed, borderColor: c.trackFeed }]}
                  onPress={() => setBottleSource('formula')} activeOpacity={0.75}>
                  <Text style={[pf.chipText, bottleSource === 'formula' && pf.chipSel]}>🍶 Formula</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ marginBottom: 20 }}>
              <Text style={pf.label}>Amount (oz)</Text>
              <View style={styles.breastRow}>
                <View style={[styles.breastField, { flex: 1 }]}>
                  <TextInput style={styles.breastInput} placeholder="0.0" placeholderTextColor={c.textMuted}
                    value={feedAmount} onChangeText={setFeedAmount} keyboardType="decimal-pad" />
                  <Text style={styles.breastUnit}>oz</Text>
                </View>
              </View>
            </View>
          </>
        )}

        {(feedType === 'bottle' || feedType === 'solids') && (
          <PickerField label="Fed by" options={CAREGIVER}
            value={feedCaregiver} onChange={setFeedCaregiver} accent={c.trackFeed} />
        )}

        <PickerField label="Baby's mood" options={FEED_MOOD}
          value={feedMood} onChange={setFeedMood} accent={c.trackFeed} />
        <PickerField label="Spit-up" options={FEED_SPIT_UP}
          value={spitUp} onChange={setSpitUp} accent={c.trackFeed} />
        <Stepper label="Burps" value={feedBurps} onChange={setFeedBurps} max={15} accent={c.trackFeed} />
        <NotesInput value={feedNotes} onChange={setFeedNotes} />
      </ModalSheet>

      {/* ══════════ DIAPER MODAL ══════════ */}
      <ModalSheet visible={activeModal === 'diaper'} onClose={closeModal}
        title={editingId ? '💩 Edit Diaper' : '💩 Log Diaper'} accent={c.trackDiaper} onSave={handleSaveDiaper} saving={saving}>

        <PickerField label="Type" options={DIAPER_TYPE}
          value={diaperType} onChange={setDiaperType} accent={c.trackDiaper} />

        {showDiaperDetail && (
          <>
            <ColorCirclePicker label="Color" options={DIAPER_COLORS}
              value={diaperColor} onChange={setDiaperColor} />
            <PickerField label="Consistency" options={DIAPER_CONSIST}
              value={diaperConsist} onChange={setDiaperConsist} accent={c.trackDiaper} />
            <PickerField label="Amount" options={DIAPER_AMOUNT}
              value={diaperAmount} onChange={setDiaperAmount} accent={c.trackDiaper} />
          </>
        )}

        <PickerField label="Diaper rash" options={DIAPER_RASH}
          value={diaperRash} onChange={setDiaperRash} accent={c.trackDiaper} />
        <NotesInput value={diaperNotes} onChange={setDiaperNotes} />
      </ModalSheet>

      {/* ══════════ PUMPING MODAL ══════════ */}
      <ModalSheet visible={activeModal === 'pumping'} onClose={closeModal}
        title={editingId ? '🤱 Edit Pumping' : '🤱 Log Pumping'} accent={c.trackPump} onSave={handleSavePumping} saving={saving}>

        <TimerWidget timer={pumpTimer} accent={c.trackPump}
          useManual={pumpUseManual} onToggleManual={() => setPumpUseManual(v => !v)}
          manualValue={pumpManualMin} onManualChange={setPumpManualMin} />

        <Text style={pf.label}>Amount expressed (ml)</Text>
        <View style={styles.breastRow}>
          <View style={styles.breastField}>
            <Text style={styles.breastSideLabel}>Left</Text>
            <TextInput style={styles.breastInput} placeholder="0" placeholderTextColor={c.textMuted}
              value={leftBreast} onChangeText={setLeftBreast} keyboardType="decimal-pad" />
            <Text style={styles.breastUnit}>ml</Text>
          </View>
          <View style={styles.breastDivider} />
          <View style={styles.breastField}>
            <Text style={styles.breastSideLabel}>Right</Text>
            <TextInput style={styles.breastInput} placeholder="0" placeholderTextColor={c.textMuted}
              value={rightBreast} onChangeText={setRightBreast} keyboardType="decimal-pad" />
            <Text style={styles.breastUnit}>ml</Text>
          </View>
        </View>
        {pumpTotal > 0 && (
          <Text style={styles.totalPreview}>Total: {pumpTotal.toFixed(1)} ml</Text>
        )}

        <Stepper label="Suction level (1–10)" value={suctionLevel} onChange={setSuctionLevel}
          min={1} max={10} accent={c.trackPump} />
        <ColorCirclePicker label="Milk color" options={MILK_COLORS}
          value={milkColor} onChange={setMilkColor} />
        <PickerField label="How did it feel?" options={PUMP_HOW_FEEL}
          value={howFeel} onChange={setHowFeel} accent={c.trackPump} />

        <View style={pf.wrap}>
          <Text style={pf.label}>Letdown achieved?</Text>
          <View style={pf.row}>
            <TouchableOpacity
              style={[pf.chip, letdownAchieved && { backgroundColor: c.trackPump, borderColor: c.trackPump }]}
              onPress={() => setLetdownAchieved(true)} activeOpacity={0.75}>
              <Text style={[pf.chipText, letdownAchieved && pf.chipSel]}>Yes ✓</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[pf.chip, !letdownAchieved && { backgroundColor: c.trackPump, borderColor: c.trackPump }]}
              onPress={() => setLetdownAchieved(false)} activeOpacity={0.75}>
              <Text style={[pf.chipText, !letdownAchieved && pf.chipSel]}>No</Text>
            </TouchableOpacity>
          </View>
        </View>

        <PickerField label="Storage" options={PUMP_STORAGE}
          value={storageLocation} onChange={setStorageLocation} accent={c.trackPump} />
      </ModalSheet>

      {/* ══════════ CALENDAR PICKER ══════════ */}
      <Modal visible={showCalendar} animationType="fade" transparent
        onRequestClose={() => setShowCalendar(false)}>
        <View style={cal.overlay}>
          <TouchableOpacity style={cal.backdrop} activeOpacity={1} onPress={() => setShowCalendar(false)} />
          <View style={cal.container}>

            {/* Month/Year header */}
            <View style={cal.header}>
              {calMode === 'month' ? (
                <>
                  <TouchableOpacity onPress={calPrevMonth} style={cal.headerBtn}>
                    <Text style={cal.headerArrow}>‹</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setCalMode('year')} activeOpacity={0.7}>
                    <Text style={cal.headerTitle}>
                      {calViewDate.toLocaleDateString('en-US', { month: 'long' })}{' '}
                      <Text style={cal.headerYear}>{calYear}</Text>
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={calNextMonth} style={cal.headerBtn}>
                    <Text style={cal.headerArrow}>›</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={cal.headerBtn} />
                  <Text style={cal.headerTitle}>Select Year</Text>
                  <TouchableOpacity onPress={() => setCalMode('month')} style={cal.headerBtn}>
                    <Text style={[cal.headerArrow, { fontSize: 14 }]}>✕</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {calMode === 'year' ? (
              /* Year grid */
              <View style={cal.yearGrid}>
                {calYearRange.map(y => {
                  const isCurYear = y === calYear;
                  return (
                    <TouchableOpacity key={y} style={[cal.yearCell, isCurYear && cal.yearCellSel]}
                      onPress={() => selectCalYear(y)} activeOpacity={0.75}>
                      <Text style={[cal.yearText, isCurYear && cal.yearTextSel]}>{y}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              /* Month grid */
              <>
                <View style={cal.dayHeaders}>
                  {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                    <Text key={d} style={cal.dayHeader}>{d}</Text>
                  ))}
                </View>
                <View style={cal.grid}>
                  {Array.from({ length: firstDayOfCalWeek }).map((_, i) => (
                    <View key={`e${i}`} style={cal.cell} />
                  ))}
                  {Array.from({ length: daysInCalMonth }, (_, i) => i + 1).map(day => {
                    const date = new Date(calYear, calMonth, day);
                    const isSel = day === selectedDate.getDate() &&
                      calMonth === selectedDate.getMonth() &&
                      calYear  === selectedDate.getFullYear();
                    const isTod = day === todayDate.getDate() &&
                      calMonth === todayDate.getMonth() &&
                      calYear  === todayDate.getFullYear();
                    const isFut = date > todayDate;
                    return (
                      <TouchableOpacity key={day} style={cal.cell} disabled={isFut}
                        onPress={() => selectCalDay(day)} activeOpacity={0.75}>
                        <View style={[cal.dayCell, isSel && cal.dayCellSel, isTod && !isSel && cal.dayCellToday]}>
                          <Text style={[cal.dayText, isFut && cal.dayFuture, isSel && cal.daySel]}>{day}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Style factories ──────────────────────────────────────────────────────────

function makePfStyles(c: Colors) {
  return StyleSheet.create({
    wrap:    { marginBottom: 20 },
    label:   { fontSize: 12, fontWeight: '700', color: c.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
    row:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip:    { borderWidth: 1.5, borderColor: c.inputBorder, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: c.card },
    chipText:{ fontSize: 13, fontWeight: '600', color: c.textSecondary },
    chipSel: { color: '#fff' },
  });
}

function makeCpStyles(c: Colors) {
  return StyleSheet.create({
    wrap:     { marginBottom: 20 },
    row:      { flexDirection: 'row', gap: 12 },
    circle:   { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: c.inputBorder, alignItems: 'center', justifyContent: 'center' },
    selected: { borderColor: c.textSecondary, borderWidth: 2.5 },
    check:    { fontSize: 16, fontWeight: '800', color: '#fff', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  });
}

function makeStStyles(c: Colors) {
  return StyleSheet.create({
    wrap:    { marginBottom: 20 },
    row:     { flexDirection: 'row', alignItems: 'center', gap: 16 },
    btn:     { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card },
    btnText: { fontSize: 22, fontWeight: '600', lineHeight: 26 },
    val:     { fontSize: 24, fontWeight: '800', color: c.textPrimary, minWidth: 32, textAlign: 'center' },
  });
}

function makeTwStyles(c: Colors) {
  return StyleSheet.create({
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
    manualInput: { backgroundColor: c.card, borderWidth: 1.5, borderColor: c.inputBorder, borderRadius: 12,
                    paddingHorizontal: 14, paddingVertical: 12, fontSize: 28, fontWeight: '800',
                    color: c.textPrimary, textAlign: 'center', width: 90 },
    manualUnit:  { fontSize: 16, color: c.textMuted, fontWeight: '600' },
  });
}

function makeMsStyles(c: Colors) {
  return StyleSheet.create({
    overlay:    { flex: 1, justifyContent: 'flex-end' },
    backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(30,27,75,0.4)' },
    sheet:      { backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, maxHeight: '92%' },
    handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: c.inputBorder, alignSelf: 'center', marginBottom: 18 },
    content:    { paddingHorizontal: 24, paddingBottom: 8 },
    title:      { fontSize: 22, fontWeight: '800', color: c.textPrimary, marginBottom: 24 },
    saveBtn:    { borderRadius: 14, paddingVertical: 17, alignItems: 'center', marginTop: 8, marginBottom: 12 },
    saveBtnOff: { opacity: 0.65 },
    saveBtnText:{ color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
    cancelBtn:  { alignItems: 'center', paddingVertical: 12 },
    cancelText: { fontSize: 15, color: c.textMuted, fontWeight: '600' },
  });
}

function makeNiStyles(c: Colors) {
  return StyleSheet.create({
    input: { backgroundColor: c.card, borderWidth: 1.5, borderColor: c.inputBorder, borderRadius: 12,
             paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: c.textPrimary, minHeight: 80 },
  });
}

function makeChartStyles(c: Colors) {
  return StyleSheet.create({
    card: { backgroundColor: c.card, borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 12,
      borderWidth: 1.5, borderColor: c.cardBorder },
    title: { fontSize: 15, fontWeight: '700', color: c.textSecondary, marginBottom: 12 },
    toggleContainer: { flexDirection: 'row', backgroundColor: c.inputBg, borderRadius: 8, padding: 3, marginBottom: 12 },
    toggle: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
    toggleActive: { backgroundColor: c.trackFeed },
    toggleText: { fontSize: 11, color: c.textMuted, fontWeight: '600' },
    toggleTextActive: { color: '#FFFFFF' },
    chart: { marginLeft: -16, borderRadius: 12 },
    noData: { textAlign: 'center', color: c.textMuted, paddingVertical: 40, fontSize: 13 },
  });
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safeArea:      { flex: 1, backgroundColor: c.bg },
    scroll:        { flex: 1 },
    scrollContent: { padding: 24, paddingBottom: 40 },
    heading:       { fontSize: 28, fontWeight: '800', color: c.textPrimary, marginBottom: 28 },

    buttonGroup: { gap: 14, marginBottom: 36 },
    button: {
      flexDirection: 'row', alignItems: 'center', borderRadius: 18,
      paddingVertical: 20, paddingHorizontal: 22,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
    },
    buttonEmoji: { fontSize: 30, marginRight: 14 },
    buttonLabel: { flex: 1, fontSize: 18, fontWeight: '700', letterSpacing: 0.2 },
    buttonArrow: { fontSize: 22, fontWeight: '300' },

    timelineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    sectionTitle:   { fontSize: 18, fontWeight: '700', color: c.textPrimary },
    timeline:       { backgroundColor: c.card, borderRadius: 16, overflow: 'hidden',
                      borderWidth: 1.5, borderColor: c.cardBorder },
    empty:          { fontSize: 15, color: c.textMuted, fontStyle: 'italic', textAlign: 'center', padding: 24 },
    entry:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 18 },
    entryBorder:    { borderBottomWidth: 1, borderBottomColor: c.cardBorder },
    entryEmoji:     { fontSize: 24, marginRight: 14 },
    entryBody:      { flex: 1 },
    entryLabel:     { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    entryDetail:    { fontSize: 12, color: c.textMuted, marginTop: 2, textTransform: 'capitalize' },
    entryTime:      { fontSize: 13, color: c.textMuted, fontWeight: '600', marginRight: 10 },
    deleteBtn:      { padding: 6 },
    deleteIcon:     { fontSize: 16 },

    breastToggleRow:       { flexDirection: 'row', gap: 12, marginBottom: 20 },
    breastToggleBtn:       { flex: 1, backgroundColor: c.card, borderWidth: 1.5, borderColor: c.inputBorder,
                             borderRadius: 16, paddingVertical: 20, alignItems: 'center',
                             shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                             shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
    breastToggleActive:    { backgroundColor: c.cardLavender, borderColor: c.lavender, borderWidth: 2 },
    breastToggleEmoji:     { fontSize: 28, marginBottom: 6 },
    breastToggleLabel:     { fontSize: 16, fontWeight: '700', color: c.textMuted },
    breastToggleLabelActive:{ color: c.lavender },
    breastToggleCheck:     { position: 'absolute', top: 8, right: 10, fontSize: 14,
                             fontWeight: '800', color: c.lavender },

    breastRow:       { flexDirection: 'row', backgroundColor: c.card, borderWidth: 1.5,
                       borderColor: c.inputBorder, borderRadius: 14, marginBottom: 8, overflow: 'hidden' },
    breastField:     { flex: 1, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 12 },
    breastSideLabel: { fontSize: 12, fontWeight: '700', color: c.textMuted, marginBottom: 8,
                       textTransform: 'uppercase', letterSpacing: 0.6 },
    breastInput:     { fontSize: 28, fontWeight: '800', color: c.textPrimary, textAlign: 'center', minWidth: 60 },
    breastUnit:      { fontSize: 13, color: c.textMuted, marginTop: 4, fontWeight: '600' },
    breastDivider:   { width: 1, backgroundColor: c.inputBorder, marginVertical: 16 },
    totalPreview:    { fontSize: 13, color: c.trackPump, fontWeight: '700', textAlign: 'center',
                       marginBottom: 20, marginTop: 4 },

    dateNav:             { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    dateNavBtn:          { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    dateNavBtnDisabled:  { opacity: 0.25 },
    dateNavArrow:        { fontSize: 28, fontWeight: '300', color: c.textSecondary, lineHeight: 32 },
    dateNavArrowDisabled:{ color: c.textMuted },
    dateNavCenter:       { flex: 1, alignItems: 'center', gap: 2 },
    dateNavLabel:        { fontSize: 16, fontWeight: '700', color: c.textPrimary },
    dateNavCal:          { fontSize: 12, color: c.trackFeed },
    dateNavToday:        { fontSize: 12, color: c.trackFeed, fontWeight: '600' },
  });
}

function makeCalStyles(c: Colors) {
  return StyleSheet.create({
    overlay:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
    backdrop:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(30,27,75,0.5)' },
    container:   { backgroundColor: c.bg, borderRadius: 20, padding: 20, width: 320,
                   shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
                   shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
    header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    headerBtn:   { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerArrow: { fontSize: 26, color: c.textSecondary, fontWeight: '300' },
    headerTitle: { fontSize: 16, fontWeight: '700', color: c.textPrimary, textAlign: 'center' },
    headerYear:  { color: c.calSelected },
    dayHeaders:  { flexDirection: 'row', marginBottom: 6 },
    dayHeader:   { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700',
                   color: c.textMuted, textTransform: 'uppercase' },
    grid:        { flexDirection: 'row', flexWrap: 'wrap' },
    cell:        { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
    dayCell:     { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    dayCellSel:  { backgroundColor: c.calSelected },
    dayCellToday:{ borderWidth: 1.5, borderColor: c.calToday },
    dayText:     { fontSize: 14, fontWeight: '500', color: c.textPrimary },
    dayFuture:   { color: c.calFuture },
    daySel:      { color: c.calSelectedText, fontWeight: '700' },
    yearGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 },
    yearCell:    { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
                   backgroundColor: c.inputBg, minWidth: 72, alignItems: 'center' },
    yearCellSel: { backgroundColor: c.calSelected },
    yearText:    { fontSize: 15, fontWeight: '600', color: c.textSecondary },
    yearTextSel: { color: '#fff' },
  });
}

function makeDetStyles(c: Colors) {
  return StyleSheet.create({
    overlay:    { flex: 1, justifyContent: 'flex-end' },
    backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(30,27,75,0.4)' },
    sheet:      { backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28,
                  paddingTop: 12, maxHeight: '80%' },
    handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: c.inputBorder,
                  alignSelf: 'center', marginBottom: 16 },
    header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 24, marginBottom: 8 },
    title:      { fontSize: 18, fontWeight: '800', color: c.textPrimary },
    titleTime:  { fontSize: 14, fontWeight: '500', color: c.textMuted },
    close:      { fontSize: 18, color: c.textMuted, paddingLeft: 8 },
    scroll:     { flexGrow: 0 },
    content:    { paddingHorizontal: 24, paddingBottom: 24 },
    row:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
                  paddingVertical: 13 },
    rowBorder:  { borderBottomWidth: 1, borderBottomColor: c.inputBg },
    rowLabel:   { fontSize: 14, fontWeight: '600', color: c.textMuted, flex: 1 },
    rowValue:   { fontSize: 14, color: c.textPrimary, fontWeight: '500', flex: 1.5, textAlign: 'right' },
    editBtn:    { marginTop: 20, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                  backgroundColor: c.cardBlue, borderWidth: 1.5, borderColor: c.blue },
    editBtnText:   { fontSize: 15, fontWeight: '700', color: c.blue },
    deleteBtn:  { marginTop: 10, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                  backgroundColor: c.cardBlush, borderWidth: 1.5, borderColor: c.blush },
    deleteBtnText: { fontSize: 15, fontWeight: '700', color: c.blush },
  });
}
