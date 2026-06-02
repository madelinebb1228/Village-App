import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, useColors } from '../lib/theme';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type RiskLevel = 'low' | 'monitoring' | 'high' | 'urgent';
type CheckStep = 'intro' | 'epds' | 'ppp' | 'results';

type CheckRecord = {
  id: string;
  epds_score: number;
  anxiety_subscale: number;
  has_ppp_flag: boolean;
  risk_level: RiskLevel;
  created_at: string;
};

// ─── EPDS Questions (Edinburgh Postnatal Depression Scale) ────────────────────

const EPDS_QUESTIONS = [
  {
    id: 1,
    text: 'I have been able to laugh and see the funny side of things',
    options: [
      { label: 'As much as I always could', score: 0 },
      { label: 'Not quite so much now', score: 1 },
      { label: 'Definitely not so much now', score: 2 },
      { label: 'Not at all', score: 3 },
    ],
    sensitive: false,
  },
  {
    id: 2,
    text: 'I have looked forward with enjoyment to things',
    options: [
      { label: 'As much as I ever did', score: 0 },
      { label: 'Rather less than I used to', score: 1 },
      { label: 'Definitely less than I used to', score: 2 },
      { label: 'Hardly at all', score: 3 },
    ],
    sensitive: false,
  },
  {
    id: 3,
    text: 'I have blamed myself unnecessarily when things went wrong',
    options: [
      { label: 'Yes, most of the time', score: 3 },
      { label: 'Yes, some of the time', score: 2 },
      { label: 'Not very often', score: 1 },
      { label: 'No, never', score: 0 },
    ],
    sensitive: false,
  },
  {
    id: 4,
    text: 'I have been anxious or worried for no good reason',
    options: [
      { label: 'No, not at all', score: 0 },
      { label: 'Hardly ever', score: 1 },
      { label: 'Yes, sometimes', score: 2 },
      { label: 'Yes, very often', score: 3 },
    ],
    sensitive: false,
  },
  {
    id: 5,
    text: 'I have felt scared or panicky for no very good reason',
    options: [
      { label: 'Yes, quite a lot', score: 3 },
      { label: 'Yes, sometimes', score: 2 },
      { label: 'No, not much', score: 1 },
      { label: 'No, not at all', score: 0 },
    ],
    sensitive: false,
  },
  {
    id: 6,
    text: 'Things have been getting on top of me',
    options: [
      { label: "Yes, most of the time I haven't been able to cope at all", score: 3 },
      { label: "Yes, sometimes I haven't been coping as well as usual", score: 2 },
      { label: 'No, most of the time I have coped quite well', score: 1 },
      { label: 'No, I have been coping as well as ever', score: 0 },
    ],
    sensitive: false,
  },
  {
    id: 7,
    text: 'I have been so unhappy that I have had difficulty sleeping',
    options: [
      { label: 'Yes, most of the time', score: 3 },
      { label: 'Yes, sometimes', score: 2 },
      { label: 'Not very often', score: 1 },
      { label: 'No, not at all', score: 0 },
    ],
    sensitive: false,
  },
  {
    id: 8,
    text: 'I have felt sad or miserable',
    options: [
      { label: 'Yes, most of the time', score: 3 },
      { label: 'Yes, quite often', score: 2 },
      { label: 'Not very often', score: 1 },
      { label: 'No, not at all', score: 0 },
    ],
    sensitive: false,
  },
  {
    id: 9,
    text: 'I have been so unhappy that I have been crying',
    options: [
      { label: 'Yes, most of the time', score: 3 },
      { label: 'Yes, quite often', score: 2 },
      { label: 'Only occasionally', score: 1 },
      { label: 'No, never', score: 0 },
    ],
    sensitive: false,
  },
  {
    id: 10,
    text: 'The thought of harming myself has occurred to me',
    options: [
      { label: 'Yes, quite often', score: 3 },
      { label: 'Sometimes', score: 2 },
      { label: 'Hardly ever', score: 1 },
      { label: 'Never', score: 0 },
    ],
    sensitive: true,
  },
];

