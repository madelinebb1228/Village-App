import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import { safeInsert, safeUpdate, safeDelete } from '../lib/syncService';
import { useColors } from '../lib/theme';
import { autoFormatDate, parseDisplayDate, toDisplayDate, todayDisplay } from '../lib/dateUtils';
import {
  GenderKey, WHO_WEIGHT, WHO_HEIGHT, WHO_HEAD,
  calcPercentile, ageInMonthsAt, lbsToKg, inToCm, kgToLbs, cmToIn, percentileContext,
} from '../lib/growthPercentiles';

const SW = Dimensions.get('window').width;

// ── Maths ──────────────────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`;
  const s = ['th','st','nd','rd'];
  return `${n}${s[n % 10] ?? 'th'}`;
}

function fmtWeight(lbs: number | null): string {
  if (!lbs) return '—';
  const w = Math.floor(lbs);
  const oz = Math.round((lbs - w) * 16);
  return oz === 0 ? `${w} lbs` : `${w} lbs ${oz} oz`;
}

function fmtWeightDelta(lbs: number): string {
  const w = Math.floor(lbs);
  const oz = Math.round((lbs - w) * 16);
  if (w === 0) return `${oz} oz`;
  return oz === 0 ? `${w} lb${w !== 1 ? 's' : ''}` : `${w} lb${w !== 1 ? 's' : ''} ${oz} oz`;
}

