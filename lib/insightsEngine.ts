import { supabase } from './supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type InsightCategory = 'sleep' | 'feeding' | 'diaper'
export type InsightType = 'positive' | 'info' | 'warning' | 'tip'

export interface Insight {
  id: string
  category: InsightCategory
  type: InsightType
  icon: string
  title: string
  body: string
  period: number
}

export interface InsightsResult {
  insights: Insight[]
  generatedAt: number
  dataPoints: { sleepSessions: number; feeds: number; diapers: number }
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
  logged_at: string
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
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

// ─── Sleep analysis ───────────────────────────────────────────────────────────

function analyzeSleep(logs: SleepRow[], period: number): Insight[] {
  const completed = logs.filter(l => l.duration_minutes != null && l.end_time != null)
  if (completed.length < 3) return []

  const insights: Insight[] = []

  // Group by day
  const byDay = new Map<string, SleepRow[]>()
  for (const log of completed) {
    const k = dayKey(log.start_time)
    const arr = byDay.get(k) ?? []
    arr.push(log)
    byDay.set(k, arr)
  }
  const days = [...byDay.keys()].sort()
  if (days.length < 3) return []

  const totalByDay    = days.map(d => byDay.get(d)!.reduce((s, l) => s + (l.duration_minutes ?? 0), 0))
  const napCountByDay = days.map(d => byDay.get(d)!.filter(l => l.sleep_type === 'nap').length)
  const nightCountByDay = days.map(d => byDay.get(d)!.filter(l => l.sleep_type === 'night').length)

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
            : `On days with fewer naps, total sleep tends to run ${minsToLabel(Math.abs(diff))} higher (${minsToLabel(lowAvg)} vs ${minsToLabel(highAvg)}).`,
          period,
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
    })
  }

  // Night waking anomaly: if today has significantly more than average
  const todayKey = dayKey(new Date().toISOString())
  const todayIdx = days.indexOf(todayKey)
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
        })
      }
    }
  }

  // Best night sleep start time (mode hour of long night sessions)
  const longNights = completed.filter(l => l.sleep_type === 'night' && (l.duration_minutes ?? 0) > 120)
  if (longNights.length >= 4) {
    const pool = longNights.filter(l => l.quality === 'great' || l.quality === 'good')
    const source = pool.length >= 3 ? pool : longNights
    const hours = source.map(l => hourOf(l.start_time))
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

  // Average feeds per day
  insights.push({
    id: 'feed-avg',
    category: 'feeding',
    type: 'info',
    icon: '🍼',
    title: `Averaging ${overallAvg.toFixed(1)} feeds per day`,
    body: `Based on ${logs.length} total feeds across ${days.length} days.`,
    period,
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
      })
    }
  }

  // Cluster feeding detection: 3+ feeds in a 3-hour window
  const clusterHours: number[] = []
  for (const [, dayFeeds] of byDay.entries()) {
    const sorted = [...dayFeeds].sort(
      (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime(),
    )
    let bestCount = 0
    let bestStartHour = -1
    for (let i = 0; i < sorted.length; i++) {
      const wStart = new Date(sorted[i].logged_at).getTime()
      const wEnd   = wStart + 3 * 60 * 60 * 1000
      const inWin  = sorted.filter(f => {
        const t = new Date(f.logged_at).getTime()
        return t >= wStart && t <= wEnd
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
    const peakHour = parseInt(
      Object.entries(hourFreq).sort((a, b) => b[1] - a[1])[0][0],
    )
    insights.push({
      id: 'feed-cluster',
      category: 'feeding',
      type: 'info',
      icon: '🍼',
      title: 'Cluster feeding pattern detected',
      body: `3+ feeds in a 3-hour window around ${fmtHour(peakHour)}–${fmtHour(peakHour + 3)} on ${clusterHours.length} days. This is normal, especially during growth spurts.`,
      period,
    })
  }

  // Average feed interval (within-day gaps, 15min–6h only)
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
    })
  }

  // Fussy mood pattern
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
        body: `${fussyCount} of ${ratedFeeds.length} feeds. This may signal a feeding difficulty, gas, growth spurt, or developmental leap.`,
        period,
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
  const sd         = stddev(countByDay)

  insights.push({
    id: 'diaper-avg',
    category: 'diaper',
    type: 'info',
    icon: '🩲',
    title: `${meanCount.toFixed(1)} diaper changes per day`,
    body: `Your ${period}-day average across ${days.length} tracked days.`,
    period,
  })

  // Anomaly: today unusually low
  const todayKey   = dayKey(new Date().toISOString())
  const todayCount = byDay.get(todayKey)?.length ?? 0
  if (byDay.has(todayKey) && days.length >= 5 && todayCount < meanCount - sd - 1 && todayCount < 4) {
    insights.push({
      id: 'diaper-low',
      category: 'diaper',
      type: 'warning',
      icon: '⚠️',
      title: 'Fewer diapers than usual today',
      body: `Only ${todayCount} change${todayCount !== 1 ? 's' : ''} so far today vs your avg of ${meanCount.toFixed(1)}/day. Low wet diapers can indicate dehydration.`,
      period,
    })
  }

  return insights
}

