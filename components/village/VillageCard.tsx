import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useColors, Colors } from '../../lib/theme';
import { Village } from '../../lib/villageData';

export function VillageCard({
  village, joining, joined = false, onJoin, onOpen, fullWidth = false,
}: {
  village: Village;
  joining: boolean;
  joined?: boolean;
  onJoin: () => void;
  onOpen?: () => void;
  fullWidth?: boolean;
}) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <TouchableOpacity
      style={[s.villageCard, fullWidth && { width: '100%' }]}
      onPress={onOpen}
      activeOpacity={onOpen ? 0.78 : 1}
    >
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
    </TouchableOpacity>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    villageCard: {
      backgroundColor: c.cardLavender,
      borderRadius: 14,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
      borderWidth: 2,
      borderColor: c.lavender,
      gap: 12,
    },
    villageEmoji: { fontSize: 28 },
    villageInfo: { flex: 1 },
    villageName: { fontSize: 15, fontWeight: '700', color: c.textPrimary, marginBottom: 2 },
    villageDesc: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
    joinBtn: {
      backgroundColor: c.joinBtn,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 7,
      minWidth: 68,
      alignItems: 'center',
    },
    joinBtnJoined: { backgroundColor: c.joinedBg },
    joinBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    joinBtnTextJoined: { color: c.joinedBorder },
  });
}
