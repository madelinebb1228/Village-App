import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, TouchableOpacity, View, StyleSheet, Platform } from 'react-native';
import { useSyncStatus } from '../lib/syncService';
import { useColors } from '../lib/theme';
import { useAccessibility } from '../lib/AccessibilityContext';

export default function OfflineBanner() {
  const { isOnline, isSyncing, pendingCount, failedCount, lastSyncedAt, triggerSync, retryFailed, dismissFailed } = useSyncStatus();
  const c = useColors();
  const { isReduceMotionEnabled } = useAccessibility();

  // Show a brief "All synced" flash after coming back online
  const [showSynced, setShowSynced] = useState(false);
  const prevOnline = useRef(isOnline);
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!prevOnline.current && isOnline && pendingCount === 0) {
      setShowSynced(true);
      if (isReduceMotionEnabled) {
        fadeAnim.setValue(1);
        const t = setTimeout(() => setShowSynced(false), 1500);
        prevOnline.current = isOnline;
        return () => clearTimeout(t);
      }
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.delay(2000),
        Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start(() => setShowSynced(false));
    }
    prevOnline.current = isOnline;
  }, [isOnline, pendingCount, fadeAnim, isReduceMotionEnabled]);

  // Nothing to show
  if (isOnline && !isSyncing && !showSynced && failedCount === 0) return null;

  // Items that gave up retrying — surface them instead of hiding pendingCount's drop
  if (isOnline && !isSyncing && failedCount > 0) {
    return (
      <View style={[styles.banner, { backgroundColor: '#DC2626' }]}>
        <Text style={styles.text}>
          ⚠ {failedCount} change{failedCount === 1 ? '' : 's'} failed to sync
        </Text>
        <TouchableOpacity onPress={retryFailed} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button" accessibilityLabel="Retry">
          <Text style={[styles.text, { fontWeight: '700', marginLeft: 12 }]}>Retry ↻</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={dismissFailed} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button" accessibilityLabel="Dismiss">
          <Text style={[styles.text, { fontWeight: '700', marginLeft: 12 }]}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
      <TouchableOpacity onPress={triggerSync} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button" accessibilityLabel="Retry sync">
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