// ─── Cross-tracker correlation ────────────────────────────────────────────────

function analyzeCorrelations(sleepLogs: SleepRow[], feedLogs: FeedRow[], period: number): Insight[] {
  const completed = sleepLogs.filter(l => l.duration_minutes && l.end_time)
  if (completed.length < 5 || feedLogs.length < 5) return []

  const insights: Insight[] = []

  // Does breastfeeding vs bottle affect nap duration?
  const naps = completed
    .filter(l => l.sleep_type === 'nap')
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  const breastNaps: number[] = []
  const bottleNaps: number[] = []

  for (const nap of naps) {
    const napStart = new Date(nap.start_time).getTime()
    const preceding = feedLogs
      .filter(f => {
        const t = new Date(f.logged_at).getTime()
        return t < napStart && napStart - t < 90 * 60_000
      })
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
      const shorterLabel = breastAvg > bottleAvg ? 'bottle feeds' : 'breastfeeding'
      const shorterAvg  = Math.min(breastAvg, bottleAvg)
      insights.push({
        id: 'corr-feed-nap',
        category: 'sleep',
        type: 'tip',
        icon: '🔗',
        title: `Longer naps after ${longer}`,
        body: `Naps average ${minsToLabel(longerAvg)} after ${longer} vs ${minsToLabel(shorterAvg)} after ${shorterLabel}.`,
        period,
      })
    }
  }

  return insights
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateInsights(
  babyId: string,
  period: 14 | 30 = 14,
): Promise<InsightsResult> {
  const cacheKey = `${babyId}-${period}`
  const cached   = cache.get(cacheKey)
  if (cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) return cached

  const since = new Date()
  since.setDate(since.getDate() - period)
  const sinceIso = since.toISOString()

  const [sleepRes, feedRes, diaperRes] = await Promise.all([
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
      .select('id, diaper_type, logged_at')
      .eq('baby_id', babyId)
      .gte('logged_at', sinceIso)
      .order('logged_at', { ascending: true }),
  ])

  const sleepLogs  = (sleepRes.data  ?? []) as SleepRow[]
  const feedLogs   = (feedRes.data   ?? []) as FeedRow[]
  const diaperLogs = (diaperRes.data ?? []) as DiaperRow[]

  const all: Insight[] = [
    ...analyzeSleep(sleepLogs, period),
    ...analyzeFeeding(feedLogs, period),
    ...analyzeDiapers(diaperLogs, period),
    ...analyzeCorrelations(sleepLogs, feedLogs, period),
  ]

  // Sort priority: warnings → positive → tip → info
  const order: InsightType[] = ['warning', 'positive', 'tip', 'info']
  all.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))

  const result: InsightsResult = {
    insights: all,
    generatedAt: Date.now(),
    dataPoints: {
      sleepSessions: sleepLogs.length,
      feeds: feedLogs.length,
      diapers: diaperLogs.length,
    },
  }

  cache.set(cacheKey, result)
  return result
}
