import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Colors, useColors } from '../lib/theme'
import { generateInsights, InsightType, InsightsResult, invalidateInsightsCache } from '../lib/insightsEngine'

type Period = 14 | 30

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

  const [result, setResult]   = useState<InsightsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [period, setPeriod]   = useState<Period>(14)
  const prevKey = useRef(refreshKey)

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

  // Invalidate cache and reload when new tracking data is saved
  useEffect(() => {
    if (refreshKey !== prevKey.current) {
      prevKey.current = refreshKey
      if (babyId) {
        invalidateInsightsCache(babyId)
        load()
      }
    }
  }, [refreshKey, babyId, load])

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
          {result.dataPoints.sleepSessions} sleep sessions · {result.dataPoints.feeds} feeds · {result.dataPoints.diapers} diapers
        </Text>
      )}

      {/* Loading */}
      {loading && (
        <ActivityIndicator color={c.lavender} style={{ marginVertical: 24 }} />
      )}

      {/* Empty state */}
      {!loading && result && result.insights.length === 0 && (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📊</Text>
          <Text style={s.emptyTitle}>Not enough data yet</Text>
          <Text style={s.emptyBody}>
            Keep logging feeds, sleep, and diapers. Pattern insights appear after a few days of tracking.
          </Text>
        </View>
      )}

      {/* Insight cards */}
      {!loading && result && result.insights.map((insight, i) => {
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
                <View style={[s.badge, { backgroundColor: col.bg }]}>
                  <Text style={[s.badgeText, { color: col.text }]}>{meta.label}</Text>
                </View>
              </View>
              <Text style={s.insightDesc}>{insight.body}</Text>
            </View>
          </View>
        )
      })}

      {/* Footer */}
      {!loading && result && result.insights.length > 0 && (
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
    badge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      flexShrink: 0,
    },
    badgeText: {
      fontSize: 10,
      fontWeight: '700',
    },
    insightDesc: {
      fontSize: 12,
      color: c.textMuted,
      lineHeight: 17,
    },
    footer: {
      fontSize: 11,
      color: c.textMuted,
      marginTop: 10,
      textAlign: 'right',
    },
  })
}
