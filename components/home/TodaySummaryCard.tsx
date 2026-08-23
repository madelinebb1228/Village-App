import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useColors, Colors } from '../../lib/theme';
import { MAX_FONT_SCALE } from '../../lib/accessibility';
import { Stats } from '../../types/feed';
import { mlToOz } from '../../lib/feedUtils.tsx';

interface TodaySummaryCardProps {
  stats: Stats;
  loading: boolean;
  containerRef?: React.RefObject<View>;
}

function TodaySummaryCard({ stats, loading, containerRef }: TodaySummaryCardProps) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  const statCards = useMemo(() => [
    { label: 'Feeds\nToday',   value: String(stats.feeds),           accent: c.statFeeds.accent,   bg: c.statFeeds.bg },
    { label: 'Diapers\nToday', value: String(stats.diapers),          accent: c.statDiapers.accent, bg: c.statDiapers.bg },
    { label: 'Pumped\nToday',  value: `${mlToOz(stats.pumpedMl)} oz`, accent: c.statPumped.accent,  bg: c.statPumped.bg },
  ], [stats, c]);

  return (
    <View ref={containerRef} style={styles.statRow}>
      {statCards.map(card => (
        <View
          key={card.label}
          style={[styles.statCard, { borderTopColor: card.accent, backgroundColor: card.bg }]}
          accessible
          accessibilityLabel={loading ? `${card.label}, loading` : `${card.label}: ${card.value}`}
        >
          {loading ? (
            <ActivityIndicator
              color={card.accent}
              style={styles.statSpinner}
            />
          ) : (
            <Text
              allowFontScaling
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={[styles.statValue, { color: card.accent }]}
            >
              {card.value}
            </Text>
          )}
          <Text style={styles.statLabel}>{card.label}</Text>
        </View>
      ))}
    </View>
  );
}

export default React.memo(TodaySummaryCard);

function makeStyles(c: Colors) {
  return StyleSheet.create({
    statRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 36,
      overflow: 'visible',
    },
    statCard: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      alignItems: 'center',
      borderTopWidth: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
      minHeight: 80,
      justifyContent: 'center',
    },
    statSpinner: {
      marginBottom: 6,
    },
    statValue: {
      fontSize: 24,
      fontWeight: '800',
      marginBottom: 6,
      color: c.textPrimary,
    },
    statLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 16,
    },
  });
}
