import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, TextInput, Modal, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';
import UserAvatar from '../components/UserAvatar';
import { useColors, Colors } from '../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QAQuestion {
  id: string;
  user_id: string;
  author: string;
  content: string;
  topic: string;
  vote_score: number;
  answer_count: number;
  created_at: string;
}

interface QAAnswer {
  id: string;
  user_id: string;
  question_id: string;
  author: string;
  content: string;
  created_at: string;
}

interface QAReply {
  id: string;
  user_id: string;
  answer_id: string;
  author: string;
  content: string;
  created_at: string;
}

// ─── Topics ───────────────────────────────────────────────────────────────────

export const QA_TOPICS = [
  { id: 'all',          label: 'All',          emoji: '✨' },
  { id: 'sleep',        label: 'Sleep',        emoji: '😴' },
  { id: 'feeding',      label: 'Feeding',      emoji: '🍼' },
  { id: 'health',       label: 'Health',       emoji: '💊' },
  { id: 'development',  label: 'Development',  emoji: '🌱' },
  { id: 'mental_health',label: 'Mental Health',emoji: '🧠' },
  { id: 'postpartum',   label: 'Postpartum',   emoji: '💜' },
  { id: 'gear',         label: 'Gear',         emoji: '🛒' },
  { id: 'general',      label: 'General',      emoji: '💬' },
];

function topicMeta(id: string) {
  return QA_TOPICS.find(t => t.id === id) ?? QA_TOPICS[QA_TOPICS.length - 1];
}

function topicColor(id: string, c: Colors) {
  const map: Record<string, { bg: string; border: string }> = {
    sleep:         { bg: c.cardLavender, border: c.lavender },
    feeding:       { bg: c.cardBlue,     border: c.blue     },
    health:        { bg: c.cardBlush,    border: c.blush    },
    development:   { bg: c.cardSage,     border: c.sage     },
    mental_health: { bg: c.cardHoney,    border: c.honey    },
    postpartum:    { bg: c.cardLavender, border: c.lavender },
    gear:          { bg: c.cardBlue,     border: c.blue     },
    general:       { bg: c.cardBlush,    border: c.blush    },
  };
  return map[id] ?? { bg: c.cardLavender, border: c.lavender };
}

