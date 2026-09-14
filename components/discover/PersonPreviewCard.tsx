import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors, Colors } from '../../lib/theme';
import { typography } from '../../lib/typography';
import { hitSlopFor } from '../../lib/accessibility';
import UserAvatar from '../UserAvatar';
import { SearchProfile } from '../../lib/discoverData';

interface Props {
  person: SearchProfile;
  isMe: boolean;
  isFollowing: boolean;
  onPress: () => void;
  onToggleFollow: () => void;
}

export default function PersonPreviewCard({ person, isMe, isFollowing, onPress, onToggleFollow }: Props) {
  const c = useColors();
  const s = makeStyles(c);
  const name = person.display_name || person.username || 'Parent';

  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.78}>
      <UserAvatar userId={person.id} name={name} size={46} />
      <View style={{ flex: 1 }}>
        <Text style={s.name}>{name}</Text>
        {person.username ? <Text style={s.username}>@{person.username}</Text> : null}
        {person.parent_role ? <Text style={s.role}>{person.parent_role}</Text> : null}
      </View>
      {isMe ? (
        <View style={s.youChip}><Text style={s.youChipText}>You</Text></View>
      ) : (
        <TouchableOpacity
          style={[s.followBtn, isFollowing && s.followBtnActive]}
          onPress={onToggleFollow}
          hitSlop={hitSlopFor(28)}
          accessibilityRole="button"
          accessibilityLabel={isFollowing ? `Unfollow ${name}` : `Follow ${name}`}
        >
          <Text style={[s.followBtnText, isFollowing && s.followBtnTextActive]}>
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.card, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: c.separator,
    },
    name: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    username: { fontSize: 13, color: c.textMuted, marginTop: 1 },
    role: { fontSize: 11, color: c.textMuted, marginTop: 2, fontStyle: 'italic' },
    followBtn: { borderWidth: 1.5, borderColor: c.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
    followBtnActive: { backgroundColor: c.primary },
    followBtnText: { ...typography.tabLabel, color: c.primary },
    followBtnTextActive: { color: c.primaryText },
    youChip: { backgroundColor: c.cardHoney, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5 },
    youChipText: { fontSize: 12, fontWeight: '700', color: c.textMuted },
  });
}
