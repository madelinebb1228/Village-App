import { supabase } from './supabase'

// ─── Constants ────────────────────────────────────────────────────────────────

export const KIDS_AGES = [
  { value: 'expecting', label: 'Expecting' },
  { value: '0-3m',      label: 'Newborn (0–3m)' },
  { value: '3-6m',      label: '3–6 months' },
  { value: '6-12m',     label: '6–12 months' },
  { value: '1-2y',      label: '1–2 years' },
  { value: '2-4y',      label: '2–4 years' },
  { value: '4plus',     label: '4+ years' },
]

export const PARENTING_STYLES = [
  { value: 'crunchy',    label: '🌿 Crunchy' },
  { value: 'silky',      label: '✨ Silky' },
  { value: 'scrunchy',   label: '🌿✨ Scrunchy' },
  { value: 'attachment', label: '🫂 Attachment' },
  { value: 'structured', label: '📋 Scheduled' },
  { value: 'gentle',     label: '💜 Gentle' },
  { value: 'free-range', label: '🌲 Free Range' },
]

export const INTERESTS = [
  { value: 'sleep-training', label: '😴 Sleep Training' },
  { value: 'breastfeeding',  label: '🤱 Breastfeeding' },
  { value: 'formula',        label: '🍼 Formula Feeding' },
  { value: 'blw',            label: '🥑 Baby-Led Weaning' },
  { value: 'working-parent', label: '💼 Working Parent' },
  { value: 'sahp',           label: '🏡 Stay-at-Home' },
  { value: 'single-parent',  label: '💪 Single Parent' },
  { value: 'multiples',      label: '👯 Twins/Multiples' },
  { value: 'first-time',     label: '🌱 First-Time Parent' },
  { value: 'experienced',    label: '⭐ 3+ Kids' },
  { value: 'postpartum',     label: '💜 Postpartum Support' },
  { value: 'cloth-diapers',  label: '🌱 Cloth Diapers' },
  { value: 'babywearing',    label: '🫂 Babywearing' },
  { value: 'outdoor-kids',   label: '🌲 Outdoorsy' },
  { value: 'screen-free',    label: '📵 Screen-Free' },
  { value: 'foster-adopt',   label: '❤️ Foster/Adoptive' },
  { value: 'special-needs',  label: '💙 Special Needs' },
]

export const LOOKING_FOR = [
  { value: 'advice',     label: '💡 Parenting Advice' },
  { value: 'friendship', label: '👯 Friendship' },
  { value: 'playdates',  label: '🛝 Playdates' },
  { value: 'chat',       label: '💬 Someone to Talk To' },
  { value: 'support',    label: '🤗 Emotional Support' },
  { value: 'local',      label: '📍 Local Friends' },
]

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MatchingProfile {
  id: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
  parent_role: string | null
  bio: string | null
  kids_ages: string[]
  parenting_style: string[]
  interests: string[]
  looking_for: string[]
  match_city: string | null
  match_state: string | null
  matching_enabled: boolean
}

export interface MatchResult {
  profile: MatchingProfile
  score: number     // 0–100
  reasons: string[] // e.g. "You both have 6-month-old babies"
}

// ─── Scoring algorithm ────────────────────────────────────────────────────────
//
// Category             Max   Notes
// Kids ages             35   Exact match 35, adjacent 20, 2 away 10
// Location              20   Same city 20, same state 10
// Shared interests      25   5 pts per shared tag (max 5)
// Parenting style       10   5 pts per shared style (max 2)
// Looking for           10   5 pts per shared goal (max 2)
// ─────────────────── ────
// Total                100

const AGE_ORDER = ['expecting', '0-3m', '3-6m', '6-12m', '1-2y', '2-4y', '4plus']

function ageDisplayLabel(v: string): string {
  const m = KIDS_AGES.find(a => a.value === v)
  return m ? m.label : v
}