// ─── PPP Warning Signs ────────────────────────────────────────────────────────

const PPP_SYMPTOMS = [
  'Hearing voices or sounds that others cannot hear',
  'Seeing things that are not there',
  'Feeling that your thoughts are being controlled or put there by someone else',
  'Extremely rapid mood swings — feeling very high or energized, then suddenly very low, within hours',
  'Feeling confused, disoriented, or uncertain about what is real',
  'Going days without sleep but not feeling tired',
  'Feeling that you or your baby is in danger when others say you are safe',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRiskLevel(epds: number, anxiety: number, q10: number, ppp: boolean): RiskLevel {
  if (ppp || q10 >= 2) return 'urgent';
  if (q10 >= 1 || epds >= 13) return 'high';
  if (epds >= 10 || anxiety >= 6) return 'monitoring';
  return 'low';
}

function riskColor(risk: RiskLevel, c: Colors): string {
  if (risk === 'urgent' || risk === 'high') return c.blush;
  if (risk === 'monitoring') return c.honey;
  return c.sage;
}

function riskBg(risk: RiskLevel, c: Colors): string {
  if (risk === 'urgent' || risk === 'high') return c.cardBlush;
  if (risk === 'monitoring') return c.cardHoney;
  return c.cardSage;
}

function riskLabel(risk: RiskLevel): string {
  if (risk === 'urgent')     return 'Reach Out Now';
  if (risk === 'high')       return 'Seek Support';
  if (risk === 'monitoring') return 'Keep Checking In';
  return 'Doing Well';
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 3600 * 1000));
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    // Card
    card: {
      backgroundColor: c.card, borderRadius: 16, padding: 20,
      marginHorizontal: 16, marginBottom: 20, borderWidth: 1.5, borderColor: c.separator,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    headerEmoji: { fontSize: 22, marginRight: 8 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: c.text, flex: 1 },
    subtitle: { fontSize: 13, color: c.textMuted, lineHeight: 19, marginBottom: 16 },
    // Last check summary
    summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    summaryBox: {
      flex: 1, backgroundColor: c.inputBg, borderRadius: 12, padding: 10, alignItems: 'center',
    },
    summaryLabel: { fontSize: 10, color: c.textMuted, marginBottom: 3, textAlign: 'center' },
    summaryValue: { fontSize: 14, fontWeight: '700', color: c.text },
    // Main button
    checkInBtn: {
      borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 2, marginBottom: 14,
    },
    checkInBtnText: { fontSize: 15, fontWeight: '700' },
    // History list
    historyTitle: { fontSize: 12, color: c.textMuted, fontWeight: '600', marginBottom: 8, marginTop: 4 },
    historyItem: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: 9,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    historyItemLast: { borderBottomWidth: 0 },
    historyDate: { flex: 1, fontSize: 13, color: c.text },
    historyScore: { fontSize: 13, fontWeight: '700', color: c.textSecondary, marginRight: 10 },
    historyPill: {
      fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99,
    },
    // Crisis bar
    crisisBar: {
      marginTop: 14, backgroundColor: c.cardBlush, borderRadius: 12,
      padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10,
    },
    crisisBarEmoji: { fontSize: 18 },
    crisisBarText: { flex: 1, fontSize: 12, color: c.blush, fontWeight: '600', lineHeight: 18 },
    emptyText: { fontSize: 14, color: c.textMuted, textAlign: 'center', marginBottom: 16, lineHeight: 22 },

    // ─── Modal ───────────────────────────────────────────────────────────────
    overlay: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
      backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '94%',
    },
    handle: {
      width: 36, height: 4, backgroundColor: c.separator, borderRadius: 2,
      alignSelf: 'center', marginTop: 12, marginBottom: 8,
    },
    // Progress bar
    progressWrap: { paddingHorizontal: 20, paddingBottom: 12, gap: 6 },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    progressTrack: { flex: 1, height: 5, backgroundColor: c.inputBg, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: '100%' as any, borderRadius: 3 },
    progressText: { fontSize: 12, color: c.textMuted, minWidth: 72, textAlign: 'right' },
    // Scroll content
    scrollContent: { paddingHorizontal: 20, paddingBottom: 16 },
    // Intro
    introTitle: { fontSize: 22, fontWeight: '800', color: c.text, marginBottom: 10, lineHeight: 28 },
    introBody: { fontSize: 14, color: c.textSecondary, lineHeight: 22, marginBottom: 8 },
    introBulletRow: { flexDirection: 'row', marginBottom: 4, gap: 6 },
    introBulletDot: { fontSize: 14, color: c.lavender, lineHeight: 22 },
    introBulletText: { fontSize: 14, color: c.textSecondary, lineHeight: 22, flex: 1 },
    disclaimer: {
      backgroundColor: c.inputBg, borderRadius: 12, padding: 12, marginTop: 10,
    },
    disclaimerText: { fontSize: 12, color: c.textMuted, lineHeight: 18 },
    // EPDS question
    periodLabel: {
      fontSize: 11, fontWeight: '700', color: c.lavender, letterSpacing: 0.8,
      textTransform: 'uppercase', marginBottom: 8,
    },
    questionText: { fontSize: 19, fontWeight: '700', color: c.text, lineHeight: 28, marginBottom: 16 },
    sensitiveBox: {
      backgroundColor: c.cardHoney, borderRadius: 10, padding: 12, marginBottom: 14,
      borderWidth: 1, borderColor: c.honey,
    },
    sensitiveText: { fontSize: 12, color: c.honey, lineHeight: 18, fontWeight: '600' },
    optionBtn: {
      borderRadius: 12, padding: 14, marginBottom: 10,
      borderWidth: 2, borderColor: c.separator, backgroundColor: c.inputBg,
    },
    optionBtnSelected: { borderColor: c.lavender, backgroundColor: c.cardLavender },
    optionText: { fontSize: 14, color: c.text, lineHeight: 20 },
    optionTextSelected: { color: c.lavender, fontWeight: '600' },
    // PPP check
    pppTitle: { fontSize: 20, fontWeight: '800', color: c.text, marginBottom: 6 },
    pppSubtitle: { fontSize: 13, color: c.textMuted, lineHeight: 19, marginBottom: 16 },
    pppRow: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: c.separator, gap: 12,
    },
    pppRowLast: { borderBottomWidth: 0 },
    pppRowText: { flex: 1, fontSize: 14, color: c.text, lineHeight: 20 },
    yesNoRow: { flexDirection: 'row', gap: 6 },
    yesNoBtn: {
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
      borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.inputBg,
    },
    yesNoBtnYesActive: { borderColor: c.blush, backgroundColor: c.cardBlush },
    yesNoBtnNoActive:  { borderColor: c.sage,  backgroundColor: c.cardSage  },
    yesNoBtnText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    yesNoBtnTextActive: { color: c.text, fontWeight: '700' },
    // Results
    resultsUrgentBox: {
      backgroundColor: c.cardBlush, borderRadius: 14, padding: 16, marginBottom: 16,
      borderWidth: 2, borderColor: c.blush,
    },
    resultsUrgentTitle: { fontSize: 16, fontWeight: '800', color: c.blush, marginBottom: 6 },
    resultsUrgentBody: { fontSize: 13, color: c.text, lineHeight: 20 },
    scoreBadge: {
      alignSelf: 'center', borderRadius: 99, paddingHorizontal: 24, paddingVertical: 10, marginBottom: 4,
    },
    scoreBadgeText: { fontSize: 14, fontWeight: '800', color: '#fff' },
    scoreNumber: { fontSize: 48, fontWeight: '900', textAlign: 'center' },
    scoreOutOf: { fontSize: 14, color: c.textMuted, textAlign: 'center', marginBottom: 16 },
    findingBox: {
      backgroundColor: c.inputBg, borderRadius: 14, padding: 14, marginBottom: 10,
    },
    findingTitle: { fontSize: 14, fontWeight: '700', color: c.text, marginBottom: 4 },
    findingBody: { fontSize: 13, color: c.textSecondary, lineHeight: 20 },
    resourcesHeader: { fontSize: 14, fontWeight: '700', color: c.text, marginBottom: 10, marginTop: 4 },
    resourceRow: { flexDirection: 'row', gap: 10, marginBottom: 10, alignItems: 'flex-start' },
    resourceEmoji: { fontSize: 16, marginTop: 1 },
    resourceName: { fontSize: 13, fontWeight: '700', color: c.text },
    resourceDetail: { fontSize: 12, color: c.textMuted, lineHeight: 18, marginTop: 1 },
    // Nav footer
    navRow: { flexDirection: 'row', gap: 10, padding: 20, paddingTop: 8 },
    navBack: {
      flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
      borderWidth: 2, borderColor: c.separator,
    },
    navBackText: { fontSize: 15, fontWeight: '600', color: c.textSecondary },
    navNext: {
      flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    },
    navNextText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  });
}

