import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Linking,
} from 'react-native';
import { supabase } from '../lib/supabase';
import UserAvatar from '../components/UserAvatar';
import { useColors, Colors } from '../lib/theme';
import { TopQuestion } from '../lib/topQuestionsData';
import { timeAgo } from './QAScreen';

interface Comment {
  id: string;
  user_id: string;
  author: string;
  body: string;
  created_at: string;
}

interface Props {
  question: TopQuestion;
  onBack: () => void;
}

export default function CommonQuestionDetail({ question, onBack }: Props) {
  const c = useColors();
  const s = makeStyles(c);

  const [userId, setUserId] = useState<string | null>(null);
  const [userAuthor, setUserAuthor] = useState('Parent');
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadUser();
    fetchComments();
  }, [question.id]);

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: profile } = await supabase
      .from('profiles').select('username, display_name').eq('id', user.id).maybeSingle();
    setUserAuthor(profile?.display_name || profile?.username || user.email?.split('@')[0] || 'Parent');
  }

  async function fetchComments() {
    setLoadingComments(true);
    const { data } = await supabase
      .from('common_question_comments')
      .select('*')
      .eq('question_id', question.id)
      .order('created_at', { ascending: true });
    setComments((data as Comment[]) ?? []);
    setLoadingComments(false);
  }

  async function submitComment() {
    if (!commentText.trim() || !userId) return;
    setSubmitting(true);
    await supabase.from('common_question_comments').insert({
      user_id: userId,
      question_id: question.id,
      author: userAuthor,
      body: commentText.trim(),
    });
    setCommentText('');
    setSubmitting(false);
    fetchComments();
  }

  const paragraphs = question.answer.split('\n\n');

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button" accessibilityLabel="Back to Common Questions">
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Common Questions</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.categoryBadge}>
            <Text style={s.categoryBadgeText}>{question.category}</Text>
          </View>
          <Text style={s.question}>{question.question}</Text>

          {paragraphs.map((p, i) => (
            <Text key={i} style={s.answerParagraph}>{p}</Text>
          ))}

          {question.sources && question.sources.length > 0 && (
            <View style={s.sourcesBlock}>
              <Text style={s.sourcesHeading}>Sources</Text>
              {question.sources.map((src, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => Linking.openURL(src.url)}
                  style={s.sourceRow}
                  accessibilityRole="link"
                  accessibilityLabel={src.label}
                >
                  <Text style={s.sourceText}>{src.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={s.divider} />

          <Text style={s.commentsHeading}>
            {comments.length === 0 ? 'Comments' : `Comments (${comments.length})`}
          </Text>

          {loadingComments ? (
            <ActivityIndicator style={{ marginTop: 16 }} color={c.primary} />
          ) : comments.length === 0 ? (
            <View style={s.noComments}>
              <Text style={s.noCommentsEmoji}>💬</Text>
              <Text style={s.noCommentsText}>No comments yet — share your experience or ask a follow-up.</Text>
            </View>
          ) : (
            comments.map(comment => (
              <View key={comment.id} style={s.commentCard}>
                <View style={s.commentHeader}>
                  <UserAvatar userId={comment.user_id} name={comment.author} size={32} />
                  <View>
                    <Text style={s.commentAuthor}>{comment.author}</Text>
                    <Text style={s.commentTime}>{timeAgo(comment.created_at)}</Text>
                  </View>
                </View>
                <Text style={s.commentBody}>{comment.body}</Text>
              </View>
            ))
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        <View style={s.commentBar}>
          <TextInput
            style={s.commentInput}
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Add a comment…"
            placeholderTextColor={c.textMuted}
            multiline
          />
          <TouchableOpacity
            onPress={submitComment}
            disabled={submitting || !commentText.trim()}
            style={[s.commentSubmitBtn, (!commentText.trim() || submitting) && s.commentSubmitBtnDisabled]}
          >
            <Text style={s.commentSubmitText}>{submitting ? '…' : '↑'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.separator },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backArrow: { fontSize: 20, color: c.textPrimary },
    backLabel: { fontSize: 15, fontWeight: '600', color: c.textPrimary },

    scroll: { padding: 20, paddingBottom: 32 },
    categoryBadge: {
      alignSelf: 'flex-start', backgroundColor: c.cardLavender, borderRadius: 10,
      paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10,
    },
    categoryBadgeText: { fontSize: 12, fontWeight: '700', color: c.textSecondary },
    question: { fontSize: 20, fontWeight: '800', color: c.textPrimary, lineHeight: 27, marginBottom: 14 },
    answerParagraph: { fontSize: 15, color: c.textSecondary, lineHeight: 23, marginBottom: 12 },

    sourcesBlock: { marginTop: 8, marginBottom: 8 },
    sourcesHeading: { fontSize: 12, fontWeight: '700', color: c.textMuted, marginBottom: 8, textTransform: 'uppercase' },
    sourceRow: {
      backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.cardBorder,
      paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
    },
    sourceText: { fontSize: 13, color: c.primary, fontWeight: '600', lineHeight: 18 },

    divider: { height: 1, backgroundColor: c.separator, marginVertical: 20 },
    commentsHeading: { fontSize: 16, fontWeight: '800', color: c.textPrimary, marginBottom: 12 },

    noComments: { alignItems: 'center', paddingVertical: 28, gap: 8 },
    noCommentsEmoji: { fontSize: 32 },
    noCommentsText: { fontSize: 14, color: c.textMuted, textAlign: 'center', paddingHorizontal: 24 },

    commentCard: {
      backgroundColor: c.card, borderRadius: 14, padding: 14, marginBottom: 10, gap: 8,
    },
    commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    commentAuthor: { fontSize: 13, fontWeight: '700', color: c.textPrimary },
    commentTime: { fontSize: 11, color: c.textMuted },
    commentBody: { fontSize: 14, color: c.textPrimary, lineHeight: 21 },

    commentBar: {
      flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12,
      borderTopWidth: 1, borderTopColor: c.separator, backgroundColor: c.card,
    },
    commentInput: {
      flex: 1, backgroundColor: c.inputBg, borderRadius: 14, padding: 12,
      fontSize: 14, color: c.textPrimary, borderWidth: 1.5, borderColor: c.inputBorder, maxHeight: 100,
    },
    commentSubmitBtn: {
      backgroundColor: c.primary, width: 40, height: 40, borderRadius: 20,
      justifyContent: 'center', alignItems: 'center',
    },
    commentSubmitBtnDisabled: { backgroundColor: c.primaryDisabled },
    commentSubmitText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  });
}
