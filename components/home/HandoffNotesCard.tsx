import React, { useMemo } from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors, Colors } from '../../lib/theme';

interface HandoffNotesCardProps {
  latestNote: string | null;
  onPress: () => void;
}

function HandoffNotesCard({ latestNote, onPress }: HandoffNotesCardProps) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <TouchableOpacity
      style={styles.handoffCard}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Handoff notes"
    >
      <Text style={styles.handoffLabel}>📝 Handoff Notes</Text>
      <Text style={styles.handoffText} numberOfLines={2}>
        {latestNote ?? 'No notes yet — leave one for your co-parent.'}
      </Text>
    </TouchableOpacity>
  );
}

export default React.memo(HandoffNotesCard);

function makeStyles(c: Colors) {
  return StyleSheet.create({
    handoffCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: c.separator,
      padding: 16,
      marginBottom: 20,
    },
    handoffLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textSecondary,
      marginBottom: 4,
    },
    handoffText: {
      fontSize: 14,
      color: c.textPrimary,
      lineHeight: 19,
    },
  });
}
