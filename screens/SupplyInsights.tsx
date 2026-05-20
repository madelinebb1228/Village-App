import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Trend {
  declinePct: number;
  recentAvg:  number;
  prevAvg:    number;
}

interface Answers {
  stress:    string;
  hydration: string;
  frequency: string;
  changes:   string[];
  pumpParts: string;
}

interface Suggestion {
  emoji: string;
  title: string;
  body:  string;
}

// ─── Suggestion engine ────────────────────────────────────────────────────────

function buildSuggestions(a: Answers): Suggestion[] {
  const out: Suggestion[] = [];

  if (a.stress === 'very' || a.stress === 'somewhat') {
    out.push({
      emoji: '🧘',
      title: 'Reduce stress before sessions',
      body: 'Stress raises cortisol, which blocks oxytocin — the let-down hormone. Try 2–3 deep breaths, a warm compress on your breasts, or looking at a photo of your baby right before you pump.',
    });
  }

  if (a.hydration === 'not_enough' || a.hydration === 'could_be') {
    out.push({
      emoji: '💧',
      title: 'Drink more water',
      body: 'Breast milk is 90% water. Aim for 13–16 cups of fluids daily. Keep a large water bottle at your pumping station and drink a full glass every time you nurse or pump.',
    });
  }

  if (a.frequency === 'less' || a.frequency === 'much_less') {
    out.push({
      emoji: '⏰',
      title: 'Pump or nurse more frequently',
      body: 'Supply is demand-driven — less stimulation means less milk. Try adding one extra session per day. Power pumping (20 min on / 10 off / 10 on / 10 off / 10 on) once daily can signal your body to make more.',
    });
  }

  if (a.changes.includes('work')) {
    out.push({
      emoji: '💼',
      title: 'Protect your supply at work',
      body: 'Pump every 2–3 hours while away from baby — as often as they would nurse. A hands-free pumping bra helps. Nurse or pump right before leaving and immediately when you get home.',
    });
  }

  if (a.changes.includes('baby_sleep')) {
    out.push({
      emoji: '🌙',
      title: 'Compensate for missed night feeds',
      body: "When baby drops a night feed, that's one less demand signal. Consider a dream feed or one pump session between midnight and 5am — prolactin peaks then, making it especially effective.",
    });
  }

  if (a.changes.includes('formula')) {
    out.push({
      emoji: '🍼',
      title: 'Pump when baby has formula',
      body: 'For every formula bottle given, try to pump at the same time to replace the stimulation your body would have gotten. This helps prevent your supply from dropping further.',
    });
  }

  if (a.changes.includes('period')) {
    out.push({
      emoji: '📅',
      title: 'Hormonal dip — it\'s temporary',
      body: 'Many people see a supply dip 1–2 days before their period through the first couple of days. It usually bounces back. Some find calcium-magnesium supplements (500 mg / 1000 mg) during this window helpful — check with your doctor first.',
    });
  }

  if (a.changes.includes('sick')) {
    out.push({
      emoji: '🤒',
      title: 'Rest and keep pumping',
      body: 'Illness often causes a temporary dip. Rest as much as possible, stay hydrated, and keep nursing or pumping to maintain stimulation. Supply usually recovers when you feel better.',
    });
  }

  if (a.pumpParts === 'months' || a.pumpParts === 'not_sure') {
    out.push({
      emoji: '🔧',
      title: 'Check your pump parts',
      body: 'Worn membranes and valves quietly reduce suction over time. Replace membranes every 4–8 weeks and valves every 2–4 weeks. Even a single new membrane can make a noticeable difference.',
    });
  }

  if (out.length === 0) {
    out.push({
      emoji: '💪',
      title: 'Stay consistent',
      body: "Sometimes supply dips without a clear reason and recovers on its own. Keep nursing or pumping on demand, eat enough calories, and stay hydrated. If you're concerned, a lactation consultant (IBCLC) can assess further.",
    });
  }

  return out;
}

// ─── Questionnaire steps ──────────────────────────────────────────────────────

