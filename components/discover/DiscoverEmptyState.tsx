import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors, Colors } from '../../lib/theme';
import { typography } from '../../lib/typography';
import { hitSlopFor } from '../../lib/accessibility';

interface Action {
  label: string;
  onPress: () => void;
}

interface Props {
  emoji: string;
  title: string;
  message: string;
  actions?: Action[];
}

export default function DiscoverEmptyState({ emoji, title, message, actions }: Props) {
  const c = useColors();
  const s = makeStyles(c);

  return (
    <View style={s.wrap}>
      <Text style={s.emoji}>{emoji}</Text>
      <Text style={s.title}>{title}</Text>
      <Text style={s.message}>{message}</Text>
      {actions && actions.length > 0 && (
        <View style={s.actions}>
          {actions.map((a, i) => (
            <TouchableOpacity
              key={a.label}
              style={[s.actionBtn, i === 0 && s.actionBtnPrimary]}
              onPress={a.onPress}
              activeOpacity={0.8}
              hitSlop={hitSlopFor(36)}
              accessibilityRole="button"
              accessibilityLabel={a.label}
            >
              <Text style={[s.actionText, i === 0 && s.actionTextPrimary]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    wrap: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 8 },
    emoji: { fontSize: 36, marginBottom: 4 },
    title: { ...typography.emptyStateTitle, color: c.textPrimary, textAlign: 'center' },
    message: { ...typography.emptyStateBody, color: c.textMuted, textAlign: 'center', lineHeight: 19 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 14 },
    actionBtn: {
      borderWidth: 1.5, borderColor: c.separator, borderRadius: 20,
      paddingHorizontal: 16, paddingVertical: 10, backgroundColor: c.card,
    },
    actionBtnPrimary: { backgroundColor: c.primary, borderColor: c.primary },
    actionText: { ...typography.tabLabel, color: c.textSecondary },
    actionTextPrimary: { color: c.primaryText },
  });
}
