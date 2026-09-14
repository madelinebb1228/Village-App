import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useColors, Colors } from '../../lib/theme';
import { typography } from '../../lib/typography';
import { hitSlopFor } from '../../lib/accessibility';

interface Props {
  title: string;
  subtitle?: string;
  seeAllLabel?: string;
  onSeeAll?: () => void;
  horizontal?: boolean;
  children: React.ReactNode;
}

// Generic landing-section shell shared by every Discover section: a plain
// heading (no colored background) plus an optional horizontal-scroll body,
// so sections read as one neutral content surface rather than a stack of
// differently-tinted dashboard blocks.
export default function DiscoverSection({ title, subtitle, seeAllLabel = 'See all', onSeeAll, horizontal, children }: Props) {
  const c = useColors();
  const s = makeStyles(c);

  return (
    <View style={s.section}>
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.title} accessibilityRole="header">{title}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>
        {onSeeAll && (
          <TouchableOpacity
            onPress={onSeeAll}
            hitSlop={hitSlopFor(30)}
            accessibilityRole="button"
            accessibilityLabel={`${seeAllLabel}: ${title}`}
          >
            <Text style={s.seeAll}>{seeAllLabel}</Text>
          </TouchableOpacity>
        )}
      </View>

      {horizontal ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.horizontalRow}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={s.verticalStack}>{children}</View>
      )}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    section: { marginBottom: 28 },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    title: { ...typography.sectionTitle, color: c.textPrimary },
    subtitle: { fontSize: 12.5, color: c.textMuted, marginTop: 2, fontWeight: '500' },
    seeAll: { ...typography.tabLabel, color: c.primary },
    horizontalRow: { paddingHorizontal: 20, gap: 12 },
    verticalStack: { paddingHorizontal: 20, gap: 10 },
  });
}
