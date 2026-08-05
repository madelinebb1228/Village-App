import React, { useMemo, useState } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors, Colors } from '../lib/theme';
import { useBaby } from '../lib/babyContext';
import { autoFormatDate, parseDisplayDate, toDisplayDate, todayDisplay } from '../lib/dateUtils';
import {
  buildVisitSummary, generateVisitSummaryPDF, shareWithProvider,
  VisitSummary, VisitType, RangeDays,
} from '../lib/visitSummary';

interface Props {
  visible: boolean;
  onClose: () => void;
  initialDate?: string;
  initialTitle?: string;
}

const VISIT_TYPES: VisitType[] = ['Well Visit', 'Sick Visit', 'Follow-up', 'Other'];
const RANGE_OPTIONS: RangeDays[] = [7, 14, 30];

function guessVisitType(title?: string): VisitType {
  if (!title) return 'Well Visit';
  const t = title.toLowerCase();
  if (t.includes('sick') || t.includes('fever') || t.includes('ill')) return 'Sick Visit';
  if (t.includes('follow')) return 'Follow-up';
  if (t.includes('well') || t.includes('check')) return 'Well Visit';
  return 'Other';
}

export default function PrepareForVisit({ visible, onClose, initialDate, initialTitle }: Props) {
  const c = useColors();
  const s = makeStyles(c);
  const { activeBaby } = useBaby();

  const [dateText, setDateText] = useState(initialDate ? toDisplayDate(initialDate) : todayDisplay());
  const [visitType, setVisitType] = useState<VisitType>(guessVisitType(initialTitle));
  const [range, setRange] = useState<RangeDays>(14);
  const [generating, setGenerating] = useState(false);
  const [summary, setSummary] = useState<VisitSummary | null>(null);
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);

  function reset() {
    setSummary(null);
    setDateText(initialDate ? toDisplayDate(initialDate) : todayDisplay());
    setVisitType(guessVisitType(initialTitle));
    setRange(14);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleGenerate() {
    if (!activeBaby) {
      Alert.alert('No baby profile', 'Add a baby profile before preparing a visit summary.');
      return;
    }
    const parsed = parseDisplayDate(dateText.trim());
    if (!parsed) {
      Alert.alert('Invalid date', 'Use MM/DD/YYYY format, e.g. 06/01/2025');
      return;
    }
    setGenerating(true);
    try {
      const result = await buildVisitSummary(activeBaby.id, activeBaby.name, visitType, dateText.trim(), range);
      setSummary(result);
    } catch (err: any) {
      Alert.alert('Could not generate summary', err?.message ?? 'Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownloadPDF() {
    if (!summary) return;
    setExporting(true);
    try {
      await generateVisitSummaryPDF(summary);
    } catch (err: any) {
      Alert.alert('Could not create PDF', err?.message ?? 'Please try again.');
    } finally {
      setExporting(false);
    }
  }

  async function handleShareWithProvider() {
    if (!summary || !activeBaby) return;
    setSharing(true);
    try {
      await shareWithProvider(activeBaby.id, summary);
    } catch (err: any) {
      Alert.alert('Could not create share link', err?.message ?? 'Please try again.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <View style={{ width: 50 }} />
          <Text style={s.headerTitle}>Prepare for Visit</Text>
          <TouchableOpacity onPress={handleClose} style={{ width: 50, alignItems: 'flex-end' }} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={s.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>Visit date</Text>
            <TextInput
              style={s.input}
              value={dateText}
              onChangeText={v => setDateText(autoFormatDate(v, dateText))}
              placeholder="MM/DD/YYYY"
              placeholderTextColor={c.textMuted}
              keyboardType="numeric"
              maxLength={10}
            />

            <Text style={s.label}>Visit type</Text>
            <View style={s.chipRow}>
              {VISIT_TYPES.map(vt => (
                <TouchableOpacity
                  key={vt}
                  style={[s.chip, visitType === vt && s.chipActive]}
                  onPress={() => setVisitType(vt)}
                  accessibilityRole="button" accessibilityLabel={vt}
                >
                  <Text style={[s.chipText, visitType === vt && s.chipTextActive]}>{vt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Look back over</Text>
            <View style={s.chipRow}>
              {RANGE_OPTIONS.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[s.chip, range === r && s.chipActive]}
                  onPress={() => setRange(r)}
                  accessibilityRole="button" accessibilityLabel={`${r} days`}
                >
                  <Text style={[s.chipText, range === r && s.chipTextActive]}>{r} days</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={s.generateBtn} onPress={handleGenerate} disabled={generating} accessibilityRole="button" accessibilityLabel="Generate summary">
              {generating ? <ActivityIndicator color="#fff" /> : <Text style={s.generateBtnText}>Generate Summary</Text>}
            </TouchableOpacity>

            {summary && (
              <View style={s.results}>
                <Text style={s.sectionTitle}>Feeding</Text>
                <Text style={s.sectionText}>{summary.feedingLine}</Text>

                <Text style={s.sectionTitle}>Sleep</Text>
                <Text style={s.sectionText}>{summary.sleepLine}</Text>

                <Text style={s.sectionTitle}>Concerns Logged</Text>
                {summary.concerns.length === 0 ? (
                  <Text style={s.sectionText}>No concerns logged in this window.</Text>
                ) : (
                  summary.concerns.map((concern, i) => (
                    <Text key={i} style={s.bullet}>• {concern}</Text>
                  ))
                )}

                {summary.growthRows.length > 0 && (
                  <>
                    <Text style={s.sectionTitle}>Growth</Text>
                    {summary.growthRows.map((g, i) => (
                      <Text key={i} style={s.bullet}>• {g.date} — {g.weight}{g.height ? `, ${g.height}` : ''}</Text>
                    ))}
                  </>
                )}

                {summary.questions.length > 0 && (
                  <>
                    <Text style={s.sectionTitle}>Questions You Might Ask</Text>
                    {summary.questions.map((q, i) => (
                      <Text key={i} style={s.bullet}>• {q}</Text>
                    ))}
                  </>
                )}

                <TouchableOpacity style={s.actionBtn} onPress={handleDownloadPDF} disabled={exporting} accessibilityRole="button" accessibilityLabel="Download PDF">
                  {exporting ? <ActivityIndicator color="#fff" /> : <Text style={s.actionBtnText}>Download PDF</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[s.actionBtn, s.shareBtn]} onPress={handleShareWithProvider} disabled={sharing} accessibilityRole="button" accessibilityLabel="Share with provider">
                  {sharing ? <ActivityIndicator color="#fff" /> : <Text style={s.actionBtnText}>Share with Provider</Text>}
                </TouchableOpacity>
                <Text style={s.hint}>The shared link is read-only and expires 24 hours after you create it.</Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: c.textPrimary },
    closeText: { fontSize: 18, color: c.textMuted },
    body: { padding: 20, paddingBottom: 48 },
    label: { fontSize: 13, fontWeight: '800', color: c.textMuted, marginTop: 14, marginBottom: 6 },
    input: {
      backgroundColor: c.inputBg, borderRadius: 12, borderWidth: 1, borderColor: c.inputBorder,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.textPrimary, fontWeight: '500',
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { backgroundColor: c.card, borderRadius: 20, borderWidth: 1.5, borderColor: c.separator, paddingHorizontal: 14, paddingVertical: 8 },
    chipActive: { backgroundColor: c.cardBlush, borderColor: c.blush ?? c.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    chipTextActive: { color: c.textPrimary, fontWeight: '800' },
    generateBtn: { backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
    generateBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    results: { marginTop: 28, borderTopWidth: 1, borderTopColor: c.separator, paddingTop: 20 },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: c.textPrimary, marginTop: 16, marginBottom: 4 },
    sectionText: { fontSize: 14, color: c.textSecondary, lineHeight: 20 },
    bullet: { fontSize: 13, color: c.textSecondary, lineHeight: 19, marginBottom: 2 },
    actionBtn: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 20 },
    shareBtn: { backgroundColor: c.editBtn ?? c.primary, marginTop: 10 },
    actionBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    hint: { fontSize: 11, color: c.textMuted, marginTop: 8, textAlign: 'center' },
  });
