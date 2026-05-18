import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

// ─── Village list ─────────────────────────────────────────────────────────────
// TODO: Replace / extend this list once the final villages are confirmed

interface Village {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

const VILLAGES: Village[] = [
  { id: 'due_date',    name: 'Due Date Moms',         emoji: '🤰', description: 'Connect with parents due the same month' },
  { id: 'newborn',     name: 'Newborn Village',        emoji: '👶', description: 'Surviving the newborn stage together' },
  { id: 'first_time',  name: 'First Time Parents',     emoji: '⭐', description: 'Navigating parenthood for the first time' },
  { id: 'single_mom',  name: 'Single Moms',            emoji: '💪', description: 'Support for single mothers' },
  { id: 'working_mom', name: 'Working Moms',           emoji: '👩‍💼', description: 'Balancing career and parenthood' },
  { id: 'autism',      name: 'Autism Parents',         emoji: '🧩', description: 'Support and resources for autism families' },
  { id: 'nicu',        name: 'NICU Warriors',          emoji: '🏥', description: 'For families who have been through the NICU' },
  { id: 'breastfeed',  name: 'Breastfeeding Support',  emoji: '🤱', description: 'Tips, support, and community for nursing moms' },
  { id: 'formula',     name: 'Formula Feeding',        emoji: '🍼', description: 'Fed is best — support for formula families' },
  { id: 'stay_home',   name: 'Stay at Home Parents',   emoji: '🏡', description: 'The full-time job of full-time parenting' },
  { id: 'postpartum',  name: 'Postpartum Support',     emoji: '💛', description: 'Mental health and recovery after birth' },
  { id: 'military',    name: 'Military Families',      emoji: '🎖️', description: 'Parenting through deployments and military life' },
  { id: 'multiples',   name: 'Twins & Multiples',      emoji: '👯', description: 'Double (or triple!) the love' },
  { id: 'teen_parent', name: 'Teen Parents',           emoji: '🌟', description: 'Young parents supporting each other' },
  { id: 'lgbtq',       name: 'LGBTQ+ Families',        emoji: '🌈', description: 'Pride and joy in every family form' },
  { id: 'grandparent', name: 'Grandparent Caregivers', emoji: '🌻', description: 'Grandparents raising grandchildren' },
];

// ─── Quiz questions ───────────────────────────────────────────────────────────
// TODO: Replace with the final question list once confirmed

type QuizQuestion = { id: string; question: string; multi: boolean; options: string[] };

const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'stage',
    question: 'Where are you in your parenting journey?',
    multi: false,
    options: ['Currently expecting', 'Newborn (0–3 months)', 'Infant (3–12 months)', 'Toddler (1–3 years)', 'Preschooler (3–5 years)'],
  },
  {
    id: 'type',
    question: 'What best describes you?',
    multi: false,
    options: ['First-time parent', 'Experienced parent', 'Grandparent caregiver', 'Foster / adoptive parent'],
  },
  {
    id: 'situation',
    question: 'Which of these apply to you?',
    multi: true,
    options: ['Single parent', 'Working parent', 'Stay-at-home parent', 'Military family', 'LGBTQ+ family', 'Twins or multiples'],
  },
  {
    id: 'needs',
    question: 'Any special circumstances in your journey?',
    multi: true,
    options: ['NICU experience', 'Child with special needs', 'Postpartum mental health', 'Breastfeeding', 'Formula feeding', 'Sleep struggles'],
  },
];

