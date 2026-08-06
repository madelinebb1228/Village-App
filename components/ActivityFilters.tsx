import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors, Colors } from '../lib/theme';
import { DEV_AREAS, DevArea, areaEmoji, areaLabel, TimeFilter, MessFilter } from '../lib/activitiesUtil';

export interface ActivityFilterState {
  time: TimeFilter;
  area: DevArea | 'all';
  mess: MessFilter;
  noMaterialsOnly: boolean;
}

interface Props {
  filters: ActivityFilterState;
  onChange: (next: ActivityFilterState) => void;
}

const TIME_OPTIONS: { key: TimeFilter; label: string }[] = [
  { key: 'any', label: 'Any time' },
  { key: 'short', label: '< 10 min' },
  { key: 'medium', label: '10–20 min' },
  { key: 'long', label: '20+ min' },
];

const MESS_OPTIONS: { key: MessFilter; label: string }[] = [
  { key: 'any', label: 'Any mess' },
  { key: 'low', label: 'Low mess' },
  { key: 'medium', label: 'Medium mess' },
  { key: 'high', label: 'High mess' },
];

export default function ActivityFilters({ filters, onChange }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  function setField<K extends keyof ActivityFilterState>(key: K, value: ActivityFilterState[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <View style={s.container}>
      <FilterRow label="Developmental focus" s={s}>
        <Chip s={s} c={c} active={filters.area === 'all'} label="All" onPress={() => setField('area', 'all')} />
        {DEV_AREAS.map(area => (
          <Chip
            key={area} s={s} c={c}
            active={filters.area === area}
            label={`${areaEmoji(area)} ${areaLabel(area)}`}
            onPress={() => setField('area', area)}
          />
        ))}
      </FilterRow>

      <FilterRow label="Time available" s={s}>
        {TIME_OPTIONS.map(opt => (
          <Chip
            key={opt.key} s={s} c={c}
            active={filters.time === opt.key}
            label={opt.label}
            onPress={() => setField('time', opt.key)}
          />
        ))}
      </FilterRow>

      <FilterRow label="Mess level" s={s}>
        {MESS_OPTIONS.map(opt => (
          <Chip
            key={opt.key} s={s} c={c}
            active={filters.mess === opt.key}
            label={opt.label}
            onPress={() => setField('mess', opt.key)}
          />
        ))}
        <Chip
          s={s} c={c}
          active={filters.noMaterialsOnly}
          label="🧺 No materials"
          onPress={() => setField('noMaterialsOnly', !filters.noMaterialsOnly)}
        />
      </FilterRow>
    </View>
  );
}

function FilterRow({ label, s, children }: { label: string; s: any; children: React.ReactNode }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {children}
      </ScrollView>
    </View>
  );
}

function Chip({ active, label, onPress, s, c }: { active: boolean; label: string; onPress: () => void; s: any; c: Colors }) {
  return (
    <TouchableOpacity
      style={[s.chip, active && { backgroundColor: c.primary, borderColor: c.primary }]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { marginBottom: 6 },
    row: { marginBottom: 12 },
    rowLabel: { fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
    chipRow: { gap: 8, paddingRight: 8 },
    chip: {
      borderWidth: 1.5, borderColor: c.separator, borderRadius: 18,
      paddingHorizontal: 13, paddingVertical: 7, backgroundColor: c.card,
    },
    chipText: { fontSize: 12.5, fontWeight: '700', color: c.textSecondary },
    chipTextActive: { color: c.primaryText },
  });
}
