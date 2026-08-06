import { Colors } from './theme';

export interface Activity {
  id: string;
  title: string;
  description: string;
  age_min_months: number;
  age_max_months: number;
  duration_minutes: number;
  materials_needed: string[];
  developmental_areas: string[];
  instructions: string;
  benefits: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  mess_level: number;
  image_url: string | null;
  video_url: string | null;
  tags: string[];
}

export const DEV_AREAS = ['motor', 'language', 'cognitive', 'social'] as const;
export type DevArea = typeof DEV_AREAS[number];

const AREA_META: Record<string, { emoji: string; label: string }> = {
  motor: { emoji: '💪', label: 'Motor' },
  language: { emoji: '💬', label: 'Language' },
  cognitive: { emoji: '🧠', label: 'Cognitive' },
  social: { emoji: '❤️', label: 'Social' },
};

export function areaEmoji(area: string): string {
  return AREA_META[area]?.emoji ?? '✨';
}

export function areaLabel(area: string): string {
  return AREA_META[area]?.label ?? area;
}

export function primaryEmoji(activity: Pick<Activity, 'developmental_areas'>): string {
  return areaEmoji(activity.developmental_areas?.[0] ?? '');
}

export function cardPalette(activity: Pick<Activity, 'developmental_areas'>, c: Colors) {
  const area = activity.developmental_areas?.[0] ?? '';
  switch (area) {
    case 'motor':     return { bg: c.cardSage,     border: c.sage };
    case 'language':  return { bg: c.cardBlue,     border: c.blue };
    case 'cognitive': return { bg: c.cardLavender, border: c.lavender };
    case 'social':    return { bg: c.cardBlush,    border: c.blush };
    default:          return { bg: c.cardHoney,    border: c.honey };
  }
}

export function difficultyLabel(d: string): string {
  return d.charAt(0).toUpperCase() + d.slice(1);
}

export function ageRangeLabel(minM: number, maxM: number): string {
  return `${minM}–${maxM}mo`;
}

export function noMaterialsNeeded(materials: string[]): boolean {
  if (!materials || materials.length === 0) return true;
  return materials.every(m => m.trim().toLowerCase() === 'none');
}

export type TimeFilter = 'any' | 'short' | 'medium' | 'long';

export function matchesTimeFilter(durationMinutes: number, filter: TimeFilter): boolean {
  if (filter === 'any') return true;
  if (filter === 'short') return durationMinutes < 10;
  if (filter === 'medium') return durationMinutes >= 10 && durationMinutes <= 20;
  return durationMinutes > 20;
}

export type MessFilter = 'any' | 'low' | 'medium' | 'high';

export function matchesMessFilter(messLevel: number, filter: MessFilter): boolean {
  if (filter === 'any') return true;
  if (filter === 'low') return messLevel <= 2;
  if (filter === 'medium') return messLevel === 3;
  return messLevel >= 4;
}

// ─── Tracking (activity_tries) & personalization ───────────────────────────

export type ActivityRating = 'loved' | 'too_hard' | 'not_interested';

export interface ActivityTry {
  id: string;
  activity_id: string;
  rating: ActivityRating | null;
  tried_at: string;
}

// Curated links between MilestoneTracker's motor/cognitive milestones (see
// screens/MilestoneTracker.tsx CATEGORIES) and the activity tags that help
// build toward them. Mirrors that screen's "coming up" window logic
// (ageWeeks >= min - 2 && <= max) so a milestone counts as "in progress"
// the same way in both places, without importing its internal, unexported
// milestone data.
export interface MilestoneActivityLink {
  key: string;
  label: string;
  ageWeeksMin: number;
  ageWeeksMax: number;
  tags: string[];
}

export const MILESTONE_ACTIVITY_LINKS: MilestoneActivityLink[] = [
  { key: 'first_tummy_time', label: 'holding their head up', ageWeeksMin: 4,  ageWeeksMax: 12, tags: ['tummy time'] },
  { key: 'first_roll',       label: 'rolling over',          ageWeeksMin: 14, ageWeeksMax: 22, tags: ['tummy time', 'gross motor'] },
  { key: 'first_sit',        label: 'sitting up',            ageWeeksMin: 24, ageWeeksMax: 32, tags: ['gross motor'] },
  { key: 'first_solids',     label: 'the pincer grasp',      ageWeeksMin: 24, ageWeeksMax: 32, tags: ['pincer grasp', 'fine motor'] },
  { key: 'first_crawl',      label: 'crawling',              ageWeeksMin: 28, ageWeeksMax: 40, tags: ['crawling', 'gross motor'] },
  { key: 'plays_peekaboo',   label: 'object permanence',     ageWeeksMin: 28, ageWeeksMax: 40, tags: ['object permanence', 'cause and effect'] },
  { key: 'first_pull_up',    label: 'pulling to stand',      ageWeeksMin: 36, ageWeeksMax: 48, tags: ['gross motor'] },
  { key: 'first_steps',      label: 'first steps',           ageWeeksMin: 44, ageWeeksMax: 58, tags: ['gross motor'] },
];

export function inProgressMilestoneLinks(ageWeeks: number, achievedKeys: Set<string>): MilestoneActivityLink[] {
  return MILESTONE_ACTIVITY_LINKS.filter(m =>
    !achievedKeys.has(m.key) && ageWeeks >= m.ageWeeksMin - 2 && ageWeeks <= m.ageWeeksMax,
  );
}

// Age-appropriate, not-disliked, boosted toward in-progress milestones and
// developmental areas the baby has "loved" before.
export function recommendActivities(
  activities: Activity[],
  ageMonths: number,
  tries: ActivityTry[],
  inProgressTags: string[],
  count = 3,
): Activity[] {
  const triedIds = new Set(tries.map(t => t.activity_id));
  const excludedIds = new Set(
    tries.filter(t => t.rating === 'too_hard' || t.rating === 'not_interested').map(t => t.activity_id),
  );
  const lovedAreas = new Set(
    tries.filter(t => t.rating === 'loved')
      .map(t => activities.find(a => a.id === t.activity_id))
      .filter((a): a is Activity => !!a)
      .flatMap(a => a.developmental_areas),
  );

  const candidates = activities.filter(a =>
    ageMonths >= a.age_min_months && ageMonths <= a.age_max_months && !excludedIds.has(a.id),
  );

  const scored = candidates.map(activity => {
    let score = 0;
    if (!triedIds.has(activity.id)) score += 2;
    if (activity.tags.some(t => inProgressTags.includes(t))) score += 3;
    if (activity.developmental_areas.some(area => lovedAreas.has(area))) score += 1;
    return { activity, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map(s => s.activity);
}

export function ratingEmoji(rating: ActivityRating | null): string {
  if (rating === 'loved') return '😍';
  if (rating === 'too_hard') return '😕';
  if (rating === 'not_interested') return '😐';
  return '✓';
}

export function ratingLabel(rating: ActivityRating | null): string {
  if (rating === 'loved') return 'Loved it';
  if (rating === 'too_hard') return 'Too hard';
  if (rating === 'not_interested') return 'Not interested';
  return 'Tried';
}
