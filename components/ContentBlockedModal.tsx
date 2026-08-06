import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useColors } from '../lib/theme';

export type ContentType = 'post_image' | 'post_video' | 'profile_avatar' | 'baby_photo' | 'event_photo' | 'listing_photo' | 'item_photo' | 'story_photo' | 'activity_photo';

interface Props {
  visible: boolean;
  severity: 'high' | 'extreme';
  reason: string;
  contentType: ContentType;
  userId: string;
  onClose: () => void;
}

const CONTENT_LABELS: Record<ContentType, string> = {
  post_image: 'post photo',
  post_video: 'post video',
  profile_avatar: 'profile photo',
  baby_photo: 'baby photo',
  event_photo: 'event photo',
  listing_photo: 'listing photo',
  item_photo: 'item photo',
  story_photo: 'story photo',
  activity_photo: 'activity photo',
};

const UPLOAD_VERB: Record<ContentType, string> = {
  post_image: 'posting',
  post_video: 'posting',
  profile_avatar: 'uploading',
  baby_photo: 'uploading',
  event_photo: 'uploading',
  listing_photo: 'uploading',
  item_photo: 'uploading',
  story_photo: 'posting',
  activity_photo: 'uploading',
};

export default function ContentBlockedModal({
  visible, severity, reason, contentType, userId, onClose,
}: Props) {
  const c = useColors();
  const flagIdRef = useRef<string | null>(null);
  const [disputeText, setDisputeText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    if (!visible) {
      setDisputeText('');
      setSubmitting(false);
      setSubmitted(false);
      flagIdRef.current = null;
      return;
    }
    (async () => {
      setLogging(true);
      const { data } = await (supabase as any)
        .from('content_flags')
        .insert({ user_id: userId, content_type: contentType, flag_reason: reason, severity })
        .select('id')
        .single();
      if (data) flagIdRef.current = data.id;
      setLogging(false);
    })();
  }, [visible]);

  async function submitDispute() {
    if (!disputeText.trim() || !flagIdRef.current) return;
    setSubmitting(true);
    await (supabase as any)
      .from('content_flags')
      .update({
        disputed: true,
        dispute_reason: disputeText.trim(),
        disputed_at: new Date().toISOString(),
      })
      .eq('id', flagIdRef.current);
    setSubmitting(false);
    setSubmitted(true);
  }

  const isExtreme = severity === 'extreme';
  const label = CONTENT_LABELS[contentType];
  const verb = UPLOAD_VERB[contentType];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView
          contentContainerStyle={{ padding: 24, gap: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={{ alignItems: 'center', gap: 10, paddingTop: 8 }}>
            <Text style={{ fontSize: 52 }}>{isExtreme ? '🚨' : '🚫'}</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: c.textPrimary, textAlign: 'center' }}>
              Content Blocked
            </Text>
            <Text style={{ fontSize: 15, color: c.textMuted, textAlign: 'center', lineHeight: 22 }}>
              Your {label} was prevented from {verb} because our system detected {reason}.
            </Text>
          </View>

          {/* Legal warning */}
          <View style={{
            backgroundColor: isExtreme ? '#FEF2F2' : '#FFF7ED',
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: isExtreme ? '#FCA5A5' : '#FED7AA',
            padding: 16,
            gap: 8,
          }}>
            <Text style={{
              fontSize: 13, fontWeight: '800', letterSpacing: 0.2,
              color: isExtreme ? '#DC2626' : '#C2410C',
            }}>
              {isExtreme ? '🚨 IMPORTANT — Legal Notice' : '⚠️ Community Standards & Legal Notice'}
            </Text>
            <Text style={{
              fontSize: 13, lineHeight: 20,
              color: isExtreme ? '#7F1D1D' : '#7C2D12',
            }}>
              Any content containing illegal material — including{' '}
              <Text style={{ fontWeight: '700' }}>child sexual abuse material (CSAM)</Text>
              {' '}— is immediately reviewed and{' '}
              <Text style={{ fontWeight: '700' }}>
                reported to the National Center for Missing & Exploited Children (NCMEC) and law enforcement
              </Text>
              {' '}as required by federal law. Accounts found to have posted illegal material receive a{' '}
              <Text style={{ fontWeight: '700' }}>permanent, immediate ban with no appeal.</Text>
            </Text>
            {isExtreme && (
              <Text style={{
                fontSize: 13, fontWeight: '700', lineHeight: 20, marginTop: 4,
                color: '#7F1D1D',
              }}>
                This content has been flagged for priority review by our safety team.
              </Text>
            )}
          </View>

          {/* Dispute or success */}
          {submitted ? (
            <View style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
              <Text style={{ fontSize: 40 }}>✅</Text>
              <Text style={{ fontSize: 17, fontWeight: '800', color: c.textPrimary }}>
                Dispute Received
              </Text>
              <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 }}>
                Our team will review your dispute within 24–48 hours. Thank you for helping keep Parent Patch safe.
              </Text>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  marginTop: 4, backgroundColor: c.primary,
                  borderRadius: 20, paddingHorizontal: 28, paddingVertical: 12,
                }}
                accessibilityRole="button" accessibilityLabel="Done"
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: c.textPrimary }}>
                Think this was a mistake?
              </Text>
              <Text style={{ fontSize: 14, color: c.textMuted, lineHeight: 20 }}>
                If your {label} was incorrectly flagged, you can submit a dispute and our safety team will review it within 24–48 hours.
              </Text>
              <Text style={{ fontSize: 12, color: c.textMuted, fontStyle: 'italic', lineHeight: 18 }}>
                Note: Submitting a false dispute for illegal content may itself be reported to law enforcement.
              </Text>
              <TextInput
                value={disputeText}
                onChangeText={setDisputeText}
                placeholder="Explain why you believe this content is appropriate..."
                placeholderTextColor={c.textMuted}
                multiline
                accessibilityLabel="Explain why you believe this content is appropriate"
                style={{
                  backgroundColor: c.card,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: c.separator,
                  padding: 14,
                  fontSize: 14,
                  color: c.textPrimary,
                  minHeight: 90,
                  textAlignVertical: 'top',
                }}
              />
              <TouchableOpacity
                onPress={submitDispute}
                disabled={!disputeText.trim() || submitting || logging}
                style={{
                  backgroundColor: c.primary,
                  borderRadius: 20,
                  paddingVertical: 14,
                  alignItems: 'center',
                  opacity: !disputeText.trim() || submitting || logging ? 0.4 : 1,
                }}
                accessibilityRole="button" accessibilityLabel="Submit dispute"
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Submit Dispute</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={{ paddingVertical: 12, alignItems: 'center' }}
                accessibilityRole="button" accessibilityLabel="Dismiss">
                <Text style={{ fontSize: 15, color: c.textMuted, fontWeight: '600' }}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 20 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
