import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useColors } from '../lib/theme';

const REASONS = [
  'Spam or advertising',
  'Inappropriate content',
  'Harmful or unsafe advice',
  'Misinformation',
  'Other',
];

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
};

export default function ReportModal({ visible, title, onClose, onSubmit }: Props) {
  const c = useColors();
  const s = styles(c);

  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleClose = () => {
    setReason('');
    setDone(false);
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    await onSubmit(reason);
    setSubmitting(false);
    setDone(true);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Text style={s.title}>{title}</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button" accessibilityLabel="Close">
            <Text style={s.close}>✕</Text>
          </TouchableOpacity>
        </View>

        {done ? (
          <View style={s.doneWrap}>
            <Text style={s.doneEmoji}>✅</Text>
            <Text style={s.doneTitle}>Report Submitted</Text>
            <Text style={s.doneBody}>
              Thank you for helping keep the community safe. We'll review this soon.
            </Text>
            <TouchableOpacity onPress={handleClose} style={s.doneBtn}
              accessibilityRole="button" accessibilityLabel="Close">
              <Text style={s.doneBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={s.scroll}>
            <Text style={s.prompt}>Why are you reporting this?</Text>
            {REASONS.map(r => (
              <TouchableOpacity
                key={r}
                onPress={() => setReason(r)}
                style={[s.reasonBtn, reason === r && s.reasonBtnActive]}
                accessibilityRole="button" accessibilityLabel={r}
              >
                <Text style={[s.reasonText, reason === r && s.reasonTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={handleSubmit}
              style={[s.submitBtn, (!reason || submitting) && s.submitBtnDisabled]}
              disabled={!reason || submitting}
              accessibilityRole="button" accessibilityLabel="Submit report"
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.submitBtnText}>Submit Report</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = (c: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: c.separator,
    },
    title: { fontSize: 18, fontWeight: '800', color: c.textPrimary },
    close: { fontSize: 20, color: c.textMuted },
    scroll: { padding: 20, gap: 10 },
    prompt: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textSecondary,
      marginBottom: 4,
    },
    reasonBtn: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.separator,
      backgroundColor: c.card,
    },
    reasonBtnActive: {
      borderColor: c.primary,
      backgroundColor: c.cardLavender,
    },
    reasonText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.textPrimary,
    },
    reasonTextActive: {
      color: c.primary,
    },
    submitBtn: {
      marginTop: 8,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: c.primary,
    },
    submitBtnDisabled: {
      backgroundColor: c.primaryDisabled,
    },
    submitBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.primaryText,
    },
    doneWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 12,
    },
    doneEmoji: { fontSize: 44 },
    doneTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: c.textPrimary,
    },
    doneBody: {
      fontSize: 14,
      color: c.textSecondary,
      fontWeight: '500',
      textAlign: 'center',
      lineHeight: 20,
    },
    doneBtn: {
      marginTop: 8,
      paddingHorizontal: 28,
      paddingVertical: 12,
      borderRadius: 20,
      backgroundColor: c.primary,
    },
    doneBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.primaryText,
    },
  });
