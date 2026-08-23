import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useColors, Colors } from '../../lib/theme';
import { hitSlopFor } from '../../lib/accessibility';

interface HomeIconRowProps {
  unreadNotifCount: number;
  unreadMessageCount: number;
  onPressNotifications: () => void;
  onPressMessages: () => void;
  onPressEvents: () => void;
  onPressSearch: () => void;
  containerRef?: React.RefObject<View>;
}

function HomeIconRow({
  unreadNotifCount,
  unreadMessageCount,
  onPressNotifications,
  onPressMessages,
  onPressEvents,
  onPressSearch,
  containerRef,
}: HomeIconRowProps) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <View ref={containerRef} style={styles.iconRow}>
      <TouchableOpacity
        onPress={onPressNotifications}
        activeOpacity={0.75}
        style={styles.notifBtn}
        hitSlop={hitSlopFor(40)}
        accessibilityRole="button"
        accessibilityLabel={unreadNotifCount > 0 ? `Notifications, ${unreadNotifCount} unread` : 'Notifications'}
      >
        <View style={styles.notifBtnClip}>
          <Image source={require('../../assets/notification-bell.png')} style={styles.notifBtnImage} resizeMode="cover" />
        </View>
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
        activeOpacity={0.75}
        style={styles.searchBtn}
        hitSlop={hitSlopFor(40)}
        accessibilityRole="button"
        accessibilityLabel={unreadMessageCount > 0 ? `Messages, ${unreadMessageCount} unread` : 'Messages'}
      >
        <Text style={styles.searchBtnIcon}>💬</Text>
        {unreadMessageCount > 0 && (
          <View style={[styles.badge, { backgroundColor: c.primary }]}>
            <Text style={styles.badgeText}>
              {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.notifBtn}
        onPress={onPressEvents}
        activeOpacity={0.75}
        hitSlop={hitSlopFor(40)}
        accessibilityRole="button" accessibilityLabel="Events"
      >
        <View style={styles.notifBtnClip}>
          <Image source={require('../../assets/events-icon.png')} style={styles.notifBtnImage} resizeMode="cover" />
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.notifBtn}
        onPress={onPressSearch}
        activeOpacity={0.75}
        hitSlop={hitSlopFor(40)}
        accessibilityRole="button" accessibilityLabel="Search"
      >
        <View style={styles.notifBtnClip}>
          <Image source={require('../../assets/search-icon.png')} style={styles.notifBtnImage} resizeMode="cover" />
        </View>
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
    searchBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.card,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    searchBtnIcon: { fontSize: 24 },
    notifBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    notifBtnClip: {
      width: 40,
      height: 40,
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: c.card,
    },
    notifBtnImage: { width: 40, height: 40 },
  });
}