const STEPS = [
  {
    key: 'stress',
    question: 'How stressed have you been this week?',
    type: 'single' as const,
    options: [
      { value: 'low',      label: '😊  Not much' },
      { value: 'somewhat', label: '😐  Somewhat stressed' },
      { value: 'very',     label: '😰  Very stressed' },
    ],
  },
  {
    key: 'hydration',
    question: "How's your hydration been?",
    type: 'single' as const,
    options: [
      { value: 'plenty',     label: '💧  Drinking plenty' },
      { value: 'could_be',   label: '🤔  Could be better' },
      { value: 'not_enough', label: '😬  Not drinking enough' },
    ],
  },
  {
    key: 'frequency',
    question: 'Compared to last week, how often are you pumping or nursing?',
    type: 'single' as const,
    options: [
      { value: 'same',      label: '✅  About the same' },
      { value: 'less',      label: '↓  A bit less often' },
      { value: 'much_less', label: '↓↓  Much less often' },
      { value: 'more',      label: '↑  More often than before' },
    ],
  },
  {
    key: 'changes',
    question: 'Has anything changed recently? (select all that apply)',
    type: 'multi' as const,
    options: [
      { value: 'work',       label: '💼  Returned to work' },
      { value: 'baby_sleep', label: '😴  Baby sleeping longer stretches' },
      { value: 'formula',    label: '🍼  Started supplementing with formula' },
      { value: 'period',     label: '📅  Period returned' },
      { value: 'sick',       label: '🤒  Been sick or unwell' },
      { value: 'none',       label: '✅  Nothing has changed' },
    ],
  },
  {
    key: 'pumpParts',
    question: 'When did you last replace your pump membranes?',
    type: 'single' as const,
    options: [
      { value: 'recent',   label: '✅  Less than a month ago' },
      { value: 'months',   label: '📅  1–3 months ago' },
      { value: 'not_sure', label: '❓  Not sure / it\'s been a while' },
      { value: 'no_pump',  label: '🤱  I don\'t use a pump' },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function SupplyInsights({ userId }: { userId: string | null }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [trend,       setTrend]       = useState<Trend | null>(null);
  const [dismissed,   setDismissed]   = useState(false);
  const [showModal,   setShowModal]   = useState(false);
  const [step,        setStep]        = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [answers,     setAnswers]     = useState<Answers>({
    stress: '', hydration: '', frequency: '', changes: [], pumpParts: '',
  });

  useEffect(() => { if (userId) analyze(); }, [userId]);

  async function analyze() {
    const now     = new Date();
    const day14   = new Date(now); day14.setDate(now.getDate() - 14);
    const day7    = new Date(now); day7.setDate(now.getDate() - 7);

    const { data } = await supabase
      .from('pumping_sessions')
      .select('total_ml, logged_at')
      .eq('user_id', userId!)
      .gte('logged_at', day14.toISOString())
      .order('logged_at', { ascending: true });

    if (!data || data.length < 4) return;

    const prev   = data.filter(d => d.logged_at <  day7.toISOString());
    const recent = data.filter(d => d.logged_at >= day7.toISOString());
    if (prev.length < 2 || recent.length < 2) return;

    const prevAvg   = prev.reduce((s, d)   => s + d.total_ml, 0) / prev.length;
    const recentAvg = recent.reduce((s, d) => s + d.total_ml, 0) / recent.length;
    if (prevAvg < 10) return;

    const declinePct = ((prevAvg - recentAvg) / prevAvg) * 100;
    if (declinePct >= 15) setTrend({ declinePct, recentAvg, prevAvg });
  }

  function toggleChange(value: string) {
    setAnswers(prev => {
      let next = prev.changes.includes(value)
        ? prev.changes.filter(c => c !== value)
        : value === 'none'
          ? ['none']
          : [...prev.changes.filter(c => c !== 'none'), value];
      return { ...prev, changes: next };
    });
  }

  function canAdvance(): boolean {
    const st = STEPS[step];
    if (st.type === 'single') return !!(answers as any)[st.key];
    return answers.changes.length > 0;
  }

  function advance() {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      setSuggestions(buildSuggestions(answers));
      setShowResults(true);
    }
  }

  function reset() {
    setStep(0);
    setShowResults(false);
    setAnswers({ stress: '', hydration: '', frequency: '', changes: [], pumpParts: '' });
    setSuggestions([]);
    setShowModal(false);
  }

  if (!trend || dismissed) return null;

  const currentStep = STEPS[step];

  return (
    <>
      {/* ── Detection card ────────────────────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardIcon}>📉</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>Supply may be decreasing</Text>
            <Text style={s.cardSub}>
              ~{Math.round(trend.declinePct)}% lower this week vs last week
            </Text>
          </View>
          <TouchableOpacity onPress={() => setDismissed(true)} style={s.dismissBtn}>
            <Text style={s.dismissText}>✕</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.cardBody}>
          Recent sessions averaged {trend.recentAvg.toFixed(0)} ml, down from {trend.prevAvg.toFixed(0)} ml the week before.
        </Text>
        <TouchableOpacity style={s.insightBtn} onPress={() => setShowModal(true)}>
          <Text style={s.insightBtnText}>Understand why →</Text>
        </TouchableOpacity>
      </View>

      {/* ── Modal (questionnaire + results) ──────────────────────────────── */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={reset}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />

            {showResults ? (
              /* Results */
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.resultsContent}>
                <View style={s.resultsHeader}>
                  <Text style={s.resultsTitle}>Your insights</Text>
                  <TouchableOpacity onPress={reset}>
                    <Text style={s.closeBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.resultsIntro}>
                  Based on your answers, here are the most likely causes and what you can do:
                </Text>
                {suggestions.map((sug, i) => (
                  <View key={i} style={s.suggCard}>
                    <Text style={s.suggEmoji}>{sug.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.suggTitle}>{sug.title}</Text>
                      <Text style={s.suggBody}>{sug.body}</Text>
                    </View>
                  </View>
                ))}
                <Text style={s.disclaimer}>
                  These suggestions are general guidance. For persistent supply concerns, a certified lactation consultant (IBCLC) can offer personalized support.
                </Text>
                <TouchableOpacity style={s.doneBtn} onPress={reset}>
                  <Text style={s.doneBtnText}>Done</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              /* Questionnaire */
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.qContent}>
                {/* Progress dots */}
                <View style={s.progressRow}>
                  {STEPS.map((_, i) => (
                    <View key={i} style={[s.dot, i <= step && s.dotActive]} />
                  ))}
                </View>

                <Text style={s.stepLabel}>Step {step + 1} of {STEPS.length}</Text>
                <Text style={s.question}>{currentStep.question}</Text>

                {currentStep.options.map(opt => {
                  const selected = currentStep.type === 'single'
                    ? (answers as any)[currentStep.key] === opt.value
                    : answers.changes.includes(opt.value);
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[s.option, selected && s.optionSel]}
                      activeOpacity={0.75}
                      onPress={() => {
                        if (currentStep.type === 'single') {
                          setAnswers(prev => ({ ...prev, [currentStep.key]: opt.value }));
                        } else {
                          toggleChange(opt.value);
                        }
                      }}
                    >
                      <Text style={[s.optionText, selected && s.optionTextSel]}>{opt.label}</Text>
                      {selected && <Text style={s.optionCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}

                <View style={s.navRow}>
                  {step > 0 ? (
                    <TouchableOpacity style={s.backBtn} onPress={() => setStep(s => s - 1)}>
                      <Text style={s.backBtnText}>← Back</Text>
                    </TouchableOpacity>
                  ) : <View />}
                  <TouchableOpacity
                    style={[s.nextBtn, !canAdvance() && s.nextBtnOff]}
                    onPress={advance}
                    disabled={!canAdvance()}
                  >
                    <Text style={s.nextBtnText}>
                      {step === STEPS.length - 1 ? 'See my insights' : 'Next →'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={s.cancelRow} onPress={reset}>
                  <Text style={s.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    // Detection card
    card:         { backgroundColor: c.cardHoney, borderWidth: 1.5, borderColor: c.honey,
                    borderRadius: 14, padding: 14, marginBottom: 14 },
    cardHeader:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 10 },
    cardIcon:     { fontSize: 22 },
    cardTitle:    { fontSize: 14, fontWeight: '800', color: c.textPrimary },
    cardSub:      { fontSize: 12, color: c.textPrimary, marginTop: 2, fontWeight: '600' },
    cardBody:     { fontSize: 13, color: c.textPrimary, lineHeight: 19, marginBottom: 12 },
    dismissBtn:   { padding: 4 },
    dismissText:  { fontSize: 15, color: c.honey },
    insightBtn:   { backgroundColor: c.honey, borderRadius: 20, paddingVertical: 10,
                    paddingHorizontal: 18, alignSelf: 'flex-start' },
    insightBtnText:{ fontSize: 13, fontWeight: '700', color: c.textPrimary },

    // Modal shell
    overlay:      { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(60,50,45,0.45)' },
    sheet:        { backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28,
                    paddingTop: 12, maxHeight: '92%' },
    handle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: c.inputBg,
                    alignSelf: 'center', marginBottom: 16 },

    // Questionnaire
    qContent:     { paddingHorizontal: 24, paddingBottom: 40 },
    progressRow:  { flexDirection: 'row', gap: 6, marginBottom: 20 },
    dot:          { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.inputBorder },
    dotActive:    { backgroundColor: c.blush },
    stepLabel:    { fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase',
                    letterSpacing: 0.6, marginBottom: 6 },
    question:     { fontSize: 20, fontWeight: '800', color: c.textPrimary, lineHeight: 27, marginBottom: 22 },

    option:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    backgroundColor: c.card, borderWidth: 1.5, borderColor: c.inputBorder,
                    borderRadius: 14, padding: 16, marginBottom: 10 },
    optionSel:    { borderColor: c.blush, backgroundColor: c.cardBlush },
    optionText:   { fontSize: 15, fontWeight: '600', color: c.textSecondary, flex: 1 },
    optionTextSel:{ color: c.blush },
    optionCheck:  { fontSize: 15, fontWeight: '800', color: c.blush },

    navRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
    backBtn:      { paddingVertical: 14, paddingHorizontal: 4 },
    backBtnText:  { fontSize: 15, color: c.textMuted, fontWeight: '600' },
    nextBtn:      { backgroundColor: c.blush, borderRadius: 14, paddingVertical: 14,
                    paddingHorizontal: 28 },
    nextBtnOff:   { opacity: 0.4 },
    nextBtnText:  { color: c.primaryText, fontWeight: '700', fontSize: 15 },
    cancelRow:    { alignItems: 'center', paddingVertical: 16 },
    cancelText:   { fontSize: 14, color: c.textMuted, fontWeight: '600' },

    // Results
    resultsContent:{ paddingHorizontal: 24, paddingBottom: 44 },
    resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    resultsTitle:  { fontSize: 22, fontWeight: '800', color: c.textPrimary },
    closeBtn:      { fontSize: 18, color: c.textMuted, padding: 4 },
    resultsIntro:  { fontSize: 14, color: c.textMuted, marginBottom: 18, lineHeight: 20 },

    suggCard:     { flexDirection: 'row', gap: 14, backgroundColor: c.card, borderRadius: 14,
                    padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: c.inputBorder,
                    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
    suggEmoji:    { fontSize: 28 },
    suggTitle:    { fontSize: 15, fontWeight: '800', color: c.textPrimary, marginBottom: 6 },
    suggBody:     { fontSize: 13, color: c.textSecondary, lineHeight: 19 },

    disclaimer:   { fontSize: 11, color: c.textMuted, lineHeight: 16, marginTop: 8, marginBottom: 20,
                    textAlign: 'center' },
    doneBtn:      { backgroundColor: c.blush, borderRadius: 14, paddingVertical: 16,
                    alignItems: 'center' },
    doneBtnText:  { color: c.primaryText, fontWeight: '700', fontSize: 16 },
  });
}
