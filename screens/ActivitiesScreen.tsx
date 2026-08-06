import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { supabase } from '../lib/supabase';
import { useBaby } from '../lib/babyContext';
import { getBabyAge } from '../lib/feedUtils';
import { useColors, Colors } from '../lib/theme';
import {
  Activity, ActivityRating, matchesTimeFilter, matchesMessFilter, noMaterialsNeeded,
} from '../lib/activitiesUtil';
import ActivityFilters, { ActivityFilterState } from '../components/ActivityFilters';
import ActivitiesFeed from '../components/ActivitiesFeed';
import ActivityDetailScreen from './ActivityDetailScreen';

interface Props {
  onBack: () => void;
}

const DEFAULT_FILTERS: ActivityFilterState = { time: 'any', area: 'all', mess: 'any', noMaterialsOnly: false };

export default function ActivitiesScreen({ onBack }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const { activeBaby } = useBaby();

  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [triedMap, setTriedMap] = useState<Map<string, ActivityRating | null>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ActivityFilterState>(DEFAULT_FILTERS);
  const [ageFilterOn, setAgeFilterOn] = useState(true);
  const [selected, setSelected] = useState<Activity | null>(null);

  useEffect(() => { fetchActivities(); }, [activeBaby?.id]);

  async function fetchActivities() {
    setLoading(true);
    const [{ data, error }, triesRes] = await Promise.all([
      supabase.from('activities').select('*').order('age_min_months', { ascending: true }),
      activeBaby?.id
        ? supabase.from('activity_tries').select('activity_id, rating, tried_at').eq('baby_id', activeBaby.id).order('tried_at', { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
    ]);
    if (!error && data) setAllActivities(data as unknown as Activity[]);
    // Rows are ordered most-recent-first, so the first occurrence of an
    // activity_id we see when building the map is its latest rating.
    const map = new Map<string, ActivityRating | null>();
    (triesRes.data ?? []).forEach((t: any) => {
      if (!map.has(t.activity_id)) map.set(t.activity_id, t.rating ?? null);
    });
    setTriedMap(map);
    setLoading(false);
  }

  const ageMonths = activeBaby?.birth_date ? getBabyAge(activeBaby.birth_date).monthsOld : null;

  const filtered = useMemo(() => {
    return allActivities.filter(a => {
      if (ageFilterOn && ageMonths != null) {
        if (ageMonths < a.age_min_months || ageMonths > a.age_max_months) return false;
      }
      if (filters.area !== 'all' && !a.developmental_areas.includes(filters.area)) return false;
      if (!matchesTimeFilter(a.duration_minutes, filters.time)) return false;
      if (!matchesMessFilter(a.mess_level, filters.mess)) return false;
      if (filters.noMaterialsOnly && !noMaterialsNeeded(a.materials_needed)) return false;
      return true;
    });
  }, [allActivities, filters, ageFilterOn, ageMonths]);

  if (selected) {
    return <ActivityDetailScreen activity={selected} onBack={() => setSelected(null)} />;
  }

  const headerTitle = activeBaby?.name && ageMonths != null
    ? `Activities for ${activeBaby.name} (${ageMonths} mo)`
    : 'Age-Appropriate Activities';

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button" accessibilityLabel="Back to Resources">
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Resources</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.pageTitle}>{headerTitle}</Text>
        <Text style={s.pageSubtitle}>Developmental play ideas matched to your baby's age and what you have on hand</Text>

        {activeBaby?.birth_date && (
          <TouchableOpacity
            style={[s.ageToggle, ageFilterOn && { backgroundColor: c.primary, borderColor: c.primary }]}
            onPress={() => setAgeFilterOn(v => !v)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={ageFilterOn ? `Showing activities for ${activeBaby.name}'s age only` : 'Showing activities for all ages'}
            accessibilityState={{ selected: ageFilterOn }}
          >
            <Text style={[s.ageToggleText, ageFilterOn && s.ageToggleTextActive]}>
              {ageFilterOn ? `✓ Matched to ${activeBaby.name}'s age` : 'Show all ages'}
            </Text>
          </TouchableOpacity>
        )}

        <ActivityFilters filters={filters} onChange={setFilters} />

        <ActivitiesFeed activities={filtered} loading={loading} onSelect={setSelected} triedMap={triedMap} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backArrow: { fontSize: 20, color: c.textSecondary, fontWeight: '700' },
    backLabel: { fontSize: 15, color: c.textSecondary, fontWeight: '700' },
    scroll: { padding: 20, paddingBottom: 40 },
    pageTitle: { fontSize: 22, fontWeight: '800', color: c.textPrimary, marginBottom: 6 },
    pageSubtitle: { fontSize: 13, color: c.textMuted, fontWeight: '500', marginBottom: 14, lineHeight: 18 },
    ageToggle: {
      alignSelf: 'flex-start', borderWidth: 1.5, borderColor: c.separator, borderRadius: 18,
      paddingHorizontal: 14, paddingVertical: 8, backgroundColor: c.card, marginBottom: 16,
    },
    ageToggleText: { fontSize: 12.5, fontWeight: '700', color: c.textSecondary },
    ageToggleTextActive: { color: c.primaryText },
  });
}