function fmtHeight(inches: number | null): string {
  if (!inches) return '—';
  return `${inches.toFixed(1)}"`;
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface GrowthLog {
  id: string;
  date: string;
  weight_lbs: number | null;
  height_in: number | null;
  head_cm: number | null;
  diaper_size: string | null;
  clothing_size: string | null;
  notes: string | null;
}

type Tab = 'weight' | 'height' | 'head' | 'size';

const DIAPER_SIZES   = ['NB','1','2','3','4','5','6'];
const CLOTHING_SIZES = ['NB','0–3m','3–6m','6–9m','9–12m','12–18m','18–24m','2T','3T','4T'];

const TABS: { key: Tab; label: string }[] = [
  { key: 'weight', label: '⚖️ Weight' },
  { key: 'height', label: '📏 Height' },
  { key: 'head',   label: '🧠 Head'   },
  { key: 'size',   label: '👕 Sizes'  },
];

// ── Component ──────────────────────────────────────────────────────────────────

export default function GrowthTracker({ userId, babyId, babyBirthDate, babyGender }: {
  userId: string | null;
  babyId: string | null;
  babyBirthDate: string | null;
  babyGender: string | null;
}) {
  const c = useColors();
  const gender: GenderKey = babyGender?.toLowerCase() === 'girl' ? 'girl' : 'boy';

  const [collapsed,  setCollapsed]  = useState(false);
  const [logs,       setLogs]       = useState<GrowthLog[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [loaded,     setLoaded]     = useState(false);
  const [tab,        setTab]        = useState<Tab>('weight');
  const [showModal,  setShowModal]  = useState(false);
  const [editingLog, setEditingLog] = useState<GrowthLog | null>(null);

  // Form state
  const [date,         setDate]         = useState(todayDisplay());
  const [weightLbs,    setWeightLbs]    = useState('');
  const [weightOz,     setWeightOz]     = useState('');
  const [heightIn,     setHeightIn]     = useState('');
  const [headCm,       setHeadCm]       = useState('');
  const [diaperSize,   setDiaperSize]   = useState('');
  const [clothingSize, setClothingSize] = useState('');
  const [notes,        setNotes]        = useState('');
  const [saving,       setSaving]       = useState(false);
  const [deleting,     setDeleting]     = useState(false);

  useEffect(() => { if (!collapsed && !loaded) loadLogs(); }, [collapsed, babyId]);

  async function loadLogs() {
    if (!babyId) return;
    setLoading(true);
    const { data } = await supabase
      .from('growth_logs').select('*')
      .eq('baby_id', babyId).order('date', { ascending: true });
    setLogs(data ?? []);
    setLoaded(true);
    setLoading(false);
  }

  function openNewLog() {
    setEditingLog(null);
    setDate(todayDisplay());
    setWeightLbs(''); setWeightOz(''); setHeightIn('');
    setHeadCm(''); setDiaperSize(''); setClothingSize(''); setNotes('');
    setShowModal(true);
  }

  function openEditLog(log: GrowthLog) {
    setEditingLog(log);
    setDate(toDisplayDate(log.date));
    if (log.weight_lbs) {
      const w = Math.floor(log.weight_lbs);
      const oz = Math.round((log.weight_lbs - w) * 16);
      setWeightLbs(String(w));
      setWeightOz(oz > 0 ? String(oz) : '');
    } else { setWeightLbs(''); setWeightOz(''); }
    setHeightIn(log.height_in ? String(log.height_in) : '');
    setHeadCm(log.head_cm ? String(log.head_cm) : '');
    setDiaperSize(log.diaper_size ?? '');
    setClothingSize(log.clothing_size ?? '');
    setNotes(log.notes ?? '');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingLog(null);
    setDate(todayDisplay());
    setWeightLbs(''); setWeightOz(''); setHeightIn('');
    setHeadCm(''); setDiaperSize(''); setClothingSize(''); setNotes('');
  }

  async function saveLog() {
    if (!babyId || !userId) return;
    const parsed = parseDisplayDate(date);
    if (!parsed) {
      Alert.alert('Invalid date', 'Please use MM/DD/YYYY format.');
      return;
    }
    setSaving(true);
    const totalLbs = (parseFloat(weightLbs) || 0) + (parseFloat(weightOz) || 0) / 16;
    const totalIn  = parseFloat(heightIn) || 0;
    const fields = {
      date:          parsed,
      weight_lbs:    totalLbs > 0 ? totalLbs : null,
      height_in:     totalIn  > 0 ? totalIn  : null,
      head_cm:       headCm  ? parseFloat(headCm)  : null,
      diaper_size:   diaperSize   || null,
      clothing_size: clothingSize || null,
      notes:         notes.trim() || null,
    };
    if (editingLog) {
      await safeUpdate('growth_logs', editingLog.id, fields);
    } else {
      await safeInsert('growth_logs', { ...fields, baby_id: babyId, user_id: userId });
    }
    setLoaded(false);
    await loadLogs();
    setSaving(false);
    closeModal();
  }

  async function deleteLog() {
    if (!editingLog) return;
    const ok = Platform.OS === 'web'
      ? window.confirm('Delete this measurement?')
      : await new Promise<boolean>(res => Alert.alert('Delete?', 'Remove this measurement?', [
          { text: 'Cancel', onPress: () => res(false), style: 'cancel' },
          { text: 'Delete', onPress: () => res(true),  style: 'destructive' },
        ]));
    if (!ok) return;
    setDeleting(true);
    await safeDelete('growth_logs', editingLog.id);
    setLoaded(false);
    await loadLogs();
    setDeleting(false);
    closeModal();
  }

  // ── Derived: latest, delta, gain rate ────────────────────────────────────────

  const latest = logs.length > 0 ? logs[logs.length - 1] : null;

  const filteredForTab = useMemo(() => logs.filter(l => {
    if (tab === 'weight') return l.weight_lbs != null;
    if (tab === 'height') return l.height_in  != null;
    if (tab === 'head')   return l.head_cm    != null;
    return false;
  }), [logs, tab]);

  const delta = useMemo((): { text: string; positive: boolean } | null => {
    if (filteredForTab.length < 2) return null;
    const cur  = filteredForTab[filteredForTab.length - 1];
    const prev = filteredForTab[filteredForTab.length - 2];
    const days = daysBetween(prev.date, cur.date);
    const since = days >= 14 ? `${Math.round(days / 7)}w ago` : `${days}d ago`;

    if (tab === 'weight' && cur.weight_lbs && prev.weight_lbs) {
      const diff = cur.weight_lbs - prev.weight_lbs;
      const sign = diff >= 0 ? '↑' : '↓';
      return { text: `${sign} ${fmtWeightDelta(Math.abs(diff))} since ${since}`, positive: diff >= 0 };
    }
    if (tab === 'height' && cur.height_in && prev.height_in) {
      const diff = cur.height_in - prev.height_in;
      const sign = diff >= 0 ? '↑' : '↓';
      return { text: `${sign} ${Math.abs(diff).toFixed(1)}" since ${since}`, positive: diff >= 0 };
    }
    if (tab === 'head' && cur.head_cm && prev.head_cm) {
      const diff = cur.head_cm - prev.head_cm;
      const sign = diff >= 0 ? '↑' : '↓';
      return { text: `${sign} ${Math.abs(diff).toFixed(1)} cm since ${since}`, positive: diff >= 0 };
    }
    return null;
  }, [filteredForTab, tab]);

  const gainRate = useMemo((): string | null => {
    if (tab !== 'weight') return null;
    if (filteredForTab.length < 2) return null;
    const first = filteredForTab[0];
    const last  = filteredForTab[filteredForTab.length - 1];
    const weeks = daysBetween(first.date, last.date) / 7;
    if (weeks <= 0) return null;
    const gainOz = (last.weight_lbs! - first.weight_lbs!) * 16;
    if (gainOz <= 0) return null;
    return `${(gainOz / weeks).toFixed(1)} oz/wk avg`;
  }, [filteredForTab, tab]);

  // ── Percentile ───────────────────────────────────────────────────────────────

  function getPercentileVal(): number | null {
    if (!latest || !babyBirthDate) return null;
    const ageM = ageInMonthsAt(babyBirthDate, latest.date);
    if (ageM > 24) return null;
    if (tab === 'weight' && latest.weight_lbs)
      return calcPercentile(lbsToKg(latest.weight_lbs), ageM, WHO_WEIGHT[gender]);
    if (tab === 'height' && latest.height_in)
      return calcPercentile(inToCm(latest.height_in), ageM, WHO_HEIGHT[gender]);
    if (tab === 'head' && latest.head_cm)
      return calcPercentile(latest.head_cm, ageM, WHO_HEAD[gender]);
    return null;
  }

  // ── Chart data with 5th/50th/95th percentile bands ───────────────────────────

  function getChartData() {
    if (filteredForTab.length < 2) return null;

    const labels = filteredForTab.map(l =>
      babyBirthDate ? `${ageInMonthsAt(babyBirthDate, l.date)}m` : l.date.slice(5));

    const values = filteredForTab.map(l => {
      if (tab === 'weight') return parseFloat((l.weight_lbs ?? 0).toFixed(2));
      if (tab === 'height') return parseFloat((l.height_in  ?? 0).toFixed(1));
      return parseFloat((l.head_cm ?? 0).toFixed(1));
    });

    if (!babyBirthDate) return { labels, values, ref5: null, ref50: null, ref95: null };

    const whoData = tab === 'weight' ? WHO_WEIGHT[gender] : tab === 'height' ? WHO_HEIGHT[gender] : WHO_HEAD[gender];

    const toDisplay = (raw: number) => {
      if (tab === 'weight') return parseFloat(kgToLbs(raw).toFixed(2));
      if (tab === 'height') return parseFloat(cmToIn(raw).toFixed(1));
      return parseFloat(raw.toFixed(1));
    };

    const ref5  = filteredForTab.map(l => {
      const ageM = Math.min(ageInMonthsAt(babyBirthDate!, l.date), 24);
      return toDisplay(whoData.m[ageM] - 1.645 * whoData.sd[ageM]);
    });
    const ref50 = filteredForTab.map(l => {
      const ageM = Math.min(ageInMonthsAt(babyBirthDate!, l.date), 24);
      return toDisplay(whoData.m[ageM]);
    });
    const ref95 = filteredForTab.map(l => {
      const ageM = Math.min(ageInMonthsAt(babyBirthDate!, l.date), 24);
      return toDisplay(whoData.m[ageM] + 1.645 * whoData.sd[ageM]);
    });

    return { labels, values, ref5, ref50, ref95 };
  }

  const chartData   = tab !== 'size' ? getChartData() : null;
  const pctVal      = getPercentileVal();
  const pctContext  = pctVal !== null ? percentileContext(pctVal) : null;
  const chartWidth  = Platform.OS === 'web' ? Math.min(SW - 32, 500) : SW - 32;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <View style={{ marginBottom: 16 }}>

      {/* Collapse header */}
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.cardSage, borderRadius: 14, borderWidth: 2, borderColor: c.sage, paddingHorizontal: 16, paddingVertical: 13, marginBottom: collapsed ? 0 : 14 }}
        onPress={() => setCollapsed(v => !v)} activeOpacity={0.75}
        accessibilityRole="button" accessibilityLabel={collapsed ? 'Expand Growth Tracker' : 'Collapse Growth Tracker'}
      >
        <Text style={{ fontSize: 16, fontWeight: '800', color: c.textPrimary }}>📈 Growth Tracker</Text>
        <Text style={{ fontSize: 20, color: c.sage, fontWeight: '700' }}>{collapsed ? '›' : '⌄'}</Text>
      </TouchableOpacity>

      {!collapsed && (
        <>
          {/* Tabs */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
            {TABS.map(t => (
              <TouchableOpacity key={t.key} onPress={() => setTab(t.key)}
                accessibilityRole="button" accessibilityLabel={t.label}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 20, alignItems: 'center', backgroundColor: tab === t.key ? c.primary : c.card, borderWidth: 1.5, borderColor: tab === t.key ? c.primary : c.separator }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: tab === t.key ? '#fff' : c.textSecondary }}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading && <ActivityIndicator color={c.primary} style={{ marginVertical: 20 }} />}

          {/* Latest + percentile badge */}
          {!loading && latest && tab !== 'size' && (
            <View style={{ backgroundColor: c.card, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1.5, borderColor: c.separator }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: c.textMuted, fontWeight: '600', marginBottom: 4 }}>
                    Latest · {formatLogDate(latest.date)}
                  </Text>
                  {tab === 'weight' && <Text style={{ fontSize: 24, fontWeight: '800', color: c.textPrimary }}>{fmtWeight(latest.weight_lbs)}</Text>}
                  {tab === 'height' && <Text style={{ fontSize: 24, fontWeight: '800', color: c.textPrimary }}>{fmtHeight(latest.height_in)}</Text>}
                  {tab === 'head'   && <Text style={{ fontSize: 24, fontWeight: '800', color: c.textPrimary }}>{latest.head_cm ? `${latest.head_cm} cm` : '—'}</Text>}

                  {/* Delta since last entry */}
                  {delta && (
                    <Text style={{ fontSize: 13, fontWeight: '600', color: delta.positive ? '#16a34a' : '#dc2626', marginTop: 6 }}>
                      {delta.text}
                    </Text>
                  )}

                  {/* Weight gain rate */}
                  {gainRate && (
                    <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>
                      📈 {gainRate}
                    </Text>
                  )}
                </View>

                {/* Percentile circle */}
                {pctVal !== null && (
                  <View style={{ alignItems: 'center' }}>
                    <View style={{ backgroundColor: c.primary, borderRadius: 50, width: 72, height: 72, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>{ordinal(pctVal)}</Text>
                      <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>percentile</Text>
                      <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>WHO</Text>
                    </View>
                    {pctContext && (
                      <Text style={{ fontSize: 10, color: pctContext.color, fontWeight: '700', marginTop: 4, textAlign: 'center', maxWidth: 80 }}>
                        {pctContext.label}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Sizes list */}
          {tab === 'size' && !loading && (
            <>
              {logs.filter(l => l.diaper_size || l.clothing_size).length === 0 ? (
                <Text style={{ color: c.textMuted, textAlign: 'center', marginVertical: 20, fontSize: 13 }}>
                  No sizes logged yet.
                </Text>
              ) : (
                [...logs].reverse().filter(l => l.diaper_size || l.clothing_size).map(l => (
                  <TouchableOpacity key={l.id} onPress={() => openEditLog(l)} activeOpacity={0.8}
                    style={{ backgroundColor: c.card, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: c.separator }}>
                    <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: '600', minWidth: 84 }}>{formatLogDate(l.date)}</Text>
                    <View style={{ flex: 1, gap: 2 }}>
                      {l.diaper_size   && <Text style={{ fontSize: 13, color: c.textPrimary }}>🍼 Diaper: Size {l.diaper_size}</Text>}
                      {l.clothing_size && <Text style={{ fontSize: 13, color: c.textPrimary }}>👕 Clothes: {l.clothing_size}</Text>}
                    </View>
                    <Text style={{ fontSize: 12, color: c.textMuted }}>✎</Text>
                  </TouchableOpacity>
                ))
              )}
            </>
          )}

          {/* Chart with 5th/50th/95th bands */}
          {tab !== 'size' && !loading && (
            chartData ? (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 11, color: c.textMuted, fontWeight: '600', marginBottom: 6 }}>
                  {'── Baby  ·  ·  WHO 5th/50th/95th'}
                </Text>
                <LineChart
                  data={{
                    labels: chartData.labels,
                    datasets: [
                      { data: chartData.values, color: () => c.primary, strokeWidth: 2.5 },
                      ...(chartData.ref5  ? [{ data: chartData.ref5,  color: () => 'rgba(150,150,150,0.25)', strokeWidth: 1, withDots: false }] : []),
                      ...(chartData.ref50 ? [{ data: chartData.ref50, color: () => 'rgba(150,150,150,0.45)', strokeWidth: 1.5, withDots: false }] : []),
                      ...(chartData.ref95 ? [{ data: chartData.ref95, color: () => 'rgba(150,150,150,0.25)', strokeWidth: 1, withDots: false }] : []),
                    ],
                  }}
                  width={chartWidth}
                  height={180}
                  chartConfig={{
                    backgroundColor: c.card,
                    backgroundGradientFrom: c.card,
                    backgroundGradientTo: c.card,
                    decimalPlaces: 1,
                    color: (opacity = 1) => `rgba(100,100,100,${opacity})`,
                    labelColor: () => c.textMuted,
                    propsForDots: { r: '4', strokeWidth: '2', stroke: c.primary },
                  }}
                  bezier
                  style={{ borderRadius: 14 }}
                  withInnerLines={false}
                  withOuterLines={false}
                />
              </View>
            ) : (
              logs.length > 0 && (
                <View style={{ backgroundColor: c.card, borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 16, borderWidth: 1.5, borderColor: c.separator }}>
                  <Text style={{ fontSize: 22, marginBottom: 6 }}>📉</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary, marginBottom: 4 }}>One more entry to see the chart</Text>
                  <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'center' }}>Log a second measurement and your growth chart will appear.</Text>
                </View>
              )
            )
          )}

          {/* Recent log list — tappable to edit */}
          {!loading && tab !== 'size' && logs.length > 0 && (
            <View style={{ marginBottom: 16, backgroundColor: c.card, borderRadius: 14, borderWidth: 1.5, borderColor: c.separator }}>
              {[...logs].reverse().slice(0, 6).map((l, i, arr) => {
                const ageM = babyBirthDate ? ageInMonthsAt(babyBirthDate, l.date) : null;
                const whoData = tab === 'weight' ? WHO_WEIGHT[gender] : tab === 'height' ? WHO_HEIGHT[gender] : WHO_HEAD[gender];
                let val: number | null = null;
                if (tab === 'weight' && l.weight_lbs) val = lbsToKg(l.weight_lbs);
                if (tab === 'height' && l.height_in)  val = inToCm(l.height_in);
                if (tab === 'head'   && l.head_cm)    val = l.head_cm;
                const pct = val !== null && ageM !== null && ageM <= 24
                  ? calcPercentile(val, ageM, whoData) : null;
                return (
                  <TouchableOpacity key={l.id} onPress={() => openEditLog(l)} activeOpacity={0.75}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: c.separator }}>
                    <Text style={{ flex: 1, fontSize: 12, color: c.textMuted, fontWeight: '600' }}>{formatLogDate(l.date)}</Text>
                    {tab === 'weight' && <Text style={{ fontSize: 14, color: c.textPrimary, fontWeight: '700' }}>{fmtWeight(l.weight_lbs)}</Text>}
                    {tab === 'height' && <Text style={{ fontSize: 14, color: c.textPrimary, fontWeight: '700' }}>{fmtHeight(l.height_in)}</Text>}
                    {tab === 'head'   && <Text style={{ fontSize: 14, color: c.textPrimary, fontWeight: '700' }}>{l.head_cm ? `${l.head_cm} cm` : '—'}</Text>}
                    {pct !== null && <Text style={{ fontSize: 11, color: c.textMuted, marginLeft: 12, fontWeight: '600' }}>{ordinal(pct)}</Text>}
                    <Text style={{ fontSize: 12, color: c.textMuted, marginLeft: 10 }}>✎</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Add button */}
          <TouchableOpacity onPress={openNewLog}
            style={{ backgroundColor: c.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }} activeOpacity={0.85}
            accessibilityRole="button" accessibilityLabel="Log measurement">
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>+ Log Measurement</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ── Log / Edit modal ── */}
      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
            <ScrollView
              style={{ backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' }}
              contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary }}>
                  {editingLog ? '✎ Edit Measurement' : '📈 Log Measurement'}
                </Text>
                {editingLog && (
                  <TouchableOpacity onPress={deleteLog} disabled={deleting} activeOpacity={0.8}
                    accessibilityRole="button" accessibilityLabel="Delete measurement"
                    style={{ backgroundColor: '#fee2e2', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
                    {deleting
                      ? <ActivityIndicator size="small" color="#dc2626" />
                      : <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 13 }}>🗑 Delete</Text>}
                  </TouchableOpacity>
                )}
              </View>

              <Field label="Date" c={c}>
                <TextInput
                  value={date} onChangeText={v => setDate(autoFormatDate(v, date))}
                  placeholder="MM/DD/YYYY" placeholderTextColor={c.textMuted}
                  keyboardType="numeric" maxLength={10}
                  style={inputStyle(c)}
                />
                {date.length > 0 && !parseDisplayDate(date) && (
                  <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>Use MM/DD/YYYY</Text>
                )}
              </Field>

              <Field label="Weight" c={c}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput value={weightLbs} onChangeText={setWeightLbs} placeholder="lbs"
                    keyboardType="decimal-pad" placeholderTextColor={c.textMuted}
                    style={[inputStyle(c), { flex: 1 }]} />
                  <TextInput value={weightOz} onChangeText={setWeightOz} placeholder="oz"
                    keyboardType="decimal-pad" placeholderTextColor={c.textMuted}
                    style={[inputStyle(c), { flex: 1 }]} />
                </View>
              </Field>

              <Field label="Length / Height (inches)" c={c}>
                <TextInput value={heightIn} onChangeText={setHeightIn} placeholder="e.g. 21.5"
                  keyboardType="decimal-pad" placeholderTextColor={c.textMuted}
                  style={inputStyle(c)} />
              </Field>

              <Field label="Head Circumference (cm)" c={c}>
                <TextInput value={headCm} onChangeText={setHeadCm} placeholder="cm"
                  keyboardType="decimal-pad" placeholderTextColor={c.textMuted}
                  style={inputStyle(c)} />
              </Field>

              <Field label="Diaper Size" c={c}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {DIAPER_SIZES.map(sz => (
                    <TouchableOpacity key={sz} onPress={() => setDiaperSize(p => p === sz ? '' : sz)}
                      accessibilityRole="button" accessibilityLabel={`Diaper size ${sz}`}
                      style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: diaperSize === sz ? c.primary : c.card, borderWidth: 1.5, borderColor: diaperSize === sz ? c.primary : c.separator }}>
                      <Text style={{ fontWeight: '700', color: diaperSize === sz ? '#fff' : c.textSecondary }}>{sz}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Field>

              <Field label="Clothing Size" c={c}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {CLOTHING_SIZES.map(sz => (
                    <TouchableOpacity key={sz} onPress={() => setClothingSize(p => p === sz ? '' : sz)}
                      accessibilityRole="button" accessibilityLabel={`Clothing size ${sz}`}
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: clothingSize === sz ? c.primary : c.card, borderWidth: 1.5, borderColor: clothingSize === sz ? c.primary : c.separator }}>
                      <Text style={{ fontWeight: '700', fontSize: 13, color: clothingSize === sz ? '#fff' : c.textSecondary }}>{sz}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Field>

              <Field label="Notes" c={c}>
                <TextInput value={notes} onChangeText={setNotes}
                  placeholder="Doctor's notes, context..."
                  placeholderTextColor={c.textMuted} multiline numberOfLines={3}
                  style={[inputStyle(c), { minHeight: 80, textAlignVertical: 'top' }]} />
              </Field>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <TouchableOpacity onPress={closeModal}
                  accessibilityRole="button" accessibilityLabel="Cancel"
                  style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator, padding: 14, alignItems: 'center' }}>
                  <Text style={{ fontWeight: '700', color: c.textSecondary }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveLog} disabled={saving}
                  accessibilityRole="button" accessibilityLabel="Save"
                  style={{ flex: 2, borderRadius: 12, backgroundColor: c.primary, padding: 14, alignItems: 'center', opacity: saving ? 0.6 : 1 }}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ fontWeight: '700', color: '#fff' }}>{editingLog ? 'Save Changes' : 'Save'}</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatLogDate(iso: string): string {
  const dateOnly = iso.split('T')[0];
  return new Date(dateOnly + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Field({ label, children, c }: { label: string; children: React.ReactNode; c: ReturnType<typeof useColors> }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  );
}

function inputStyle(c: ReturnType<typeof useColors>) {
  return {
    backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5,
    borderColor: c.separator, padding: 12, fontSize: 14, color: c.textPrimary,
  } as const;
}
