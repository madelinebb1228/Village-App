import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Platform, Text, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useColors } from '../lib/theme';
import { supabase } from '../lib/supabase';

const SW = Dimensions.get('window').width;

type Metric = 'calories' | 'protein' | 'water';

interface Row {
  log_date: string;
  meal_type: string;
  calories: number | null;
  protein_g: number | null;
  water_oz: number | null;
}

interface Props {
  userId: string | null;
  expanded: boolean;
}

const METRICS: { key: Metric; label: string; unit: string; suffix: string }[] = [
  { key: 'calories', label: '🍽️ Calories', unit: 'kcal', suffix: '' },
  { key: 'protein',  label: '🥩 Protein',  unit: 'g',    suffix: 'g' },
  { key: 'water',    label: '💧 Water',    unit: 'oz',   suffix: 'oz' },
];

function dateToISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function NutritionTrendsChart({ userId, expanded }: Props) {
  const c = useColors();
  const chartWidth = Platform.OS === 'web' ? Math.min(SW - 96, 480) : SW - 96;

  const [metric, setMetric] = useState<Metric>('calories');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!expanded || loaded || !userId) return;
    setLoading(true);
    const start = new Date(); start.setDate(start.getDate() - 6);
    supabase
      .from('nutrition_logs')
      .select('log_date, meal_type, calories, protein_g, water_oz')
      .eq('user_id', userId)
      .gte('log_date', dateToISO(start))
      .then(({ data }) => {
        setRows((data ?? []) as Row[]);
        setLoaded(true);
        setLoading(false);
      });
  }, [expanded, loaded, userId]);

  const chartDays = useMemo(() => {
    const days: { key: string; label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      days.push({ key: dateToISO(d), label: d.toLocaleDateString('en-US', { weekday: 'short' }), value: 0 });
    }
    const map = new Map(days.map(d => [d.key, d]));
    rows.forEach(r => {
      const entry = map.get(r.log_date);
      if (!entry) return;
      if (metric === 'water') {
        if (r.meal_type === 'water') entry.value += r.water_oz ?? 0;
      } else if (r.meal_type !== 'water') {
        entry.value += (metric === 'calories' ? r.calories : r.protein_g) ?? 0;
      }
    });
    return days;
  }, [rows, metric]);

  const weeklyTotal = chartDays.reduce((s, d) => s + d.value, 0);
  const daysWithData = chartDays.filter(d => d.value > 0).length;
  const weeklyAvg = daysWithData ? Math.round(weeklyTotal / daysWithData) : 0;

  const activeMetric = METRICS.find(m => m.key === metric)!;
  const metricColor = metric === 'calories' ? c.primary : metric === 'protein' ? c.sage : c.blue;

  if (!expanded) return null;

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        {METRICS.map(m => (
          <TouchableOpacity key={m.key} onPress={() => setMetric(m.key)}
            accessibilityRole="button" accessibilityLabel={m.label}
            style={{
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
              backgroundColor: metric === m.key ? c.primary : c.card,
              borderWidth: 1.5, borderColor: metric === m.key ? c.primary : c.separator,
            }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: metric === m.key ? '#fff' : c.textMuted }}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={c.primary} style={{ paddingVertical: 24 }} />
      ) : weeklyTotal > 0 ? (
        <View>
          <Text style={{ fontSize: 11, fontWeight: '600', color: c.textMuted, marginBottom: 6 }}>
            LAST 7 DAYS{weeklyAvg ? ` · avg ${weeklyAvg}${activeMetric.suffix ? activeMetric.suffix : ` ${activeMetric.unit}`}/day` : ''}
          </Text>
          <LineChart
            data={{
              labels: chartDays.map(d => d.label),
              datasets: [{ data: chartDays.map(d => Math.round(d.value)), color: () => metricColor, strokeWidth: 2.5 }],
            }}
            width={chartWidth}
            height={160}
            fromZero
            segments={4}
            yAxisSuffix={activeMetric.suffix}
            chartConfig={{
              backgroundColor: c.card,
              backgroundGradientFrom: c.card,
              backgroundGradientTo: c.card,
              decimalPlaces: 0,
              color: () => metricColor,
              labelColor: () => c.textMuted,
              propsForDots: { r: '3.5', strokeWidth: '2' },
            }}
            bezier
            style={{ borderRadius: 14 }}
            withInnerLines={false}
            withOuterLines={false}
          />
        </View>
      ) : (
        <View style={{ alignItems: 'center', backgroundColor: c.bg, borderRadius: 14, padding: 16 }}>
          <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center' }}>
            Log a few days to see your weekly {activeMetric.label.replace(/^\S+\s/, '').toLowerCase()} trend.
          </Text>
        </View>
      )}
    </View>
  );
}
