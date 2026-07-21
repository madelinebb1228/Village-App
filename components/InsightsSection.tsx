import AsyncStorage from '@react-native-async-storage/async-storage'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Colors, useColors } from '../lib/theme'
import { generateInsights, InsightType, InsightsResult, invalidateInsightsCache } from '../lib/insightsEngine'

type Period = 14 | 30

const DISMISS_KEY  = '@insights_dismissed_v1'
const DISMISS_TTL  = 48 * 60 * 60 * 1000  // 48 hours

const TYPE_META: Record<InsightType, { label: string; getColors: (c: Colors) => { bg: string; border: string; text: string } }> = {
  positive: { label: 'Great',    getColors: c => ({ bg: c.cardSage,     border: c.sage,     text: c.sage     }) },
  info:     { label: 'Info',     getColors: c => ({ bg: c.cardLavender, border: c.lavender, text: c.lavender }) },
  warning:  { label: 'Heads up', getColors: c => ({ bg: c.cardHoney,    border: c.honey,    text: c.honey    }) },
  tip:      { label: 'Tip',      getColors: c => ({ bg: c.cardBlush,    border: c.blush,    text: c.blush    }) },
}

export default function InsightsSection({
  babyId,
  refreshKey,
}: {
  babyId: string | null
  refreshKey: number
}) {
  const c = useColors()
  const s = useMemo(() => makeStyles(c), [c])

  const [result, setResult]       = useState<InsightsResult | null>(null)
  const [loading, setLoading]     = useState(false)
  const [period, setPeriod]       = useState<Period>(14)
  const [dismissed, setDismissed] = useState<Record<string, number>>({})
  const prevKey = useRef(refreshKey)

  // Load dismiss map on mount
  useEffect(() => {
    AsyncStorage.getItem(DISMISS_KEY).then(raw => {
      if (!raw) return
      try {
        const parsed: Record<string, number> = JSON.parse(raw)
        const now = Date.now()
        const pruned = Object.fromEntries(
          Object.entries(parsed).filter(([, ts]) => now - ts < DISMISS_TTL),
        )
        setDismissed(pruned)
        if (Object.keys(pruned).length !== Object.keys(parsed).length) {
          AsyncStorage.setItem(DISMISS_KEY, JSON.stringify(pruned))
        }
      } catch { /* ignore */ }
    })
  }, [])

  const dismiss = useCallback(async (id: string) => {
    const next = { ...dismissed, [id]: Date.now() }
    setDismissed(next)
    await AsyncStorage.setItem(DISMISS_KEY, JSON.stringify(next))
  }, [dismissed])

  const load = useCallback(async () => {
    if (!babyId) return
    setLoading(true)
    try {
      const data = await generateInsights(babyId, period)
      setResult(data)
    } catch (err) {
      console.error('[InsightsSection]', err)
    } finally {
      setLoading(false)
    }
  }, [babyId, period])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (refreshKey !== prevKey.current) {
      prevKey.current = refreshKey
      if (babyId) {
        invalidateInsightsCache(babyId)
        load()
      }
    }
  }, [refreshKey, babyId, load])

  const now = Date.now()
  const visibleInsights = useMemo(
    () => result?.insights.filter(i => !dismissed[i.id] || now - dismissed[i.id] >= DISMISS_TTL) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, dismissed],
  )

  if (!babyId) return null

  return (
    <View style={s.card}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.headerEmoji}>✨</Text>
          <Text style={s.headerTitle}>Patterns & Insights</Text>
        </View>
        <View style={s.periodRow}>
          {([14, 30] as Period[]).map(p => (
            <TouchableOpacity
              key={p}
              style={[s.periodBtn, period === p && s.periodBtnActive]}
              onPress={() => setPeriod(p)}
              activeOpacity={0.75}
            >
              <Text style={[s.periodText, period === p && s.periodTextActive]}>{p}d</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Data summary row */}
      {result && (
        <Text style={s.summary}>
          {result.dataPoints.sleepSessions} sleep · {result.dataPoints.feeds} feeds · {result.dataPoints.diapers} diapers · {result.dataPoints.foodLogs} foods
        </Text>
      )}

      {/* Loading */}
      {loading && (
        <ActivityIndicator color={c.lavender} style={{ marginVertical: 24 }} />
      )}

      {/* Empty state */}
      {!loading && result && visibleInsights.length === 0 && (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📊</Text>
          <Text style={s.emptyTitle}>Not enough data yet</Text>
          <Text style={s.emptyBody}>
            Keep logging feeds, sleep, and diapers. Pattern insights appear after a few days of tracking.
          </Text>
        </View>
      )}

      {/* Insight cards */}
      {!loading && visibleInsights.map((insight, i) => {
        const meta = TYPE_META[insight.type]
        const col  = meta.getColors(c)
        return (
          <View
            key={insight.id}
            style={[
              s.insightRow,
              { borderLeftColor: col.border },
              i > 0 && s.insightBorder,
            ]}
          >
            <View style={[s.iconBox, { backgroundColor: col.bg }]}>
              <Text style={s.iconText}>{insight.icon}</Text>
            </View>
            <View style={s.insightBody}>
              <View style={s.titleRow}>
                <Text style={s.insightTitle} numberOfLines={2}>{insight.title}</Text>
                <View style={s.titleRight}>
                  <View style={[s.badge, { backgroundColor: col.bg }]}>
                    <Text style={[s.badgeText, { color: col.text }]}>{meta.label}</Text>
                  </View>
                  <TouchableOpacity
                    style={s.dismissBtn}
                    onPress={() => dismiss(insight.id)}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    activeOpacity={0.6}
                  >
                    <Text style={s.dismissText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={s.insightDesc}>{insight.body}</Text>
              {insight.action && (
                <View style={s.actionBox}>
                  <Text style={s.actionLabel}>What to try: </Text>
                  <Text style={s.actionText}>{insight.action}</Text>
                </View>
              )}
              {insight.dataPoints !== undefined && (
                <Text style={s.dataPoints}>Based on {insight.dataPoints} data point{insight.dataPoints !== 1 ? 's' : ''}</Text>
              )}
            </View>
          </View>
        )
      })}

      {/* Footer */}
      {!loading && result && visibleInsights.length > 0 && (
        <Text style={s.footer}>Last updated: {new Date(result.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      )}
    </View>
  )
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 20,
      marginHorizontal: 16,
      marginBottom: 20,
      borderWidth: 1.5,
      borderColor: c.separator,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerEmoji: {
      fontSize: 22,
      marginRight: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.textPrimary,
    },
    periodRow: {
      flexDirection: 'row',
      gap: 4,
    },
    periodBtn: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: c.inputBg,
    },
    periodBtnActive: {
      backgroundColor: c.cardLavender,
    },
    periodText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textMuted,
    },
    periodTextActive: {
      color: c.lavender,
    },
    summary: {
      fontSize: 12,
      color: c.textMuted,
      marginBottom: 14,
    },
    empty: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    emptyIcon: {
      fontSize: 36,
      marginBottom: 8,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: 4,
    },
    emptyBody: {
      fontSize: 13,
      color: c.textMuted,
      textAlign: 'center',
      lineHeight: 18,
    },
    insightRow: {
      flexDirection: 'row',
      gap: 10,
      paddingVertical: 12,
      borderLeftWidth: 3,
      paddingLeft: 12,
      marginLeft: -4,
    },
    insightBorder: {
      borderTopWidth: 1,
      borderTopColor: c.separator,
    },
    iconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    iconText: {
      fontSize: 16,
    },
    insightBody: {
      flex: 1,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      marginBottom: 3,
    },
    insightTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textPrimary,
      flex: 1,
    },
    titleRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexShrink: 0,
    },
    badge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    badgeText: {
      fontSize: 10,
      fontWeight: '700',
    },
    dismissBtn: {
      paddingHorizontal: 4,
      paddingVertical: 2,
    },
    dismissText: {
      fontSize: 11,
      color: c.textMuted,
      fontWeight: '600',
    },
    insightDesc: {
      fontSize: 12,
      color: c.textMuted,
      lineHeight: 17,
    },
    actionBox: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 6,
      backgroundColor: c.inputBg,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    actionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: c.textSecondary,
    },
    actionText: {
      fontSize: 11,
      color: c.textSecondary,
      lineHeight: 16,
      flex: 1,
    },
    dataPoints: {
      fontSize: 10,
      color: c.textMuted,
      marginTop: 4,
      fontStyle: 'italic',
    },
    footer: {
      fontSize: 11,
      color: c.textMuted,
      marginTop: 10,
      textAlign: 'right',
    },
  })
}