export function scoreMatch(me: MatchingProfile, them: MatchingProfile): MatchResult {
  let score = 0
  const reasons: string[] = []

  // 1. Kids ages
  if (me.kids_ages.length > 0 && them.kids_ages.length > 0) {
    let bestPts    = 0
    let bestReason = ''
    for (const myAge of me.kids_ages) {
      for (const theirAge of them.kids_ages) {
        const myIdx    = AGE_ORDER.indexOf(myAge)
        const theirIdx = AGE_ORDER.indexOf(theirAge)
        if (myIdx < 0 || theirIdx < 0) continue
        const dist = Math.abs(myIdx - theirIdx)
        const pts  = dist === 0 ? 35 : dist === 1 ? 20 : dist === 2 ? 10 : 0
        if (pts > bestPts) {
          bestPts    = pts
          bestReason = dist === 0
            ? `You both have ${ageDisplayLabel(myAge)} babies`
            : `Similar ages — ${ageDisplayLabel(myAge)} and ${ageDisplayLabel(theirAge)}`
        }
      }
    }
    score += bestPts
    if (bestReason) reasons.push(bestReason)
  }

  // 2. Location (city/state comparison, no exact address exposed)
  const myCity  = me.match_city?.toLowerCase().trim()
  const myState = me.match_state?.toLowerCase().trim()
  const thCity  = them.match_city?.toLowerCase().trim()
  const thState = them.match_state?.toLowerCase().trim()

  if (myCity && thCity && myCity === thCity && myState === thState) {
    score += 20
    reasons.push(`Both near ${me.match_city}`)
  } else if (myState && thState && myState === thState) {
    score += 10
    reasons.push(`Both in ${me.match_state}`)
  }

  // 3. Shared interests
  const sharedInterests = me.interests.filter(i => them.interests.includes(i))
  score += Math.min(sharedInterests.length * 5, 25)
  if (sharedInterests.length > 0) {
    const labels = sharedInterests.slice(0, 2)
      .map(v => INTERESTS.find(i => i.value === v)?.label ?? v)
    reasons.push(
      sharedInterests.length === 1
        ? `Both into ${labels[0]}`
        : `${sharedInterests.length} shared interests: ${labels.join(', ')}`,
    )
  }

  // 4. Parenting style
  const sharedStyles = me.parenting_style.filter(s => them.parenting_style.includes(s))
  score += Math.min(sharedStyles.length * 5, 10)
  if (sharedStyles.length > 0) {
    const label = PARENTING_STYLES.find(s => s.value === sharedStyles[0])?.label ?? sharedStyles[0]
    reasons.push(`Parenting style: ${label}`)
  }

  // 5. Looking for
  const sharedGoals = me.looking_for.filter(g => them.looking_for.includes(g))
  score += Math.min(sharedGoals.length * 5, 10)
  if (sharedGoals.length > 0 && reasons.length < 4) {
    const label = LOOKING_FOR.find(g => g.value === sharedGoals[0])?.label ?? sharedGoals[0]
    reasons.push(`Both looking for ${label}`)
  }

  return { profile: them, score: Math.min(score, 100), reasons }
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

const SELECT_FIELDS = `
  id, display_name, username, avatar_url, parent_role, bio,
  kids_ages, parenting_style, interests, looking_for,
  match_city, match_state, matching_enabled
`.trim()

function normalise(raw: any): MatchingProfile {
  return {
    ...raw,
    kids_ages:        Array.isArray(raw.kids_ages)        ? raw.kids_ages        : [],
    parenting_style:  Array.isArray(raw.parenting_style)  ? raw.parenting_style  : [],
    interests:        Array.isArray(raw.interests)        ? raw.interests        : [],
    looking_for:      Array.isArray(raw.looking_for)      ? raw.looking_for      : [],
    matching_enabled: raw.matching_enabled ?? true,
  }
}

export async function loadMyMatchingProfile(userId: string): Promise<MatchingProfile | null> {
  const { data } = await supabase
    .from('profiles')
    .select(SELECT_FIELDS)
    .eq('id', userId)
    .maybeSingle()
  return data ? normalise(data) : null
}

export async function saveMatchingProfile(
  userId: string,
  updates: {
    kids_ages?:        string[]
    parenting_style?:  string[]
    interests?:        string[]
    looking_for?:      string[]
    match_city?:       string | null
    match_state?:      string | null
    matching_enabled?: boolean
  },
): Promise<void> {
  await (supabase.from('profiles') as any).update(updates).eq('id', userId)
}

export async function findMatches(me: MatchingProfile, limit = 5): Promise<MatchResult[]> {
  // Scoring is 100% on-device for privacy — we fetch a capped pool and rank locally.
  const { data } = await supabase
    .from('profiles')
    .select(SELECT_FIELDS)
    .eq('matching_enabled', true)
    .neq('id', me.id)
    .limit(300)

  if (!data) return []

  return (data as any[])
    .map(normalise)
    .filter(p => p.kids_ages.length > 0 || p.interests.length > 0)
    .map(p => scoreMatch(me, p))
    .filter(r => r.score >= 15)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

// Creates or retrieves a DM conversation between two users (deterministic ordering).
export async function openOrCreateConversation(myId: string, otherId: string): Promise<string | null> {
  const [p1, p2] = myId < otherId ? [myId, otherId] : [otherId, myId]

  let { data: existing } = await (supabase
    .from('conversations') as any)
    .select('id')
    .eq('participant_1', p1)
    .eq('participant_2', p2)
    .maybeSingle()

  if (!existing) {
    const { data: created } = await (supabase
      .from('conversations') as any)
      .insert({ participant_1: p1, participant_2: p2 })
      .select('id')
      .single()
    existing = created
  }

  if (!existing) return null

  return (existing as any).id
}

export async function sendIntroMessage(conversationId: string, senderId: string, content: string): Promise<void> {
  await (supabase.from('direct_messages') as any).insert({
    conversation_id: conversationId,
    sender_id:       senderId,
    content,
    created_at:      new Date().toISOString(),
  })
  await (supabase.from('conversations') as any)
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)
}

export function hasMatchingProfile(p: MatchingProfile): boolean {
  return p.kids_ages.length > 0 || p.interests.length > 0
}
