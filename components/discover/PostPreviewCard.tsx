import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Colors } from '../../lib/theme';
import { typography } from '../../lib/typography';
import { hitSlopFor } from '../../lib/accessibility';
import { Post } from '../../types/feed';
import { resolveAuthorName } from '../../lib/feedUtils';
import { timeAgo } from '../../lib/discoverData';
import { VILLAGE_MAP } from '../../lib/villageData';
import UserAvatar from '../UserAvatar';
import PatchLabel from '../feed/PatchLabel';
import PostTypeBadge from '../feed/PostTypeBadge';

interface Props {
  post: Post;
  onPress: () => void;
  width?: number;
  /** Small "📌 Pinned" tag shown above the author row. */
  pinned?: boolean;
  /** Optional owner-only controls (pin/delete, etc.) rendered in the header row. */
  headerRight?: React.ReactNode;
  /** Opens the Patch this post belongs to — omit to hide the tag entirely. */
  onPressVillage?: (villageId: string) => void;
  /** 'default' (unchanged): rounded card with a type-colored left rail, as
   * used by Discover. 'profile': flat list-row chrome matching Home's own
   * post card (no rounding/rail) so Profile's posts read as the same social
   * network as Home — the post-type indicator still shows via PostTypeBadge. */
  variant?: 'default' | 'profile';
}

// A read-only, lightweight rendering of the same "social post" visual
// language used across the app (author row, type-colored left border, tags)
// — intentionally not the fully-interactive HomeTab post card (like/comment
// state lives there), since this only needs to preview and route to PostDetail.
// Reused by Discover's search/landing results and by Profile's Posts/Saved tabs.
export default function PostPreviewCard({ post, onPress, width, pinned, headerRight, onPressVillage, variant = 'default' }: Props) {
  const c = useColors();
  const s = makeStyles(c);
  const [revealed, setRevealed] = useState(false);
  const authorName = resolveAuthorName(post);
  const borderColor =
    post.post_type === 'milestone' ? c.postMilestone
    : post.post_type === 'question' ? c.postQuestion
    : c.postText;
  const isSensitiveHidden = !!post.is_sensitive && !revealed;
  const isProfile = variant === 'profile';

  return (
    <TouchableOpacity
      style={[
        s.card,
        isProfile ? s.cardProfile : { borderLeftColor: borderColor },
        width ? { width } : null,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      // 'link' (not 'button') — this card opens the post, and can contain
      // its own nested button (the sensitive-content reveal, or a
      // headerRight like PostOptionsButton's ellipsis). Nesting a real
      // <button> inside another is invalid HTML and logs a
      // validateDOMNesting warning on every render.
      accessibilityRole="link"
      accessibilityLabel={`Post by ${authorName}: ${isSensitiveHidden ? 'sensitive content hidden' : post.content}`}
    >
      {pinned && (
        <View style={s.pinnedRow}>
          <Ionicons name="pin" size={11} color={s.pinnedText.color} />
          <Text style={s.pinnedText}>Pinned</Text>
        </View>
      )}
      {post.village_id && VILLAGE_MAP[post.village_id] && onPressVillage && (
        <PatchLabel
          emoji={VILLAGE_MAP[post.village_id].emoji}
          name={VILLAGE_MAP[post.village_id].name}
          onPress={() => onPressVillage(post.village_id!)}
        />
      )}
      <View style={s.header}>
        <UserAvatar userId={post.user_id} name={authorName} size={32} />
        <View style={{ flex: 1 }}>
          <Text style={s.author} numberOfLines={1}>{authorName}</Text>
          <Text style={s.time}>{timeAgo(post.created_at)}</Text>
        </View>
        <PostTypeBadge postType={post.post_type} size={12} />
        {headerRight}
      </View>

      {isSensitiveHidden ? (
        <View style={s.sensitiveBox}>
          <Text style={s.sensitiveTitle}>⚠️ Sensitive Content</Text>
          <Text style={s.sensitiveText}>
            {post.sensitive_label ? `Marked as: ${post.sensitive_label}` : 'The author has marked this post as sensitive.'}
          </Text>
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation?.(); setRevealed(true); }}
            style={s.sensitiveBtn}
            hitSlop={hitSlopFor(24)}
            accessibilityRole="button"
            accessibilityLabel="Show sensitive post"
          >
            <Text style={s.sensitiveBtnText}>Show post</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {post.content ? <Text style={s.content} numberOfLines={3}>{post.content}</Text> : null}
          <View style={s.footer}>
            <View style={s.footerItem}>
              <Ionicons name="heart" size={13} color={c.blush} />
              <Text style={s.footerText}>{post.likes || 0}</Text>
            </View>
            {post.image_url ? (
              <View style={s.footerItem}>
                <Ionicons name="image-outline" size={13} color={c.textMuted} />
                <Text style={s.footerText}>Photo</Text>
              </View>
            ) : null}
            {post.video_url ? (
              <View style={s.footerItem}>
                <Ionicons name="videocam-outline" size={13} color={c.textMuted} />
                <Text style={s.footerText}>Video</Text>
              </View>
            ) : null}
            {post.tags && post.tags.length > 0 ? <Text style={s.footerText}>#{post.tags[0]}</Text> : null}
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      borderLeftWidth: 4,
      borderWidth: 1,
      borderColor: c.separator,
      gap: 8,
    },
    // Flat list-row chrome matching Home's own post card — see `variant` prop.
    cardProfile: {
      backgroundColor: c.bg,
      borderRadius: 0,
      borderWidth: 0,
      borderLeftWidth: 0,
      borderBottomWidth: 1,
      borderBottomColor: c.separator,
    },
    pinnedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    pinnedText: { fontSize: 11.5, fontWeight: '700', color: c.textMuted },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    author: { ...typography.postAuthor, color: c.textPrimary },
    time: { ...typography.postMeta, color: c.textMuted, marginTop: 1 },
    content: { fontSize: 13.5, color: c.textPrimary, lineHeight: 19 },
    footer: { flexDirection: 'row', gap: 14 },
    footerItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    footerText: { fontSize: 12, color: c.textMuted, fontWeight: '600' },
    sensitiveBox: { backgroundColor: c.reminderWarning.bg, borderRadius: 10, padding: 10, gap: 4, borderWidth: 1, borderColor: c.reminderWarning.border },
    sensitiveTitle: { fontSize: 12, fontWeight: '800', color: c.reminderWarning.text },
    sensitiveText: { fontSize: 12, color: c.reminderWarning.text, lineHeight: 16 },
    sensitiveBtn: { alignSelf: 'flex-start', marginTop: 2, backgroundColor: c.reminderWarning.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5 },
    sensitiveBtnText: { fontSize: 12, fontWeight: '700', color: c.textOnColored },
  });
}
