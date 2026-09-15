import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Colors } from '../../lib/theme';
import { typography } from '../../lib/typography';

interface Props {
  question: string;
  topic?: string;
  answerCount?: number;
  onPress: () => void;
  width?: number;
}

export default function QuestionPreview({ question, topic, answerCount, onPress, width }: Props) {
  const c = useColors();
  const s = makeStyles(c);

  return (
    <TouchableOpacity
      style={[s.card, width ? { width } : null]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={question}
    >
      <View style={s.questionRow}>
        <Ionicons name="help-circle-outline" size={16} color={c.primary} style={{ marginTop: 1 }} />
        <Text style={s.question} numberOfLines={3}>{question}</Text>
      </View>
      <View style={s.metaRow}>
        {topic ? <Text style={s.topic}>{topic}</Text> : null}
        {typeof answerCount === 'number' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="chatbubble-outline" size={12} color={c.textMuted} />
            <Text style={s.meta}>{answerCount} answer{answerCount === 1 ? '' : 's'}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.separator,
      borderRadius: 14,
      padding: 14,
      gap: 8,
      minHeight: 96,
    },
    questionRow: { flexDirection: 'row', gap: 8 },
    question: { flex: 1, fontSize: 14, fontWeight: '700', color: c.textPrimary, lineHeight: 19 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    topic: { ...typography.badge, color: c.primary },
    meta: { fontSize: 11, color: c.textMuted, fontWeight: '600' },
  });
}
