import { supabase } from './supabase'
import { computeCycleStats, isFlowDay, FlowLogLike } from './cycleUtils'
import { GenderKey, WHO_WEIGHT, WHO_HEIGHT, calcPercentile, ageInMonthsAt, lbsToKg, inToCm } from './growthPercentiles'

// ─── Types ────────────────────────────────────────────────────────────────────

export type InsightCategory = 'sleep' | 'feeding' | 'diaper' | 'food' | 'medication' | 'period' | 'movement' | 'growth' | 'allergen'
export type InsightType = 'positive' | 'info' | 'warning' | 'tip'

export interface Insight {
  id: string
  category: InsightCategory
  type: InsightType
  icon: string
  title: string
  body: string
  period: number
  action?: string      // "What to try" suggestion shown below body
  dataPoints?: number  // confidence indicator
}

export interface InsightsResult {
  insights: Insight[]
  generatedAt: number
  dataPoints: { sleepSessions: number; feeds: number; diapers: number; foodLogs: number; medications: number; periodLogs: number; movementLogs: number; growthLogs: number; allergenRecords: number }
}

// ─── Cache (15-min TTL per babyId) ───────────────────────────────────────────

const CACHE_TTL_MS = 15 * 60 * 1000
const cache = new Map<string, InsightsResult>()

export function invalidateInsightsCache(babyId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(babyId)) cache.delete(key)
  }
}

// ─── Raw row types ────────────────────────────────────────────────────────────

interface SleepRow {
  id: string
  sleep_type: 'nap' | 'night'
  start_time: string
  end_time: string | null
  duration_minutes: number | null
  quality: 'great' | 'good' | 'fair' | 'poor' | null
}

interface FeedRow {
  id: string
  feed_type: string
  logged_at: string
  mood: string | null
  duration_seconds: number | null
  bottle_amount_oz: number | null
}

interface DiaperRow {
  id: string
  diaper_type: string
  diaper_consist: string | null
  logged_at: string
}

interface FoodRow {
  id: string
  brand: string
  flavor: string
  rating: 'dislike' | 'like' | 'love' | null
  bad_reaction: boolean
  tried_at: string
  is_first_introduction: boolean
}

interface MedicationRow {
  id: string
  name: string
  frequency_hours: number | null
  active: boolean
  created_at: string
}

interface MedicationLogRow {
  id: string
  medication_id: string
  taken_at: string
}

interface PeriodLogRow extends FlowLogLike {
  id: string
}

interface MomMoodLogRow {
  id: string
  logged_date: string
  mood_score: number
}

interface MovementLogRow {
  id: string
  logged_at: string
  duration_minutes: number | null
}

interface GrowthLogRow {
  id: string
  date: string
  weight_lbs: number | null
  height_in: number | null
}

interface AllergenRecordRow {
  allergen_id: string
  allergen_name: string
  status: string
  date_introduced: string | null
  last_given_at: string | null
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = avg(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length)
}

function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

function hourOf(iso: string): number {
  return new Date(iso).getHours()
}

function minsToLabel(mins: number): string {
  const m = Math.round(mins)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}

function fmtHour(h: number): string {
  const clamped = ((h % 24) + 24) % 24
  if (clamped === 0) return '12am'
  if (clamped < 12) return `${clamped}am`
  if (clamped === 12) return '12pm'
  return `${clamped - 12}pm`
}

// ─── Sleep analysis ───────────────────────────────────────────────────────────

function analyzeSleep(logs: SleepRow[], period: number): Insight[] {
  const completed = logs.filter(l => l.duration_minutes != null && l.end_time != null)
  if (completed.length < 3) return []

  const insights: Insight[] = []

  const byDay = new Map<string, SleepRow[]>()
  for (const log of completed) {
    const k = dayKey(log.start_time)
    const arr = byDay.get(k) ?? []
    arr.push(log)
    byDay.set(k, arr)
  }
  const days = [...byDay.keys()].sort()
  if (days.length < 3) return []

  const totalByDay     = days.map(d => byDay.get(d)!.reduce((s, l) => s + (l.duration_minutes ?? 0), 0))
  const napCountByDay  = days.map(d => byDay.get(d)!.filter(l => l.sleep_type === 'nap').length)
  const nightCountByDay= days.map(d => byDay.get(d)!.filter(l => l.sleep_type === 'night').length)

  // Trend: last 7 vs prior 7 days
  if (days.length >= 10) {
    const recent = totalByDay.slice(-7).filter(v => v > 0)
    const prior  = totalByDay.slice(-14, -7).filter(v => v > 0)
    if (recent.length >= 4 && prior.length >= 4) {
      const recentAvg = avg(recent)
      const priorAvg  = avg(prior)
      const diff = recentAvg - priorAvg
      if (Math.abs(diff) > 20) {
        insights.push({
          id: 'sleep-trend',
          category: 'sleep',
          type: diff > 0 ? 'positive' : 'info',
          icon: diff > 0 ? '📈' : '📉',
          title: diff > 0 ? 'More sleep this week' : 'Less sleep this week',
          body: `Average daily sleep is ${minsToLabel(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than last week (${minsToLabel(recentAvg)}/day now vs ${minsToLabel(priorAvg)}/day before).`,
          period,
          action: diff > 0
            ? 'Maintain consistent sleep and wake times to keep this momentum going.'
            : 'Try moving bedtime 15–30 min earlier and make sure afternoon naps aren\'t too late in the day.',
          dataPoints: recent.length + prior.length,
        })
      }
    }
  }

  // Nap count correlation: days with 2+ naps vs fewer
  if (days.length >= 5) {
    const highDays = days.filter((_, i) => napCountByDay[i] >= 2)
    const lowDays  = days.filter((_, i) => napCountByDay[i] < 2)
    if (highDays.length >= 3 && lowDays.length >= 3) {
      const highAvg = avg(highDays.map(d => byDay.get(d)!.reduce((s, l) => s + (l.duration_minutes ?? 0), 0)))
      const lowAvg  = avg(lowDays.map(d => byDay.get(d)!.reduce((s, l) => s + (l.duration_minutes ?? 0), 0)))
      const diff = highAvg - lowAvg
      if (Math.abs(diff) > 15) {
        insights.push({
          id: 'sleep-nap-correlation',
          category: 'sleep',
          type: diff > 0 ? 'positive' : 'tip',
          icon: '💤',
          title: diff > 0 ? '2+ naps means more total sleep' : 'Fewer naps, more total sleep',
          body: diff > 0
            ? `On 2-nap days baby sleeps ${minsToLabel(diff)} more total (${minsToLabel(highAvg)} vs ${minsToLabel(lowAvg)} on lower-nap days).`
            : `On days with fewer naps, total sleep runs ${minsToLabel(Math.abs(diff))} higher (${minsToLabel(lowAvg)} vs ${minsToLabel(highAvg)}).`,
          period,
          action: diff > 0
            ? 'Protect the 2-nap schedule for now — it\'s paying off in total sleep.'
            : 'This may be a sign baby is ready to transition to fewer naps.',
          dataPoints: highDays.length + lowDays.length,
        })
      }
    }
  }

  // Sleep quality distribution
  const qualityCounts = { great: 0, good: 0, fair: 0, poor: 0 }
  for (const log of completed) {
    if (log.quality) qualityCounts[log.quality as keyof typeof qualityCounts]++
  }
  const ratedTotal = qualityCounts.great + qualityCounts.good + qualityCounts.fair + qualityCounts.poor
  if (ratedTotal >= 5) {
    const goodPct = Math.round(((qualityCounts.great + qualityCounts.good) / ratedTotal) * 100)
    insights.push({
      id: 'sleep-quality',
      category: 'sleep',
      type: goodPct >= 70 ? 'positive' : goodPct >= 40 ? 'info' : 'warning',
      icon: goodPct >= 70 ? '😊' : goodPct >= 40 ? '😐' : '😣',
      title: `${goodPct}% of sleeps rated good or great`,
      body: `Out of ${ratedTotal} rated sessions — ${qualityCounts.great} great, ${qualityCounts.good} good, ${qualityCounts.fair} fair, ${qualityCounts.poor} poor.`,
      period,
      action: goodPct < 40
        ? 'Check room temperature (68–72°F is ideal), white noise level, and feed timing before sleep.'
        : undefined,
      dataPoints: ratedTotal,
    })
  }

  // Night waking anomaly: today has significantly more than average
  const todayK   = dayKey(new Date().toISOString())
  const todayIdx = days.indexOf(todayK)
  if (todayIdx >= 0 && days.length >= 5) {
    const historicalNights = nightCountByDay.filter((_, i) => i !== todayIdx && nightCountByDay[i] > 0)
    if (historicalNights.length >= 4) {
      const avgNights  = avg(historicalNights)
      const sdNights   = stddev(historicalNights)
      const todayNights = nightCountByDay[todayIdx]
      if (todayNights > avgNights + sdNights + 0.5) {
        insights.push({
          id: 'sleep-night-anomaly',
          category: 'sleep',
          type: 'warning',
          icon: '🌙',
          title: 'More night wakings than usual',
          body: `${todayNights} night session${todayNights !== 1 ? 's' : ''} tonight vs your average of ${avgNights.toFixed(1)}. Could be a growth spurt, teething, or developmental leap.`,
          period,
          action: 'Try a dream feed before you go to sleep and check for discomfort signs like gas or teething pain.',
          dataPoints: historicalNights.length,
        })
      }
    }
  }

  // Best night sleep start time
  const longNights = completed.filter(l => l.sleep_type === 'night' && (l.duration_minutes ?? 0) > 120)
  if (longNights.length >= 4) {
    const pool   = longNights.filter(l => l.quality === 'great' || l.quality === 'good')
    const source = pool.length >= 3 ? pool : longNights
    const hours  = source.map(l => hourOf(l.start_time))
    const modeHour = [...new Set(hours)].sort(
      (a, b) => hours.filter(h => h === b).length - hours.filter(h => h === a).length,
    )[0]
    if (modeHour !== undefined) {
      insights.push({
        id: 'sleep-best-start',
        category: 'sleep',
        type: 'tip',
        icon: '⏰',
        title: `Best sleeps start around ${fmtHour(modeHour)}`,
        body: `Baby's ${pool.length >= 3 ? 'highest-quality' : 'longest'} night sleeps most often begin around ${fmtHour(modeHour)}.`,
        period,
        action: `Start the bedtime routine by ${fmtHour(modeHour - 1)} to hit this natural sleep window.`,
        dataPoints: source.length,
      })
    }
  }

  return insights
}

