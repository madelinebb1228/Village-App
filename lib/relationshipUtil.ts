// Shared types + logic for the relationship-connection features (Send Kudos,
// Us Time). Two screens (KudosTracker, UsTimeTracker) need identical
// couple-resolution logic, so — like activitiesUtil.ts — that's centralized
// here instead of duplicated per screen.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getParentTerm } from './inclusiveLanguage';

export interface Couple {
  id: string;
  invite_code: string;
  created_at: string;
}

export interface Partner {
  user_id: string;
  name: string;
  term: string;
}

export interface AppreciationMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  sent_at: string;
  read_at: string | null;
}

export interface CoupleActivity {
  id: string;
  couple_id: string;
  logged_by: string;
  activity_type: string;
  note: string | null;
  completed_at: string;
  duration_minutes: number | null;
  created_at: string;
}

// ─── Presets ────────────────────────────────────────────────────────────────

export const KUDOS_PRESETS: string[] = [
  'Thanks for the 2am diaper change 🍼',
  'Great job with bedtime tonight 🌙',
  'Thanks for letting me sleep in 😴',
  'You made a hard day easier ☕',
  "You're a great partner 💜",
];

export interface UsTimePreset { type: string; label: string; emoji: string }

export const US_TIME_PRESETS: UsTimePreset[] = [
  { type: 'date_night', label: 'Date night', emoji: '🌙' },
  { type: 'coffee', label: 'Coffee together', emoji: '☕' },
  { type: 'walk', label: 'Walk together', emoji: '🚶' },
  { type: 'phone_free', label: 'Phone-free time', emoji: '📵' },
];

// MVP: static, rotating ideas. A fast-follow could drive these off the live
// nap/sleep schedule (e.g. "Baby naps 1-3pm → walk together?"), but that
// needs to read sleep-tracker data and is out of scope for this pass.
export const MICRO_DATE_IDEAS: string[] = [
  '15 minutes on the porch together?',
  'Trade phones for 10 minutes and really talk',
  'Split a coffee while the baby naps',
  'Put on one song and slow dance in the kitchen',
  'Text each other one thing you appreciated today',
];

// ─── Helpers ────────────────────────────────────────────────────────────────

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diffMs / 86400000));
}

/** Gentle, never guilt-tripping framing for the "last Us Time" banner. */
export function usTimeBannerText(lastCompletedAt: string | null | undefined): string {
  const days = daysSince(lastCompletedAt);
  if (days === null) return "Log your first Us Time together 💞";
  if (days === 0) return 'You had Us Time today 💞';
  if (days === 1) return "It's been 1 day since your last Us Time";
  return `It's been ${days} days since your last Us Time`;
}

export function timeAgoShort(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── useCouple ──────────────────────────────────────────────────────────────

// KudosTracker and UsTimeTracker each hold their own useCouple() instance.
// When one links a couple, this notifies every other instance on the page
// to refetch, so the sibling tracker doesn't keep showing the "connect"
// prompt until the user manually reloads.
const coupleLinkListeners = new Set<() => void>();
export function notifyCoupleLinked() {
  coupleLinkListeners.forEach(l => l());
}

interface UseCoupleResult {
  couple: Couple | null;
  partner: Partner | null;
  loading: boolean;
  refresh: () => void;
}

/** Resolves the current user's couple (if any) and their partner's display info. */
export function useCouple(userId: string | null): UseCoupleResult {
  const [couple, setCouple] = useState<Couple | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    coupleLinkListeners.add(refresh);
    return () => { coupleLinkListeners.delete(refresh); };
  }, [refresh]);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const { data: myMembership } = await supabase
          .from('couple_members')
          .select('couple_id')
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle();

        if (!myMembership) {
          if (!cancelled) { setCouple(null); setPartner(null); }
          return;
        }

        const [{ data: coupleRow }, { data: memberRows }] = await Promise.all([
          supabase.from('couples').select('id, invite_code, created_at').eq('id', myMembership.couple_id).maybeSingle(),
          supabase.from('couple_members').select('user_id').eq('couple_id', myMembership.couple_id),
        ]);

        const partnerId = (memberRows ?? []).map((r: any) => r.user_id as string).find(id => id !== userId) ?? null;

        let partnerInfo: Partner | null = null;
        if (partnerId) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, display_name, username, preferred_term')
            .eq('id', partnerId)
            .maybeSingle();
          partnerInfo = {
            user_id: partnerId,
            name: profile?.display_name || (profile?.username ? `@${profile.username}` : 'Your partner'),
            term: getParentTerm(profile),
          };
        }

        if (!cancelled) {
          setCouple((coupleRow as Couple) ?? null);
          setPartner(partnerInfo);
        }
      } catch (err: any) {
        console.warn('[useCouple] load error:', err?.message);
        if (!cancelled) { setCouple(null); setPartner(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userId, tick]);

  return { couple, partner, loading, refresh };
}