// Map quiz answers to suggested village ids
function suggestVillages(answers: Record<string, string[]>): string[] {
  const suggested = new Set<string>();
  const all = Object.values(answers).flat().map(a => a.toLowerCase());

  if (all.some(a => a.includes('expecting')))        suggested.add('due_date');
  if (all.some(a => a.includes('newborn')))          suggested.add('newborn');
  if (all.some(a => a.includes('first-time')))       suggested.add('first_time');
  if (all.some(a => a.includes('grandparent')))      suggested.add('grandparent');
  if (all.some(a => a.includes('single')))           suggested.add('single_mom');
  if (all.some(a => a.includes('working')))          suggested.add('working_mom');
  if (all.some(a => a.includes('stay-at-home')))     suggested.add('stay_home');
  if (all.some(a => a.includes('military')))         suggested.add('military');
  if (all.some(a => a.includes('lgbtq')))            suggested.add('lgbtq');
  if (all.some(a => a.includes('twins')))            suggested.add('multiples');
  if (all.some(a => a.includes('nicu')))             suggested.add('nicu');
  if (all.some(a => a.includes('special needs')))    suggested.add('autism');
  if (all.some(a => a.includes('postpartum')))       suggested.add('postpartum');
  if (all.some(a => a.includes('breastfeeding')))    suggested.add('breastfeed');
  if (all.some(a => a.includes('formula')))          suggested.add('formula');

  return Array.from(suggested);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VillageTab() {
  const [joinedIds, setJoinedIds]       = useState<Set<string>>(new Set());
  const [loading, setLoading]           = useState(true);
  const [joining, setJoining]           = useState<string | null>(null);
  const [search, setSearch]             = useState('');
  const [quizDone, setQuizDone]         = useState(false);
  const [showQuiz, setShowQuiz]         = useState(false);
  const [quizStep, setQuizStep]         = useState(0);
  const [quizAnswers, setQuizAnswers]   = useState<Record<string, string[]>>({});
  const [quizComplete, setQuizComplete] = useState(false);
  const [suggestions, setSuggestions]   = useState<string[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: { user } }, done] = await Promise.all([
        supabase.auth.getUser(),
        AsyncStorage.getItem('village_quiz_done'),
      ]);
      if (!user) return;
      setQuizDone(done === 'true');
      const { data } = await supabase
        .from('user_villages')
        .select('village_id')
        .eq('user_id', user.id);
      if (data) setJoinedIds(new Set(data.map((r: any) => r.village_id)));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  function closeQuiz() {
    setShowQuiz(false);
    setQuizStep(0);
    setQuizAnswers({});
    setQuizComplete(false);
  }

  async function toggleJoin(villageId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setJoining(villageId);
    if (joinedIds.has(villageId)) {
      await supabase.from('user_villages').delete().eq('user_id', user.id).eq('village_id', villageId);
      setJoinedIds(prev => { const next = new Set(prev); next.delete(villageId); return next; });
    } else {
      await supabase.from('user_villages').insert({ user_id: user.id, village_id: villageId });
      setJoinedIds(prev => new Set([...prev, villageId]));
    }
    setJoining(null);
  }

  function toggleAnswer(questionId: string, option: string, multi: boolean) {
    setQuizAnswers(prev => {
      const current = prev[questionId] ?? [];
      if (multi) {
        return {
          ...prev,
          [questionId]: current.includes(option)
            ? current.filter(o => o !== option)
            : [...current, option],
        };
      }
      return { ...prev, [questionId]: [option] };
    });
  }

  async function finishQuiz() {
    const suggested = suggestVillages(quizAnswers);
    setSuggestions(suggested);
    setQuizComplete(true);
    await AsyncStorage.setItem('village_quiz_done', 'true');
    setQuizDone(true);
  }

  async function joinAllSuggested() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const toJoin = suggestions.filter(id => !joinedIds.has(id));
    if (toJoin.length > 0) {
      await supabase.from('user_villages').insert(
        toJoin.map(village_id => ({ user_id: user.id, village_id }))
      );
      setJoinedIds(prev => new Set([...prev, ...toJoin]));
    }
    closeQuiz();
  }

  const filtered = search.trim()
    ? VILLAGES.filter(v =>
        v.name.toLowerCase().includes(search.toLowerCase()) ||
        v.description.toLowerCase().includes(search.toLowerCase())
      )
    : VILLAGES;

  const myVillages  = VILLAGES.filter(v => joinedIds.has(v.id));
  const discoverList = filtered.filter(v => !joinedIds.has(v.id));

  const currentQ       = QUIZ_QUESTIONS[quizStep];
  const currentAnswers = quizAnswers[currentQ?.id] ?? [];
  const canAdvance     = currentAnswers.length > 0;
  const isLastStep     = quizStep === QUIZ_QUESTIONS.length - 1;

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color="#B1A7F0" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.heading}>Village</Text>

        {/* Search bar */}
        <View style={s.searchRow}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            placeholder="Search villages..."
            placeholderTextColor="#B0A89E"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={s.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Find Your Villages quiz card */}
        {!quizDone && !search && (
          <TouchableOpacity style={s.quizCard} onPress={() => setShowQuiz(true)} activeOpacity={0.85}>
            <Text style={s.quizCardEmoji}>🏘️</Text>
            <View style={s.quizCardBody}>
              <Text style={s.quizCardTitle}>Find Your Villages</Text>
              <Text style={s.quizCardSub}>Answer a few questions to discover your perfect communities</Text>
            </View>
            <Text style={s.quizCardArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* My Villages */}
        {myVillages.length > 0 && !search && (
          <>
            <Text style={s.sectionTitle}>My Villages</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.joinedScroll}
              contentContainerStyle={{ paddingRight: 8 }}
            >
              {myVillages.map(v => (
                <TouchableOpacity
                  key={v.id}
                  style={s.joinedChip}
                  onPress={() => toggleJoin(v.id)}
                  activeOpacity={0.75}
                >
                  <Text style={s.joinedChipEmoji}>{v.emoji}</Text>
                  <Text style={s.joinedChipName} numberOfLines={1}>{v.name}</Text>
                  <Text style={s.joinedChipLeave}>✕</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* Discover / Search results */}
        {discoverList.length > 0 && (
          <>
            <Text style={s.sectionTitle}>{search ? 'Results' : 'Discover'}</Text>
            {discoverList.map(v => (
              <VillageCard
                key={v.id}
                village={v}
                joining={joining === v.id}
                onJoin={() => toggleJoin(v.id)}
              />
            ))}
          </>
        )}

        {search && filtered.length === 0 && (
          <View style={s.emptySearch}>
            <Text style={s.emptySearchEmoji}>🔍</Text>
            <Text style={s.emptySearchText}>No villages found for "{search}"</Text>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Quiz modal ── */}
      <Modal
        visible={showQuiz}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeQuiz}
      >
        <SafeAreaView style={s.modalSafe}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={closeQuiz} style={s.modalCloseBtn}>
              <Text style={s.modalCloseText}>✕</Text>
            </TouchableOpacity>
            {!quizComplete && (
              <Text style={s.modalStep}>{quizStep + 1} of {QUIZ_QUESTIONS.length}</Text>
            )}
            <View style={{ width: 40 }} />
          </View>

          {quizComplete ? (
            /* ── Results ── */
            <ScrollView contentContainerStyle={s.resultsContent}>
              <Text style={s.resultsEmoji}>🎉</Text>
              <Text style={s.resultsTitle}>Your villages are ready!</Text>
              <Text style={s.resultsSub}>
                {suggestions.length > 0
                  ? 'Based on your answers, we think you\'d love these:'
                  : 'Explore all our villages below and join the ones that feel right.'}
              </Text>

              {VILLAGES.filter(v => suggestions.includes(v.id)).map(v => (
                <VillageCard
                  key={v.id}
                  village={v}
                  joining={joining === v.id}
                  joined={joinedIds.has(v.id)}
                  onJoin={() => toggleJoin(v.id)}
                  fullWidth
                />
              ))}

              {suggestions.length > 0 && (
                <TouchableOpacity style={s.joinAllBtn} onPress={joinAllSuggested}>
                  <Text style={s.joinAllBtnText}>Join All & Continue</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.skipBtn} onPress={closeQuiz}>
                <Text style={s.skipBtnText}>{suggestions.length > 0 ? 'Skip for now' : 'Done'}</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            /* ── Question ── */
            <ScrollView contentContainerStyle={s.quizContent} keyboardShouldPersistTaps="handled">
              {/* Progress bar */}
              <View style={s.progressBar}>
                <View style={{ flex: quizStep + 1, backgroundColor: '#FA92B1', borderRadius: 3 }} />
                <View style={{ flex: QUIZ_QUESTIONS.length - quizStep - 1 }} />
              </View>

              <Text style={s.questionText}>{currentQ.question}</Text>
              {currentQ.multi && (
                <Text style={s.questionSub}>Select all that apply</Text>
              )}

              {currentQ.options.map(option => {
                const selected = currentAnswers.includes(option);
                return (
                  <TouchableOpacity
                    key={option}
                    style={[s.optionBtn, selected && s.optionBtnSelected]}
                    onPress={() => toggleAnswer(currentQ.id, option, currentQ.multi)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.optionDot, selected && s.optionDotSelected]} />
                    <Text style={[s.optionText, selected && s.optionTextSelected]}>{option}</Text>
                  </TouchableOpacity>
                );
              })}

              <View style={s.quizNavRow}>
                {quizStep > 0 && (
                  <TouchableOpacity style={s.backBtn} onPress={() => setQuizStep(q => q - 1)}>
                    <Text style={s.backBtnText}>← Back</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[s.nextBtn, !canAdvance && s.nextBtnDisabled]}
                  onPress={() => isLastStep ? finishQuiz() : setQuizStep(q => q + 1)}
                  disabled={!canAdvance}
                >
                  <Text style={s.nextBtnText}>
                    {isLastStep ? 'See My Villages →' : 'Next →'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Village card sub-component ───────────────────────────────────────────────

function VillageCard({
  village, joining, joined = false, onJoin, fullWidth = false,
}: {
  village: Village;
  joining: boolean;
  joined?: boolean;
  onJoin: () => void;
  fullWidth?: boolean;
}) {
  return (
    <View style={[s.villageCard, fullWidth && { width: '100%' }]}>
      <Text style={s.villageEmoji}>{village.emoji}</Text>
      <View style={s.villageInfo}>
        <Text style={s.villageName}>{village.name}</Text>
        <Text style={s.villageDesc}>{village.description}</Text>
      </View>
      <TouchableOpacity
        style={[s.joinBtn, joined && s.joinBtnJoined]}
        onPress={onJoin}
        disabled={joining}
      >
        {joining
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={[s.joinBtnText, joined && s.joinBtnTextJoined]}>
              {joined ? '✓ Joined' : '+ Join'}
            </Text>
        }
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FEFCF8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 24, paddingBottom: 40 },

  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: '#5A544E',
    marginBottom: 16,
  },

  // ── Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#EAE5DF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    gap: 8,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 15, color: '#5A544E', padding: 0 },
  searchClear: { fontSize: 14, color: '#B0A89E', paddingHorizontal: 4 },

  // ── Quiz card
  quizCard: {
    backgroundColor: '#FDE4DE',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
    borderLeftWidth: 5,
    borderLeftColor: '#FA92B1',
    gap: 14,
    shadowColor: '#FA92B1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  quizCardEmoji: { fontSize: 32 },
  quizCardBody: { flex: 1 },
  quizCardTitle: { fontSize: 17, fontWeight: '800', color: '#5A544E', marginBottom: 4 },
  quizCardSub: { fontSize: 13, color: '#8A7E78', lineHeight: 18 },
  quizCardArrow: { fontSize: 22, color: '#FA92B1', fontWeight: '600' },

  // ── Section title
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#5A544E',
    marginBottom: 12,
  },

  // ── My Villages
  joinedScroll: { marginBottom: 28 },
  joinedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D3E5CF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#94B58C',
    maxWidth: 180,
  },
  joinedChipEmoji: { fontSize: 18 },
  joinedChipName: { fontSize: 13, fontWeight: '700', color: '#3D3530', flex: 1 },
  joinedChipLeave: { fontSize: 11, color: '#AEBCB1' },

  // ── Village card
  villageCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    gap: 12,
  },
  villageEmoji: { fontSize: 28 },
  villageInfo: { flex: 1 },
  villageName: { fontSize: 15, fontWeight: '700', color: '#3D3530', marginBottom: 2 },
  villageDesc: { fontSize: 12, color: '#B0A89E', lineHeight: 17 },
  joinBtn: {
    backgroundColor: '#B1A7F0',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 68,
    alignItems: 'center',
  },
  joinBtnJoined: { backgroundColor: '#D3E5CF' },
  joinBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  joinBtnTextJoined: { color: '#94B58C' },

  // ── Empty search
  emptySearch: { padding: 40, alignItems: 'center' },
  emptySearchEmoji: { fontSize: 36, marginBottom: 12 },
  emptySearchText: { fontSize: 14, color: '#B0A89E', textAlign: 'center' },

  // ── Quiz modal
  modalSafe: { flex: 1, backgroundColor: '#FEFCF8' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EBE4',
  },
  modalCloseBtn: { width: 40, alignItems: 'flex-start' },
  modalCloseText: { fontSize: 18, color: '#B0A89E' },
  modalStep: { fontSize: 14, fontWeight: '600', color: '#B0A89E' },

  // ── Quiz question
  quizContent: { padding: 24, paddingBottom: 40 },
  progressBar: {
    flexDirection: 'row',
    height: 6,
    backgroundColor: '#F0EBE4',
    borderRadius: 3,
    marginBottom: 32,
    overflow: 'hidden',
  },
  questionText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#3D3530',
    lineHeight: 28,
    marginBottom: 8,
  },
  questionSub: { fontSize: 13, color: '#B0A89E', marginBottom: 20 },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#EAE5DF',
    gap: 12,
  },
  optionBtnSelected: { backgroundColor: '#FDE4DE', borderColor: '#FA92B1' },
  optionDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D0C8C0',
    backgroundColor: '#fff',
  },
  optionDotSelected: { backgroundColor: '#FA92B1', borderColor: '#FA92B1' },
  optionText: { flex: 1, fontSize: 15, color: '#5A544E', fontWeight: '500' },
  optionTextSelected: { fontWeight: '700', color: '#3D3530' },
  quizNavRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
  },
  backBtn: { paddingHorizontal: 8, paddingVertical: 12 },
  backBtnText: { fontSize: 15, color: '#B0A89E', fontWeight: '600' },
  nextBtn: {
    backgroundColor: '#B1A7F0',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  nextBtnDisabled: { backgroundColor: '#D5D0C8' },
  nextBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // ── Quiz results
  resultsContent: { padding: 24, paddingBottom: 40, alignItems: 'center' },
  resultsEmoji: { fontSize: 52, marginTop: 16, marginBottom: 16 },
  resultsTitle: { fontSize: 22, fontWeight: '800', color: '#3D3530', marginBottom: 8, textAlign: 'center' },
  resultsSub: { fontSize: 14, color: '#8A7E78', textAlign: 'center', lineHeight: 20, marginBottom: 24, paddingHorizontal: 8 },
  joinAllBtn: {
    backgroundColor: '#FA92B1',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    width: '100%',
    marginTop: 8,
    marginBottom: 10,
  },
  joinAllBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  skipBtn: { paddingVertical: 12 },
  skipBtnText: { fontSize: 14, color: '#B0A89E', fontWeight: '600' },
});