// ─── Feeding analysis ─────────────────────────────────────────────────────────

function analyzeFeeding(logs: FeedRow[], period: number): Insight[] {
  if (logs.length < 5) return []

  const insights: Insight[] = []

  const byDay = new Map<string, FeedRow[]>()
  for (const log of logs) {
    const k = dayKey(log.logged_at)
    const arr = byDay.get(k) ?? []
    arr.push(log)
    byDay.set(k, arr)
  }
  const days = [...byDay.keys()].sort()
  if (days.length < 3) return []

  const countByDay = days.map(d => byDay.get(d)!.length)
  const overallAvg = avg(countByDay)

  insights.push({
    id: 'feed-avg',
    category: 'feeding',
    type: 'info',
    icon: '🍼',
    title: `Averaging ${overallAvg.toFixed(1)} feeds per day`,
    body: `Based on ${logs.length} total feeds across ${days.length} days.`,
    period,
    dataPoints: logs.length,
  })

  // Trend: last 7 vs prior 7
  if (days.length >= 10) {
    const recentAvg = avg(countByDay.slice(-7))
    const priorAvg  = avg(countByDay.slice(-14, -7))
    const diff = recentAvg - priorAvg
    if (Math.abs(diff) >= 1) {
      insights.push({
        id: 'feed-trend',
        category: 'feeding',
        type: 'info',
        icon: '📊',
        title: `Feeds ${diff > 0 ? 'up' : 'down'} vs last week`,
        body: `${recentAvg.toFixed(1)} feeds/day this week vs ${priorAvg.toFixed(1)}/day last week.`,
        period,
        action: diff < 0
          ? 'Check wet diaper count — at least 6/day confirms adequate intake.'
          : 'Frequent feeding spurts are normal — feed on demand.',
        dataPoints: days.length,
      })
    }
  }

  // Cluster feeding
  const clusterHours: number[] = []
  for (const [, dayFeeds] of byDay.entries()) {
    const sorted = [...dayFeeds].sort(
      (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime(),
    )
    let bestCount = 0
    let bestStartHour = -1
    for (let i = 0; i < sorted.length; i++) {
      const wStart = new Date(sorted[i].logged_at).getTime()
      const inWin  = sorted.filter(f => {
        const t = new Date(f.logged_at).getTime()
        return t >= wStart && t <= wStart + 3 * 60 * 60 * 1000
      })
      if (inWin.length > bestCount) {
        bestCount = inWin.length
        bestStartHour = hourOf(sorted[i].logged_at)
      }
    }
    if (bestCount >= 3) clusterHours.push(bestStartHour)
  }
  if (clusterHours.length >= 2) {
    const hourFreq: Record<number, number> = {}
    for (const h of clusterHours) hourFreq[h] = (hourFreq[h] ?? 0) + 1
    const peakHour = parseInt(Object.entries(hourFreq).sort((a, b) => b[1] - a[1])[0][0])
    insights.push({
      id: 'feed-cluster',
      category: 'feeding',
      type: 'info',
      icon: '🍼',
      title: 'Cluster feeding pattern detected',
      body: `3+ feeds in a 3-hour window around ${fmtHour(peakHour)}–${fmtHour(peakHour + 3)} on ${clusterHours.length} days. Normal, especially during growth spurts.`,
      period,
      action: 'Stay hydrated and rest when possible. If breastfeeding, cluster feeding boosts supply.',
      dataPoints: clusterHours.length,
    })
  }

  // Average feed interval
  const allSorted = [...logs].sort(
    (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime(),
  )
  const intervals: number[] = []
  for (let i = 1; i < allSorted.length; i++) {
    const gapH = (new Date(allSorted[i].logged_at).getTime() - new Date(allSorted[i - 1].logged_at).getTime()) / 3_600_000
    if (gapH >= 0.25 && gapH <= 6) intervals.push(gapH)
  }
  if (intervals.length >= 5) {
    const avgInterval = avg(intervals)
    insights.push({
      id: 'feed-interval',
      category: 'feeding',
      type: 'info',
      icon: '⏱️',
      title: `Feeds every ${avgInterval.toFixed(1)}h on average`,
      body: `Based on ${intervals.length} feed-to-feed gaps over ${period} days.`,
      period,
      dataPoints: intervals.length,
    })
  }

  // Fussy mood
  const ratedFeeds = logs.filter(l => l.mood)
  if (ratedFeeds.length >= 8) {
    const fussyCount = ratedFeeds.filter(l => l.mood === 'fussy').length
    const fussyPct   = Math.round((fussyCount / ratedFeeds.length) * 100)
    if (fussyPct >= 30) {
      insights.push({
        id: 'feed-fussy',
        category: 'feeding',
        type: 'warning',
        icon: '😣',
        title: `${fussyPct}% of feeds logged as fussy`,
        body: `${fussyCount} of ${ratedFeeds.length} feeds. May signal a feeding difficulty, gas, growth spurt, or developmental leap.`,
        period,
        action: 'Try different positions, mid-feed burping, and checking bottle nipple flow rate. Could also be gas or a growth spurt.',
        dataPoints: ratedFeeds.length,
      })
    }
  }

  return insights
}

// ─── Diaper analysis ──────────────────────────────────────────────────────────

function analyzeDiapers(logs: DiaperRow[], period: number): Insight[] {
  if (logs.length < 5) return []

  const insights: Insight[] = []

  const byDay = new Map<string, DiaperRow[]>()
  for (const log of logs) {
    const k = dayKey(log.logged_at)
    const arr = byDay.get(k) ?? []
    arr.push(log)
    byDay.set(k, arr)
  }
  const days = [...byDay.keys()].sort()
  if (days.length < 3) return []

  const countByDay = days.map(d => byDay.get(d)!.length)
  const meanCount  = avg(countByDay)

  insights.push({
    id: 'diaper-avg',
    category: 'diaper',
    type: 'info',
    icon: '🩲',
    title: `${meanCount.toFixed(1)} diaper changes per day`,
    body: `Your ${period}-day average across ${days.length} tracked days.`,
    period,
    dataPoints: days.length,
  })

  return insights
}

// ─── Enhanced dehydration check (2-day pattern) ───────────────────────────────

function detectDehydration(diaperLogs: DiaperRow[], period: number): Insight[] {
  if (diaperLogs.length < 5) return []

  const now     = Date.now()
  const twoDays = 2 * 86_400_000

  const isWet = (l: DiaperRow) => l.diaper_type === 'wet' || l.diaper_type === 'both'

  const wetRecent = diaperLogs.filter(l => isWet(l) && now - new Date(l.logged_at).getTime() < twoDays).length
  const priorLogs = diaperLogs.filter(l => now - new Date(l.logged_at).getTime() >= twoDays)
  if (priorLogs.length < 3) return []

  const priorByDay = new Map<string, DiaperRow[]>()
  for (const log of priorLogs) {
    const k = dayKey(log.logged_at)
    priorByDay.set(k, [...(priorByDay.get(k) ?? []), log])
  }
  const wetByDay = [...priorByDay.values()].map(dayLogs => dayLogs.filter(isWet).length)
  if (wetByDay.length < 2) return []

  const avgWetPerDay    = avg(wetByDay)
  const expectedIn2Days = avgWetPerDay * 2

  if (wetRecent < expectedIn2Days * 0.6 && wetRecent < 8) {
    return [{
      id: 'dehydration-2day',
      category: 'diaper',
      type: 'warning',
      icon: '💧',
      title: 'Low wet diapers over 2 days',
      body: `Only ${wetRecent} wet diaper${wetRecent !== 1 ? 's' : ''} in the past 48 hours vs your average of ${Math.round(expectedIn2Days)} — consistently low output can indicate dehydration.`,
      period,
      action: 'Offer feeds more frequently. Contact your pediatrician if fewer than 3 wet diapers in 24 hours, or if baby seems unusually lethargic.',
      dataPoints: priorLogs.length + wetRecent,
    }]
  }

  return []
}

// ─── Growth spurt detector ────────────────────────────────────────────────────

function detectGrowthSpurt(feedLogs: FeedRow[], sleepLogs: SleepRow[]): Insight[] {
  if (feedLogs.length < 10 || sleepLogs.length < 5) return []

  const now      = Date.now()
  const threeDays= 3 * 86_400_000
  const tenDays  = 10 * 86_400_000

  const recentFeeds = feedLogs.filter(f => now - new Date(f.logged_at).getTime() < threeDays)
  const priorFeeds  = feedLogs.filter(f => {
    const t = now - new Date(f.logged_at).getTime()
    return t >= threeDays && t < tenDays
  })
  if (recentFeeds.length < 3 || priorFeeds.length < 7) return []

  const recentFpd = recentFeeds.length / 3
  const priorFpd  = priorFeeds.length / 7
  if (priorFpd === 0) return []
  const feedIncrease = (recentFpd - priorFpd) / priorFpd

  const completedSleep = sleepLogs.filter(l => l.duration_minutes && l.end_time)
  const recentSleep = completedSleep.filter(l => now - new Date(l.start_time).getTime() < threeDays)
  const priorSleep  = completedSleep.filter(l => {
    const t = now - new Date(l.start_time).getTime()
    return t >= threeDays && t < tenDays
  })
  if (recentSleep.length < 2 || priorSleep.length < 3) return []

  const recentSpd = recentSleep.reduce((s, l) => s + (l.duration_minutes ?? 0), 0) / 3
  const priorSpd  = priorSleep.reduce((s, l) => s + (l.duration_minutes ?? 0), 0) / 7
  const sleepIncrease = priorSpd > 0 ? (recentSpd - priorSpd) / priorSpd : 0

  if (feedIncrease >= 0.3 && sleepIncrease >= 0.1) {
    return [{
      id: 'growth-spurt',
      category: 'feeding',
      type: 'info',
      icon: '🌱',
      title: 'Signs of a growth spurt',
      body: `Feeds are up ${Math.round(feedIncrease * 100)}% and sleep is up ${Math.round(sleepIncrease * 100)}% over the past 3 days vs your recent baseline — a classic growth spurt pattern.`,
      period: 14,
      action: 'Feed on demand. If breastfeeding, your supply will adjust within 24–48 hours. Stock up on snacks — your calorie needs increase too.',
      dataPoints: recentFeeds.length + recentSleep.length,
    }]
  }

  return []
}

// ─── Sleep regression detector ────────────────────────────────────────────────

const REGRESSION_WINDOWS = [
  { label: '4-month', range: [3.5, 4.75] as [number, number] },
  { label: '6-month', range: [5.5, 6.75] as [number, number] },
  { label: '8-month', range: [7.5, 9.5]  as [number, number] },
  { label: '12-month',range: [11,  13.5] as [number, number] },
]

function detectSleepRegression(sleepLogs: SleepRow[], birthDateIso: string | null): Insight[] {
  if (!birthDateIso || sleepLogs.length < 8) return []

  const ageMonths = (Date.now() - new Date(birthDateIso).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  const regression = REGRESSION_WINDOWS.find(r => ageMonths >= r.range[0] && ageMonths <= r.range[1])
  if (!regression) return []

  const now      = Date.now()
  const fiveDays = 5  * 86_400_000
  const twelveDays=12 * 86_400_000

  const completed    = sleepLogs.filter(l => l.duration_minutes && l.end_time)
  const recentNights = completed.filter(l => l.sleep_type === 'night' && now - new Date(l.start_time).getTime() < fiveDays)
  const priorNights  = completed.filter(l => l.sleep_type === 'night' && now - new Date(l.start_time).getTime() >= fiveDays && now - new Date(l.start_time).getTime() < twelveDays)

  if (recentNights.length < 3 || priorNights.length < 3) return []

  const recentAvg = avg(recentNights.map(l => l.duration_minutes ?? 0))
  const priorAvg  = avg(priorNights.map(l => l.duration_minutes ?? 0))

  if (priorAvg > 0 && (priorAvg - recentAvg) / priorAvg >= 0.2) {
    return [{
      id: 'sleep-regression',
      category: 'sleep',
      type: 'warning',
      icon: '🌀',
      title: `Possible ${regression.label} sleep regression`,
      body: `Baby is ${Math.round(ageMonths * 10) / 10} months old and night sleep is down ${Math.round((1 - recentAvg / priorAvg) * 100)}% over the past 5 days — this aligns with the ${regression.label} regression window.`,
      period: 14,
      action: 'Maintain your usual routines. Regressions typically last 2–6 weeks. Extra comfort at night is fine — you can\'t spoil a baby through a developmental leap.',
      dataPoints: recentNights.length + priorNights.length,
    }]
  }

  return []
}

// ─── Feed-to-nap timing ───────────────────────────────────────────────────────

function analyzeFeedToNapTiming(feedLogs: FeedRow[], sleepLogs: SleepRow[], period: number): Insight[] {
  const naps = sleepLogs.filter(l => l.sleep_type === 'nap' && l.duration_minutes && l.end_time)
  if (naps.length < 6 || feedLogs.length < 6) return []

  const BUCKETS = [
    { label: '0–15 min',  min: 0,  max: 15  },
    { label: '15–30 min', min: 15, max: 30  },
    { label: '30–45 min', min: 30, max: 45  },
    { label: '45–60 min', min: 45, max: 60  },
    { label: '60–90 min', min: 60, max: 90  },
    { label: '90–120 min',min: 90, max: 120 },
  ]

  const buckets = BUCKETS.map(b => ({ label: b.label, min: b.min, max: b.max, durations: [] as number[] }))

  for (const nap of naps) {
    const napStart   = new Date(nap.start_time).getTime()
    const preceding  = feedLogs
      .filter(f => { const t = new Date(f.logged_at).getTime(); return t < napStart && napStart - t < 120 * 60_000 })
      .sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime())[0]
    if (!preceding || !nap.duration_minutes) continue
    const gapMin = (napStart - new Date(preceding.logged_at).getTime()) / 60_000
    const bucket = buckets.find(b => gapMin >= b.min && gapMin < b.max)
    if (bucket) bucket.durations.push(nap.duration_minutes)
  }

  const qualified = buckets.filter(b => b.durations.length >= 3)
  if (qualified.length < 2) return []

  const withAvg = qualified.map(b => ({ ...b, avg: avg(b.durations) }))
  const best    = withAvg.reduce((a, b) => a.avg > b.avg ? a : b)
  const overall = avg(naps.map(l => l.duration_minutes ?? 0))

  if (best.avg - overall > 15) {
    return [{
      id: 'feed-nap-timing',
      category: 'sleep',
      type: 'tip',
      icon: '⏱️',
      title: `Best naps when fed ${best.label} before sleep`,
      body: `Naps average ${Math.round(best.avg)}m when the last feed was ${best.label} before sleep, vs ${Math.round(overall)}m overall.`,
      period,
      action: `Try to wrap up feeds about ${best.label} before putting baby down — this appears to be the sweet spot for longer naps.`,
      dataPoints: best.durations.length,
    }]
  }

  return []
}

// ─── Night feed trend ─────────────────────────────────────────────────────────

function analyzeNightFeedTrend(feedLogs: FeedRow[], period: number): Insight[] {
  if (feedLogs.length < 5) return []

  const isNight = (iso: string) => { const h = new Date(iso).getHours(); return h >= 22 || h < 6 }

  const byDay = new Map<string, FeedRow[]>()
  for (const f of feedLogs) {
    const k = dayKey(f.logged_at)
    byDay.set(k, [...(byDay.get(k) ?? []), f])
  }
  const days = [...byDay.keys()].sort()
  if (days.length < 10) return []

  const nightByDay = days.map(d => byDay.get(d)!.filter(f => isNight(f.logged_at)).length)
  const recentAvg  = avg(nightByDay.slice(-7))
  const priorAvg   = avg(nightByDay.slice(-14, -7))

  if (priorAvg === 0) return []
  const pctChange = (recentAvg - priorAvg) / priorAvg

  if (pctChange <= -0.3 && recentAvg <= priorAvg - 0.5) {
    return [{
      id: 'night-feed-trend',
      category: 'feeding',
      type: 'positive',
      icon: '🌙',
      title: 'Fewer night feeds this week',
      body: `Night feeds down to ${recentAvg.toFixed(1)}/night this week from ${priorAvg.toFixed(1)}/night last week — a ${Math.round(Math.abs(pctChange) * 100)}% reduction.`,
      period,
      action: 'Great sign! Keep consistent bedtime routines to continue building longer overnight stretches.',
      dataPoints: days.length,
    }]
  }

  if (pctChange >= 0.3 && recentAvg >= priorAvg + 0.5) {
    return [{
      id: 'night-feed-trend',
      category: 'feeding',
      type: 'info',
      icon: '🌙',
      title: 'More night feeds this week',
      body: `Night feeds up to ${recentAvg.toFixed(1)}/night from ${priorAvg.toFixed(1)}/night last week. Could be a growth spurt, teething, or developmental leap.`,
      period,
      action: 'Feed on demand at night. If this persists beyond 2 weeks without a clear explanation, check in with your pediatrician.',
      dataPoints: days.length,
    }]
  }

  return []
}

// ─── Positive sleep streak ────────────────────────────────────────────────────

function detectPositiveStreak(sleepLogs: SleepRow[], period: number): Insight[] {
  const now = Date.now()

  const goodNightDays = new Set<string>()
  for (const log of sleepLogs) {
    if (log.sleep_type !== 'night' || !log.duration_minutes || !log.end_time) continue
    if (log.duration_minutes >= 300) goodNightDays.add(dayKey(log.start_time))
  }
  if (goodNightDays.size < 3) return []

  const sortedDays = [...goodNightDays].sort().reverse()
  let streak = 1
  for (let i = 0; i < sortedDays.length - 1; i++) {
    const diff = (new Date(sortedDays[i]).getTime() - new Date(sortedDays[i + 1]).getTime()) / 86_400_000
    if (diff <= 1.5) streak++
    else break
  }

  const daysSinceLastGood = (now - new Date(sortedDays[0]).getTime()) / 86_400_000
  if (streak < 3 || daysSinceLastGood > 2) return []

  const avgMins = avg(
    sleepLogs
      .filter(l => l.sleep_type === 'night' && l.duration_minutes && goodNightDays.has(dayKey(l.start_time)))
      .map(l => l.duration_minutes ?? 0),
  )

  return [{
    id: 'positive-streak',
    category: 'sleep',
    type: 'positive',
    icon: '🎉',
    title: `${streak} nights in a row with 5h+ sleep!`,
    body: `Baby has had a stretch of 5+ hours for ${streak} consecutive nights, averaging ${minsToLabel(Math.round(avgMins))} per long stretch.`,
    period,
    action: 'Keep the momentum going with a consistent bedtime routine and sleep environment.',
    dataPoints: streak,
  }]
}

// ─── Food-diaper reaction correlation ─────────────────────────────────────────

function detectFoodDiaperReaction(foodLogs: FoodRow[], diaperLogs: DiaperRow[], period: number): Insight[] {
  if (foodLogs.length < 1 || diaperLogs.length < 3) return []

  const now        = Date.now()
  const sevenDays  = 7 * 86_400_000
  const firstIntros= foodLogs.filter(l => l.is_first_introduction && now - new Date(l.tried_at).getTime() < sevenDays)
  if (firstIntros.length === 0) return []

  const isPoop   = (l: DiaperRow) => l.diaper_type === 'poop' || l.diaper_type === 'both'
  const isLoose  = (l: DiaperRow) => l.diaper_consist === 'loose' || l.diaper_consist === 'watery'

  for (const intro of firstIntros.slice(0, 5)) {
    const introTime = new Date(intro.tried_at).getTime()
    const window48  = 48 * 3_600_000

    const afterDiapers  = diaperLogs.filter(l => { const t = new Date(l.logged_at).getTime(); return t >= introTime && t < introTime + window48 })
    const beforeDiapers = diaperLogs.filter(l => { const t = new Date(l.logged_at).getTime(); return t >= introTime - window48 && t < introTime })

    const poopAfter  = afterDiapers.filter(isPoop).length
    const poopBefore = beforeDiapers.filter(isPoop).length
    const looseAfter = afterDiapers.filter(isLoose).length

    if (poopAfter >= poopBefore + 2 || looseAfter >= 2) {
      return [{
        id: `food-diaper-reaction-${intro.id}`,
        category: 'food',
        type: 'warning',
        icon: '🚨',
        title: `Unusual diapers after introducing ${intro.flavor}`,
        body: `${poopAfter} poop diaper${poopAfter !== 1 ? 's' : ''} in 48h after first trying ${intro.flavor}${looseAfter > 0 ? `, including ${looseAfter} loose/watery` : ''} — up from ${poopBefore} in the 48h before. This may indicate a reaction.`,
        period,
        action: 'Pause that food for 2 weeks, then reintroduce slowly. If the reaction was severe (vomiting, rash, breathing changes), contact your pediatrician.',
        dataPoints: afterDiapers.length + beforeDiapers.length,
      }]
    }
  }

  return []
}

// ─── Food analysis ────────────────────────────────────────────────────────────

const FOOD_GROUP_KEYWORDS: Record<string, string[]> = {
  fruits:     ['apple', 'pear', 'banana', 'mango', 'peach', 'berry', 'blueberry', 'strawberry', 'plum', 'apricot', 'cherry', 'kiwi', 'pineapple', 'papaya', 'raspberry', 'blackberry', 'prune', 'orange', 'grape', 'watermelon', 'fig', 'melon', 'guava', 'pomegranate'],
  vegetables: ['carrot', 'sweet potato', 'pea', 'spinach', 'zucchini', 'pumpkin', 'squash', 'broccoli', 'kale', 'beet', 'corn', 'bean', 'lentil', 'chickpea', 'avocado', 'parsnip', 'cauliflower', 'asparagus', 'edamame', 'celery', 'tomato', 'pepper'],
  protein:    ['chicken', 'beef', 'turkey', 'pork', 'salmon', 'fish', 'lamb', 'bison', 'egg', 'tofu', 'quinoa', 'meat', 'hummus'],
  grains:     ['oat', 'rice', 'barley', 'wheat', 'grain', 'cereal', 'buckwheat', 'millet', 'oatmeal', 'pasta', 'bread', 'toast', 'cracker'],
  dairy:      ['yogurt', 'cheese', 'milk', 'cream', 'butter', 'cheddar', 'mozzarella'],
}

function getFoodGroupKey(flavor: string): string | null {
  const lower = flavor.toLowerCase()
  for (const [group, keywords] of Object.entries(FOOD_GROUP_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return group
  }
  return null
}

function stageGroups(ageMonths: number): string[] {
  if (ageMonths < 6)  return ['fruits', 'vegetables']
  if (ageMonths < 8)  return ['fruits', 'vegetables', 'grains']
  if (ageMonths < 10) return ['fruits', 'vegetables', 'grains', 'protein']
  return ['fruits', 'vegetables', 'grains', 'protein', 'dairy']
}

function analyzeFood(logs: FoodRow[], sleepLogs: SleepRow[], period: number, birthDateIso: string | null): Insight[] {
  let ageMonths: number | null = null
  if (birthDateIso) {
    ageMonths = Math.floor((Date.now() - new Date(birthDateIso).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
    if (ageMonths < 4) return []
  }

  if (logs.length < 2) return []

  const insights: Insight[] = []
  const now  = Date.now()
  const week = 7 * 86_400_000

  const recentLogs = logs.filter(l => now - new Date(l.tried_at).getTime() < week)
  const ratedLogs  = recentLogs.filter(l => l.rating !== null)

  // Diversity gap
  if (recentLogs.length >= 3) {
    const applicable     = ageMonths !== null ? stageGroups(ageMonths) : ['fruits', 'vegetables', 'grains', 'protein', 'dairy']
    const groupsThisWeek = new Set(recentLogs.map(l => getFoodGroupKey(l.flavor)).filter(Boolean))
    const missing        = applicable.filter(g => !groupsThisWeek.has(g))
    if (missing.length >= 2) {
      insights.push({
        id: 'food-diversity',
        category: 'food',
        type: 'tip',
        icon: '🌈',
        title: 'Expand food variety this week',
        body: `Haven't logged any ${missing.slice(0, 2).join(' or ')} this week. Variety across food groups builds healthy preferences early.`,
        period,
        action: 'Try introducing one food from a missing group this week — even a small taste counts.',
        dataPoints: recentLogs.length,
      })
    }
  }

  // Acceptance trend
  if (ratedLogs.length >= 3) {
    const accepted = ratedLogs.filter(l => l.rating === 'like' || l.rating === 'love').length
    const pct = Math.round((accepted / ratedLogs.length) * 100)
    insights.push({
      id: 'food-acceptance',
      category: 'food',
      type: pct >= 60 ? 'positive' : 'info',
      icon: pct >= 60 ? '🎉' : '🍽️',
      title: `${accepted} of ${ratedLogs.length} foods accepted this week`,
      body: pct >= 60
        ? `${pct}% acceptance — great variety window! Keep offering new foods while baby is receptive.`
        : `${pct}% acceptance so far. Normal for early introduction — babies often need 10–15 tries before accepting a food.`,
      period,
      action: pct < 60 ? 'Keep offering rejected foods on separate occasions alongside favorites to build familiarity.' : undefined,
      dataPoints: ratedLogs.length,
    })
  }

  // Reaction pattern
  const recentReactions = logs.filter(l => l.bad_reaction && now - new Date(l.tried_at).getTime() < 14 * 86_400_000)
  if (recentReactions.length >= 2) {
    insights.push({
      id: 'food-reactions',
      category: 'food',
      type: 'warning',
      icon: '⚠️',
      title: `${recentReactions.length} bad reactions in 2 weeks`,
      body: `Reactions logged for: ${recentReactions.map(l => l.flavor).join(', ')}. These have been added to your allergen watchlist.`,
      period,
      action: 'Pause the suspected foods and consult your pediatrician before reintroducing. Check your allergen tracker for notes.',
      dataPoints: recentReactions.length,
    })
  }

  // Retry nudge
  const oldDislikes = logs.filter(l => {
    if (l.rating !== 'dislike') return false
    const daysAgo = (now - new Date(l.tried_at).getTime()) / 86_400_000
    return daysAgo >= 10 && daysAgo <= 30
  })
  for (const disliked of oldDislikes) {
    const retriedSince = logs.some(
      l => l.flavor.toLowerCase() === disliked.flavor.toLowerCase() &&
           new Date(l.tried_at).getTime() > new Date(disliked.tried_at).getTime(),
    )
    if (!retriedSince) {
      const daysAgo = Math.round((now - new Date(disliked.tried_at).getTime()) / 86_400_000)
      insights.push({
        id: `food-retry-${disliked.id}`,
        category: 'food',
        type: 'tip',
        icon: '🔄',
        title: `Time to retry ${disliked.flavor}?`,
        body: `${disliked.flavor} was disliked ${daysAgo} days ago. Babies often need 10–15 exposures before accepting a food.`,
        period,
        action: 'Try offering a tiny amount alongside a loved food — mixing textures can help build familiarity.',
      })
      break
    }
  }

  // Introduction pace
  const firstIntros = logs.filter(l => l.is_first_introduction)
  if (firstIntros.length > 0) {
    const lastIntro  = firstIntros[0]
    const daysSince  = (now - new Date(lastIntro.tried_at).getTime()) / 86_400_000
    if (daysSince > 7) {
      insights.push({
        id: 'food-intro-pace',
        category: 'food',
        type: 'tip',
        icon: '🌱',
        title: `No new foods in ${Math.round(daysSince)} days`,
        body: `Last new introduction was ${lastIntro.flavor}. Offering new flavors regularly helps build a varied palate.`,
        period,
        action: 'Check the Baby Food Guide for stage-appropriate suggestions and pick one new food to try this week.',
        dataPoints: firstIntros.length,
      })
    }
  }

  // Sleep–food correlation
  const napLogs = sleepLogs.filter(l => l.sleep_type === 'nap' && l.duration_minutes && l.end_time)
  if (napLogs.length >= 5 && logs.length >= 5) {
    const lovedNaps: number[] = []
    const otherNaps: number[] = []
    for (const nap of napLogs) {
      const napStart  = new Date(nap.start_time).getTime()
      const preceding = logs
        .filter(l => { const t = new Date(l.tried_at).getTime(); return t < napStart && napStart - t < 90 * 60_000 })
        .sort((a, b) => new Date(b.tried_at).getTime() - new Date(a.tried_at).getTime())[0]
      if (preceding && nap.duration_minutes) {
        if (preceding.rating === 'love') lovedNaps.push(nap.duration_minutes)
        else otherNaps.push(nap.duration_minutes)
      }
    }
    if (lovedNaps.length >= 3 && otherNaps.length >= 3) {
      const lovedAvg = avg(lovedNaps)
      const otherAvg = avg(otherNaps)
      if (lovedAvg - otherAvg > 15) {
        insights.push({
          id: 'food-sleep-corr',
          category: 'food',
          type: 'tip',
          icon: '😴',
          title: 'Better naps after favorite meals',
          body: `Naps average ${Math.round(lovedAvg - otherAvg)}m longer when baby eats a loved food beforehand (${Math.round(lovedAvg)}m vs ${Math.round(otherAvg)}m).`,
          period,
          action: 'Track which specific foods precede the best naps and offer them before sleep windows.',
          dataPoints: lovedNaps.length + otherNaps.length,
        })
      }
    }
  }

  return insights
}

// ─── Medication adherence ─────────────────────────────────────────────────────

function analyzeMedicationAdherence(meds: MedicationRow[], logs: MedicationLogRow[], period: number): Insight[] {
  const now = Date.now()
  const periodStart = now - period * 86_400_000

  const scheduled = meds.filter(m => m.active && m.frequency_hours && m.frequency_hours > 0)
  if (scheduled.length === 0) return []

  const results = scheduled.map(med => {
    const windowStart    = Math.max(periodStart, new Date(med.created_at).getTime())
    const hoursActive    = (now - windowStart) / 3_600_000
    const expectedDoses  = Math.floor(hoursActive / (med.frequency_hours as number))
    const actualDoses    = logs.filter(l => l.medication_id === med.id && new Date(l.taken_at).getTime() >= windowStart).length
    const pct = expectedDoses > 0 ? Math.round((actualDoses / expectedDoses) * 100) : null
    return { med, expectedDoses, actualDoses, pct }
  }).filter((r): r is typeof r & { pct: number } => r.pct !== null && r.expectedDoses >= 3)

  if (results.length === 0) return []

  const insights: Insight[] = []

  const worst = results.reduce((a, b) => (a.pct < b.pct ? a : b))
  if (worst.pct < 70) {
    insights.push({
      id: `med-adherence-low-${worst.med.id}`,
      category: 'medication',
      type: 'warning',
      icon: '💊',
      title: `${worst.pct}% adherence for ${worst.med.name}`,
      body: `${worst.actualDoses} of an expected ${worst.expectedDoses} doses logged over the past ${period} days.`,
      period,
      action: 'Try setting a reminder for this medication, or pair doses with an existing routine like meals or brushing teeth.',
      dataPoints: worst.expectedDoses,
    })
  }

  const best = results.reduce((a, b) => (a.pct > b.pct ? a : b))
  if (best.pct >= 90 && best.expectedDoses >= 5 && best.med.id !== worst.med.id) {
    insights.push({
      id: `med-adherence-good-${best.med.id}`,
      category: 'medication',
      type: 'positive',
      icon: '💊',
      title: `${best.pct}% adherence for ${best.med.name}`,
      body: `Strong consistency — ${best.actualDoses} of an expected ${best.expectedDoses} doses logged over the past ${period} days.`,
      period,
      dataPoints: best.expectedDoses,
    })
  }

  return insights
}

// ─── Period return / cycle patterns ───────────────────────────────────────────

function analyzePeriodPatterns(periodLogs: PeriodLogRow[], moodLogs: MomMoodLogRow[], period: number): Insight[] {
  if (periodLogs.length === 0) return []

  const insights: Insight[] = []
  const cycle = computeCycleStats(periodLogs)
  if (cycle.periodStarts.length === 0) return []

  // Milestone: first period detected within the display window
  if (cycle.periodStarts.length === 1) {
    const daysSinceReturn = Math.round((Date.now() - new Date(cycle.periodStarts[0]).getTime()) / 86_400_000)
    if (daysSinceReturn <= period) {
      insights.push({
        id: 'period-returned',
        category: 'period',
        type: 'info',
        icon: '🩸',
        title: 'Your period has returned',
        body: `First postpartum flow logged on ${new Date(cycle.periodStarts[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. Cycle length and predictions will appear once a second period is logged.`,
        period,
        dataPoints: 1,
      })
    }
  }

  // Prediction
  if (cycle.avgCycleLength && cycle.predictedNextStart) {
    insights.push({
      id: 'period-prediction',
      category: 'period',
      type: 'info',
      icon: '🩸',
      title: `Next period expected around ${new Date(cycle.predictedNextStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      body: `Based on an average cycle of ${cycle.avgCycleLength} days across ${cycle.periodStarts.length} tracked cycles.`,
      period,
      dataPoints: cycle.periodStarts.length,
    })
  }

  // Irregularity
  if (cycle.cycleLengths.length >= 2) {
    const sd = stddev(cycle.cycleLengths)
    if (sd >= 5) {
      insights.push({
        id: 'period-irregular',
        category: 'period',
        type: 'tip',
        icon: '🔄',
        title: 'Your cycles have been irregular so far',
        body: `Cycle length has varied by about ${Math.round(sd)} days (average ${cycle.avgCycleLength} days). This is common in the first year postpartum, especially while breastfeeding.`,
        period,
        dataPoints: cycle.cycleLengths.length,
      })
    }
  }

  // Mood correlation on flow days vs other days
  const flowDates = new Set(periodLogs.filter(isFlowDay).map(l => l.logged_date))
  if (flowDates.size >= 3 && moodLogs.length >= 5) {
    const moodByDay = new Map<string, number[]>()
    for (const m of moodLogs) {
      const arr = moodByDay.get(m.logged_date) ?? []
      arr.push(m.mood_score)
      moodByDay.set(m.logged_date, arr)
    }
    const flowMoods: number[] = []
    const otherMoods: number[] = []
    for (const [date, scores] of moodByDay) {
      const dayAvg = avg(scores)
      if (flowDates.has(date)) flowMoods.push(dayAvg)
      else otherMoods.push(dayAvg)
    }
    if (flowMoods.length >= 3 && otherMoods.length >= 3) {
      const flowAvg  = avg(flowMoods)
      const otherAvg = avg(otherMoods)
      if (otherAvg - flowAvg >= 0.5) {
        insights.push({
          id: 'period-mood-dip',
          category: 'period',
          type: 'info',
          icon: '💭',
          title: 'Mood tends to dip during your period',
          body: `Average mood is ${(otherAvg - flowAvg).toFixed(1)} points lower on a 5-point scale on flow days (${flowAvg.toFixed(1)}) vs other days (${otherAvg.toFixed(1)}).`,
          period,
          action: 'This is common hormonally. Plan lighter days when possible, and mention the pattern to your provider if it feels severe.',
          dataPoints: flowMoods.length + otherMoods.length,
        })
      }
    }
  }

  return insights
}

// ─── Movement patterns ────────────────────────────────────────────────────────

const MOVEMENT_WEEKLY_GOAL_MIN = 150 // ACOG postpartum guidance

function analyzeMovementPatterns(movementLogs: MovementLogRow[], moodLogs: MomMoodLogRow[], period: number): Insight[] {
  if (movementLogs.length === 0) return []

  const insights: Insight[] = []
  const now   = Date.now()
  const week  = 7 * 86_400_000

  const thisWeek  = movementLogs.filter(l => now - new Date(l.logged_at).getTime() < week)
  const priorWeek = movementLogs.filter(l => { const t = now - new Date(l.logged_at).getTime(); return t >= week && t < 2 * week })

  const thisWeekMins  = thisWeek.reduce((s, l) => s + (l.duration_minutes ?? 0), 0)
  const priorWeekMins = priorWeek.reduce((s, l) => s + (l.duration_minutes ?? 0), 0)

  if (thisWeekMins >= MOVEMENT_WEEKLY_GOAL_MIN) {
    insights.push({
      id: 'movement-goal-hit',
      category: 'movement',
      type: 'positive',
      icon: '🎉',
      title: 'Weekly movement goal hit',
      body: `${thisWeekMins} minutes logged this week — at or above the ~${MOVEMENT_WEEKLY_GOAL_MIN} min/week postpartum activity guideline.`,
      period,
      dataPoints: thisWeek.length,
    })
  } else if (thisWeekMins > 0 || priorWeekMins > 0) {
    const diff = thisWeekMins - priorWeekMins
    if (Math.abs(diff) >= 20) {
      insights.push({
        id: 'movement-trend',
        category: 'movement',
        type: diff > 0 ? 'positive' : 'info',
        icon: diff > 0 ? '📈' : '📉',
        title: diff > 0 ? 'Movement is up this week' : 'Movement is down this week',
        body: `${thisWeekMins} min logged this week vs ${priorWeekMins} min last week.`,
        period,
        action: diff < 0 ? 'Even a short walk counts — small, frequent movement adds up postpartum.' : undefined,
        dataPoints: thisWeek.length + priorWeek.length,
      })
    }
  }

  // Movement/mood correlation: mood on active days vs inactive days
  const activeDates = new Set(movementLogs.map(l => l.logged_at.slice(0, 10)))
  if (activeDates.size >= 3 && moodLogs.length >= 5) {
    const moodByDay = new Map<string, number[]>()
    for (const m of moodLogs) {
      const arr = moodByDay.get(m.logged_date) ?? []
      arr.push(m.mood_score)
      moodByDay.set(m.logged_date, arr)
    }
    const activeMoods: number[] = []
    const inactiveMoods: number[] = []
    for (const [date, scores] of moodByDay) {
      const dayAvg = avg(scores)
      if (activeDates.has(date)) activeMoods.push(dayAvg)
      else inactiveMoods.push(dayAvg)
    }
    if (activeMoods.length >= 3 && inactiveMoods.length >= 3) {
      const activeAvg   = avg(activeMoods)
      const inactiveAvg = avg(inactiveMoods)
      if (activeAvg - inactiveAvg >= 0.4) {
        insights.push({
          id: 'movement-mood-link',
          category: 'movement',
          type: 'positive',
          icon: '💚',
          title: 'Movement is linked to better mood',
          body: `Average mood is ${(activeAvg - inactiveAvg).toFixed(1)} points higher on a 5-point scale on days with logged movement (${activeAvg.toFixed(1)}) vs days without (${inactiveAvg.toFixed(1)}).`,
          period,
          action: 'Even short sessions seem to help — keep it up when you can.',
          dataPoints: activeMoods.length + inactiveMoods.length,
        })
      }
    }
  }

  return insights
}

// ─── Growth trend ─────────────────────────────────────────────────────────────

interface PercentileMetricConfig {
  key: 'weight_lbs' | 'height_in'
  label: string
  unit: string
  toWho: (v: number) => number       // convert stored unit -> WHO table unit (kg/cm)
  whoTable: Record<GenderKey, { m: number[]; sd: number[] }>
}

const WEIGHT_METRIC: PercentileMetricConfig = { key: 'weight_lbs', label: 'Weight', unit: 'lbs', toWho: lbsToKg, whoTable: WHO_WEIGHT }
const HEIGHT_METRIC: PercentileMetricConfig = { key: 'height_in', label: 'Height', unit: 'in', toWho: inToCm, whoTable: WHO_HEIGHT }

function detectPercentileShift(
  logs: GrowthLogRow[],
  birthDateIso: string,
  gender: GenderKey,
  metric: PercentileMetricConfig,
  period: number,
): Insight[] {
  const withMetric = logs
    .filter(l => l[metric.key] != null)
    .filter(l => ageInMonthsAt(birthDateIso, l.date) <= 24) // WHO tables only cover 0–24mo
    .sort((a, b) => a.date.localeCompare(b.date))
  if (withMetric.length < 2) return []

  const first = withMetric[0]
  const last  = withMetric[withMetric.length - 1]
  if (first.date === last.date) return []

  const firstPct = calcPercentile(metric.toWho(first[metric.key]!), ageInMonthsAt(birthDateIso, first.date), metric.whoTable[gender])
  const lastPct  = calcPercentile(metric.toWho(last[metric.key]!),  ageInMonthsAt(birthDateIso, last.date),  metric.whoTable[gender])
  const diff = lastPct - firstPct
  if (Math.abs(diff) < 15) return []

  const nowConcerning = lastPct <= 10 || lastPct >= 90
  return [{
    id: `growth-percentile-${metric.key}`,
    category: 'growth',
    type: nowConcerning ? 'warning' : 'info',
    icon: '📈',
    title: `${metric.label} percentile shifted from ${firstPct}th to ${lastPct}th`,
    body: `Based on measurements from ${first.date} and ${last.date}.`,
    period,
    action: nowConcerning ? 'Mention this shift to your pediatrician at the next visit.' : undefined,
    dataPoints: withMetric.length,
  }]
}

function detectWeightStall(logs: GrowthLogRow[], period: number): Insight[] {
  const withWeight = logs
    .filter(l => l.weight_lbs != null)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (withWeight.length < 2) return []

  const last = withWeight[withWeight.length - 1]
  const prev = withWeight[withWeight.length - 2]
  const daysBetween = Math.round((new Date(last.date).getTime() - new Date(prev.date).getTime()) / 86_400_000)
  if (daysBetween < 14) return [] // too close together to mean anything

  const gainLbs = last.weight_lbs! - prev.weight_lbs!
  if (gainLbs > 0) return []

  return [{
    id: 'growth-weight-stall',
    category: 'growth',
    type: 'warning',
    icon: '⚠️',
    title: gainLbs < 0 ? 'Weight loss since last measurement' : 'No weight gain since last measurement',
    body: `${prev.date} to ${last.date} (${daysBetween} days): ${gainLbs < 0 ? `down ${Math.abs(gainLbs).toFixed(1)} lbs` : 'no change'}.`,
    period,
    action: 'Bring this up with your pediatrician, especially if it continues at the next check.',
    dataPoints: withWeight.length,
  }]
}

function analyzeGrowthTrend(logs: GrowthLogRow[], birthDateIso: string | null, gender: GenderKey, period: number): Insight[] {
  if (!birthDateIso || logs.length < 2) return []
  return [
    ...detectPercentileShift(logs, birthDateIso, gender, WEIGHT_METRIC, period),
    ...detectPercentileShift(logs, birthDateIso, gender, HEIGHT_METRIC, period),
    ...detectWeightStall(logs, period),
  ]
}

// ─── Allergen patterns ────────────────────────────────────────────────────────

function analyzeAllergenPatterns(records: AllergenRecordRow[], period: number): Insight[] {
  if (records.length === 0) return []

  const insights: Insight[] = []
  const now = Date.now()
  const day = 86_400_000

  // Reintroduction reminder: safe foods not given in 14+ days.
  const introduced = records.filter(r => r.status === 'introduced')
  const staleIntros = introduced
    .map(r => ({ r, lastAt: r.last_given_at ?? r.date_introduced }))
    .filter((x): x is { r: AllergenRecordRow; lastAt: string } => !!x.lastAt)
    .map(x => ({ ...x, daysSince: Math.floor((now - new Date(x.lastAt).getTime()) / day) }))
    .filter(x => x.daysSince >= 14)
    .sort((a, b) => b.daysSince - a.daysSince)

  if (staleIntros.length > 0) {
    const top = staleIntros[0]
    insights.push({
      id: `allergen-reintroduce-${top.r.allergen_id}`,
      category: 'allergen',
      type: 'tip',
      icon: '🔄',
      title: `Time to reintroduce ${top.r.allergen_name}?`,
      body: `It's been ${top.daysSince} days since ${top.r.allergen_name} was last given. Regular exposure helps maintain tolerance once a food is safe.${staleIntros.length > 1 ? ` ${staleIntros.length - 1} other food${staleIntros.length > 2 ? 's are' : ' is'} also overdue for a repeat.` : ''}`,
      period,
      dataPoints: staleIntros.length,
    })
  }

  // Stalled Big-9 introduction pace: no new allergen introduced recently, others still not tried.
  const notTried = records.filter(r => r.status === 'not_tried')
  const anyIntroduced = records.filter(r => r.date_introduced)
  if (notTried.length > 0 && anyIntroduced.length > 0) {
    const lastIntroDate = anyIntroduced
      .map(r => new Date(r.date_introduced!).getTime())
      .reduce((a, b) => Math.max(a, b), 0)
    const daysSinceLastIntro = Math.floor((now - lastIntroDate) / day)
    if (daysSinceLastIntro > 7) {
      insights.push({
        id: 'allergen-intro-pace',
        category: 'allergen',
        type: 'tip',
        icon: '🌱',
        title: `No new allergen introduced in ${daysSinceLastIntro} days`,
        body: `${notTried.length} allergen${notTried.length !== 1 ? 's' : ''} still haven't been tried. Introducing one every 3–5 days is the typical pace during the intro window.`,
        period,
        dataPoints: notTried.length,
      })
    }
  }

  return insights
}

// ─── Cross-tracker correlation ────────────────────────────────────────────────

function analyzeCorrelations(sleepLogs: SleepRow[], feedLogs: FeedRow[], period: number): Insight[] {
  const completed = sleepLogs.filter(l => l.duration_minutes && l.end_time)
  if (completed.length < 5 || feedLogs.length < 5) return []

  const insights: Insight[] = []

  const naps = completed
    .filter(l => l.sleep_type === 'nap')
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  const breastNaps: number[] = []
  const bottleNaps: number[] = []

  for (const nap of naps) {
    const napStart  = new Date(nap.start_time).getTime()
    const preceding = feedLogs
      .filter(f => { const t = new Date(f.logged_at).getTime(); return t < napStart && napStart - t < 90 * 60_000 })
      .sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime())[0]
    if (preceding && nap.duration_minutes) {
      if (preceding.feed_type === 'breast') breastNaps.push(nap.duration_minutes)
      else if (preceding.feed_type === 'bottle') bottleNaps.push(nap.duration_minutes)
    }
  }

  if (breastNaps.length >= 3 && bottleNaps.length >= 3) {
    const breastAvg = avg(breastNaps)
    const bottleAvg = avg(bottleNaps)
    const diff = Math.abs(breastAvg - bottleAvg)
    if (diff > 15) {
      const longer      = breastAvg > bottleAvg ? 'breastfeeding' : 'bottle feeds'
      const longerAvg   = Math.max(breastAvg, bottleAvg)
      const shorterLabel= breastAvg > bottleAvg ? 'bottle feeds' : 'breastfeeding'
      const shorterAvg  = Math.min(breastAvg, bottleAvg)
      insights.push({
        id: 'corr-feed-nap',
        category: 'sleep',
        type: 'tip',
        icon: '🔗',
        title: `Longer naps after ${longer}`,
        body: `Naps average ${minsToLabel(longerAvg)} after ${longer} vs ${minsToLabel(shorterAvg)} after ${shorterLabel}.`,
        period,
        action: `Try scheduling the ${longer} session about 20–30 min before nap time for potentially longer rest.`,
        dataPoints: breastNaps.length + bottleNaps.length,
      })
    }
  }

  return insights
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateInsights(
  babyId: string,
  period: 14 | 30 = 14,
  userId: string | null = null,
): Promise<InsightsResult> {
  const cacheKey = `${babyId}-${period}-${userId ?? ''}`
  const cached   = cache.get(cacheKey)
  if (cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) return cached

  const since = new Date()
  since.setDate(since.getDate() - period)
  const sinceIso = since.toISOString()

  // Cycle detection needs more history than the 14/30-day display window to span 2+ periods.
  const cycleSince = new Date()
  cycleSince.setDate(cycleSince.getDate() - 180)
  const cycleSinceStr = cycleSince.toISOString().slice(0, 10)

  const [sleepRes, feedRes, diaperRes, foodRes, babyRes, medsRes, medLogsRes, periodRes, momMoodRes, movementRes, growthRes, allergenRes] = await Promise.all([
    supabase
      .from('sleep_logs')
      .select('id, sleep_type, start_time, end_time, duration_minutes, quality')
      .eq('baby_id', babyId)
      .gte('start_time', sinceIso)
      .order('start_time', { ascending: true }),
    supabase
      .from('feeds')
      .select('id, feed_type, logged_at, mood, duration_seconds, bottle_amount_oz')
      .eq('baby_id', babyId)
      .gte('logged_at', sinceIso)
      .order('logged_at', { ascending: true }),
    supabase
      .from('diaper_logs')
      .select('id, diaper_type, diaper_consist, logged_at')
      .eq('baby_id', babyId)
      .gte('logged_at', sinceIso)
      .order('logged_at', { ascending: true }),
    supabase
      .from('baby_food_logs')
      .select('id, brand, flavor, rating, bad_reaction, tried_at, is_first_introduction')
      .eq('baby_id', babyId)
      .gte('tried_at', sinceIso)
      .order('tried_at', { ascending: false }),
    supabase
      .from('babies')
      .select('birth_date, gender')
      .eq('id', babyId)
      .maybeSingle(),
    userId
      ? supabase.from('medications').select('id, name, frequency_hours, active, created_at').eq('user_id', userId).eq('active', true)
      : Promise.resolve({ data: [] as MedicationRow[] }),
    userId
      ? supabase.from('medication_logs').select('id, medication_id, taken_at').eq('user_id', userId).gte('taken_at', sinceIso)
      : Promise.resolve({ data: [] as MedicationLogRow[] }),
    userId
      ? supabase.from('mom_period_logs').select('id, logged_date, flow_level').eq('user_id', userId).gte('logged_date', cycleSinceStr)
      : Promise.resolve({ data: [] as PeriodLogRow[] }),
    userId
      ? supabase.from('mom_mood_logs').select('id, logged_date, mood_score').eq('user_id', userId).gte('logged_date', cycleSinceStr)
      : Promise.resolve({ data: [] as MomMoodLogRow[] }),
    userId
      ? supabase.from('mom_movement_logs').select('id, logged_at, duration_minutes').eq('user_id', userId).gte('logged_at', cycleSince.toISOString())
      : Promise.resolve({ data: [] as MovementLogRow[] }),
    // Growth check-ups are typically monthly — use the same longer window as cycle detection.
    supabase.from('growth_logs').select('id, date, weight_lbs, height_in').eq('baby_id', babyId).gte('date', cycleSinceStr),
    supabase.from('allergen_records').select('allergen_id, allergen_name, status, date_introduced, last_given_at').eq('baby_id', babyId),
  ])

  const sleepLogs    = (sleepRes.data  ?? []) as SleepRow[]
  const feedLogs     = (feedRes.data   ?? []) as FeedRow[]
  const diaperLogs   = (diaperRes.data ?? []) as DiaperRow[]
  const foodLogs     = (foodRes.data   ?? []) as FoodRow[]
  const birthDateIso = (babyRes.data as any)?.birth_date ?? null
  const babyGender: GenderKey = (babyRes.data as any)?.gender?.toLowerCase() === 'girl' ? 'girl' : 'boy'
  const medications  = (medsRes.data    ?? []) as MedicationRow[]
  const medLogs      = (medLogsRes.data ?? []) as MedicationLogRow[]
  const periodLogs   = (periodRes.data  ?? []) as PeriodLogRow[]
  const momMoodLogs  = (momMoodRes.data ?? []) as MomMoodLogRow[]
  const movementLogs = (movementRes.data ?? []) as MovementLogRow[]
  const growthLogs   = (growthRes.data  ?? []) as GrowthLogRow[]
  const allergenRecords = (allergenRes.data ?? []) as AllergenRecordRow[]

  const all: Insight[] = [
    ...analyzeSleep(sleepLogs, period),
    ...analyzeFeeding(feedLogs, period),
    ...analyzeDiapers(diaperLogs, period),
    ...analyzeCorrelations(sleepLogs, feedLogs, period),
    ...analyzeFood(foodLogs, sleepLogs, period, birthDateIso),
    // New cross-tracker detectors
    ...detectGrowthSpurt(feedLogs, sleepLogs),
    ...detectSleepRegression(sleepLogs, birthDateIso),
    ...analyzeFeedToNapTiming(feedLogs, sleepLogs, period),
    ...analyzeNightFeedTrend(feedLogs, period),
    ...detectPositiveStreak(sleepLogs, period),
    ...detectDehydration(diaperLogs, period),
    ...detectFoodDiaperReaction(foodLogs, diaperLogs, period),
    ...analyzeMedicationAdherence(medications, medLogs, period),
    ...analyzePeriodPatterns(periodLogs, momMoodLogs, period),
    ...analyzeMovementPatterns(movementLogs, momMoodLogs, period),
    ...analyzeGrowthTrend(growthLogs, birthDateIso, babyGender, period),
    ...analyzeAllergenPatterns(allergenRecords, period),
  ]

  // Sort: warnings → positive → tip → info
  const order: InsightType[] = ['warning', 'positive', 'tip', 'info']
  all.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))

  const result: InsightsResult = {
    insights: all,
    generatedAt: Date.now(),
    dataPoints: {
      sleepSessions: sleepLogs.length,
      feeds:         feedLogs.length,
      diapers:       diaperLogs.length,
      foodLogs:      foodLogs.length,
      medications:   medications.length,
      periodLogs:    periodLogs.length,
      movementLogs:  movementLogs.length,
      growthLogs:    growthLogs.length,
      allergenRecords: allergenRecords.length,
    },
  }

  cache.set(cacheKey, result)
  return result
}
