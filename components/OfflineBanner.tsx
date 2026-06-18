import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, TouchableOpacity, View, StyleSheet, Platform } from 'react-native';
import { useSyncStatus } from '../lib/syncService';
import { useColors } from '../lib/theme';

export default function OfflineBanner() {
  const { isOnline, isSyncing, pendingCount, lastSyncedAt, triggerSync } = useSyncStatus();
  const c = useColors();

  // Show a brief "All synced" flash after coming back online
  const [showSynced, setShowSynced] = useState(false);
  const prevOnline = useRef(isOnline);
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!prevOnline.current && isOnline && pendingCount === 0) {
      setShowSynced(true);
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.delay(2000),
        Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start(() => setShowSynced(false));
    }
    prevOnline.current = isOnline;
  }, [isOnline, pendingCount, fadeAnim]);

  // Nothing to show
  if (isOnline && !isSyncing && !showSynced) return null;

  // "All synced" flash
  if (showSynced) {
    return (
      <Animated.View style={[styles.banner, { backgroundColor: '#16A34A', opacity: fadeAnim }]}>
        <Text style={styles.text}>✓ All changes synced</Text>
      </Animated.View>
    );
  }

  // Syncing in progress
  if (isSyncing) {
    return (
      <View style={[styles.banner, { backgroundColor: c.primary ?? '#7C6BC4' }]}>
        <Text style={styles.text}>⟳ Syncing {pendingCount > 0 ? `${pendingCount} changes…` : '…'}</Text>
      </View>
    );
  }

  // Offline
  return (
    <View style={[styles.banner, { backgroundColor: '#64748B' }]}>
      <Text style={styles.text}>
        ✈ Offline{pendingCount > 0 ? ` · ${pendingCount} change${pendingCount === 1 ? '' : 's'} saved locally` : ''}
      </Text>
      <TouchableOpacity onPress={triggerSync} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={[styles.text, { fontWeight: '700', marginLeft: 12 }]}>Retry ↻</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    // Sit below the status bar on native; top of page on web
    ...(Platform.OS === 'web' ? {} : {}),
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.1,
  },
});