function timeAgo(dateString: string): string {
  const s = /Z|[+-]\d{2}:\d{2}$/.test(dateString) ? dateString : dateString + 'Z';
  const sec = Math.floor((Date.now() - new Date(s).getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface QAScreenProps {
  onBack?: () => void;
  initialQuestionId?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function QAScreen({ onBack, initialQuestionId }: QAScreenProps) {
  const c = useColors();
  const s = makeStyles(c);

  // ── view state
  const [view, setView] = useState<'list' | 'detail'>(initialQuestionId ? 'detail' : 'list');
  const [selectedQ, setSelectedQ] = useState<QAQuestion | null>(null);

  // ── list state
  const [questions, setQuestions] = useState<QAQuestion[]>([]);
  const [activeTopic, setActiveTopic] = useState('all');
  const [sortBy, setSortBy] = useState<'top' | 'new'>('top');
  const [loadingList, setLoadingList] = useState(true);

  // ── list search
  const [showListSearch, setShowListSearch] = useState(false);
  const [listSearchQuery, setListSearchQuery] = useState('');
  const [listSearchResults, setListSearchResults] = useState<QAQuestion[]>([]);
  const [listSearchLoading, setListSearchLoading] = useState(false);
  const listSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── user state
  const [userId, setUserId] = useState<string | null>(null);
  const [userAuthor, setUserAuthor] = useState('Parent');
  const [myVotes, setMyVotes] = useState<Record<string, 1 | -1>>({});
  const [myFollows, setMyFollows] = useState<Set<string>>(new Set());

  // ── ask modal (two-step: search → write)
  const [showAsk, setShowAsk] = useState(false);
  const [askStep, setAskStep] = useState<'search' | 'write'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<QAQuestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [askContent, setAskContent] = useState('');
  const [askTopic, setAskTopic] = useState('general');
  const [askSubmitting, setAskSubmitting] = useState(false);

  // ── detail state
  const [answers, setAnswers] = useState<QAAnswer[]>([]);
  const [replies, setReplies] = useState<Record<string, QAReply[]>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [answerText, setAnswerText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);

  // ── init
  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [activeTopic, sortBy]);

  useEffect(() => {
    if (!initialQuestionId) return;
    supabase.from('qa_questions').select('*').eq('id', initialQuestionId).maybeSingle()
      .then(({ data }) => { if (data) openQuestion(data as QAQuestion); });
  }, [initialQuestionId]);

  // Debounced search while in the ask-search step
  useEffect(() => {
    if (!showAsk || askStep !== 'search') return;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!searchQuery.trim()) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    searchDebounce.current = setTimeout(async () => {
      const { data } = await supabase
        .from('qa_questions')
        .select('*')
        .ilike('content', `%${searchQuery.trim()}%`)
        .order('vote_score', { ascending: false })
        .limit(10);
      setSearchResults((data as QAQuestion[]) ?? []);
      setSearchLoading(false);
    }, 350);
  }, [searchQuery, showAsk, askStep]);

  // Debounced search for the list page
  useEffect(() => {
    if (listSearchDebounce.current) clearTimeout(listSearchDebounce.current);
    if (!listSearchQuery.trim()) { setListSearchResults([]); setListSearchLoading(false); return; }
    setListSearchLoading(true);
    listSearchDebounce.current = setTimeout(async () => {
      const { data } = await supabase
        .from('qa_questions')
        .select('*')
        .ilike('content', `%${listSearchQuery.trim()}%`)
        .order('vote_score', { ascending: false })
        .limit(30);
      setListSearchResults((data as QAQuestion[]) ?? []);
      setListSearchLoading(false);
    }, 350);
  }, [listSearchQuery]);

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: profile } = await supabase
      .from('profiles').select('username, display_name').eq('id', user.id).maybeSingle();
    setUserAuthor(profile?.display_name || profile?.username || user.email?.split('@')[0] || 'Parent');

    const [{ data: voteRows }, { data: followRows }] = await Promise.all([
      supabase.from('qa_votes').select('question_id, vote').eq('user_id', user.id),
      supabase.from('qa_follows').select('question_id').eq('user_id', user.id),
    ]);
    if (voteRows) {
      const m: Record<string, 1 | -1> = {};
      voteRows.forEach((v: any) => { m[v.question_id] = v.vote; });
      setMyVotes(m);
    }
    if (followRows) {
      setMyFollows(new Set(followRows.map((f: any) => f.question_id)));
    }
  }

  async function fetchQuestions() {
    setLoadingList(true);
    let q = supabase.from('qa_questions').select('*');
    if (activeTopic !== 'all') q = q.eq('topic', activeTopic);
    q = sortBy === 'top'
      ? q.order('vote_score', { ascending: false })
      : q.order('created_at', { ascending: false });
    const { data } = await q.limit(60);
    if (data) setQuestions(data as QAQuestion[]);
    setLoadingList(false);
  }

  async function fetchDetail(q: QAQuestion) {
    setLoadingDetail(true);
    const { data: answerRows } = await supabase
      .from('qa_answers').select('*').eq('question_id', q.id).order('created_at', { ascending: true });
    const safeAnswers = (answerRows as QAAnswer[]) ?? [];
    setAnswers(safeAnswers);

    if (safeAnswers.length > 0) {
      const ids = safeAnswers.map(a => a.id);
      const { data: replyRows } = await supabase
        .from('qa_replies').select('*').in('answer_id', ids).order('created_at', { ascending: true });
      const replyMap: Record<string, QAReply[]> = {};
      (replyRows as QAReply[] ?? []).forEach(r => {
        if (!replyMap[r.answer_id]) replyMap[r.answer_id] = [];
        replyMap[r.answer_id].push(r);
      });
      setReplies(replyMap);
    } else {
      setReplies({});
    }
    setLoadingDetail(false);
  }

  function openQuestion(q: QAQuestion) {
    setSelectedQ(q);
    setView('detail');
    setAnswerText('');
    setReplyingTo(null);
    setReplyText('');
    fetchDetail(q);
  }

  function backFromDetail() {
    setView('list');
    setSelectedQ(null);
    fetchQuestions();
  }

  // ── Voting ────────────────────────────────────────────────────────────────

  async function handleVote(q: QAQuestion, vote: 1 | -1) {
    if (!userId) return;
    const existing = myVotes[q.id];
    let delta = 0;

    if (existing === vote) {
      await supabase.from('qa_votes').delete().eq('user_id', userId).eq('question_id', q.id);
      delta = -vote;
      setMyVotes(prev => { const n = { ...prev }; delete n[q.id]; return n; });
    } else if (existing) {
      await supabase.from('qa_votes').update({ vote }).eq('user_id', userId).eq('question_id', q.id);
      delta = vote * 2;
      setMyVotes(prev => ({ ...prev, [q.id]: vote }));
    } else {
      await supabase.from('qa_votes').insert({ user_id: userId, question_id: q.id, vote });
      delta = vote;
      setMyVotes(prev => ({ ...prev, [q.id]: vote }));
    }

    const newScore = q.vote_score + delta;
    await supabase.from('qa_questions').update({ vote_score: newScore }).eq('id', q.id);
    const patch = (list: QAQuestion[]) =>
      list.map(item => item.id === q.id ? { ...item, vote_score: newScore } : item);
    setQuestions(patch);
    if (selectedQ?.id === q.id) setSelectedQ(prev => prev ? { ...prev, vote_score: newScore } : null);
  }

  // ── Follow ────────────────────────────────────────────────────────────────

  async function handleFollow(qId: string) {
    if (!userId) return;
    if (myFollows.has(qId)) {
      await supabase.from('qa_follows').delete().eq('user_id', userId).eq('question_id', qId);
      setMyFollows(prev => { const n = new Set(prev); n.delete(qId); return n; });
    } else {
      await supabase.from('qa_follows').insert({ user_id: userId, question_id: qId });
      setMyFollows(prev => new Set([...prev, qId]));
    }
  }

  // ── Ask a question ────────────────────────────────────────────────────────

  function openAskModal() {
    setAskStep('search');
    setSearchQuery('');
    setSearchResults([]);
    setAskContent('');
    setAskTopic('general');
    setShowAsk(true);
  }

  function closeAskModal() {
    setShowAsk(false);
    setSearchQuery('');
    setSearchResults([]);
    setAskContent('');
  }

  function proceedToWrite() {
    // Pre-fill the question text with whatever the user searched so they don't retype
    setAskContent(searchQuery.trim());
    setAskStep('write');
  }

  async function submitQuestion() {
    if (!askContent.trim() || !userId) return;
    setAskSubmitting(true);
    const { error } = await supabase.from('qa_questions').insert({
      user_id: userId,
      author: userAuthor,
      content: askContent.trim(),
      topic: askTopic,
      vote_score: 0,
      answer_count: 0,
    });
    if (error) Alert.alert('Error', 'Could not post question.');
    closeAskModal();
    setAskSubmitting(false);
    fetchQuestions();
  }

  // ── Post an answer ────────────────────────────────────────────────────────

  async function submitAnswer() {
    if (!answerText.trim() || !selectedQ || !userId) return;
    setSubmittingAnswer(true);
    await supabase.from('qa_answers').insert({
      user_id: userId,
      question_id: selectedQ.id,
      author: userAuthor,
      content: answerText.trim(),
    });
    const newCount = (selectedQ.answer_count ?? 0) + 1;
    await supabase.from('qa_questions').update({ answer_count: newCount }).eq('id', selectedQ.id);
    setSelectedQ(prev => prev ? { ...prev, answer_count: newCount } : null);
    setAnswerText('');
    setSubmittingAnswer(false);
    fetchDetail(selectedQ);
  }

  // ── Post a reply ──────────────────────────────────────────────────────────

  async function submitReply(answerId: string) {
    if (!replyText.trim() || !userId) return;
    setSubmittingReply(true);
    await supabase.from('qa_replies').insert({
      user_id: userId,
      answer_id: answerId,
      author: userAuthor,
      content: replyText.trim(),
    });
    setReplyText('');
    setReplyingTo(null);
    setSubmittingReply(false);
    if (selectedQ) fetchDetail(selectedQ);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Question List
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'list') {
    return (
      <SafeAreaView style={s.container}>
        {/* Header */}
        <View style={s.header}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.backArrow}>←</Text>
            </TouchableOpacity>
          )}
          <Text style={s.headerTitle}>Parenting Q+A</Text>
          <TouchableOpacity
            onPress={() => { setShowListSearch(true); setListSearchQuery(''); setListSearchResults([]); }}
            style={s.headerIconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={s.headerIconBtnText}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.askBtn} onPress={openAskModal} activeOpacity={0.8}>
            <Text style={s.askBtnText}>+ Ask</Text>
          </TouchableOpacity>
        </View>

        {/* Search bar (replaces topic filter when active) */}
        {showListSearch ? (
          <View style={s.listSearchBar}>
            <View style={s.listSearchInputWrap}>
              <Text style={s.searchInputIcon}>🔍</Text>
              <TextInput
                style={s.listSearchInput}
                value={listSearchQuery}
                onChangeText={setListSearchQuery}
                placeholder="Search questions…"
                placeholderTextColor={c.textMuted}
                autoFocus
                returnKeyType="search"
              />
              {listSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setListSearchQuery('')}>
                  <Text style={s.searchClear}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity onPress={() => { setShowListSearch(false); setListSearchQuery(''); setListSearchResults([]); }}>
              <Text style={s.listSearchCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Topic filter */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.topicScroll}
              contentContainerStyle={s.topicScrollContent}
            >
              {QA_TOPICS.map(t => (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => setActiveTopic(t.id)}
                  style={[s.topicChip, activeTopic === t.id && s.topicChipActive]}
                  activeOpacity={0.75}
                >
                  <Text style={s.topicChipEmoji}>{t.emoji}</Text>
                  <Text style={[s.topicChipLabel, activeTopic === t.id && s.topicChipLabelActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Sort toggle */}
            <View style={s.sortRow}>
              <Text style={s.sortLabel}>Sort:</Text>
              <TouchableOpacity
                onPress={() => setSortBy('top')}
                style={[s.sortBtn, sortBy === 'top' && s.sortBtnActive]}
              >
                <Text style={[s.sortBtnText, sortBy === 'top' && s.sortBtnTextActive]}>⬆ Top</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSortBy('new')}
                style={[s.sortBtn, sortBy === 'new' && s.sortBtnActive]}
              >
                <Text style={[s.sortBtnText, sortBy === 'new' && s.sortBtnTextActive]}>🕐 New</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Question list */}
        {(loadingList && !showListSearch) ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
        ) : (
          <ScrollView contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
            {/* Search mode */}
            {showListSearch && listSearchQuery.trim().length === 0 && (
              <View style={s.searchPrompt}>
                <Text style={s.searchPromptEmoji}>💭</Text>
                <Text style={s.searchPromptText}>Start typing to search questions</Text>
              </View>
            )}
            {showListSearch && listSearchLoading && (
              <ActivityIndicator style={{ marginTop: 24 }} color={c.primary} />
            )}
            {showListSearch && !listSearchLoading && listSearchQuery.trim().length > 0 && listSearchResults.length === 0 && (
              <View style={s.emptyState}>
                <Text style={s.emptyEmoji}>🔍</Text>
                <Text style={s.emptyText}>No questions found.</Text>
                <TouchableOpacity style={[s.askNewBtn, { marginTop: 8 }]} onPress={openAskModal} activeOpacity={0.8}>
                  <Text style={s.askNewBtnText}>Ask this question →</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* Normal mode: empty state */}
            {!showListSearch && questions.length === 0 && (
              <View style={s.emptyState}>
                <Text style={s.emptyEmoji}>🤔</Text>
                <Text style={s.emptyText}>No questions yet{activeTopic !== 'all' ? ' for this topic' : ''}.</Text>
                <Text style={s.emptyHint}>Be the first to ask!</Text>
              </View>
            )}
            {(showListSearch ? listSearchResults : questions).map(q => {
              const tc = topicColor(q.topic, c);
              const meta = topicMeta(q.topic);
              const isFollowing = myFollows.has(q.id);
              const myVote = myVotes[q.id];
              return (
                <TouchableOpacity key={q.id} style={s.qCard} onPress={() => openQuestion(q)} activeOpacity={0.85}>
                  <View style={s.qCardTop}>
                    <View style={[s.topicBadge, { backgroundColor: tc.bg, borderColor: tc.border }]}>
                      <Text style={s.topicBadgeText}>{meta.emoji} {meta.label}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleFollow(q.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={s.followBtn}
                    >
                      <Text style={s.followBtnText}>{isFollowing ? '🔔' : '🔕'}</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={s.qContent} numberOfLines={3}>{q.content}</Text>

                  <View style={s.qMeta}>
                    <View style={s.voteRow}>
                      <TouchableOpacity
                        onPress={() => handleVote(q, 1)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={[s.voteArrow, myVote === 1 && s.voteArrowActive]}>▲</Text>
                      </TouchableOpacity>
                      <Text style={s.voteScore}>{q.vote_score}</Text>
                      <TouchableOpacity
                        onPress={() => handleVote(q, -1)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={[s.voteArrow, s.voteArrowDown, myVote === -1 && s.voteArrowDownActive]}>▼</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={s.qMetaText}>💬 {q.answer_count} answer{q.answer_count !== 1 ? 's' : ''}</Text>
                    <Text style={s.qMetaText}>· {q.author} · {timeAgo(q.created_at)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <View style={{ height: 32 }} />
          </ScrollView>
        )}

        {/* Ask question modal — two steps */}
        <Modal visible={showAsk} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeAskModal}>
          <SafeAreaView style={s.modalSafe}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>

              {/* ── Step 1: Search ── */}
              {askStep === 'search' && (
                <>
                  <View style={s.modalHeader}>
                    <TouchableOpacity onPress={closeAskModal}>
                      <Text style={s.modalCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={s.modalTitle}>Search Questions</Text>
                    <View style={{ width: 60 }} />
                  </View>

                  <View style={s.searchStepBody}>
                    <Text style={s.searchHint}>
                      Search to see if your question has already been asked. If not, you can ask it! 💛
                    </Text>
                    <View style={s.searchInputWrap}>
                      <Text style={s.searchInputIcon}>🔍</Text>
                      <TextInput
                        style={s.searchInput}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="What's your question about?"
                        placeholderTextColor={c.textMuted}
                        autoFocus
                        returnKeyType="search"
                      />
                      {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
                          <Text style={s.searchClear}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Results */}
                    <ScrollView style={s.searchResults} keyboardShouldPersistTaps="handled">
                      {searchLoading && (
                        <ActivityIndicator style={{ marginTop: 20 }} color={c.primary} />
                      )}

                      {!searchLoading && searchQuery.trim().length > 0 && searchResults.length === 0 && (
                        <View style={s.noResultsWrap}>
                          <Text style={s.noResultsEmoji}>🤷</Text>
                          <Text style={s.noResultsText}>No matching questions found.</Text>
                          <TouchableOpacity style={s.askNewBtn} onPress={proceedToWrite} activeOpacity={0.8}>
                            <Text style={s.askNewBtnText}>Ask this question →</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {!searchLoading && searchResults.map(q => {
                        const tc = topicColor(q.topic, c);
                        const meta = topicMeta(q.topic);
                        return (
                          <TouchableOpacity
                            key={q.id}
                            style={s.searchResultCard}
                            onPress={() => { closeAskModal(); openQuestion(q); }}
                            activeOpacity={0.85}
                          >
                            <View style={[s.topicBadge, { backgroundColor: tc.bg, borderColor: tc.border, alignSelf: 'flex-start', marginBottom: 6 }]}>
                              <Text style={s.topicBadgeText}>{meta.emoji} {meta.label}</Text>
                            </View>
                            <Text style={s.searchResultContent} numberOfLines={3}>{q.content}</Text>
                            <Text style={s.searchResultMeta}>
                              💬 {q.answer_count} answer{q.answer_count !== 1 ? 's' : ''} · ⬆ {q.vote_score}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}

                      {!searchLoading && searchResults.length > 0 && (
                        <TouchableOpacity style={s.askDifferentBtn} onPress={proceedToWrite} activeOpacity={0.8}>
                          <Text style={s.askDifferentBtnText}>My question is different — ask it →</Text>
                        </TouchableOpacity>
                      )}

                      {!searchLoading && searchQuery.trim().length === 0 && (
                        <View style={s.searchPrompt}>
                          <Text style={s.searchPromptEmoji}>💭</Text>
                          <Text style={s.searchPromptText}>Start typing to search existing questions</Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                </>
              )}

              {/* ── Step 2: Write ── */}
              {askStep === 'write' && (
                <>
                  <View style={s.modalHeader}>
                    <TouchableOpacity onPress={() => setAskStep('search')}>
                      <Text style={s.modalCancel}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={s.modalTitle}>Ask a Question</Text>
                    <TouchableOpacity
                      onPress={submitQuestion}
                      disabled={askSubmitting || !askContent.trim()}
                      style={[s.modalPost, (!askContent.trim() || askSubmitting) && s.modalPostDisabled]}
                    >
                      <Text style={s.modalPostText}>{askSubmitting ? '…' : 'Post'}</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
                    <Text style={s.modalSectionLabel}>Topic</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
                        {QA_TOPICS.filter(t => t.id !== 'all').map(t => (
                          <TouchableOpacity
                            key={t.id}
                            onPress={() => setAskTopic(t.id)}
                            style={[s.askTopicChip, askTopic === t.id && s.askTopicChipActive]}
                          >
                            <Text style={s.askTopicChipText}>{t.emoji} {t.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>

                    <Text style={s.modalSectionLabel}>Your question</Text>
                    <TextInput
                      style={s.modalInput}
                      value={askContent}
                      onChangeText={setAskContent}
                      placeholder="What's on your mind? Other parents are here to help 💛"
                      placeholderTextColor={c.textMuted}
                      multiline
                      autoFocus
                    />
                  </ScrollView>
                </>
              )}

            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Question Detail
  // ─────────────────────────────────────────────────────────────────────────

  const q = selectedQ!;
  const tc = topicColor(q.topic, c);
  const meta = topicMeta(q.topic);
  const isFollowing = myFollows.has(q.id);
  const myVote = myVotes[q.id];

  return (
    <SafeAreaView style={s.container}>
      {/* Detail header */}
      <View style={s.header}>
        <TouchableOpacity onPress={backFromDetail} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Q+A</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleFollow(q.id)}
          style={[s.followHeaderBtn, isFollowing && s.followHeaderBtnActive]}
        >
          <Text style={s.followHeaderBtnText}>{isFollowing ? '🔔 Following' : '🔕 Follow'}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.detailScroll} showsVerticalScrollIndicator={false}>
          {/* Question card */}
          <View style={[s.detailQCard, { borderLeftColor: tc.border }]}>
            <View style={[s.topicBadge, { backgroundColor: tc.bg, borderColor: tc.border, alignSelf: 'flex-start' }]}>
              <Text style={s.topicBadgeText}>{meta.emoji} {meta.label}</Text>
            </View>
            <Text style={s.detailQContent}>{q.content}</Text>
            <Text style={s.detailQMeta}>Asked by {q.author} · {timeAgo(q.created_at)}</Text>

            {/* Votes */}
            <View style={s.detailVoteRow}>
              <TouchableOpacity onPress={() => handleVote(q, 1)} style={s.detailVoteBtn}>
                <Text style={[s.detailVoteArrow, myVote === 1 && s.voteArrowActive]}>▲</Text>
              </TouchableOpacity>
              <Text style={s.detailVoteScore}>{q.vote_score}</Text>
              <TouchableOpacity onPress={() => handleVote(q, -1)} style={s.detailVoteBtn}>
                <Text style={[s.detailVoteArrow, s.voteArrowDown, myVote === -1 && s.voteArrowDownActive]}>▼</Text>
              </TouchableOpacity>
              <Text style={s.detailAnswerCount}>· {q.answer_count} answer{q.answer_count !== 1 ? 's' : ''}</Text>
            </View>
          </View>

          {/* Answers */}
          {loadingDetail ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={c.primary} />
          ) : answers.length === 0 ? (
            <View style={s.noAnswers}>
              <Text style={s.noAnswersEmoji}>💭</Text>
              <Text style={s.noAnswersText}>No answers yet — be the first to help!</Text>
            </View>
          ) : (
            answers.map(ans => (
              <View key={ans.id} style={s.answerCard}>
                <View style={s.answerHeader}>
                  <UserAvatar userId={ans.user_id} name={ans.author} size={32} />
                  <View>
                    <Text style={s.answerAuthor}>{ans.author}</Text>
                    <Text style={s.answerTime}>{timeAgo(ans.created_at)}</Text>
                  </View>
                </View>
                <Text style={s.answerContent}>{ans.content}</Text>

                {/* Replies */}
                {(replies[ans.id] ?? []).map(rep => (
                  <View key={rep.id} style={s.replyCard}>
                    <View style={s.replyHeader}>
                      <Text style={s.replyAuthor}>{rep.author}</Text>
                      <Text style={s.replyTime}>{timeAgo(rep.created_at)}</Text>
                    </View>
                    <Text style={s.replyContent}>{rep.content}</Text>
                  </View>
                ))}

                {/* Reply input */}
                {replyingTo === ans.id ? (
                  <View style={s.replyInputRow}>
                    <TextInput
                      style={s.replyInput}
                      value={replyText}
                      onChangeText={setReplyText}
                      placeholder="Write a reply…"
                      placeholderTextColor={c.textMuted}
                      autoFocus
                      multiline
                    />
                    <TouchableOpacity
                      onPress={() => submitReply(ans.id)}
                      disabled={submittingReply || !replyText.trim()}
                      style={[s.replySubmitBtn, (!replyText.trim() || submittingReply) && s.replySubmitBtnDisabled]}
                    >
                      <Text style={s.replySubmitText}>{submittingReply ? '…' : 'Send'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => { setReplyingTo(ans.id); setReplyText(''); }}
                    style={s.replyBtn}
                  >
                    <Text style={s.replyBtnText}>↩ Reply</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Answer input bar */}
        <View style={s.answerBar}>
          <TextInput
            style={s.answerInput}
            value={answerText}
            onChangeText={setAnswerText}
            placeholder="Write an answer…"
            placeholderTextColor={c.textMuted}
            multiline
          />
          <TouchableOpacity
            onPress={submitAnswer}
            disabled={submittingAnswer || !answerText.trim()}
            style={[s.answerSubmitBtn, (!answerText.trim() || submittingAnswer) && s.answerSubmitBtnDisabled]}
          >
            <Text style={s.answerSubmitText}>{submittingAnswer ? '…' : '↑'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },

    // ── header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 8,
      gap: 8,
    },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 4 },
    backArrow: { fontSize: 20, color: c.textSecondary, fontWeight: '700' },
    backLabel: { fontSize: 15, color: c.textSecondary, fontWeight: '700' },
    headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: c.textPrimary },
    askBtn: {
      backgroundColor: c.primary,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
    },
    askBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    headerIconBtn: { padding: 4 },
    headerIconBtnText: { fontSize: 20 },
    listSearchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 10,
      gap: 10,
    },
    listSearchInputWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.inputBg,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: c.inputBorder,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 8,
    },
    listSearchInput: { flex: 1, fontSize: 15, color: c.textPrimary },
    listSearchCancel: { fontSize: 14, fontWeight: '600', color: c.textMuted },

    // ── topic filter
    topicScroll: { flexGrow: 0 },
    topicScrollContent: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
    topicChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.card,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1.5,
      borderColor: c.cardBorder,
    },
    topicChipActive: {
      backgroundColor: c.cardLavender,
      borderColor: c.lavender,
    },
    topicChipEmoji: { fontSize: 14 },
    topicChipLabel: { fontSize: 12, fontWeight: '600', color: c.textMuted },
    topicChipLabelActive: { color: c.textPrimary },

    // ── sort row
    sortRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 10,
      gap: 8,
    },
    sortLabel: { fontSize: 12, color: c.textMuted, fontWeight: '600' },
    sortBtn: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.cardBorder,
    },
    sortBtnActive: { backgroundColor: c.cardBlue, borderColor: c.blue },
    sortBtnText: { fontSize: 12, fontWeight: '600', color: c.textMuted },
    sortBtnTextActive: { color: c.textPrimary },

    // ── list
    listContent: { paddingHorizontal: 16, paddingTop: 4 },
    qCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
      gap: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    qCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    topicBadge: {
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
    },
    topicBadgeText: { fontSize: 11, fontWeight: '700', color: c.textSecondary },
    followBtn: { padding: 2 },
    followBtnText: { fontSize: 18 },
    qContent: { fontSize: 15, color: c.textPrimary, fontWeight: '500', lineHeight: 22 },
    qMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    voteRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    voteArrow: { fontSize: 13, color: c.textMuted, fontWeight: '700' },
    voteArrowActive: { color: c.sage },
    voteArrowDown: {},
    voteArrowDownActive: { color: c.blush },
    voteScore: { fontSize: 13, fontWeight: '800', color: c.textSecondary, minWidth: 20, textAlign: 'center' },
    qMetaText: { fontSize: 12, color: c.textMuted, fontWeight: '500' },

    // ── empty state
    emptyState: { alignItems: 'center', paddingTop: 60, gap: 8 },
    emptyEmoji: { fontSize: 40 },
    emptyText: { fontSize: 16, fontWeight: '700', color: c.textSecondary },
    emptyHint: { fontSize: 14, color: c.textMuted },

    // ── search step
    searchStepBody: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
    searchHint: {
      fontSize: 13,
      color: c.textMuted,
      fontWeight: '500',
      lineHeight: 19,
      marginBottom: 12,
      textAlign: 'center',
    },
    searchInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.inputBg,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: c.inputBorder,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
      marginBottom: 12,
    },
    searchInputIcon: { fontSize: 16 },
    searchInput: { flex: 1, fontSize: 15, color: c.textPrimary },
    searchClear: { fontSize: 14, color: c.textMuted, fontWeight: '700', paddingHorizontal: 4 },
    searchResults: { flex: 1 },
    searchResultCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.cardBorder,
    },
    searchResultContent: {
      fontSize: 14,
      fontWeight: '500',
      color: c.textPrimary,
      lineHeight: 20,
      marginBottom: 6,
    },
    searchResultMeta: { fontSize: 12, color: c.textMuted, fontWeight: '500' },
    noResultsWrap: { alignItems: 'center', paddingTop: 32, gap: 10 },
    noResultsEmoji: { fontSize: 36 },
    noResultsText: { fontSize: 14, color: c.textMuted, fontWeight: '500' },
    askNewBtn: {
      marginTop: 8,
      backgroundColor: c.primary,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 20,
    },
    askNewBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    askDifferentBtn: {
      alignSelf: 'center',
      marginVertical: 16,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 20,
      backgroundColor: c.cardBlue,
      borderWidth: 1.5,
      borderColor: c.blue,
    },
    askDifferentBtnText: { color: c.textPrimary, fontWeight: '700', fontSize: 13 },
    searchPrompt: { alignItems: 'center', paddingTop: 48, gap: 10 },
    searchPromptEmoji: { fontSize: 36 },
    searchPromptText: { fontSize: 14, color: c.textMuted, fontWeight: '500' },

    // ── ask modal
    modalSafe: { flex: 1, backgroundColor: c.bg },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.separator,
    },
    modalCancel: { fontSize: 15, color: c.textMuted, fontWeight: '600', flex: 1 },
    modalTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary, flex: 2, textAlign: 'center' },
    modalPost: {
      flex: 1,
      alignItems: 'flex-end',
      backgroundColor: c.primary,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 16,
    },
    modalPostDisabled: { backgroundColor: c.primaryDisabled },
    modalPostText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    modalBody: { flex: 1, padding: 16 },
    modalSectionLabel: { fontSize: 12, fontWeight: '700', color: c.textMuted, marginBottom: 8, textTransform: 'uppercase' },
    askTopicChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: c.card,
      borderWidth: 1.5,
      borderColor: c.cardBorder,
    },
    askTopicChipActive: { backgroundColor: c.cardLavender, borderColor: c.lavender },
    askTopicChipText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    modalInput: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      fontSize: 15,
      color: c.textPrimary,
      minHeight: 140,
      textAlignVertical: 'top',
      borderWidth: 1.5,
      borderColor: c.inputBorder,
    },

    // ── detail
    detailScroll: { paddingHorizontal: 16, paddingTop: 8 },
    detailQCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      gap: 10,
      borderLeftWidth: 4,
      marginBottom: 16,
    },
    detailQContent: { fontSize: 17, fontWeight: '600', color: c.textPrimary, lineHeight: 26 },
    detailQMeta: { fontSize: 12, color: c.textMuted, fontWeight: '500' },
    detailVoteRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    detailVoteBtn: { padding: 4 },
    detailVoteArrow: { fontSize: 16, color: c.textMuted, fontWeight: '700' },
    detailVoteScore: { fontSize: 16, fontWeight: '800', color: c.textSecondary, minWidth: 24, textAlign: 'center' },
    detailAnswerCount: { fontSize: 13, color: c.textMuted, fontWeight: '500' },

    followHeaderBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: c.card,
      borderWidth: 1.5,
      borderColor: c.cardBorder,
    },
    followHeaderBtnActive: { backgroundColor: c.cardSage, borderColor: c.sage },
    followHeaderBtnText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },

    // ── no answers
    noAnswers: { alignItems: 'center', paddingVertical: 32, gap: 8 },
    noAnswersEmoji: { fontSize: 36 },
    noAnswersText: { fontSize: 14, color: c.textMuted, fontWeight: '500' },

    // ── answer card
    answerCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      gap: 8,
    },
    answerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    answerAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.cardLavender,
      justifyContent: 'center',
      alignItems: 'center',
    },
    answerAvatarText: { fontSize: 14, fontWeight: '700', color: c.textSecondary },
    answerAuthor: { fontSize: 13, fontWeight: '700', color: c.textPrimary },
    answerTime: { fontSize: 11, color: c.textMuted },
    answerContent: { fontSize: 14, color: c.textPrimary, lineHeight: 21 },
    replyBtn: { alignSelf: 'flex-start' },
    replyBtnText: { fontSize: 12, color: c.textMuted, fontWeight: '600' },

    // ── replies
    replyCard: {
      marginLeft: 16,
      paddingLeft: 12,
      paddingVertical: 8,
      borderLeftWidth: 2,
      borderLeftColor: c.separator,
      gap: 2,
    },
    replyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    replyAuthor: { fontSize: 12, fontWeight: '700', color: c.textSecondary },
    replyTime: { fontSize: 11, color: c.textMuted },
    replyContent: { fontSize: 13, color: c.textPrimary, lineHeight: 19 },

    // ── reply input
    replyInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginLeft: 16, marginTop: 4 },
    replyInput: {
      flex: 1,
      backgroundColor: c.inputBg,
      borderRadius: 12,
      padding: 10,
      fontSize: 13,
      color: c.textPrimary,
      borderWidth: 1,
      borderColor: c.inputBorder,
      maxHeight: 80,
    },
    replySubmitBtn: {
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    replySubmitBtnDisabled: { backgroundColor: c.primaryDisabled },
    replySubmitText: { color: '#fff', fontWeight: '700', fontSize: 13 },

    // ── answer bar
    answerBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: c.separator,
      backgroundColor: c.card,
    },
    answerInput: {
      flex: 1,
      backgroundColor: c.inputBg,
      borderRadius: 14,
      padding: 12,
      fontSize: 14,
      color: c.textPrimary,
      borderWidth: 1.5,
      borderColor: c.inputBorder,
      maxHeight: 100,
    },
    answerSubmitBtn: {
      backgroundColor: c.primary,
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    answerSubmitBtnDisabled: { backgroundColor: c.primaryDisabled },
    answerSubmitText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  });
}
