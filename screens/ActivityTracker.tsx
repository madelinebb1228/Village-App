import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, SafeAreaView, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { safeInsert } from '../lib/syncService';
import { useColors, Colors } from '../lib/theme';
import TrackerHeader from '../components/TrackerHeader';
import { useCollapsed } from '../lib/useCollapsed';
import { getBabyAge } from '../lib/feedUtils';
import {
  Activity, ActivityTry, ActivityRating, primaryEmoji, cardPalette, ageRangeLabel,
  inProgressMilestoneLinks, recommendActivities, ratingEmoji, ratingLabel,
} from '../lib/activitiesUtil';

interface Props {
  userId: string | null;
  babyId: string | null;
  babyName: string | null;
  babyBirthDate: string | null;
}

const RATING_OPTIONS: { value: ActivityRating; label: string; emoji: string }[] = [
  { value: 'loved', label: 'Baby loved it', emoji: '😍' },
  { value: 'too_hard', label: 'Too hard', emoji: '😕' },
  { value: 'not_interested', label: 'Not interested', emoji: '😐' },
];

export default function ActivityTracker({ userId, babyId, babyName, babyBirthDate }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [collapsed, toggleCollapsed] = useCollapsed('activity_tracker_collapsed');

  const [activities, setActivities] = useState<Activity[]>([]);
  const [tries, setTries] = useState<ActivityTry[]>([]);
  const [achievedMilestoneKeys, setAchievedMilestoneKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Activity | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchAll(); }, [babyId, userId]);

  async function fetchAll() {
    setLoading(true);
    const [{ data: activityRows }, { data: tryRows }, { data: milestoneRows }] = await Promise.all([
      supabase.from('activities').select('*').order('age_min_months', { ascending: true }),
      babyId
        ? supabase.from('activity_tries').select('id, activity_id, rating, tried_at').eq('baby_id', babyId).order('tried_at', { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      userId
        ? supabase.from('milestone_photos').select('milestone_key').eq('user_id', userId)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    if (activityRows) setActivities(activityRows as unknown as Activity[]);
    if (tryRows) setTries(tryRows as unknown as ActivityTry[]);
    if (milestoneRows) setAchievedMilestoneKeys(new Set(milestoneRows.map((m: any) => m.milestone_key)));
    setLoading(false);
  }

  const ageMonths = babyBirthDate ? getBabyAge(babyBirthDate).monthsOld : null;
  const ageWeeks = babyBirthDate ? getBabyAge(babyBirthDate).ageWeeks : null;

  const inProgressLinks = useMemo(
    () => (ageWeeks != null ? inProgressMilestoneLinks(ageWeeks, achievedMilestoneKeys) : []),
    [ageWeeks, achievedMilestoneKeys],
  );
  const inProgressTags = useMemo(() => inProgressLinks.flatMap(l => l.tags), [inProgressLinks]);

  const recommended = useMemo(() => {
    if (ageMonths == null || activities.length === 0) return [];
    return recommendActivities(activities, ageMonths, tries, inProgressTags, 3);
  }, [activities, ageMonths, tries, inProgressTags]);

  const recentTries = useMemo(() => {
    return tries.slice(0, 6).map(t => ({ tryRow: t, activity: activities.find(a => a.id === t.activity_id) }))
      .filter((x): x is { tryRow: ActivityTry; activity: Activity } => !!x.activity);
  }, [tries, activities]);

  function whyRecommended(activity: Activity): string | null {
    const link = inProgressLinks.find(l => activity.tags.some(t => l.tags.includes(t)));
    return link ? `🎯 Builds toward ${link.label}` : null;
  }

  async function submitRating(activity: Activity, r: ActivityRating) {
    if (!babyId || !userId) return;
    setSaving(true);
    await safeInsert('activity_tries', {
      baby_id: babyId, activity_id: activity.id, created_by: userId, rating: r,
    });
    setSaving(false);
    setActive(null);
    fetchAll();
  }

  const header = (
    <TrackerHeader
      emoji="🧩" title="Activities & Play"
      subtitle={babyBirthDate ? `Personalized picks for ${babyName ?? 'your baby'}, ${ageMonths} mo` : undefined}
      collapsed={collapsed} onToggle={toggleCollapsed}
      accentBg={c.cardBlush} accentColor={c.blush}
    />
  );

  if (loading) {
    return (
      <View style={s.container}>
        {header}
        {!collapsed && <ActivityIndicator color={c.primary} style={{ marginVertical: 20 }} />}
      </View>
    );
  }

  if (!babyId || !babyBirthDate) {
    return (
      <View style={s.container}>
        {header}
        {!collapsed && (
          <Text style={[s.emptyText, { marginTop: 14 }]}>Add your baby's birthday to get personalized activity picks.</Text>
        )}
      </View>
    );
  }

  return (
    <View style={s.container}>
      {header}
      {!collapsed && (<>

      {recommended.length > 0 ? (
        <View style={{ marginTop: 14, marginBottom: 18 }}>
          <Text style={s.groupLabel}>✨ This week for {babyName ?? 'baby'}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
            {recommended.map(activity => {
              const palette = cardPalette(activity, c);
              const why = whyRecommended(activity);
              return (
                <TouchableOpacity
                  key={activity.id}
                  style={[s.card, { backgroundColor: palette.bg, borderColor: palette.border }]}
                  onPress={() => setActive(activity)}
                  activeOpacity={0.85}
                  accessibilityRole="button" accessibilityLabel={`Try ${activity.title}`}
                >
                  <Text style={s.cardEmoji}>{primaryEmoji(activity)}</Text>
                  <Text style={s.cardTitle} numberOfLines={2}>{activity.title}</Text>
                  <Text style={s.cardMeta}>{ageRangeLabel(activity.age_min_months, activity.age_max_months)} · {activity.duration_minutes} min</Text>
                  {why && <Text style={s.cardWhy} numberOfLines={2}>{why}</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <Text style={[s.emptyText, { marginTop: 14 }]}>No age-matched activities right now — check the Activities & Play resource to browse more.</Text>
      )}

      <View>
        <Text style={s.groupLabel}>📋 Recently tried</Text>
        {recentTries.length === 0 ? (
          <Text style={s.emptyText}>Nothing logged yet. Try an activity above to get started.</Text>
        ) : (
          recentTries.map(({ tryRow, activity }) => (
            <TouchableOpacity
              key={tryRow.id}
              style={s.historyRow}
              onPress={() => setActive(activity)}
              activeOpacity={0.8}
              accessibilityRole="button" accessibilityLabel={`${activity.title}, ${ratingLabel(tryRow.rating)}`}
            >
              <Text style={s.historyEmoji}>{primaryEmoji(activity)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.historyTitle} numberOfLines={1}>{activity.title}</Text>
                <Text style={s.historyDate}>{new Date(tryRow.tried_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</Text>
              </View>
              <Text style={s.historyRating}>{ratingEmoji(tryRow.rating)} {ratingLabel(tryRow.rating)}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      </>)}

      {/* ── Try / rate modal ─────────────────────────────────────────── */}
      <Modal visible={active !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setActive(null)}>
        <SafeAreaView style={s.modalSafe}>
          {active && (
            <ScrollView contentContainerStyle={s.modalBody}>
              <View style={s.modalHeader}>
                <TouchableOpacity onPress={() => setActive(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button" accessibilityLabel="Close">
                  <Text style={s.modalClose}>Close</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.modalEmoji}>{primaryEmoji(active)}</Text>
              <Text style={s.modalTitle}>{active.title}</Text>
              <Text style={s.modalDesc}>{active.description}</Text>
              <Text style={s.modalInstructions}>{active.instructions}</Text>

              <Text style={s.modalPrompt}>How did it go?</Text>
              <View style={s.ratingRow}>
                {RATING_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={s.ratingBtn}
                    onPress={() => submitRating(active, opt.value)}
                    disabled={saving}
                    activeOpacity={0.8}
                    accessibilityRole="button" accessibilityLabel={opt.label}
                  >
                    {saving ? <ActivityIndicator color={c.primary} /> : (
                      <>
                        <Text style={s.ratingEmoji}>{opt.emoji}</Text>
                        <Text style={s.ratingLabel}>{opt.label}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { marginBottom: 16 },
    emptyText: { fontSize: 13, color: c.textMuted, fontWeight: '500', lineHeight: 18 },

    groupLabel: { fontSize: 13, fontWeight: '700', color: c.textPrimary, marginBottom: 10 },
    strip: { paddingRight: 8, gap: 10 },
    card: { width: 150, borderRadius: 16, borderWidth: 2, padding: 12 },
    cardEmoji: { fontSize: 26, marginBottom: 4 },
    cardTitle: { fontSize: 13, fontWeight: '800', color: c.textPrimary, marginBottom: 4 },
    cardMeta: { fontSize: 10.5, color: c.textMuted, fontWeight: '600' },
    cardWhy: { fontSize: 10.5, color: c.textSecondary, fontWeight: '700', marginTop: 6 },

    historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.separator },
    historyEmoji: { fontSize: 20 },
    historyTitle: { fontSize: 13, fontWeight: '700', color: c.textPrimary },
    historyDate: { fontSize: 11, color: c.textMuted, marginTop: 1 },
    historyRating: { fontSize: 11.5, fontWeight: '700', color: c.textSecondary },

    modalSafe: { flex: 1, backgroundColor: c.bg },
    modalHeader: { alignItems: 'flex-end' },
    modalClose: { fontSize: 15, color: c.textMuted, fontWeight: '600' },
    modalBody: { padding: 20, paddingBottom: 40 },
    modalEmoji: { fontSize: 44, textAlign: 'center', marginTop: 4 },
    modalTitle: { fontSize: 20, fontWeight: '800', color: c.textPrimary, textAlign: 'center', marginTop: 8 },
    modalDesc: { fontSize: 13.5, color: c.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 19, fontWeight: '500' },
    modalInstructions: { fontSize: 14, color: c.textSecondary, marginTop: 16, lineHeight: 21, fontWeight: '500' },

    modalPrompt: { fontSize: 14, fontWeight: '800', color: c.textPrimary, marginTop: 24, marginBottom: 12, textAlign: 'center' },
    ratingRow: { flexDirection: 'row', gap: 10 },
    ratingBtn: { flex: 1, backgroundColor: c.card, borderRadius: 16, borderWidth: 1.5, borderColor: c.cardBorder, paddingVertical: 16, alignItems: 'center', gap: 6, minHeight: 76, justifyContent: 'center' },
    ratingEmoji: { fontSize: 26 },
    ratingLabel: { fontSize: 11.5, fontWeight: '700', color: c.textSecondary, textAlign: 'center' },
  });
}
