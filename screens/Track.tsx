import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import OneHandedTray from '../components/OneHandedTray';
import { supabase } from '../lib/supabase';
import { safeInsert, safeUpdate, safeDelete, safeQuery, generateId, useSyncStatus } from '../lib/syncService';
import { LineChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import SuppliesSection, { addToSupply, addToMilkStash, deductFromSupply, incrementPumpPartSessions } from './SuppliesSection';
import MilestoneTracker from './MilestoneTracker';
import ActivityTracker from './ActivityTracker';
import VaccineTracker from './VaccineTracker';
import GrowthTracker from './GrowthTracker';
import AllergenTracker from './AllergenTracker';
import HealthTracker from './HealthTracker';
import SleepTracker from './SleepTracker';
import BabyJournal from './BabyJournal';
import BabyFoodChart from './BabyFoodChart';
import NutritionTracker from './NutritionTracker';
import PostpartumMentalHealthTracker from './PostpartumMentalHealthTracker';
import MoodEnergyTracker from './MoodEnergyTracker';
import MomSleepTracker from './MomSleepTracker';
import MedTracker from './MedTracker';
import DiaperReminderCard from '../components/DiaperReminderCard';
import CarCheckReminderCard from '../components/CarCheckReminderCard';
import { getDiaperReminderSettings, scheduleNextDiaperReminder } from '../lib/diaperNotifications';
import FeedReminderCard from '../components/FeedReminderCard';
import NursingReminderCard from '../components/NursingReminderCard';
import { getFeedReminderSettings, scheduleNextFeedReminder } from '../lib/feedNotifications';
import BabyFoodTracker from './BabyFoodTracker';
import PostpartumRecoveryTracker from './PostpartumRecoveryTracker';
import PeriodReturnTracker from './PeriodReturnTracker';
import MovementTracker from './MovementTracker';
import KickCounterTracker from './KickCounterTracker';
import ContractionTimerTracker from './ContractionTimerTracker';
import PregnancyLogTracker from './PregnancyLogTracker';
import InsightsSection from '../components/InsightsSection';
import PaywallGate from '../components/PaywallGate';
import PostLogCelebration from '../components/PostLogCelebration';
import { recordLog } from '../lib/streakService';
import { useColors, Colors } from '../lib/theme';
import * as Sentry from '@sentry/react-native';
import LoadErrorBanner from '../components/LoadErrorBanner';
import { useBaby } from '../lib/babyContext';
import { useSubscription } from '../lib/subscriptionContext';

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

// ─── Input sanitizers ─────────────────────────────────────────────────────────
// keyboardType is a native-keyboard hint only — react-native-web renders a
// plain text input that accepts anything typed, so numeric fields need to
// filter their own input to match the native behavior.

function sanitizeDecimal(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}

function sanitizeDigits(text: string): string {
  return text.replace(/[^0-9]/g, '');
}

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
const POWER_PUMP_PROTOCOLS: Record<string, { label: string; desc: string; phases: { action: 'pump' | 'rest'; minutes: number }[]; loops?: boolean }> = {
  classic:  { label: 'Classic',         desc: '20 on · 10 off · 10 on · 10 off · 10 on',  phases: [{ action: 'pump', minutes: 20 }, { action: 'rest', minutes: 10 }, { action: 'pump', minutes: 10 }, { action: 'rest', minutes: 10 }, { action: 'pump', minutes: 10 }] },
  extended: { label: 'Extended 30-30-30', desc: '30 on · 30 off · 30 on',                  phases: [{ action: 'pump', minutes: 30 }, { action: 'rest', minutes: 30 }, { action: 'pump', minutes: 30 }] },
  mini:     { label: 'Mini (30 min)',    desc: '10 on · 5 off · 5 on · 5 off · 5 on',      phases: [{ action: 'pump', minutes: 10 }, { action: 'rest', minutes: 5  }, { action: 'pump', minutes: 5  }, { action: 'rest', minutes: 5  }, { action: 'pump', minutes: 5  }] },
  burst:    { label: 'Hourly Burst',     desc: '5 min pump · 55 min rest · loops',          phases: [{ action: 'pump', minutes: 5  }, { action: 'rest', minutes: 55 }], loops: true },
};

const MILK_COLORS: ColorOption[] = [
  { value: 'white',  color: '#F0EDE8', label: 'White'  },
  { value: 'yellow', color: '#F5D76E', label: 'Yellow' },
  { value: 'blue',   color: '#AED6F1', label: 'Blue'   },
  { value: 'pink',   color: '#F1AEB5', label: 'Pink'   },
];

// ─── Category filter groups ─────────────────────────────────────────────────
// Each group gets one accent color in the filter bar; selecting a category
// shows only the matching page sections below (or everything, for "All").

interface TrackNavGroup { emoji: string; category: string }

const BABY_NAV_GROUPS: TrackNavGroup[] = [
  { emoji: '📋', category: 'Daily Logging' },
  { emoji: '✨', category: 'Insights & Supplies' },
  { emoji: '🍽️', category: 'Feeding' },
  { emoji: '🌙', category: 'Sleep & Development' },
  { emoji: '🏥', category: 'Health' },
];

const YOU_NAV_GROUPS: TrackNavGroup[] = [
  { emoji: '💧', category: 'Daily Care' },
  { emoji: '🌈', category: 'Wellness Check-ins' },
  { emoji: '🌸', category: 'Body & Recovery' },
];

const PREGNANCY_NAV_GROUP: TrackNavGroup = { emoji: '🤰', category: 'Pregnancy' };

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
              onPress={() => onChange(opt.value)} activeOpacity={0.75}
              accessibilityRole="button" accessibilityLabel={opt.label}>
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
              onPress={() => onChange(opt.value)} activeOpacity={0.8}
              accessibilityRole="button" accessibilityLabel={opt.label}>
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
          onPress={() => onChange(Math.max(min, value - 1))} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={`Decrease ${label}`}>
          <Text style={[st.btnText, { color: accent }]}>−</Text>
        </TouchableOpacity>
        <Text style={st.val}>{value}</Text>
        <TouchableOpacity style={[st.btn, { borderColor: accent }]}
          onPress={() => onChange(Math.min(max, value + 1))} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={`Increase ${label}`}>
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
        <TouchableOpacity onPress={onToggleManual}
          accessibilityRole="button" accessibilityLabel={useManual ? 'Use timer' : 'Enter duration manually'}>
          <Text style={[tw.toggleLink, { color: accent }]}>
            {useManual ? 'Use timer' : 'Enter manually'}
          </Text>
        </TouchableOpacity>
      </View>

      {useManual ? (
        <View style={tw.manualRow}>
          <TextInput style={tw.manualInput} placeholder="0" placeholderTextColor={c.textMuted}
            value={manualValue} onChangeText={t => onManualChange(sanitizeDigits(t))} keyboardType="number-pad"
            accessibilityLabel="Duration in minutes" />
          <Text style={tw.manualUnit}>min</Text>
        </View>
      ) : (
        <>
          <Text style={[tw.display, { color: accent }]}>{formatTimer(timer.elapsed)}</Text>
          <View style={tw.btnRow}>
            {!timer.running && !timer.paused && (
              <TouchableOpacity style={[tw.timerBtn, { backgroundColor: accent }]} onPress={timer.start}
                accessibilityRole="button" accessibilityLabel="Start timer">
                <Text style={tw.timerBtnText}>▶  Start</Text>
              </TouchableOpacity>
            )}
            {timer.running && !timer.paused && (
              <>
                <TouchableOpacity style={[tw.timerBtn, tw.outline, { borderColor: accent }]} onPress={timer.pause}
                  accessibilityRole="button" accessibilityLabel="Pause timer">
                  <Text style={[tw.outlineText, { color: accent }]}>⏸  Pause</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[tw.timerBtn, tw.danger]} onPress={timer.stop}
                  accessibilityRole="button" accessibilityLabel="Stop timer">
                  <Text style={tw.timerBtnText}>■  Stop</Text>
                </TouchableOpacity>
              </>
            )}
            {timer.paused && (
              <>
                <TouchableOpacity style={[tw.timerBtn, { backgroundColor: accent }]} onPress={timer.resume}
                  accessibilityRole="button" accessibilityLabel="Resume timer">
                  <Text style={tw.timerBtnText}>▶  Resume</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[tw.timerBtn, tw.danger]} onPress={timer.reset}
                  accessibilityRole="button" accessibilityLabel="Reset timer">
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

  const actionButtons = (
    <>
      <TouchableOpacity style={[ms.saveBtn, { backgroundColor: accent }, saving && ms.saveBtnOff]}
        onPress={onSave} disabled={saving} activeOpacity={0.85}
        accessibilityRole="button" accessibilityLabel="Save">
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={ms.saveBtnText}>Save</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={ms.cancelBtn} onPress={onClose} activeOpacity={0.7}
        accessibilityRole="button" accessibilityLabel="Cancel">
        <Text style={ms.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={ms.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={ms.backdrop} activeOpacity={1} onPress={onClose}
          accessibilityRole="button" accessibilityLabel="Close" />
        <View style={ms.sheet}>
          <View style={ms.handle} />
          <OneHandedTray actions={actionButtons} bottomPad={insets.bottom + 8}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
              contentContainerStyle={ms.content}>
              <Text style={ms.title}>{title}</Text>
              {children}
            </ScrollView>
          </OneHandedTray>
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
        value={value} onChangeText={onChange} multiline numberOfLines={3} textAlignVertical="top"
        accessibilityLabel="Notes" />
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
        <TouchableOpacity key={p} style={[chartStyles.toggle, period === p && chartStyles.toggleActive]} onPress={() => onChange(p)}
          accessibilityRole="button" accessibilityLabel={`Show ${p} data`}>
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

export default function Track({ route }: any) {
  const c = useColors();
  const { isSubscribed, openPaywall } = useSubscription();
  const styles = useMemo(() => makeStyles(c), [c]);
  const cal = useMemo(() => makeCalStyles(c), [c]);
  const det = useMemo(() => makeDetStyles(c), [c]);
  const pf = useMemo(() => makePfStyles(c), [c]);
  const initialCategory = route?.params?.initialCategory as string | undefined;
  const initialActiveView = route?.params?.activeView as 'baby' | 'you' | undefined;

  const [entries,    setEntries]    = useState<TimelineEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [timelineError, setTimelineError] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [saving,      setSaving]      = useState(false);
  const [babyId,         setBabyId]         = useState<string | null>(null);
  const [userId,         setUserId]         = useState<string | null>(null);
  const [babyBirthDate,  setBabyBirthDate]  = useState<string | null>(null);
  const [babyGender,     setBabyGender]     = useState<string | null>(null);
  const [babyName,       setBabyName]       = useState<string | null>(null);
  const [babyWeightLbs,  setBabyWeightLbs]  = useState<number | null>(null);
  const [userName,       setUserName]       = useState<string | null>(null);
  const [showFoodChart, setShowFoodChart] = useState(false);
  const [activeView,    setActiveView]    = useState<'baby' | 'you'>(initialActiveView ?? 'baby');
  const [mentalHealthAlert, setMentalHealthAlert] = useState(false);
  const [celebration, setCelebration] = useState<{ streak: number; milestone: number | null; usedFreeze: boolean } | null>(null);

  const scrollRef       = useRef<ScrollView>(null);
  const [babyCategory, setBabyCategory] = useState<string>(initialActiveView !== 'you' ? initialCategory ?? 'All' : 'All');
  const [youCategory,  setYouCategory]  = useState<string>(initialActiveView === 'you' ? initialCategory ?? 'All' : 'All');

  // Jump to the category a synced calendar event points back to, e.g. Health
  // for a vaccine appointment, whenever the Calendar tab navigates here.
  useEffect(() => {
    if (!initialCategory) return;
    if (initialActiveView === 'you') {
      setActiveView('you');
      setYouCategory(initialCategory);
    } else {
      setActiveView('baby');
      setBabyCategory(initialCategory);
    }
  }, [initialCategory, initialActiveView]);
  const [suppliesRefreshKey,  setSuppliesRefreshKey]  = useState(0);
  const [pumpChartKey,       setPumpChartKey]        = useState(0);
  const [insightsRefreshKey, setInsightsRefreshKey]  = useState(0);
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
  const [foodTrackerOpenKey,        setFoodTrackerOpenKey]        = useState(0);
  const [openFoodTrackerAfterFeed,  setOpenFoodTrackerAfterFeed]  = useState(false);
  const [feedMood,          setFeedMood]           = useState('calm');
  const [feedPosition,      setFeedPosition]       = useState('cradle');
  const [feedPositionOther, setFeedPositionOther]  = useState('');
  const [latchQuality,      setLatchQuality]       = useState('good');
  const [spitUp,            setSpitUp]             = useState('none');
  const [feedBurps,         setFeedBurps]          = useState(0);
  const [feedNotes,         setFeedNotes]          = useState('');
  const [feedCaregiver,     setFeedCaregiver]      = useState('parent');
  const [feedUseManual,     setFeedUseManual]      = useState(false);
  const [feedManualMin,     setFeedManualMin]      = useState('');
  const [bottleSource,      setBottleSource]       = useState<'breastmilk' | 'formula' | 'mixed'>('breastmilk');
  const [bottleMixBmOz,    setBottleMixBmOz]      = useState('');
  const [bottleMixFmOz,    setBottleMixFmOz]      = useState('');
  const [feedAmount,        setFeedAmount]         = useState('');
  // Per-side breast timers
  const leftBreastTimer  = useTimer();
  const rightBreastTimer = useTimer();
  const [activeBreastSide, setActiveBreastSide]   = useState<'left' | 'right' | null>(null);
  // Last feed (for banner + "same as last time")
  const [lastFeedLog,      setLastFeedLog]         = useState<any>(null);
  const feedTimer = useTimer(); // kept for manual entry fallback

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
  const [pumpUnit,        setPumpUnit]        = useState<'ml' | 'oz'>('ml');
  const [pumpNotes,       setPumpNotes]       = useState('');
  const [lastPumpSession, setLastPumpSession] = useState<{ left_breast: number; right_breast: number; total_ml: number; logged_at: string } | null>(null);
  const [powerPumpMode,   setPowerPumpMode]   = useState(false);
  const [powerPumpProto,  setPowerPumpProto]  = useState('classic');
  const [ppPhaseIdx,      setPpPhaseIdx]      = useState(0);
  const [ppSecondsLeft,   setPpSecondsLeft]   = useState(0);
  const [ppRunning,       setPpRunning]       = useState(false);
  const [ppDone,          setPpDone]          = useState(false);
  const ppIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pumpTimer = useTimer();


  // Power pump countdown
  useEffect(() => {
    if (!ppRunning || ppDone) {
      if (ppIntervalRef.current) { clearInterval(ppIntervalRef.current); ppIntervalRef.current = null; }
      return;
    }
    const protocol = POWER_PUMP_PROTOCOLS[powerPumpProto];
    ppIntervalRef.current = setInterval(() => {
      setPpSecondsLeft(prev => {
        if (prev > 1) return prev - 1;
        setPpPhaseIdx(idx => {
          const nextIdx = idx + 1;
          if (nextIdx >= protocol.phases.length) {
            if (protocol.loops) {
              setTimeout(() => setPpSecondsLeft(protocol.phases[0].minutes * 60), 0);
              return 0;
            }
            setPpRunning(false);
            setPpDone(true);
            return idx;
          }
          setTimeout(() => setPpSecondsLeft(protocol.phases[nextIdx].minutes * 60), 0);
          return nextIdx;
        });
        return 0;
      });
    }, 1000);
    return () => { if (ppIntervalRef.current) { clearInterval(ppIntervalRef.current); ppIntervalRef.current = null; } };
  }, [ppRunning, ppDone, powerPumpProto]);

  // ── Data ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      setUserName(user.user_metadata?.name ?? user.email?.split('@')[0] ?? null);
    });
  }, []);

  // Source the current baby from the shared BabyContext (multi-child +
  // multi-caregiver aware) rather than an independent single-baby query —
  // every tracker below reads babyId/babyName/etc. from this screen's state.
  const { activeBaby } = useBaby();
  useEffect(() => {
    setBabyId(activeBaby?.id ?? null);
    setBabyName(activeBaby?.name ?? null);
    setBabyBirthDate(activeBaby?.birth_date ?? null);
    setBabyGender(activeBaby?.gender ?? null);
    setBabyWeightLbs(activeBaby?.current_weight ?? null);
  }, [activeBaby]);

  // Baby logging (feed/diaper/sleep) doesn't apply before birth — default
  // expecting parents straight to the You tab's Pregnancy category, unless
  // a Calendar deep link already asked for a specific view.
  const isExpecting = !!activeBaby?.is_expecting;
  useEffect(() => {
    if (isExpecting && !initialCategory) {
      setActiveView('you');
      setYouCategory('Pregnancy');
    }
  }, [isExpecting, initialCategory]);

  const fetchTimeline = useCallback(async () => {
    setRefreshing(true);
    setTimelineError(false);
    try {
      const dayStart = new Date(selectedDate); dayStart.setHours(0, 0, 0, 0);
      const dayEnd   = new Date(selectedDate); dayEnd.setHours(23, 59, 59, 999);
      const start = dayStart.toISOString();
      const end   = dayEnd.toISOString();
      const dateKey = start.slice(0, 10);
      const [feedRows, diaperRows, pumpRows] = await Promise.all([
        safeQuery(
          () => supabase.from('feeds').select('id, feed_type, logged_at').gte('logged_at', start).lte('logged_at', end).order('logged_at', { ascending: false }),
          `timeline_feeds_${dateKey}`,
        ),
        safeQuery(
          () => supabase.from('diaper_logs').select('id, diaper_type, logged_at').gte('logged_at', start).lte('logged_at', end).order('logged_at', { ascending: false }),
          `timeline_diapers_${dateKey}`,
        ),
        safeQuery(
          () => supabase.from('pumping_sessions').select('id, total_ml, logged_at').gte('logged_at', start).lte('logged_at', end).order('logged_at', { ascending: false }),
          `timeline_pumping_${dateKey}`,
        ),
      ]);
      const feedRes   = { data: feedRows };
      const diaperRes = { data: diaperRows };
      const pumpRes   = { data: pumpRows };
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
      setTimelineError(true);
    } finally {
      setRefreshing(false);
    }
  }, [selectedDate]);

  useEffect(() => { fetchTimeline(); }, [fetchTimeline]);

  async function getFirstBabyId(): Promise<string | null> {
    // Fallback for the rare race where BabyContext hasn't resolved yet —
    // RLS (see supabase/baby_sharing.sql) already scopes this to babies the
    // signed-in user owns or has been invited to as a caregiver.
    const { data } = await supabase.from('babies').select('id').limit(1).maybeSingle();
    return data?.id ?? null;
  }

  // ── Modal open ────────────────────────────────────────────────────────────

  function handleFeedTypeChange(value: string) {
    setFeedType(value);
    if (value === 'solids') {
      Alert.alert(
        'Track this food? 🥣',
        'Want to also log what baby ate in the Baby Food Tracker?',
        [
          { text: 'No thanks', style: 'cancel' },
          { text: "Yes, I'll add it", onPress: () => setOpenFoodTrackerAfterFeed(true) },
        ],
      );
    } else {
      setOpenFoodTrackerAfterFeed(false);
    }
  }

  function openModal(type: EntryType) {
    if (type === 'feed') {
      setFeedType('breast'); setFeedMood('calm'); setFeedPosition('cradle');
      setFeedPositionOther(''); setLatchQuality('good'); setSpitUp('none');
      setFeedBurps(0); setFeedNotes(''); setFeedCaregiver('mom');
      setFeedUseManual(false); setFeedManualMin('');
      setFeedAmount(''); setBottleSource('breastmilk');
      setBottleMixBmOz(''); setBottleMixFmOz('');
      leftBreastTimer.reset(); rightBreastTimer.reset(); setActiveBreastSide(null);
      feedTimer.reset();
      setOpenFoodTrackerAfterFeed(false);
    } else if (type === 'diaper') {
      setDiaperType('wet'); setDiaperColor('yellow'); setDiaperConsist('seedy');
      setDiaperAmount('medium'); setDiaperRash('none'); setDiaperNotes('');
    } else {
      setLeftBreast(''); setRightBreast(''); setSuctionLevel(5);
      setHowFeel('comfortable'); setStorageLocation('fridge'); setMilkColor('white');
      setPumpUseManual(false); setPumpManualMin(''); setLetdownAchieved(true); pumpTimer.reset();
      setPumpNotes(''); setPowerPumpMode(false); setPowerPumpProto('classic');
      setPpPhaseIdx(0); setPpSecondsLeft(0); setPpRunning(false); setPpDone(false);
      // Fetch last session for context strip
      if (userId) {
        supabase.from('pumping_sessions').select('left_breast,right_breast,total_ml,logged_at')
          .eq('user_id', userId).order('logged_at', { ascending: false }).limit(1).maybeSingle()
          .then(({ data }) => setLastPumpSession(data ?? null));
      }
    }
    setActiveModal(type);
  }

  function closeModal() {
    feedTimer.stop();
    leftBreastTimer.stop(); rightBreastTimer.stop();
    pumpTimer.stop();
    setActiveModal(null);
    setEditingId(null);
    setOpenFoodTrackerAfterFeed(false);
  }

  // ── Save handlers ─────────────────────────────────────────────────────────

  async function handleSaveFeed() {
    setSaving(true);
    try {
      // Per-side breast timing
      const leftSeconds  = leftBreastTimer.elapsed > 0 ? leftBreastTimer.elapsed : null;
      const rightSeconds = rightBreastTimer.elapsed > 0 ? rightBreastTimer.elapsed : null;
      const perSideTotal = (leftBreastTimer.elapsed + rightBreastTimer.elapsed);

      const durationSeconds = feedType === 'breast' && perSideTotal > 0
        ? perSideTotal
        : feedUseManual
          ? (parseFloat(feedManualMin) || 0) * 60
          : feedTimer.elapsed;

      const resolvedPosition = feedPosition === 'other'
        ? (feedPositionOther.trim() || 'other')
        : feedPosition;

      const breastLeft  = (leftBreastTimer.elapsed > 0 || activeBreastSide === 'left');
      const breastRight = (rightBreastTimer.elapsed > 0 || activeBreastSide === 'right');
      const breastSide = feedType === 'breast'
        ? (breastLeft && breastRight ? 'both' : breastLeft ? 'left' : breastRight ? 'right' : null)
        : null;

      // Mixed bottle amounts
      const bmOz = bottleSource === 'mixed' ? (parseFloat(bottleMixBmOz) || 0) : 0;
      const fmOz = bottleSource === 'mixed' ? (parseFloat(bottleMixFmOz) || 0) : 0;
      const singleOz = bottleSource !== 'mixed' ? (parseFloat(feedAmount) || 0) : 0;

      const fields: Record<string, any> = {
        feed_type:            feedType,
        mood:                 feedMood,
        latch_quality:        feedType === 'breast' ? latchQuality : null,
        position:             feedType === 'breast' ? resolvedPosition : null,
        breast_side:          breastSide,
        left_breast_seconds:  feedType === 'breast' ? leftSeconds : null,
        right_breast_seconds: feedType === 'breast' ? rightSeconds : null,
        caregiver:            feedType !== 'breast' ? feedCaregiver : null,
        spit_up:              spitUp,
        burps:                feedBurps,
        duration_seconds:     durationSeconds > 0 ? durationSeconds : null,
        notes:                feedNotes.trim() || null,
        bottle_source:        feedType === 'bottle' ? bottleSource : null,
        bottle_amount_oz:     feedType === 'bottle' && bottleSource !== 'mixed' && singleOz > 0 ? singleOz : null,
        breastmilk_oz:        feedType === 'bottle' && bottleSource === 'mixed' && bmOz > 0 ? bmOz : null,
        formula_oz:           feedType === 'bottle' && bottleSource === 'mixed' && fmOz > 0 ? fmOz : null,
      };

      if (editingId) {
        await safeUpdate('feeds', editingId, fields);
      } else {
        const baby_id = babyId ?? await getFirstBabyId();
        if (!baby_id) throw new Error('No baby profile found — add one in the Profile tab first.');
        await safeInsert('feeds', { ...fields, baby_id, logged_at: new Date().toISOString() });
        try {
          if (feedType === 'bottle' && userId) {
            if (bottleSource === 'mixed') {
              if (bmOz > 0) await deductFromSupply(userId, 'breastmilk', bmOz * 29.5735);
              if (fmOz > 0) await deductFromSupply(userId, 'formula', fmOz);
            } else {
              if (singleOz > 0) {
                if (bottleSource === 'breastmilk') {
                  await deductFromSupply(userId, 'breastmilk', singleOz * 29.5735);
                } else {
                  await deductFromSupply(userId, 'formula', singleOz);
                }
              }
            }
            setSuppliesRefreshKey(k => k + 1);
          }
        } catch (supplyErr: any) {
          console.warn('[Feed] Supply update failed (feed still saved):', supplyErr?.message);
        }
        // Schedule feed reminder
        try {
          const bid = baby_id;
          if (bid && userId) {
            const reminderCfg = await getFeedReminderSettings(userId, bid);
            await scheduleNextFeedReminder(bid, babyName ?? 'Baby', new Date(), reminderCfg);
          }
        } catch {}
      }

      Sentry.addBreadcrumb({
        category: 'tracking',
        message: editingId ? 'Updated feeding' : 'Logged feeding',
        level: 'info',
        data: { feed_type: feedType },
      });

      feedTimer.stop();
      leftBreastTimer.stop(); rightBreastTimer.stop(); setActiveBreastSide(null);
      setActiveModal(null);
      setEditingId(null);
      if (openFoodTrackerAfterFeed) {
        setOpenFoodTrackerAfterFeed(false);
        setFoodTrackerOpenKey(k => k + 1);
      }
      setInsightsRefreshKey(k => k + 1);
      await fetchTimeline();
      if (!editingId && userId) {
        try {
          const r = await recordLog(userId);
          setCelebration({ streak: r.newStreak, milestone: r.milestone, usedFreeze: r.usedFreeze });
        } catch {}
      }
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
        await safeUpdate('diaper_logs', editingId, fields);
      } else {
        const baby_id = babyId ?? await getFirstBabyId();
        if (!baby_id) throw new Error('No baby profile found — add one in the Profile tab first.');
        await safeInsert('diaper_logs', { ...fields, baby_id, logged_at: new Date().toISOString() });
        try {
          if (userId) {
            await deductFromSupply(userId, 'diapers', 1);
            setSuppliesRefreshKey(k => k + 1);
          }
        } catch (supplyErr: any) {
          console.warn('[Diaper] Supply update failed (diaper still saved):', supplyErr?.message);
        }
      }

      Sentry.addBreadcrumb({
        category: 'tracking',
        message: editingId ? 'Updated diaper change' : 'Logged diaper change',
        level: 'info',
        data: { diaper_type: diaperType },
      });

      setActiveModal(null);
      setEditingId(null);
      setInsightsRefreshKey(k => k + 1);
      await fetchTimeline();
      if (!editingId && userId) {
        try {
          const r = await recordLog(userId);
          setCelebration({ streak: r.newStreak, milestone: r.milestone, usedFreeze: r.usedFreeze });
        } catch {}
        // Schedule diaper change reminder if enabled
        try {
          const bid = babyId ?? await getFirstBabyId();
          if (bid) {
            const reminderCfg = await getDiaperReminderSettings(userId, bid);
            await scheduleNextDiaperReminder(bid, babyName ?? 'Baby', new Date(), reminderCfg);
          }
        } catch {}
      }
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

      const toMl = (v: string) => pumpUnit === 'oz' ? (parseFloat(v) || 0) * 29.5735 : (parseFloat(v) || 0);
      const left     = toMl(leftBreast);
      const right    = toMl(rightBreast);
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
        ...(pumpNotes.trim() ? { notes: pumpNotes.trim() } : {}),
      };

      if (editingId) {
        await safeUpdate('pumping_sessions', editingId, fields);
      } else {
        await safeInsert('pumping_sessions', {
          ...fields, user_id: user.id, logged_at: new Date().toISOString(),
        });
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

      Sentry.addBreadcrumb({
        category: 'tracking',
        message: editingId ? 'Updated pumping session' : 'Logged pumping session',
        level: 'info',
      });

      pumpTimer.stop();
      setActiveModal(null);
      setEditingId(null);
      setInsightsRefreshKey(k => k + 1);
      await fetchTimeline();
      setPumpChartKey(k => k + 1);
      if (!editingId && userId) {
        try {
          const r = await recordLog(userId);
          setCelebration({ streak: r.newStreak, milestone: r.milestone, usedFreeze: r.usedFreeze });
        } catch {}
      }
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

      await safeDelete(entry.table as any, entry.rawId);
      setEntries(prev => prev.filter(e => e.id !== entry.id));
      setInsightsRefreshKey(k => k + 1);

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
      setFeedAmount(data.bottle_amount_oz != null ? String(data.bottle_amount_oz) : '');
      setBottleMixBmOz(data.breastmilk_oz != null ? String(data.breastmilk_oz) : '');
      setBottleMixFmOz(data.formula_oz != null ? String(data.formula_oz) : '');
      setBottleSource(data.bottle_source || 'breastmilk');
      leftBreastTimer.reset(); rightBreastTimer.reset(); setActiveBreastSide(null);
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

        {/* ── Baby / You toggle */}
        <View style={styles.viewToggleRow}>
          <TouchableOpacity
            style={[styles.viewToggleBtn, activeView === 'baby' && styles.viewToggleBtnActive]}
            onPress={() => { setActiveView('baby'); scrollRef.current?.scrollTo({ y: 0, animated: false }); }}
            activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel="Show baby tracking"
          >
            <Text style={[styles.viewToggleText, activeView === 'baby' && styles.viewToggleTextActive]}>
              👶  Baby
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggleBtn, activeView === 'you' && styles.viewToggleBtnActive]}
            onPress={() => { setActiveView('you'); scrollRef.current?.scrollTo({ y: 0, animated: false }); }}
            activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel="Show your tracking"
          >
            <Text style={[styles.viewToggleText, activeView === 'you' && styles.viewToggleTextActive]}>
              🌷  You
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Category filter ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {(() => {
            const palette = [
              { bg: c.cardHoney,    border: c.honey,    text: c.honey    },
              { bg: c.cardBlush,    border: c.blush,    text: c.blush    },
              { bg: c.cardBlue,     border: c.blue,     text: c.blue     },
              { bg: c.cardSage,     border: c.sage,     text: c.sage     },
              { bg: c.cardLavender, border: c.lavender, text: c.lavender },
            ];
            const groups = activeView === 'baby' ? BABY_NAV_GROUPS
              : isExpecting ? [PREGNANCY_NAV_GROUP, ...YOU_NAV_GROUPS] : YOU_NAV_GROUPS;
            const category = activeView === 'baby' ? babyCategory : youCategory;
            const setCategory = activeView === 'baby' ? setBabyCategory : setYouCategory;
            return (
              <>
                <TouchableOpacity
                  onPress={() => setCategory('All')}
                  style={[styles.categoryChip, category === 'All' && { backgroundColor: c.primary, borderColor: c.primary }]}
                  activeOpacity={0.75}
                  accessibilityRole="button" accessibilityLabel="Show all categories"
                >
                  <Text style={[styles.categoryChipText, category === 'All' && styles.categoryChipTextActive]}>All</Text>
                </TouchableOpacity>
                {groups.map((group, gi) => {
                  const col = palette[gi % palette.length];
                  const active = category === group.category;
                  return (
                    <TouchableOpacity
                      key={group.category}
                      onPress={() => setCategory(group.category)}
                      style={[
                        styles.categoryChip,
                        { backgroundColor: active ? col.border : col.bg, borderColor: col.border },
                      ]}
                      activeOpacity={0.75}
                      accessibilityRole="button" accessibilityLabel={`Filter by ${group.category}`}
                    >
                      <Text style={[styles.categoryChipText, { color: active ? '#fff' : col.text }]}>
                        {group.emoji} {group.category}
                      </Text>
                      {group.category === 'Wellness Check-ins' && mentalHealthAlert && (
                        <View style={{
                          position: 'absolute', top: -3, right: -3,
                          width: 10, height: 10, borderRadius: 5,
                          backgroundColor: c.blush, borderWidth: 1.5, borderColor: c.bg,
                        }} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </>
            );
          })()}
        </ScrollView>

        {activeView === 'baby' ? (<>

        {(babyCategory === 'All' || babyCategory === 'Daily Logging') && (<>
        {/* ═══ Group: Daily Logging ═══ */}
        <Text style={styles.groupHeading}>📋 Daily Logging</Text>

        {/* ── Main buttons */}
        <View style={styles.buttonGroup}>
          {mainButtons.map((btn, idx) => (
            <TouchableOpacity key={btn.type}
              style={[styles.button, { backgroundColor: btn.bgColor, borderWidth: 2, borderColor: btn.accent }]}
              activeOpacity={0.8} onPress={() => openModal(btn.type)}
              accessibilityRole="button" accessibilityLabel={btn.label}>
              <Text style={styles.buttonEmoji}>{btn.emoji}</Text>
              <Text style={[styles.buttonLabel, { color: btn.accent }]}>{btn.label}</Text>
              <Text style={[styles.buttonArrow, { color: btn.accent }]}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Feed reminder & last feed summary */}
        <FeedReminderCard
          userId={userId}
          babyId={babyId}
          babyName={babyName}
          onLastFeedLoaded={setLastFeedLog}
          refreshKey={insightsRefreshKey}
        />
        <NursingReminderCard userId={userId} babyId={babyId} babyName={babyName} refreshKey={insightsRefreshKey} />

        {/* ── Diaper reminder & color guide */}
        <DiaperReminderCard userId={userId} babyId={babyId} babyName={babyName} refreshKey={insightsRefreshKey} />

        {/* ── Car check reminder */}
        <CarCheckReminderCard userId={userId} babyId={babyId} babyName={babyName} />

        {/* ── Charts */}
        <View style={{ overflow: 'visible' }}>
          <PaywallGate feature="trend_charts" title="Trend Charts" description="See feeding, diaper, and pumping patterns over time." emoji="📊">
            <FeedChartCard babyId={babyId} />
            <DiaperChartCard babyId={babyId} />
            <PumpingChartCard key={pumpChartKey} userId={userId} />
          </PaywallGate>
        </View>

        {/* ── Timeline */}
        <View style={styles.timelineHeader}>
          <Text style={styles.sectionTitle}>Timeline</Text>
          {refreshing && <ActivityIndicator size="small" color={c.trackFeed} />}
        </View>

        {/* Date navigation */}
        <View style={styles.dateNav}>
          <TouchableOpacity style={styles.dateNavBtn} onPress={goToPrevDay} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel="Previous day">
            <Text style={styles.dateNavArrow}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dateNavCenter} onPress={openCalendar} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel="Open calendar to pick a date">
            <Text style={styles.dateNavLabel}>{dateLabel} <Text style={styles.dateNavCal}>▾</Text></Text>
            {!isToday && (
              <TouchableOpacity onPress={() => setSelectedDate(new Date())} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel="Back to today">
                <Text style={styles.dateNavToday}>Back to today</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.dateNavBtn, isToday && styles.dateNavBtnDisabled]}
            onPress={goToNextDay} activeOpacity={isToday ? 1 : 0.7}
            accessibilityRole="button" accessibilityLabel="Next day">
            <Text style={[styles.dateNavArrow, isToday && styles.dateNavArrowDisabled]}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.timeline}>
          {timelineError ? (
            <LoadErrorBanner message="Couldn't load today's entries." onRetry={fetchTimeline} />
          ) : entries.length === 0 ? (
            <Text style={styles.empty}>No entries for this day</Text>
          ) : (
            entries.map((entry, i) => (
              <TouchableOpacity key={entry.id} activeOpacity={0.75} onPress={() => openDetail(entry)}
                style={[styles.entry, i < entries.length - 1 && styles.entryBorder,
                  { backgroundColor: entry.type === 'feed' ? c.cardLavender : entry.type === 'diaper' ? c.cardSage : c.cardBlush }]}
                accessibilityRole="button" accessibilityLabel={`${entry.label} at ${formatTime(entry.logged_at)}`}>
                <Text style={styles.entryEmoji}>{entry.emoji}</Text>
                <View style={styles.entryBody}>
                  <Text style={styles.entryLabel}>{entry.label}</Text>
                  <Text style={styles.entryDetail}>{entry.detail}</Text>
                </View>
                <Text style={styles.entryTime}>{formatTime(entry.logged_at)}</Text>
                <TouchableOpacity style={styles.deleteBtn}
                  onPress={() => handleDeleteEntry(entry)} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityLabel={`Delete ${entry.label.toLowerCase()} entry`}>
                  <Text style={styles.deleteIcon}>🗑</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
        </View>
        </>)}

        {(babyCategory === 'All' || babyCategory === 'Insights & Supplies') && (<>
        {/* ═══ Group: Insights & Supplies ═══ */}
        <Text style={styles.groupHeading}>✨ Insights & Supplies</Text>

        {/* ── Insights */}
        <View>
          <PaywallGate feature="smart_insights" title="Smart Insights" description="Pattern detection and personalized tips based on your tracking data." emoji="✨">
            <InsightsSection babyId={babyId} userId={userId} refreshKey={insightsRefreshKey} />
          </PaywallGate>
        </View>

        {/* ── Supplies */}
        <View>
          <PaywallGate feature="supplies" title="Smart Supplies" description="Track formula, diapers, and milk stash with low-stock alerts and usage insights." emoji="🧴">
            <SuppliesSection userId={userId} babyId={babyId} refreshKey={suppliesRefreshKey} />
          </PaywallGate>
        </View>
        </>)}

        {(babyCategory === 'All' || babyCategory === 'Feeding') && (<>
        {/* ═══ Group: Feeding ═══ */}
        <Text style={styles.groupHeading}>🍽️ Feeding</Text>

        {/* ── Baby Food Tracker */}
        <View>
          <BabyFoodTracker userId={userId} babyId={babyId} babyName={babyName} babyBirthDate={babyBirthDate} autoOpenKey={foodTrackerOpenKey} />
        </View>

        {/* ── Baby Food Chart (reference guide) */}
        <View>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: c.cardHoney, borderWidth: 2, borderColor: c.honey }]}
            activeOpacity={0.8}
            onPress={() => setShowFoodChart(true)}
            accessibilityRole="button" accessibilityLabel="Open baby food guide"
          >
            <Text style={styles.buttonEmoji}>🍽️</Text>
            <Text style={[styles.buttonLabel, { color: c.honey }]}>Baby Food Guide</Text>
            <Text style={[styles.buttonArrow, { color: c.honey }]}>›</Text>
          </TouchableOpacity>
        </View>
        </>)}

        {(babyCategory === 'All' || babyCategory === 'Sleep & Development') && (<>
        {/* ═══ Group: Sleep & Development ═══ */}
        <Text style={styles.groupHeading}>🌙 Sleep & Development</Text>

        {/* ── Sleep Tracker */}
        <View>
          <PaywallGate feature="sleep_tracker" isTracker title="Sleep Tracker" description="Log and review your baby's naps and night sleep." emoji="🌙">
            <SleepTracker babyId={babyId} babyBirthDate={babyBirthDate} userId={userId} babyName={babyName} />
          </PaywallGate>
        </View>

        {/* ── Development Tracker */}
        <View>
          <MilestoneTracker userId={userId} babyBirthDate={babyBirthDate} />
        </View>

        {/* ── Activities & Play Tracker */}
        <View>
          <ActivityTracker userId={userId} babyId={babyId} babyName={babyName} babyBirthDate={babyBirthDate} />
        </View>

        {/* ── Baby Journal */}
        <View>
          <PaywallGate feature="baby_journal" isTracker title="Baby Journal" description="Write memories and notes for your baby to look back on someday." emoji="📓">
            <BabyJournal userId={userId} babyId={babyId} babyName={babyName} />
          </PaywallGate>
        </View>
        </>)}

        {(babyCategory === 'All' || babyCategory === 'Health') && (<>
        {/* ═══ Group: Health ═══ */}
        <Text style={styles.groupHeading}>🏥 Health</Text>

        {/* ── Vaccines & Appointments */}
        <View>
          <PaywallGate feature="vaccines" isTracker title="Vaccines & Appointments" description="Track your baby's vaccine schedule and upcoming appointments." emoji="💉">
            <VaccineTracker userId={userId} />
          </PaywallGate>
        </View>

        {/* ── Baby Medications */}
        <View>
          <MedTracker
            type="baby"
            userId={userId}
            babyId={babyId}
            babyName={babyName}
            babyWeightLbs={babyWeightLbs}
            userName={userName}
          />
        </View>

        {/* ── Growth Tracker */}
        <View>
          <PaywallGate feature="growth_tracker" isTracker title="Growth Tracker" description="Track weight and height over time with WHO growth curve percentiles." emoji="📈">
            <GrowthTracker
              userId={userId}
              babyId={babyId}
              babyBirthDate={babyBirthDate}
              babyGender={babyGender}
            />
          </PaywallGate>
        </View>

        {/* ── Allergen Tracker */}
        <View>
          <AllergenTracker userId={userId} babyId={babyId} babyBirthDate={babyBirthDate} />
        </View>

        {/* ── Health Tracker */}
        <View>
          <PaywallGate feature="health_tracker" isTracker title="Health Tracker" description="Log fevers, symptoms, and illness episodes." emoji="🩺">
            <HealthTracker userId={userId} babyId={babyId} />
          </PaywallGate>
        </View>
        </>)}

        </>) : (<>

        {isExpecting && (youCategory === 'All' || youCategory === 'Pregnancy') && (<>
        {/* ═══ Group: Pregnancy ═══ */}
        <Text style={styles.groupHeading}>🤰 Pregnancy</Text>

        {/* ── Kick Counter ── */}
        <View>
          <KickCounterTracker userId={userId} />
        </View>

        {/* ── Contraction Timer ── */}
        <View>
          <ContractionTimerTracker userId={userId} />
        </View>

        {/* ── Symptoms & Weight ── */}
        <View>
          <PaywallGate feature="pregnancy_log" isTracker title="Symptoms & Weight" description="Track weight and symptoms throughout your pregnancy." emoji="📝">
            <PregnancyLogTracker userId={userId} />
          </PaywallGate>
        </View>
        </>)}

        {(youCategory === 'All' || youCategory === 'Daily Care') && (<>
        {/* ═══ Group: Daily Care ═══ */}
        <Text style={styles.groupHeading}>💧 Daily Care</Text>

        {/* ── You: Nutrition & Hydration */}
        <View>
          <PaywallGate feature="nutrition_tracker" isTracker title="Nutrition & Hydration" description="Track your water intake, meals, and vitamins each day." emoji="💧">
            <NutritionTracker userId={userId} />
          </PaywallGate>
        </View>

        {/* ── You: Meds & Supplements */}
        <View>
          <PaywallGate feature="meds_tracker" isTracker title="Meds & Supplements" description="Log medications, vitamins, and supplements with dosage reminders." emoji="💊">
            <MedTracker
              type="parent"
              userId={userId}
              babyId={babyId}
              babyName={babyName}
              userName={userName}
            />
          </PaywallGate>
        </View>
        </>)}

        {(youCategory === 'All' || youCategory === 'Wellness Check-ins') && (<>
        {/* ═══ Group: Wellness Check-ins ═══ */}
        <Text style={styles.groupHeading}>🌈 Wellness Check-ins</Text>

        {/* ── You: Mental Health */}
        <View>
          <PostpartumMentalHealthTracker userId={userId} onStatusChange={setMentalHealthAlert} />
        </View>

        {/* ── You: Mood & Energy */}
        <View>
          <PaywallGate feature="mood_energy_tracker" isTracker title="Mood & Energy" description="Log your daily mood and energy levels to spot patterns over time." emoji="🌈">
            <MoodEnergyTracker userId={userId} onSuggestCheckIn={() => setYouCategory('Wellness Check-ins')} />
          </PaywallGate>
        </View>

        {/* ── You: Sleep */}
        <View>
          <PaywallGate feature="mom_sleep_tracker" isTracker title="Your Sleep" description="Track how much sleep you're getting and how rested you feel." emoji="🌙">
            <MomSleepTracker userId={userId} />
          </PaywallGate>
        </View>
        </>)}

        {(youCategory === 'All' || youCategory === 'Body & Recovery') && (<>
        {/* ═══ Group: Body & Recovery ═══ */}
        <Text style={styles.groupHeading}>🌸 Body & Recovery</Text>

        {/* ── You: Postpartum Recovery */}
        <View>
          <PostpartumRecoveryTracker userId={userId} babyBirthDate={babyBirthDate} />
        </View>

        {/* ── You: Period Return */}
        <View>
          <PaywallGate feature="period_tracker" isTracker title="Period Return" description="Track the return of your menstrual cycle after birth." emoji="🩸">
            <PeriodReturnTracker userId={userId} />
          </PaywallGate>
        </View>

        {/* ── You: Movement */}
        <View>
          <PaywallGate feature="movement_tracker" isTracker title="Movement" description="Log exercise, walks, and physical activity during your recovery." emoji="🏃">
            <MovementTracker userId={userId} />
          </PaywallGate>
        </View>
        </>)}

        {/* ── Patch Premium upsell (bottom of page, non-subscribers only) ── */}
        {!isSubscribed && (
          <View style={styles.premiumCard}>
            <Text style={styles.premiumEmoji}>✨</Text>
            <Text style={styles.premiumTitle}>Patch Premium</Text>
            <Text style={styles.premiumBody}>
              Unlock all trackers, your journal & calendar, unlimited patches, community sharing, and more — for $5.99/mo.
            </Text>
            <TouchableOpacity style={styles.premiumBtn} onPress={openPaywall} activeOpacity={0.85}
              accessibilityRole="button" accessibilityLabel="Learn more and upgrade to Patch Premium">
              <Text style={styles.premiumBtnText}>Learn More & Upgrade</Text>
            </TouchableOpacity>
          </View>
        )}

        </>)}
      </ScrollView>

      {/* ══════════ DETAIL MODAL ══════════ */}
      <Modal visible={detailEntry !== null} animationType="slide" transparent
        onRequestClose={() => setDetailEntry(null)}>
        <View style={det.overlay}>
          <TouchableOpacity style={det.backdrop} activeOpacity={1} onPress={() => setDetailEntry(null)}
            accessibilityRole="button" accessibilityLabel="Close" />
          <View style={det.sheet}>
            <View style={det.handle} />
            <View style={det.header}>
              <Text style={det.title}>
                {detailEntry?.emoji} {detailEntry?.label}
                {'  '}<Text style={det.titleTime}>{detailEntry ? formatTime(detailEntry.logged_at) : ''}</Text>
              </Text>
              <TouchableOpacity onPress={() => setDetailEntry(null)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel="Close">
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
                  onPress={() => { if (detailEntry) openEdit(detailEntry); }}
                  accessibilityRole="button" accessibilityLabel="Edit entry">
                  <Text style={det.editBtnText}>✏️  Edit Entry</Text>
                </TouchableOpacity>
                <TouchableOpacity style={det.deleteBtn} activeOpacity={0.8}
                  onPress={() => { setDetailEntry(null); if (detailEntry) handleDeleteEntry(detailEntry); }}
                  accessibilityRole="button" accessibilityLabel="Delete entry">
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

        {/* Same as last time */}
        {!editingId && lastFeedLog && (
          <TouchableOpacity
            style={[pf.chip, { alignSelf: 'flex-start', marginBottom: 12, backgroundColor: c.cardLavender, borderColor: c.lavender }]}
            onPress={() => {
              setFeedType(lastFeedLog.feed_type ?? 'breast');
              setFeedMood(lastFeedLog.mood ?? 'calm');
              setLatchQuality(lastFeedLog.latch_quality ?? 'good');
              setFeedPosition(lastFeedLog.position ?? 'cradle');
              setSpitUp(lastFeedLog.spit_up ?? 'none');
              setFeedBurps(lastFeedLog.burps ?? 0);
              setFeedCaregiver(lastFeedLog.caregiver ?? 'mom');
              setBottleSource(lastFeedLog.bottle_source ?? 'breastmilk');
              if (lastFeedLog.feed_type === 'bottle' && lastFeedLog.bottle_amount_oz) {
                setFeedAmount(String(lastFeedLog.bottle_amount_oz));
              }
              if (lastFeedLog.bottle_source === 'mixed') {
                setBottleMixBmOz(lastFeedLog.breastmilk_oz ? String(lastFeedLog.breastmilk_oz) : '');
                setBottleMixFmOz(lastFeedLog.formula_oz ? String(lastFeedLog.formula_oz) : '');
              }
            }}
            activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel="Fill in same as last feed"
          >
            <Text style={[pf.chipText, { color: c.lavender, fontWeight: '700' }]}>↩ Same as last time</Text>
          </TouchableOpacity>
        )}

        <PickerField label="Feed type" options={FEED_TYPE}
          value={feedType} onChange={handleFeedTypeChange} accent={c.trackFeed} />

        {feedType === 'breast' && (
          <>
            {/* Per-side breast timers */}
            <Text style={pf.label}>Nursing timer — tap a side to start/stop</Text>
            <View style={styles.breastToggleRow}>
              {/* Left */}
              <TouchableOpacity
                style={[styles.breastToggleBtn, leftBreastTimer.elapsed > 0 && styles.breastToggleActive,
                  activeBreastSide === 'left' && { borderColor: c.trackFeed, backgroundColor: c.cardLavender }]}
                onPress={() => {
                  if (activeBreastSide === 'left') {
                    leftBreastTimer.pause();
                    setActiveBreastSide(null);
                  } else {
                    if (activeBreastSide === 'right') rightBreastTimer.pause();
                    leftBreastTimer.running ? leftBreastTimer.resume() : leftBreastTimer.start();
                    setActiveBreastSide('left');
                  }
                }}
                activeOpacity={0.75}
                accessibilityRole="button" accessibilityLabel="Left breast nursing timer"
              >
                <Text style={styles.breastToggleEmoji}>🤱</Text>
                <Text style={[styles.breastToggleLabel, (leftBreastTimer.elapsed > 0) && styles.breastToggleLabelActive]}>
                  Left
                </Text>
                <Text style={[styles.breastToggleCheck, { color: c.trackFeed, fontSize: 13 }]}>
                  {activeBreastSide === 'left' ? '⏸' : leftBreastTimer.elapsed > 0 ? '⏹' : '▶'}
                  {' '}{Math.floor(leftBreastTimer.elapsed / 60)}:{String(leftBreastTimer.elapsed % 60).padStart(2, '0')}
                </Text>
              </TouchableOpacity>
              {/* Right */}
              <TouchableOpacity
                style={[styles.breastToggleBtn, rightBreastTimer.elapsed > 0 && styles.breastToggleActive,
                  activeBreastSide === 'right' && { borderColor: c.trackFeed, backgroundColor: c.cardLavender }]}
                onPress={() => {
                  if (activeBreastSide === 'right') {
                    rightBreastTimer.pause();
                    setActiveBreastSide(null);
                  } else {
                    if (activeBreastSide === 'left') leftBreastTimer.pause();
                    rightBreastTimer.running ? rightBreastTimer.resume() : rightBreastTimer.start();
                    setActiveBreastSide('right');
                  }
                }}
                activeOpacity={0.75}
                accessibilityRole="button" accessibilityLabel="Right breast nursing timer"
              >
                <Text style={styles.breastToggleEmoji}>🤱</Text>
                <Text style={[styles.breastToggleLabel, (rightBreastTimer.elapsed > 0) && styles.breastToggleLabelActive]}>
                  Right
                </Text>
                <Text style={[styles.breastToggleCheck, { color: c.trackFeed, fontSize: 13 }]}>
                  {activeBreastSide === 'right' ? '⏸' : rightBreastTimer.elapsed > 0 ? '⏹' : '▶'}
                  {' '}{Math.floor(rightBreastTimer.elapsed / 60)}:{String(rightBreastTimer.elapsed % 60).padStart(2, '0')}
                </Text>
              </TouchableOpacity>
            </View>
            {(leftBreastTimer.elapsed > 0 || rightBreastTimer.elapsed > 0) && (
              <Text style={{ fontSize: 12, color: c.textMuted, marginBottom: 12, marginTop: -4 }}>
                Total: {Math.round((leftBreastTimer.elapsed + rightBreastTimer.elapsed) / 60)}m
              </Text>
            )}

            {/* Manual entry fallback */}
            {leftBreastTimer.elapsed === 0 && rightBreastTimer.elapsed === 0 && (
              <TimerWidget timer={feedTimer} accent={c.trackFeed}
                useManual={feedUseManual} onToggleManual={() => setFeedUseManual(v => !v)}
                manualValue={feedManualMin} onManualChange={setFeedManualMin} />
            )}
            <PickerField label="Position" options={FEED_POSITION}
              value={feedPosition} onChange={setFeedPosition} accent={c.trackFeed} />
            {feedPosition === 'other' && (
              <TextInput
                style={[makeNiStyles(c).input, { marginTop: -10, marginBottom: 20 }]}
                placeholder="Describe position…"
                placeholderTextColor={c.textMuted}
                value={feedPositionOther}
                onChangeText={setFeedPositionOther}
                accessibilityLabel="Describe nursing position"
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
                  onPress={() => setBottleSource('breastmilk')} activeOpacity={0.75}
                  accessibilityRole="button" accessibilityLabel="Breastmilk">
                  <Text style={[pf.chipText, bottleSource === 'breastmilk' && pf.chipSel]}>🤱 Breastmilk</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[pf.chip, bottleSource === 'formula' && { backgroundColor: c.trackFeed, borderColor: c.trackFeed }]}
                  onPress={() => setBottleSource('formula')} activeOpacity={0.75}
                  accessibilityRole="button" accessibilityLabel="Formula">
                  <Text style={[pf.chipText, bottleSource === 'formula' && pf.chipSel]}>🍶 Formula</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[pf.chip, bottleSource === 'mixed' && { backgroundColor: c.trackFeed, borderColor: c.trackFeed }]}
                  onPress={() => setBottleSource('mixed')} activeOpacity={0.75}
                  accessibilityRole="button" accessibilityLabel="Mixed breastmilk and formula">
                  <Text style={[pf.chipText, bottleSource === 'mixed' && pf.chipSel]}>🤱🍶 Mixed</Text>
                </TouchableOpacity>
              </View>
            </View>

            {bottleSource !== 'mixed' ? (
              <View style={{ marginBottom: 20 }}>
                <Text style={pf.label}>Amount (oz)</Text>
                <View style={styles.breastRow}>
                  <View style={[styles.breastField, { flex: 1 }]}>
                    <TextInput style={styles.breastInput} placeholder="0.0" placeholderTextColor={c.textMuted}
                      value={feedAmount} onChangeText={t => setFeedAmount(sanitizeDecimal(t))} keyboardType="decimal-pad"
                      accessibilityLabel="Bottle amount in ounces" />
                    <Text style={styles.breastUnit}>oz</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={{ marginBottom: 20 }}>
                <Text style={pf.label}>How much of each? (oz)</Text>
                <View style={styles.breastRow}>
                  <View style={styles.breastField}>
                    <Text style={styles.breastSideLabel}>Breastmilk 🤱</Text>
                    <TextInput style={styles.breastInput} placeholder="0.0" placeholderTextColor={c.textMuted}
                      value={bottleMixBmOz} onChangeText={t => setBottleMixBmOz(sanitizeDecimal(t))} keyboardType="decimal-pad"
                      accessibilityLabel="Breastmilk amount in ounces" />
                    <Text style={styles.breastUnit}>oz</Text>
                  </View>
                  <View style={styles.breastDivider} />
                  <View style={styles.breastField}>
                    <Text style={styles.breastSideLabel}>Formula 🍶</Text>
                    <TextInput style={styles.breastInput} placeholder="0.0" placeholderTextColor={c.textMuted}
                      value={bottleMixFmOz} onChangeText={t => setBottleMixFmOz(sanitizeDecimal(t))} keyboardType="decimal-pad"
                      accessibilityLabel="Formula amount in ounces" />
                    <Text style={styles.breastUnit}>oz</Text>
                  </View>
                </View>
                {((parseFloat(bottleMixBmOz) || 0) + (parseFloat(bottleMixFmOz) || 0)) > 0 && (
                  <Text style={styles.totalPreview}>
                    Total: {((parseFloat(bottleMixBmOz) || 0) + (parseFloat(bottleMixFmOz) || 0)).toFixed(1)} oz
                  </Text>
                )}
              </View>
            )}
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

        {/* Last session context strip */}
        {lastPumpSession && !editingId && (() => {
          const ago = (() => { const ms = Date.now() - new Date(lastPumpSession.logged_at).getTime(); const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); return h > 0 ? `${h}h ${m}m ago` : `${m}m ago`; })();
          const totalDisplay = pumpUnit === 'oz' ? `${(lastPumpSession.total_ml / 29.5735).toFixed(1)} oz` : `${lastPumpSession.total_ml.toFixed(0)} ml`;
          return (
            <View style={styles.pumpLastSession}>
              <Text style={styles.pumpLastSessionText}>Last: {totalDisplay} · {ago}</Text>
              <TouchableOpacity onPress={() => {
                if (pumpUnit === 'oz') {
                  setLeftBreast((lastPumpSession.left_breast / 29.5735).toFixed(1));
                  setRightBreast((lastPumpSession.right_breast / 29.5735).toFixed(1));
                } else {
                  setLeftBreast(String(lastPumpSession.left_breast || ''));
                  setRightBreast(String(lastPumpSession.right_breast || ''));
                }
              }}
                accessibilityRole="button" accessibilityLabel="Fill in same as last pumping session">
                <Text style={styles.pumpSameAsLast}>↩ Same as last</Text>
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* Mode selector: Normal / Power Pump */}
        <View style={styles.pumpModeRow}>
          <TouchableOpacity
            style={[styles.pumpModeChip, !powerPumpMode && { backgroundColor: c.trackPump, borderColor: c.trackPump }]}
            onPress={() => { setPowerPumpMode(false); setPpRunning(false); setPpDone(false); pumpTimer.reset(); }}
            activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel="Normal pumping mode">
            <Text style={[styles.pumpModeChipText, !powerPumpMode && { color: '#fff' }]}>⏱ Normal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pumpModeChip, powerPumpMode && { backgroundColor: c.trackPump, borderColor: c.trackPump }]}
            onPress={() => { setPowerPumpMode(true); pumpTimer.reset(); }}
            activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel="Power pump mode">
            <Text style={[styles.pumpModeChipText, powerPumpMode && { color: '#fff' }]}>⚡ Power Pump</Text>
          </TouchableOpacity>
        </View>

        {!powerPumpMode ? (
          <TimerWidget timer={pumpTimer} accent={c.trackPump}
            useManual={pumpUseManual} onToggleManual={() => setPumpUseManual(v => !v)}
            manualValue={pumpManualMin} onManualChange={setPumpManualMin} />
        ) : (
          <View style={styles.powerPumpWrap}>
            {/* Protocol chips */}
            <Text style={pf.label}>Protocol</Text>
            <View style={[pf.row, { marginBottom: 12 }]}>
              {Object.entries(POWER_PUMP_PROTOCOLS).map(([key, proto]) => (
                <TouchableOpacity
                  key={key}
                  style={[pf.chip, powerPumpProto === key && { backgroundColor: c.trackPump, borderColor: c.trackPump }]}
                  onPress={() => {
                    setPowerPumpProto(key);
                    setPpPhaseIdx(0);
                    setPpSecondsLeft(POWER_PUMP_PROTOCOLS[key].phases[0].minutes * 60);
                    setPpRunning(false);
                    setPpDone(false);
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="button" accessibilityLabel={`${proto.label} power pump protocol`}>
                  <Text style={[pf.chipText, powerPumpProto === key && pf.chipSel]}>{proto.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.ppDesc}>{POWER_PUMP_PROTOCOLS[powerPumpProto].desc}</Text>

            {/* Phase progress dots */}
            <View style={styles.ppDots}>
              {POWER_PUMP_PROTOCOLS[powerPumpProto].phases.map((ph, i) => (
                <View key={i} style={[
                  styles.ppDot,
                  ph.action === 'pump' ? styles.ppDotPump : styles.ppDotRest,
                  i < ppPhaseIdx && styles.ppDotDone,
                  i === ppPhaseIdx && ppRunning && styles.ppDotActive,
                ]} />
              ))}
            </View>

            {/* Current phase display */}
            {ppDone ? (
              <Text style={styles.ppComplete}>🎉 Complete! Great session!</Text>
            ) : (
              <View style={styles.ppPhaseDisplay}>
                <Text style={styles.ppPhaseLabel}>
                  {POWER_PUMP_PROTOCOLS[powerPumpProto].phases[ppPhaseIdx]?.action === 'pump' ? '🟢 Pump' : '⏸️ Rest'}
                </Text>
                <Text style={styles.ppCountdown}>
                  {ppSecondsLeft > 0
                    ? `${String(Math.floor(ppSecondsLeft / 60)).padStart(2, '0')}:${String(ppSecondsLeft % 60).padStart(2, '0')}`
                    : `${String(POWER_PUMP_PROTOCOLS[powerPumpProto].phases[0].minutes).padStart(2, '0')}:00`}
                </Text>
              </View>
            )}

            {/* Controls */}
            <View style={styles.ppControls}>
              {!ppDone && (
                <TouchableOpacity
                  style={[styles.ppBtn, { backgroundColor: c.trackPump }]}
                  onPress={() => {
                    if (!ppRunning && ppSecondsLeft === 0) {
                      setPpSecondsLeft(POWER_PUMP_PROTOCOLS[powerPumpProto].phases[0].minutes * 60);
                      setPpPhaseIdx(0);
                    }
                    setPpRunning(v => !v);
                    if (!ppRunning) pumpTimer.start?.();
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="button" accessibilityLabel={ppRunning ? 'Pause power pump' : ppSecondsLeft > 0 ? 'Resume power pump' : 'Start power pump'}>
                  <Text style={styles.ppBtnText}>{ppRunning ? '⏸ Pause' : ppSecondsLeft > 0 ? '▶ Resume' : '▶ Start'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.ppBtn, styles.ppBtnOutline]}
                onPress={() => { setPpRunning(false); setPpDone(false); setPpPhaseIdx(0); setPpSecondsLeft(0); pumpTimer.reset(); }}
                activeOpacity={0.8}
                accessibilityRole="button" accessibilityLabel="Reset power pump">
                <Text style={[styles.ppBtnText, { color: c.textSecondary }]}>↺ Reset</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Amount with unit toggle */}
        <View style={styles.pumpAmountHeader}>
          <Text style={pf.label}>Amount expressed</Text>
          <View style={styles.pumpUnitToggle}>
            <TouchableOpacity
              style={[styles.pumpUnitChip, pumpUnit === 'ml' && { backgroundColor: c.trackPump, borderColor: c.trackPump }]}
              onPress={() => { setPumpUnit('ml'); setLeftBreast(''); setRightBreast(''); }}
              accessibilityRole="button" accessibilityLabel="Milliliters">
              <Text style={[styles.pumpUnitText, pumpUnit === 'ml' && { color: '#fff' }]}>ml</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pumpUnitChip, pumpUnit === 'oz' && { backgroundColor: c.trackPump, borderColor: c.trackPump }]}
              onPress={() => { setPumpUnit('oz'); setLeftBreast(''); setRightBreast(''); }}
              accessibilityRole="button" accessibilityLabel="Ounces">
              <Text style={[styles.pumpUnitText, pumpUnit === 'oz' && { color: '#fff' }]}>oz</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.breastRow}>
          <View style={styles.breastField}>
            <Text style={styles.breastSideLabel}>Left</Text>
            <TextInput style={styles.breastInput} placeholder="0" placeholderTextColor={c.textMuted}
              value={leftBreast} onChangeText={t => setLeftBreast(sanitizeDecimal(t))} keyboardType="decimal-pad"
              accessibilityLabel={`Left breast amount in ${pumpUnit}`} />
            <Text style={styles.breastUnit}>{pumpUnit}</Text>
          </View>
          <View style={styles.breastDivider} />
          <View style={styles.breastField}>
            <Text style={styles.breastSideLabel}>Right</Text>
            <TextInput style={styles.breastInput} placeholder="0" placeholderTextColor={c.textMuted}
              value={rightBreast} onChangeText={t => setRightBreast(sanitizeDecimal(t))} keyboardType="decimal-pad"
              accessibilityLabel={`Right breast amount in ${pumpUnit}`} />
            <Text style={styles.breastUnit}>{pumpUnit}</Text>
          </View>
        </View>
        {pumpTotal > 0 && (
          <Text style={styles.totalPreview}>Total: {pumpTotal.toFixed(1)} {pumpUnit}</Text>
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
              onPress={() => setLetdownAchieved(true)} activeOpacity={0.75}
              accessibilityRole="button" accessibilityLabel="Letdown achieved: yes">
              <Text style={[pf.chipText, letdownAchieved && pf.chipSel]}>Yes ✓</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[pf.chip, !letdownAchieved && { backgroundColor: c.trackPump, borderColor: c.trackPump }]}
              onPress={() => setLetdownAchieved(false)} activeOpacity={0.75}
              accessibilityRole="button" accessibilityLabel="Letdown achieved: no">
              <Text style={[pf.chipText, !letdownAchieved && pf.chipSel]}>No</Text>
            </TouchableOpacity>
          </View>
        </View>

        <PickerField label="Storage" options={PUMP_STORAGE}
          value={storageLocation} onChange={setStorageLocation} accent={c.trackPump} />

        <NotesInput value={pumpNotes} onChange={setPumpNotes} />
      </ModalSheet>

      {/* ══════════ BABY FOOD CHART MODAL ══════════ */}
      <Modal visible={showFoodChart} animationType="slide" onRequestClose={() => setShowFoodChart(false)}>
        <BabyFoodChart onBack={() => setShowFoodChart(false)} babyId={babyId} />
      </Modal>

      {/* ══════════ CALENDAR PICKER ══════════ */}
      <Modal visible={showCalendar} animationType="fade" transparent
        onRequestClose={() => setShowCalendar(false)}>
        <View style={cal.overlay}>
          <TouchableOpacity style={cal.backdrop} activeOpacity={1} onPress={() => setShowCalendar(false)}
            accessibilityRole="button" accessibilityLabel="Close calendar" />
          <View style={cal.container}>

            {/* Month/Year header */}
            <View style={cal.header}>
              {calMode === 'month' ? (
                <>
                  <TouchableOpacity onPress={calPrevMonth} style={cal.headerBtn}
                    accessibilityRole="button" accessibilityLabel="Previous month">
                    <Text style={cal.headerArrow}>‹</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setCalMode('year')} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityLabel="Select year">
                    <Text style={cal.headerTitle}>
                      {calViewDate.toLocaleDateString('en-US', { month: 'long' })}{' '}
                      <Text style={cal.headerYear}>{calYear}</Text>
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={calNextMonth} style={cal.headerBtn}
                    accessibilityRole="button" accessibilityLabel="Next month">
                    <Text style={cal.headerArrow}>›</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={cal.headerBtn} />
                  <Text style={cal.headerTitle}>Select Year</Text>
                  <TouchableOpacity onPress={() => setCalMode('month')} style={cal.headerBtn}
                    accessibilityRole="button" accessibilityLabel="Close year picker">
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
                      onPress={() => selectCalYear(y)} activeOpacity={0.75}
                      accessibilityRole="button" accessibilityLabel={`Year ${y}`}>
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
                        onPress={() => selectCalDay(day)} activeOpacity={0.75}
                        accessibilityRole="button" accessibilityLabel={`${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}${isSel ? ', selected' : ''}`}>
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

      <PostLogCelebration
        visible={celebration !== null}
        streak={celebration?.streak ?? 0}
        milestone={celebration?.milestone ?? null}
        usedFreeze={celebration?.usedFreeze ?? false}
        onDismiss={() => setCelebration(null)}
      />
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
    sheet:      { backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, maxHeight: '92%', overflow: 'hidden' },
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
    scrollContent: { padding: 24, paddingBottom: 560 },
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
    breastToggleCheck:     { fontSize: 13, fontWeight: '700', color: c.lavender, marginTop: 6 },

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

    // Quick nav arrows
    categoryRow:          { gap: 8, paddingBottom: 20, paddingRight: 4 },
    categoryChip:         { borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
    categoryChipText:     { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    categoryChipTextActive: { color: '#fff' },
    groupHeading:        { fontSize: 20, fontWeight: '800', color: c.textPrimary, marginTop: 10, marginBottom: 14 },

    // Pump enhancements
    pumpLastSession:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                           backgroundColor: c.inputBg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
    pumpLastSessionText: { fontSize: 12, color: c.textMuted, fontWeight: '600' },
    pumpSameAsLast:      { fontSize: 12, fontWeight: '700', color: c.trackPump },
    pumpModeRow:         { flexDirection: 'row', gap: 8, marginBottom: 16 },
    pumpModeChip:        { flex: 1, borderWidth: 1.5, borderColor: c.inputBorder, borderRadius: 20,
                           paddingVertical: 9, alignItems: 'center' },
    pumpModeChipText:    { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    pumpAmountHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    pumpUnitToggle:      { flexDirection: 'row', gap: 4 },
    pumpUnitChip:        { borderWidth: 1.5, borderColor: c.inputBorder, borderRadius: 12,
                           paddingHorizontal: 12, paddingVertical: 5 },
    pumpUnitText:        { fontSize: 12, fontWeight: '700', color: c.textSecondary },

    // Power pump
    powerPumpWrap:   { marginBottom: 20 },
    ppDesc:          { fontSize: 12, color: c.textMuted, marginBottom: 12, fontStyle: 'italic' },
    ppDots:          { flexDirection: 'row', gap: 6, marginBottom: 16 },
    ppDot:           { flex: 1, height: 6, borderRadius: 3 },
    ppDotPump:       { backgroundColor: c.inputBorder },
    ppDotRest:       { backgroundColor: c.inputBorder, opacity: 0.5 },
    ppDotDone:       { backgroundColor: c.sage },
    ppDotActive:     { backgroundColor: c.trackPump },
    ppPhaseDisplay:  { alignItems: 'center', marginBottom: 14 },
    ppPhaseLabel:    { fontSize: 14, fontWeight: '700', color: c.textPrimary, marginBottom: 4 },
    ppCountdown:     { fontSize: 48, fontWeight: '800', color: c.trackPump, letterSpacing: 2 },
    ppComplete:      { fontSize: 16, fontWeight: '800', color: c.sage, textAlign: 'center', marginBottom: 14 },
    ppControls:      { flexDirection: 'row', gap: 10 },
    ppBtn:           { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
    ppBtnOutline:    { borderWidth: 1.5, borderColor: c.inputBorder, backgroundColor: 'transparent' },
    ppBtnText:       { fontSize: 14, fontWeight: '700', color: '#fff' },

    viewToggleRow:         { flexDirection: 'row', backgroundColor: c.inputBg, borderRadius: 14, padding: 4, marginBottom: 24, gap: 4 },
    viewToggleBtn:         { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 11 },
    viewToggleBtnActive:   { backgroundColor: c.card, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
    viewToggleText:        { fontSize: 15, fontWeight: '600', color: c.textMuted },
    viewToggleTextActive:  { color: c.textPrimary, fontWeight: '700' },

    dateNav:             { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    dateNavBtn:          { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    dateNavBtnDisabled:  { opacity: 0.25 },
    dateNavArrow:        { fontSize: 28, fontWeight: '300', color: c.textSecondary, lineHeight: 32 },
    dateNavArrowDisabled:{ color: c.textMuted },
    dateNavCenter:       { flex: 1, alignItems: 'center', gap: 2 },
    dateNavLabel:        { fontSize: 16, fontWeight: '700', color: c.textPrimary },
    dateNavCal:          { fontSize: 12, color: c.trackFeed },
    dateNavToday:        { fontSize: 12, color: c.trackFeed, fontWeight: '600' },

    premiumCard: {
      margin: 16,
      marginTop: 8,
      marginBottom: 32,
      backgroundColor: c.cardLavender,
      borderRadius: 20,
      padding: 24,
      alignItems: 'center',
      gap: 10,
    },
    premiumEmoji:   { fontSize: 32 },
    premiumTitle:   { fontSize: 18, fontWeight: '800', color: c.textPrimary },
    premiumBody:    { fontSize: 14, color: c.textSecondary, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
    premiumBtn: {
      marginTop: 4,
      backgroundColor: c.lavender,
      borderRadius: 14,
      paddingVertical: 13,
      paddingHorizontal: 28,
    },
    premiumBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
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
