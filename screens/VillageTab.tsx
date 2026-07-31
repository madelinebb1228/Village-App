import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';
import { useSubscription } from '../lib/subscriptionContext';

import { Village, VILLAGES } from '../lib/villageData';
import VillageFeedSheet from './VillageFeedSheet';
import FindYourPatchSheet from './FindYourPatchSheet';
import PatchTasksSheet from './PatchTasksSheet';
import { QUIZ_QUESTIONS } from '../lib/quizData';
import { suggestVillages, getNextVisibleStep, getPrevVisibleStep } from '../lib/quizLogic';
import { VillageCard } from '../components/village/VillageCard';
import { LocationPicker } from '../components/village/LocationPicker';

// ─── Component ────────────────────────────────────────────────────────────────

export default function VillageTab() {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const lp = useMemo(() => makeLocationPickerStyles(c), [c]);
  const { isSubscribed, openPaywall } = useSubscription();
  const FREE_VILLAGE_LIMIT = 5;

  const [joinedIds, setJoinedIds]       = useState<Set<string>>(new Set());
  const [selectedVillage, setSelectedVillage] = useState<Village | null>(null);
  const [loading, setLoading]           = useState(true);
  const [joining, setJoining]           = useState<string | null>(null);
  const [search, setSearch]             = useState('');
  const [quizDone, setQuizDone]         = useState(false);
  const [showQuiz, setShowQuiz]         = useState(false);
  const [quizStep, setQuizStep]         = useState(0);
  const [quizAnswers, setQuizAnswers]   = useState<Record<string, string[]>>({});
  const [quizComplete, setQuizComplete]   = useState(false);
  const [suggestions, setSuggestions]     = useState<string[]>([]);
  const [locCountry, setLocCountry]       = useState('');
  const [locState, setLocState]           = useState('');
  const [locCity, setLocCity]             = useState('');
  const [locSearch, setLocSearch]         = useState('');

  const [showRequestModal, setShowRequestModal]   = useState(false);
  const [requestText, setRequestText]             = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestDone, setRequestDone]             = useState(false);
  const [showFindPatch, setShowFindPatch]         = useState(false);
  const [showPatchTasks, setShowPatchTasks]       = useState(false);

  const patchScrollRef = useRef<ScrollView>(null);
  const patchScrollX   = useRef(0);
  const patchContentW  = useRef(0);
  const patchLayoutW   = useRef(0);
  const [patchArrows, setPatchArrows] = useState({ left: false, right: true });

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
    setLocCountry(''); setLocState(''); setLocCity(''); setLocSearch('');
  }

  async function retakeQuiz() {
    await AsyncStorage.removeItem('village_quiz_done');
    setQuizDone(false);
    setQuizStep(0);
    setQuizAnswers({});
    setQuizComplete(false);
    setLocCountry(''); setLocState(''); setLocCity(''); setLocSearch('');
    setShowQuiz(true);
  }

  async function toggleJoin(villageId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (!joinedIds.has(villageId) && !isSubscribed && joinedIds.size >= FREE_VILLAGE_LIMIT) {
      openPaywall();
      return;
    }

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

  function confirmLeave(village: Village) {
    const message = "You'll stop seeing posts from this patch and can rejoin any time.";
    // On web, RN's multi-button Alert doesn't fire onPress callbacks —
    // the browser confirm() dialog is the reliable alternative.
    if (Platform.OS === 'web') {
      if (window.confirm(`Leave ${village.name}? ${message}`)) toggleJoin(village.id);
      return;
    }
    Alert.alert(
      `Leave ${village.name}?`,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => toggleJoin(village.id) },
      ]
    );
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

  async function finishQuiz(extraAnswers?: Record<string, string[]>) {
    const all = { ...quizAnswers, ...(extraAnswers ?? {}) };
    const suggested = suggestVillages(all);
    setSuggestions(suggested);
    setQuizComplete(true);
    await AsyncStorage.setItem('village_quiz_done', 'true');
    setQuizDone(true);
  }

  async function submitVillageRequest() {
    const trimmed = requestText.trim();
    if (!trimmed) return;
    setSubmittingRequest(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const { error } = await supabase
        .from('village_requests')
        .insert({ user_id: user.id, description: trimmed });
      if (error) throw error;
      setRequestDone(true);
      setRequestText('');
    } catch (e: any) {
      Alert.alert('Could not submit', e.message ?? 'Please try again.');
    } finally {
      setSubmittingRequest(false);
    }
  }

  async function joinAllSuggested() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const toJoin = suggestions.filter(id => !joinedIds.has(id));
    const slotsLeft = isSubscribed ? toJoin.length : Math.max(0, FREE_VILLAGE_LIMIT - joinedIds.size);
    const limited = toJoin.slice(0, slotsLeft);
    if (limited.length > 0) {
      await supabase.from('user_villages').insert(
        limited.map(village_id => ({ user_id: user.id, village_id }))
      );
      setJoinedIds(prev => new Set([...prev, ...limited]));
    }
    closeQuiz();
    const skipped = toJoin.length - limited.length;
    if (skipped > 0) {
      const message = `You joined ${limited.length} patch${limited.length === 1 ? '' : 'es'}. ${skipped} more suggested patch${skipped === 1 ? ' was' : 'es were'} skipped — upgrade to join unlimited patches.`;
      // On web, RN's multi-button Alert doesn't fire onPress callbacks —
      // the browser confirm() dialog is the reliable alternative.
      if (Platform.OS === 'web') {
        if (window.confirm(`${message} Open upgrade screen?`)) openPaywall();
        return;
      }
      Alert.alert(
        'Free patch limit reached',
        message,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade', onPress: () => openPaywall() },
        ]
      );
    }
  }

  const filtered = search.trim()
    ? VILLAGES.filter(v =>
        v.name.toLowerCase().includes(search.toLowerCase()) ||
        v.description.toLowerCase().includes(search.toLowerCase())
      )
    : VILLAGES;

  const myVillages   = VILLAGES.filter(v => joinedIds.has(v.id));
  const discoverList = filtered.filter(v => !joinedIds.has(v.id) && !v.hidden);

  const currentQ        = QUIZ_QUESTIONS[quizStep];
  const isLocationStep  = currentQ?.type === 'location';
  const currentAnswers  = quizAnswers[currentQ?.id] ?? [];
  const canAdvance      = isLocationStep ? locCountry !== '' : currentAnswers.length > 0;
  const nextVisibleStep = getNextVisibleStep(quizStep, quizAnswers);
  const isLastStep      = nextVisibleStep === null;

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={c.primary} /></View>
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
        <Text style={s.heading}>Your Patch</Text>

        {/* Find Your Patch modal */}
        <FindYourPatchSheet
          visible={showFindPatch}
          onClose={() => setShowFindPatch(false)}
        />

        {/* Patch Tasks modal */}
        <PatchTasksSheet
          visible={showPatchTasks}
          onClose={() => setShowPatchTasks(false)}
          myVillages={myVillages}
        />

        {/* Search bar */}
        <View style={s.searchRow}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            placeholder="Search patches..."
            placeholderTextColor={c.textMuted}
            value={search}
            onChangeText={setSearch}
            accessibilityLabel="Search patches"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Clear search" accessibilityRole="button">
              <Text style={s.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Request a village banner */}
        <TouchableOpacity
          style={s.requestBanner}
          onPress={() => { setRequestDone(false); setShowRequestModal(true); }}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Don't see your community? Request one"
        >
          <Text style={s.requestBannerEmoji}>💌</Text>
          <Text style={s.requestBannerText}>Don't see your community? Request one</Text>
          <Text style={s.requestBannerArrow}>›</Text>
        </TouchableOpacity>

        {/* Request modal */}
        <Modal visible={showRequestModal} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={s.modalSafe}>
            <View style={s.modalHeader}>
              <TouchableOpacity style={s.modalCloseBtn} onPress={() => setShowRequestModal(false)}
                accessibilityRole="button" accessibilityLabel="Close">
                <Text style={s.modalCloseText}>✕</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary }}>Request a Patch</Text>
              <View style={s.modalCloseBtn} />
            </View>

            <ScrollView contentContainerStyle={s.quizContent} keyboardShouldPersistTaps="handled">
              {requestDone ? (
                <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                  <Text style={{ fontSize: 48, marginBottom: 16 }}>🎉</Text>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: c.textPrimary, marginBottom: 8, textAlign: 'center' }}>
                    Request sent!
                  </Text>
                  <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 22 }}>
                    Thanks for the suggestion. We'll review it and may add it as a new patch soon.
                  </Text>
                  <TouchableOpacity
                    style={[s.joinBtn, { marginTop: 32, paddingHorizontal: 28, paddingVertical: 12 }]}
                    onPress={() => setShowRequestModal(false)}
                    accessibilityRole="button" accessibilityLabel="Done"
                  >
                    <Text style={s.joinBtnText}>Done</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={[s.questionText, { marginBottom: 6 }]}>What community is missing?</Text>
                  <Text style={s.questionSub}>
                    Describe the community you'd love to see — e.g. "Moms of toddlers in Austin, TX" or "Bilingual parenting".
                  </Text>
                  <TextInput
                    style={s.requestInput}
                    placeholder="Describe your community idea..."
                    placeholderTextColor={c.textMuted}
                    value={requestText}
                    onChangeText={setRequestText}
                    multiline
                    maxLength={300}
                    textAlignVertical="top"
                    accessibilityLabel="Describe your community idea"
                  />
                  <Text style={s.requestCharCount}>{requestText.length}/300</Text>
                  <TouchableOpacity
                    style={[s.joinBtn, { paddingVertical: 14, borderRadius: 14, opacity: requestText.trim() ? 1 : 0.45 }]}
                    onPress={submitVillageRequest}
                    disabled={submittingRequest || !requestText.trim()}
                    activeOpacity={0.8}
                    accessibilityRole="button" accessibilityLabel="Send request"
                  >
                    {submittingRequest
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={s.joinBtnText}>Send Request</Text>
                    }
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>

        {/* Find Your Patches quiz card */}
        {!quizDone && !search && (
          <TouchableOpacity
            style={s.quizCard}
            onPress={() => setShowQuiz(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Find Your Patches. Answer a few questions to discover your perfect communities"
          >
            <Text style={s.quizCardEmoji}>🏘️</Text>
            <View style={s.quizCardBody}>
              <Text style={s.quizCardTitle}>Find Your Patches</Text>
              <Text style={s.quizCardSub}>Answer a few questions to discover your perfect communities</Text>
            </View>
            <Text style={s.quizCardArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* Retake quiz button */}
        {quizDone && !search && (
          <TouchableOpacity
            style={s.retakeRow}
            onPress={retakeQuiz}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Retake community quiz. Update your communities"
          >
            <Text style={s.retakeIcon}>🔄</Text>
            <View style={s.retakeBody}>
              <Text style={s.retakeTitle}>Retake community quiz</Text>
              <Text style={s.retakeSub}>Update your communities — new baby on the way?</Text>
            </View>
            <Text style={s.retakeArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* Meet Parents Like You — individual matching */}
        {!search && (
          <TouchableOpacity
            style={s.findPatchCard}
            onPress={() => setShowFindPatch(true)}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Meet Parents Like You. Get matched with parents in similar situations"
          >
            <View style={s.findPatchLeft}>
              <Text style={s.findPatchEmoji}>🤝</Text>
              <View>
                <Text style={s.findPatchTitle}>Meet Parents Like You</Text>
                <Text style={s.findPatchSub}>Get matched with parents in similar situations</Text>
              </View>
            </View>
            <Text style={s.findPatchArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* Patch Requests */}
        {!search && (
          <TouchableOpacity
            style={s.patchTasksCard}
            onPress={() => setShowPatchTasks(true)}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Patch Requests. Ask for help or offer it to a neighbor"
          >
            <View style={s.findPatchLeft}>
              <Text style={s.patchTasksEmoji}>🙋</Text>
              <View>
                <Text style={s.patchTasksTitle}>Patch Requests</Text>
                <Text style={s.patchTasksSub}>Ask for help or offer it to a neighbor</Text>
              </View>
            </View>
            <Text style={s.findPatchArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* My Patches */}
        {myVillages.length > 0 && !search && (
          <>
            <Text style={s.sectionTitle}>My Patches</Text>
            <View style={s.joinedScrollWrap}>
              <TouchableOpacity
                onPress={() => {
                  const maxX = Math.max(0, patchContentW.current - patchLayoutW.current);
                  patchScrollX.current = Math.max(0, patchScrollX.current - 200);
                  patchScrollRef.current?.scrollTo({ x: patchScrollX.current, animated: true });
                  setPatchArrows({ left: patchScrollX.current > 0, right: patchScrollX.current < maxX });
                }}
                activeOpacity={0.7}
                style={[s.joinedArrow, { opacity: patchArrows.left ? 1 : 0.25 }]}
                disabled={!patchArrows.left}
                accessibilityLabel="Scroll patches left"
                accessibilityRole="button"
              >
                <Text style={s.joinedArrowText}>‹</Text>
              </TouchableOpacity>

              <View style={{ flex: 1, overflow: 'hidden' }}>
                <ScrollView
                  ref={patchScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  onScroll={e => {
                    const x = e.nativeEvent.contentOffset.x;
                    patchScrollX.current = x;
                    const maxX = Math.max(0, patchContentW.current - patchLayoutW.current);
                    setPatchArrows({ left: x > 4, right: x < maxX - 4 });
                  }}
                  onContentSizeChange={w => {
                    patchContentW.current = w;
                    const maxX = Math.max(0, w - patchLayoutW.current);
                    setPatchArrows(a => ({ ...a, right: patchScrollX.current < maxX - 4 }));
                  }}
                  onLayout={e => {
                    patchLayoutW.current = e.nativeEvent.layout.width;
                    const maxX = Math.max(0, patchContentW.current - e.nativeEvent.layout.width);
                    setPatchArrows(a => ({ ...a, right: patchScrollX.current < maxX - 4 }));
                  }}
                  scrollEventThrottle={16}
                  contentContainerStyle={{ paddingRight: 8, gap: 0 }}
                >
                  {myVillages.map((v, i) => {
                    const chipColors = [
                      { bg: c.cardLavender, border: c.lavender },
                      { bg: c.cardBlue,     border: c.blue },
                      { bg: c.cardBlush,    border: c.blush },
                      { bg: c.cardHoney,    border: c.honey },
                      { bg: c.cardSage,     border: c.sage },
                    ];
                    const cc = chipColors[i % chipColors.length];
                    return (
                      <View key={v.id} style={[s.joinedChip, { backgroundColor: cc.bg, borderColor: cc.border }]}>
                        <TouchableOpacity
                          style={s.joinedChipBody}
                          onPress={() => setSelectedVillage(v)}
                          activeOpacity={0.75}
                          accessibilityRole="button"
                          accessibilityLabel={`Open ${v.name}`}
                        >
                          <Text style={s.joinedChipEmoji}>{v.emoji}</Text>
                          <Text style={s.joinedChipName} numberOfLines={1}>{v.name}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => confirmLeave(v)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel={`Leave ${v.name}`}
                          accessibilityRole="button"
                        >
                          <Text style={s.joinedChipLeave}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>

              <TouchableOpacity
                onPress={() => {
                  const maxX = Math.max(0, patchContentW.current - patchLayoutW.current);
                  patchScrollX.current = Math.min(maxX, patchScrollX.current + 200);
                  patchScrollRef.current?.scrollTo({ x: patchScrollX.current, animated: true });
                  setPatchArrows({ left: patchScrollX.current > 0, right: patchScrollX.current < maxX });
                }}
                activeOpacity={0.7}
                style={[s.joinedArrow, { opacity: patchArrows.right ? 1 : 0.25 }]}
                disabled={!patchArrows.right}
                accessibilityLabel="Scroll patches right"
                accessibilityRole="button"
              >
                <Text style={s.joinedArrowText}>›</Text>
              </TouchableOpacity>
            </View>

            {!isSubscribed && joinedIds.size >= FREE_VILLAGE_LIMIT && (
              <TouchableOpacity
                style={s.limitBanner}
                onPress={openPaywall}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`You've joined ${FREE_VILLAGE_LIMIT} free patches. Upgrade to join more.`}
              >
                <Text style={s.limitBannerText}>
                  You've joined {FREE_VILLAGE_LIMIT} free patches. <Text style={s.limitBannerLink}>Upgrade</Text> to join more.
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Discover / Search results */}
        {discoverList.length > 0 && (
          <>
            <Text style={s.sectionTitle}>{search ? 'Results' : 'Discover'}</Text>
            <View style={{ overflow: 'visible' }}>
              {discoverList.map((v, idx) => (
              <View key={v.id}>
                <VillageCard
                  village={v}
                  joining={joining === v.id}
                  onJoin={() => toggleJoin(v.id)}
                  onOpen={() => setSelectedVillage(v)}
                  colorIndex={idx}
                />
              </View>
              ))}
            </View>
          </>
        )}

        {search && filtered.length === 0 && (
          <View style={s.emptySearch}>
            <Text style={s.emptySearchEmoji}>🔍</Text>
            <Text style={s.emptySearchText}>No patches found for "{search}"</Text>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Village feed sheet ── */}
      <VillageFeedSheet
        village={selectedVillage}
        visible={selectedVillage !== null}
        onClose={() => setSelectedVillage(null)}
        joined={selectedVillage !== null && joinedIds.has(selectedVillage.id)}
        onToggleJoin={() => selectedVillage && toggleJoin(selectedVillage.id)}
      />

      {/* ── Quiz modal ── */}
      <Modal
        visible={showQuiz}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeQuiz}
      >
        <SafeAreaView style={s.modalSafe}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={closeQuiz} style={s.modalCloseBtn}
              accessibilityRole="button" accessibilityLabel="Close quiz">
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
              <Text style={s.resultsTitle}>Your patches are ready!</Text>
              <Text style={s.resultsSub}>
                {suggestions.length > 0
                  ? 'Based on your answers, we think you\'d love these:'
                  : 'Explore all our patches below and join the ones that feel right.'}
              </Text>

              {VILLAGES.filter(v => suggestions.includes(v.id)).map((v, idx) => (
                <VillageCard
                  key={v.id}
                  village={v}
                  joining={joining === v.id}
                  joined={joinedIds.has(v.id)}
                  onJoin={() => toggleJoin(v.id)}
                  onOpen={() => setSelectedVillage(v)}
                  fullWidth
                  colorIndex={idx}
                />
              ))}

              {suggestions.length > 0 && (
                <TouchableOpacity style={s.joinAllBtn} onPress={joinAllSuggested}
                  accessibilityRole="button" accessibilityLabel="Join all suggested patches and continue">
                  <Text style={s.joinAllBtnText}>Join All & Continue</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.skipBtn} onPress={closeQuiz}
                accessibilityRole="button" accessibilityLabel={suggestions.length > 0 ? 'Skip for now' : 'Done'}>
                <Text style={s.skipBtnText}>{suggestions.length > 0 ? 'Skip for now' : 'Done'}</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            /* ── Question ── */
            <ScrollView contentContainerStyle={s.quizContent} keyboardShouldPersistTaps="handled">
              {/* Progress bar */}
              <View style={s.progressBar}>
                <View style={{ flex: quizStep + 1, backgroundColor: c.progressFill, borderRadius: 3 }} />
                <View style={{ flex: QUIZ_QUESTIONS.length - quizStep - 1 }} />
              </View>

              <Text style={s.questionText}>{currentQ.question}</Text>
              {currentQ.multi && !isLocationStep && (
                <Text style={s.questionSub}>Select all that apply</Text>
              )}

              {isLocationStep ? (
                <LocationPicker
                  country={locCountry} state={locState} city={locCity} search={locSearch}
                  onCountryChange={ct => { setLocCountry(ct); setLocState(''); setLocCity(''); setLocSearch(''); }}
                  onStateChange={st => { setLocState(st); setLocCity(''); setLocSearch(''); }}
                  onCityChange={setLocCity}
                  onSearchChange={setLocSearch}
                />
              ) : (
                <>
                  {currentQ.options.map(option => {
                    const selected = currentAnswers.includes(option);
                    return (
                      <TouchableOpacity
                        key={option}
                        style={[s.optionBtn, selected && s.optionBtnSelected]}
                        onPress={() => toggleAnswer(currentQ.id, option, currentQ.multi)}
                        activeOpacity={0.75}
                        accessibilityRole="button" accessibilityLabel={option}
                      >
                        <View style={[s.optionDot, selected && s.optionDotSelected]} />
                        <Text style={[s.optionText, selected && s.optionTextSelected]}>{option}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {currentQ.hasRequestButton && (
                    <TouchableOpacity
                      style={lp.requestBtn}
                      activeOpacity={0.75}
                      onPress={() => setShowRequestModal(true)}
                      accessibilityRole="button" accessibilityLabel="Don't see yours? Request to add a patch"
                    >
                      <Text style={lp.requestBtnText}>✋ Don't see yours? Request to add a patch</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              <View style={s.quizNavRow}>
                {quizStep > 0 && (
                  <TouchableOpacity style={s.backBtn} onPress={() => setQuizStep(q => getPrevVisibleStep(q, quizAnswers))}
                    accessibilityRole="button" accessibilityLabel="Back">
                    <Text style={s.backBtnText}>← Back</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[s.nextBtn, !canAdvance && s.nextBtnDisabled]}
                  accessibilityRole="button" accessibilityLabel={isLastStep ? 'See my patches' : 'Next'}
                  onPress={() => {
                    if (isLocationStep) {
                      const loc: Record<string, string[]> = {};
                      if (locCountry) loc['location_country'] = [locCountry];
                      if (locState)   loc['location_state']   = [locState];
                      if (locCity)    loc['location_city']    = [locCity];
                      const next = getNextVisibleStep(quizStep, quizAnswers);
                      if (next === null) { finishQuiz(loc); return; }
                      setQuizAnswers(prev => ({ ...prev, ...loc }));
                      setQuizStep(next);
                    } else {
                      const next = getNextVisibleStep(quizStep, quizAnswers);
                      next === null ? finishQuiz() : setQuizStep(next);
                    }
                  }}
                  disabled={!canAdvance}
                >
                  <Text style={s.nextBtnText}>
                    {isLastStep ? 'See My Patches →' : 'Next →'}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    content: { padding: 24, paddingBottom: 40 },

    // Find Your Patch hero card
    findPatchCard: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.cardLavender, borderRadius: 16, padding: 16, marginBottom: 16,
      borderLeftWidth: 5, borderLeftColor: c.lavender,
    },
    findPatchLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
    findPatchEmoji: { fontSize: 28 },
    findPatchTitle: { fontSize: 16, fontWeight: '700', color: c.lavender },
    findPatchSub:   { fontSize: 12, color: c.lavender + 'AA', marginTop: 2 },
    findPatchArrow: { fontSize: 22, color: c.lavender, fontWeight: '700' },

    // Patch Requests card
    patchTasksCard: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.cardHoney, borderRadius: 16, padding: 16, marginBottom: 16,
      borderLeftWidth: 5, borderLeftColor: c.honey,
    },
    patchTasksEmoji: { fontSize: 28 },
    patchTasksTitle: { fontSize: 16, fontWeight: '700', color: c.honey },
    patchTasksSub:   { fontSize: 12, color: c.honey + 'AA', marginTop: 2 },

    heading: {
      fontSize: 26,
      fontWeight: '800',
      color: c.textSecondary,
      marginBottom: 16,
    },

    // ── Search
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: c.separator,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
      gap: 8,
    },
    searchIcon: { fontSize: 16 },
    searchInput: { flex: 1, fontSize: 15, color: c.textSecondary, padding: 0 },
    searchClear: { fontSize: 14, color: c.textMuted, paddingHorizontal: 4 },

    // ── Quiz card
    quizCard: {
      backgroundColor: c.quizCard,
      borderRadius: 16,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 28,
      borderLeftWidth: 5,
      borderLeftColor: c.quizCardBorder,
      gap: 14,
      shadowColor: c.quizCardBorder,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 3,
    },
    quizCardEmoji: { fontSize: 32 },
    quizCardBody: { flex: 1 },
    quizCardTitle: { fontSize: 17, fontWeight: '800', color: c.textSecondary, marginBottom: 4 },
    quizCardSub: { fontSize: 13, color: c.textMuted, lineHeight: 18 },
    quizCardArrow: { fontSize: 22, color: c.quizCardBorder, fontWeight: '600' },

    // ── Request banner
    requestBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.cardBlush,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginBottom: 16,
      borderWidth: 1.5,
      borderColor: c.blush,
      gap: 10,
    },
    requestBannerEmoji: { fontSize: 20 },
    requestBannerText: { flex: 1, fontSize: 14, fontWeight: '600', color: c.textSecondary },
    requestBannerArrow: { fontSize: 20, color: c.textMuted, fontWeight: '600' },
    requestInput: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.separator,
      padding: 14,
      fontSize: 15,
      color: c.textPrimary,
      minHeight: 120,
      marginBottom: 8,
    },
    requestCharCount: { fontSize: 12, color: c.textMuted, textAlign: 'right', marginBottom: 24 },

    // ── Retake quiz row
    retakeRow: {
      backgroundColor: c.retakeCard,
      borderRadius: 16,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 28,
      borderLeftWidth: 5,
      borderLeftColor: c.retakeCardBorder,
      gap: 14,
    },
    retakeIcon:  { fontSize: 26 },
    retakeBody:  { flex: 1 },
    retakeTitle: { fontSize: 15, fontWeight: '700', color: c.textSecondary, marginBottom: 2 },
    retakeSub:   { fontSize: 12, color: c.textMuted },
    retakeArrow: { fontSize: 22, color: c.retakeCardBorder, fontWeight: '600' },

    // ── Section title
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: c.textSecondary,
      marginBottom: 12,
    },

    // ── My Patches
    joinedScrollWrap: { flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
    joinedArrow:      { paddingHorizontal: 6, paddingVertical: 8, justifyContent: 'center', alignItems: 'center' },
    joinedArrowText:  { fontSize: 22, fontWeight: '600', color: c.textSecondary, lineHeight: 26 },
    joinedChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.joinedBg,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginRight: 10,
      gap: 6,
      borderWidth: 1,
      borderColor: c.joinedBorder,
      maxWidth: 180,
    },
    joinedChipBody: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
    joinedChipEmoji: { fontSize: 18 },
    joinedChipName: { fontSize: 13, fontWeight: '700', color: c.textPrimary, flex: 1 },
    joinedChipLeave: { fontSize: 11, color: c.textMuted, paddingLeft: 4 },
    limitBanner: {
      marginTop: 8,
      paddingVertical: 8,
      paddingHorizontal: 14,
      backgroundColor: c.cardHoney,
      borderRadius: 10,
      alignItems: 'center',
    },
    limitBannerText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    limitBannerLink: { fontWeight: '800', color: c.textPrimary },

    // ── Join button (used in request modal results)
    joinBtn: {
      backgroundColor: c.joinBtn,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 7,
      minWidth: 68,
      alignItems: 'center',
    },
    joinBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

    // ── Empty search
    emptySearch: { padding: 40, alignItems: 'center' },
    emptySearchEmoji: { fontSize: 36, marginBottom: 12 },
    emptySearchText: { fontSize: 14, color: c.textMuted, textAlign: 'center' },

    // ── Quiz modal
    modalSafe: { flex: 1, backgroundColor: c.bg },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.separator,
    },
    modalCloseBtn: { width: 40, alignItems: 'flex-start' },
    modalCloseText: { fontSize: 18, color: c.textMuted },
    modalStep: { fontSize: 14, fontWeight: '600', color: c.textMuted },

    // ── Quiz question
    quizContent: { padding: 24, paddingBottom: 40 },
    progressBar: {
      flexDirection: 'row',
      height: 6,
      backgroundColor: c.separator,
      borderRadius: 3,
      marginBottom: 32,
      overflow: 'hidden',
    },
    questionText: {
      fontSize: 20,
      fontWeight: '800',
      color: c.textPrimary,
      lineHeight: 28,
      marginBottom: 8,
    },
    questionSub: { fontSize: 13, color: c.textMuted, marginBottom: 20 },
    optionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1.5,
      borderColor: c.separator,
      gap: 12,
    },
    optionBtnSelected: { backgroundColor: c.optionSelected, borderColor: c.optionSelectedBorder },
    optionDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: c.primaryDisabled,
      backgroundColor: c.card,
    },
    optionDotSelected: { backgroundColor: c.optionDotSelected, borderColor: c.optionDotSelected },
    optionText: { flex: 1, fontSize: 15, color: c.textSecondary, fontWeight: '500' },
    optionTextSelected: { fontWeight: '700', color: c.textPrimary },
    quizNavRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 12,
      marginTop: 20,
    },
    backBtn: { paddingHorizontal: 8, paddingVertical: 12 },
    backBtnText: { fontSize: 15, color: c.textMuted, fontWeight: '600' },
    nextBtn: {
      backgroundColor: c.nextBtn,
      borderRadius: 14,
      paddingHorizontal: 24,
      paddingVertical: 12,
    },
    nextBtnDisabled: { backgroundColor: c.primaryDisabled },
    nextBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

    // ── Quiz results
    resultsContent: { padding: 24, paddingBottom: 40, alignItems: 'center' },
    resultsEmoji: { fontSize: 52, marginTop: 16, marginBottom: 16 },
    resultsTitle: { fontSize: 22, fontWeight: '800', color: c.textPrimary, marginBottom: 8, textAlign: 'center' },
    resultsSub: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 24, paddingHorizontal: 8 },
    joinAllBtn: {
      backgroundColor: c.fab,
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
    skipBtnText: { fontSize: 14, color: c.textMuted, fontWeight: '600' },
  });
}

function makeLocationPickerStyles(c: Colors) {
  return StyleSheet.create({
    requestBtn: { marginTop: 12, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, borderStyle: 'dashed' },
    requestBtnText: { fontSize: 13, color: c.textMuted, fontWeight: '500' },
  });
}
