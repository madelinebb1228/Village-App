import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors } from '../lib/theme';

/** Inline "couldn't load, tap to retry" row for background data-fetch
 * failures — visible instead of degrading silently to an empty screen. */
export default function LoadErrorBanner({
  message = "Couldn't load. Tap to retry.",
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  const c = useColors();
  return (
    <TouchableOpacity
      onPress={onRetry}
      activeOpacity={0.75}
      style={[styles.wrap, { backgroundColor: c.cardBlush ?? '#FEE2E2', borderColor: c.blush ?? '#FCA5A5' }]}
      accessibilityRole="button" accessibilityLabel={`${message} Tap to retry`}
    >
      <Text style={[styles.text, { color: c.textPrimary }]}>⚠ {message}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
