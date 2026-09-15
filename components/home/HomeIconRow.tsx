import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Colors } from '../../lib/theme';
import { hitSlopFor } from '../../lib/accessibility';

interface HomeIconRowProps {
  unreadNotifCount: number;
  unreadMessageCount: number;
  onPressNotifications: () => void;
  onPressMessages: () => void;
  onPressSearch: () => void;
  containerRef?: React.RefObject<View>;
}

// Same restrained Ionicons-outline language as the sidebar and Track —
// these are functional chrome (open Notifications/Messages/Search), not
// content, so they get plain vector icons in a subtle neutral circle rather
// than the old illustrated pastel button artwork.
function HomeIconRow({
  unreadNotifCount,
  unreadMessageCount,
  onPressNotifications,
  onPressMessages,
  onPressSearch,
  containerRef,
}: HomeIconRowProps) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <View ref={containerRef} style={styles.iconRow}>
      <TouchableOpacity
        onPress={onPressNotifications}
        activeOpacity={0.7}
        style={styles.iconBtn}
        hitSlop={hitSlopFor(40)}
        accessibilityRole="button"
        accessibilityLabel={unreadNotifCount > 0 ? `Notifications, ${unreadNotifCount} unread` : 'Notifications'}
      >
        <Ionicons name="notifications-outline" size={21} color={c.textPrimary} />
        {unreadNotifCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onPressMessages}
        activeOpacity={0.7}
        style={styles.iconBtn}
        hitSlop={hitSlopFor(40)}
        accessibilityRole="button"
        accessibilityLabel={unreadMessageCount > 0 ? `Messages, ${unreadMessageCount} unread` : 'Messages'}
      >
        <Ionicons name="chatbubble-outline" size={21} color={c.textPrimary} />
        {unreadMessageCount > 0 && (
          <View style={[styles.badge, { backgroundColor: c.primary }]}>
            <Text style={styles.badgeText}>
              {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={onPressSearch}
        activeOpacity={0.7}
        hitSlop={hitSlopFor(40)}
        accessibilityRole="button" accessibilityLabel="Search"
      >
        <Ionicons name="search-outline" size={21} color={c.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

export default React.memo(HomeIconRow);

function makeStyles(c: Colors) {
  return StyleSheet.create({
    iconRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    badge: {
      position: 'absolute', top: 2, right: 2,
      backgroundColor: c.blush, borderRadius: 6,
      minWidth: 14, height: 14, justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: 2,
    },
    badgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.card,
      borderWidth: 1.5,
      borderColor: c.separator,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