// ─── Resources (always shown on results) ──────────────────────────────────────

const RESOURCES = [
  {
    emoji: '💜',
    name: 'Postpartum Support International',
    detail: 'Call or text: 1-800-944-4773\nEn Español: 1-800-944-4773 (opción 2)',
  },
  {
    emoji: '📞',
    name: '988 Suicide & Crisis Lifeline',
    detail: 'Call or text 988 — free, 24/7',
  },
  {
    emoji: '💬',
    name: 'Crisis Text Line',
    detail: 'Text HOME to 741741',
  },
  {
    emoji: '🚨',
    name: 'Emergency',
    detail: 'Call 911 or go to your nearest ER if you feel unsafe',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function MomMentalHealthTracker({ userId }: { userId: string | null }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();

  const [records, setRecords] = useState<CheckRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Check-in state
  const [step, setStep] = useState<CheckStep>('intro');
  const [epdsIndex, setEpdsIndex] = useState(0);     // 0–9 within EPDS step
  const [responses, setResponses] = useState<number[]>(new Array(10).fill(-1));
  const [pppFlags, setPppFlags] = useState<boolean[]>(new Array(PPP_SYMPTOMS.length).fill(false));
  const [pppAnswered, setPppAnswered] = useState<boolean[]>(new Array(PPP_SYMPTOMS.length).fill(false));

  useEffect(() => {
    if (userId) loadRecords();
  }, [userId]);

  const loadRecords = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('mom_mental_health_checks')
        .select('id, epds_score, anxiety_subscale, has_ppp_flag, risk_level, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
      setRecords((data ?? []) as CheckRecord[]);
    } catch (err) {
      console.error('MH load error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // ── Modal open/close ─────────────────────────────────────────────────────

  function openCheckIn() {
    setStep('intro');
    setEpdsIndex(0);
    setResponses(new Array(10).fill(-1));
    setPppFlags(new Array(PPP_SYMPTOMS.length).fill(false));
    setPppAnswered(new Array(PPP_SYMPTOMS.length).fill(false));
    setShowModal(true);
  }

  // ── Navigation within check-in ────────────────────────────────────────────

  function handleNext() {
    if (step === 'intro') {
      setStep('epds');
      setEpdsIndex(0);
      return;
    }
    if (step === 'epds') {
      if (responses[epdsIndex] === -1) return; // must answer before advancing
      if (epdsIndex < 9) {
        setEpdsIndex(i => i + 1);
      } else {
        setStep('ppp');
      }
      return;
    }
    if (step === 'ppp') {
      if (!pppAnswered.every(Boolean)) return; // must answer all
      handleSave();
      return;
    }
  }

  function handleBack() {
    if (step === 'intro') { setShowModal(false); return; }
    if (step === 'epds') {
      if (epdsIndex === 0) { setStep('intro'); return; }
      setEpdsIndex(i => i - 1);
      return;
    }
    if (step === 'ppp') { setStep('epds'); setEpdsIndex(9); return; }
    if (step === 'results') { setShowModal(false); return; }
  }

  // ── Save to Supabase ──────────────────────────────────────────────────────

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    try {
      const epdsScore      = responses.reduce((a, b) => a + Math.max(b, 0), 0);
      const anxietySubscale = responses[2] + responses[3] + responses[4]; // Q3+Q4+Q5
      const q10Score       = responses[9];
      const hasPppFlag     = pppFlags.some(Boolean);
      const riskLevel      = getRiskLevel(epdsScore, anxietySubscale, q10Score, hasPppFlag);

      await supabase.from('mom_mental_health_checks').insert({
        user_id:          userId,
        epds_score:       epdsScore,
        responses:        responses,
        anxiety_subscale: anxietySubscale,
        ppp_flags:        pppFlags,
        has_ppp_flag:     hasPppFlag,
        risk_level:       riskLevel,
      });

      await loadRecords();
      setStep('results');
    } catch (err: any) {
      console.error('MH save error:', err);
    } finally {
      setSaving(false);
    }
  }

  // ── Derived results values ─────────────────────────────────────────────────

  const epdsScore      = responses.reduce((a, b) => a + Math.max(b, 0), 0);
  const anxietySubscale = responses[2] + responses[3] + responses[4];
  const q10Score       = responses[9];
  const hasPppFlag     = pppFlags.some(Boolean);
  const riskLevel      = getRiskLevel(epdsScore, anxietySubscale, q10Score, hasPppFlag);

  // ── Progress calc ─────────────────────────────────────────────────────────

  const totalSteps = 12; // intro(0) + 10 EPDS + 1 PPP
  const currentStepNum =
    step === 'intro'   ? 0 :
    step === 'epds'    ? epdsIndex + 1 :
    step === 'ppp'     ? 11 : 12;
  const progress = currentStepNum / totalSteps;

  const progressLabel =
    step === 'intro'   ? 'Intro' :
    step === 'epds'    ? `Question ${epdsIndex + 1} of 10` :
    step === 'ppp'     ? 'Safety check' : 'Results';

  const canAdvance =
    step === 'intro'  ? true :
    step === 'epds'   ? responses[epdsIndex] !== -1 :
    step === 'ppp'    ? pppAnswered.every(Boolean) : true;

  // ── Render ────────────────────────────────────────────────────────────────

  const lastRecord = records[0];
  const daysSinceLast = lastRecord ? daysSince(lastRecord.created_at) : null;
  const overdue = daysSinceLast !== null && daysSinceLast >= 14;
  const due     = daysSinceLast !== null && daysSinceLast >= 7 && !overdue;

  return (
    <>
      {/* ── Card ────────────────────────────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.headerRow}>
          <Text style={s.headerEmoji}>🧠</Text>
          <Text style={s.headerTitle}>Mom Mental Health</Text>
          {loading && <ActivityIndicator size="small" color={c.lavender} />}
        </View>
        <Text style={s.subtitle}>
          Regular check-ins screen for postpartum depression (PPD), anxiety (PPA), and psychosis (PPP) — so you can get support early.
        </Text>

        {/* Summary of last check-in */}
        {lastRecord ? (
          <>
            <View style={s.summaryRow}>
              <View style={s.summaryBox}>
                <Text style={s.summaryLabel}>Last check-in</Text>
                <Text style={s.summaryValue}>
                  {daysSinceLast === 0 ? 'Today' : daysSinceLast === 1 ? 'Yesterday' : `${daysSinceLast}d ago`}
                </Text>
              </View>
              <View style={s.summaryBox}>
                <Text style={s.summaryLabel}>EPDS score</Text>
                <Text style={s.summaryValue}>{lastRecord.epds_score}/30</Text>
              </View>
              <View style={[s.summaryBox, { backgroundColor: riskBg(lastRecord.risk_level, c) }]}>
                <Text style={s.summaryLabel}>Status</Text>
                <Text style={[s.summaryValue, { color: riskColor(lastRecord.risk_level, c) }]}>
                  {riskLabel(lastRecord.risk_level)}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                s.checkInBtn,
                overdue
                  ? { backgroundColor: c.cardBlush, borderColor: c.blush }
                  : due
                    ? { backgroundColor: c.cardHoney, borderColor: c.honey }
                    : { backgroundColor: c.cardLavender, borderColor: c.lavender },
              ]}
              onPress={openCheckIn}
              activeOpacity={0.85}
            >
              <Text style={[
                s.checkInBtnText,
                { color: overdue ? c.blush : due ? c.honey : c.lavender },
              ]}>
                {overdue ? '⚠️  Check-in Overdue — Take One Now' : due ? '📋  Check-in Due This Week' : '📋  Take Another Check-in'}
              </Text>
            </TouchableOpacity>

            {records.length > 1 && (
              <>
                <Text style={s.historyTitle}>Recent check-ins</Text>
                {records.map((rec, i) => (
                  <View key={rec.id} style={[s.historyItem, i === records.length - 1 && s.historyItemLast]}>
                    <Text style={s.historyDate}>{fmtDate(rec.created_at)}</Text>
                    <Text style={s.historyScore}>{rec.epds_score}/30</Text>
                    <View style={[s.historyPill, { backgroundColor: riskBg(rec.risk_level, c) }]}>
                      <Text style={[s.historyPill, { color: riskColor(rec.risk_level, c), margin: 0, padding: 0 }]}>
                        {riskLabel(rec.risk_level)}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        ) : (
          <>
            <Text style={s.emptyText}>
              Your wellbeing matters just as much as your baby's. Taking regular check-ins helps catch early warning signs before they become harder to manage.
            </Text>
            <TouchableOpacity
              style={[s.checkInBtn, { backgroundColor: c.cardLavender, borderColor: c.lavender }]}
              onPress={openCheckIn}
              activeOpacity={0.85}
            >
              <Text style={[s.checkInBtnText, { color: c.lavender }]}>💜  Take Your First Check-in</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Always-visible crisis resources */}
        <View style={s.crisisBar}>
          <Text style={s.crisisBarEmoji}>💜</Text>
          <Text style={s.crisisBarText}>
            In crisis now? Call or text{' '}
            <Text style={{ fontWeight: '800' }}>988</Text>
            {'  ·  '}
            Text HOME to{' '}
            <Text style={{ fontWeight: '800' }}>741741</Text>
            {'  ·  '}
            PSI: <Text style={{ fontWeight: '800' }}>1-800-944-4773</Text>
          </Text>
        </View>
      </View>

      {/* ── Check-in Modal ───────────────────────────────────────────────── */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setShowModal(false)} />
          <View style={[s.sheet, { paddingBottom: insets.bottom }]}>
            <View style={s.handle} />

            {/* Progress bar */}
            {step !== 'results' && (
              <View style={s.progressWrap}>
                <View style={s.progressRow}>
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${progress * 100}%` as any, backgroundColor: c.lavender }]} />
                  </View>
                  <Text style={s.progressText}>{progressLabel}</Text>
                </View>
              </View>
            )}

            <ScrollView
              contentContainerStyle={s.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >

              {/* ── Intro ──────────────────────────────────────────────── */}
              {step === 'intro' && (
                <>
                  <Text style={s.introTitle}>How are you doing?</Text>
                  <Text style={s.introBody}>
                    This check-in takes about 3 minutes and includes the Edinburgh Postnatal Depression Scale (EPDS) — a clinically validated tool used worldwide.
                  </Text>
                  <Text style={s.introBody}>It screens for:</Text>
                  {[
                    'Postpartum Depression (PPD) — affecting 1 in 7 moms',
                    'Postpartum Anxiety (PPA) — affecting up to 1 in 5 moms',
                    'Postpartum Psychosis (PPP) — rare but a medical emergency',
                  ].map(item => (
                    <View key={item} style={s.introBulletRow}>
                      <Text style={s.introBulletDot}>•</Text>
                      <Text style={s.introBulletText}>{item}</Text>
                    </View>
                  ))}
                  <View style={s.disclaimer}>
                    <Text style={s.disclaimerText}>
                      This is a screening tool only — not a clinical diagnosis. Please discuss results with your OB, midwife, or therapist. All responses are stored privately and only visible to you.
                    </Text>
                  </View>
                </>
              )}

              {/* ── EPDS Question ──────────────────────────────────────── */}
              {step === 'epds' && (
                <>
                  <Text style={s.periodLabel}>In the past 7 days…</Text>
                  <Text style={s.questionText}>{EPDS_QUESTIONS[epdsIndex].text}</Text>

                  {EPDS_QUESTIONS[epdsIndex].sensitive && (
                    <View style={s.sensitiveBox}>
                      <Text style={s.sensitiveText}>
                        This question asks about self-harm thoughts. Your honest answer helps us make sure you get the right support. You are not alone.
                      </Text>
                    </View>
                  )}

                  {EPDS_QUESTIONS[epdsIndex].options.map((opt, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[s.optionBtn, responses[epdsIndex] === opt.score && s.optionBtnSelected]}
                      onPress={() => {
                        const updated = [...responses];
                        updated[epdsIndex] = opt.score;
                        setResponses(updated);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.optionText, responses[epdsIndex] === opt.score && s.optionTextSelected]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* ── PPP Symptoms ───────────────────────────────────────── */}
              {step === 'ppp' && (
                <>
                  <Text style={s.pppTitle}>Safety Check</Text>
                  <Text style={s.pppSubtitle}>
                    These questions screen for postpartum psychosis (PPP), which is rare but requires urgent care. Please answer honestly — even one "Yes" is important.
                  </Text>
                  {PPP_SYMPTOMS.map((symptom, i) => (
                    <View key={i} style={[s.pppRow, i === PPP_SYMPTOMS.length - 1 && s.pppRowLast]}>
                      <Text style={s.pppRowText}>{symptom}</Text>
                      <View style={s.yesNoRow}>
                        <TouchableOpacity
                          style={[s.yesNoBtn, pppAnswered[i] && pppFlags[i] && s.yesNoBtnYesActive]}
                          onPress={() => {
                            const flags = [...pppFlags]; flags[i] = true;
                            const answered = [...pppAnswered]; answered[i] = true;
                            setPppFlags(flags); setPppAnswered(answered);
                          }}
                          activeOpacity={0.75}
                        >
                          <Text style={[s.yesNoBtnText, pppAnswered[i] && pppFlags[i] && s.yesNoBtnTextActive]}>Yes</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.yesNoBtn, pppAnswered[i] && !pppFlags[i] && s.yesNoBtnNoActive]}
                          onPress={() => {
                            const flags = [...pppFlags]; flags[i] = false;
                            const answered = [...pppAnswered]; answered[i] = true;
                            setPppFlags(flags); setPppAnswered(answered);
                          }}
                          activeOpacity={0.75}
                        >
                          <Text style={[s.yesNoBtnText, pppAnswered[i] && !pppFlags[i] && s.yesNoBtnTextActive]}>No</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </>
              )}

              {/* ── Results ────────────────────────────────────────────── */}
              {step === 'results' && (
                <>
                  {/* PPP urgent banner — shown first if flagged */}
                  {hasPppFlag && (
                    <View style={s.resultsUrgentBox}>
                      <Text style={s.resultsUrgentTitle}>🚨 Please Seek Help Immediately</Text>
                      <Text style={s.resultsUrgentBody}>
                        Your responses indicate possible symptoms of postpartum psychosis (PPP). PPP is a psychiatric emergency — it is not your fault, it is treatable, and help is available right now.{'\n\n'}
                        <Text style={{ fontWeight: '800' }}>Call 911 or go to your nearest ER now.</Text>
                        {'\n'}If you cannot go yourself, call someone you trust to take you.
                      </Text>
                    </View>
                  )}

                  {/* EPDS Score */}
                  <View style={[s.scoreBadge, { backgroundColor: riskColor(riskLevel, c) }]}>
                    <Text style={s.scoreBadgeText}>{riskLabel(riskLevel)}</Text>
                  </View>
                  <Text style={[s.scoreNumber, { color: riskColor(riskLevel, c) }]}>{epdsScore}</Text>
                  <Text style={s.scoreOutOf}>out of 30 — EPDS score</Text>

                  {/* Depression finding */}
                  {epdsScore >= 10 && (
                    <View style={s.findingBox}>
                      <Text style={s.findingTitle}>
                        {epdsScore >= 13 ? '💙 Probable Postpartum Depression (PPD)' : '💙 Possible Postpartum Depression (PPD)'}
                      </Text>
                      <Text style={s.findingBody}>
                        {epdsScore >= 13
                          ? 'Your score strongly suggests PPD. Please reach out to your OB, midwife, or a therapist as soon as possible. PPD is very common and very treatable — you deserve support.'
                          : 'Your score suggests you may be experiencing some symptoms of PPD. Check in again in a week, and consider speaking with your healthcare provider.'}
                      </Text>
                    </View>
                  )}

                  {/* Anxiety finding */}
                  {anxietySubscale >= 6 && (
                    <View style={s.findingBox}>
                      <Text style={s.findingTitle}>💜 Possible Postpartum Anxiety (PPA)</Text>
                      <Text style={s.findingBody}>
                        Your anxiety subscale score ({anxietySubscale}/9) suggests elevated anxiety. PPA is very common and often overlooked. Talk to your provider about what you're experiencing.
                      </Text>
                    </View>
                  )}

                  {/* Self-harm note */}
                  {q10Score > 0 && (
                    <View style={[s.findingBox, { borderWidth: 2, borderColor: c.blush }]}>
                      <Text style={[s.findingTitle, { color: c.blush }]}>💜 You're Not Alone</Text>
                      <Text style={s.findingBody}>
                        You indicated thoughts of self-harm. Please reach out to a crisis line or your healthcare provider today. These thoughts are a signal that you need and deserve immediate support. You matter.
                      </Text>
                    </View>
                  )}

                  {/* All clear */}
                  {riskLevel === 'low' && !hasPppFlag && (
                    <View style={[s.findingBox, { backgroundColor: c.cardSage }]}>
                      <Text style={[s.findingTitle, { color: c.sage }]}>You're doing well</Text>
                      <Text style={s.findingBody}>
                        Your score suggests you're coping well right now. Keep checking in — postpartum feelings can change quickly, and early support makes a big difference.
                      </Text>
                    </View>
                  )}

                  {/* Resources — always shown */}
                  <Text style={s.resourcesHeader}>Support Resources</Text>
                  {RESOURCES.map(r => (
                    <View key={r.name} style={s.resourceRow}>
                      <Text style={s.resourceEmoji}>{r.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.resourceName}>{r.name}</Text>
                        <Text style={s.resourceDetail}>{r.detail}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}

            </ScrollView>

            {/* Nav footer */}
            <View style={s.navRow}>
              <TouchableOpacity style={s.navBack} onPress={handleBack} activeOpacity={0.75}>
                <Text style={s.navBackText}>{step === 'results' ? 'Close' : 'Back'}</Text>
              </TouchableOpacity>

              {step !== 'results' && (
                <TouchableOpacity
                  style={[
                    s.navNext,
                    { backgroundColor: canAdvance ? c.lavender : c.inputBg },
                  ]}
                  onPress={handleNext}
                  disabled={!canAdvance || saving}
                  activeOpacity={0.85}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : (
                      <Text style={[s.navNextText, { color: canAdvance ? '#fff' : c.textMuted }]}>
                        {step === 'ppp' ? 'See Results' : 'Next'}
                      </Text>
                    )
                  }
                </TouchableOpacity>
              )}
            </View>

          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
