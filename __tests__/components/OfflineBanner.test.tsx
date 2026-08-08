import React from 'react';
import { Animated } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo } from 'react-native';
import { AccessibilityProvider } from '../../lib/AccessibilityContext';
import OfflineBanner from '../../components/OfflineBanner';

const mockSyncStatus = {
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  failedCount: 0,
  lastSyncedAt: null as Date | null,
  triggerSync: jest.fn(),
  retryFailed: jest.fn(),
  dismissFailed: jest.fn(),
};

jest.mock('../../lib/syncService', () => ({
  useSyncStatus: () => mockSyncStatus,
}));

describe('OfflineBanner reduce-motion handling', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);
    jest.spyOn(Animated, 'sequence');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('plays the fade sequence when reduce motion is off', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(false);
    mockSyncStatus.isOnline = false;
    const { rerender } = render(
      <AccessibilityProvider>
        <OfflineBanner />
      </AccessibilityProvider>
    );

    mockSyncStatus.isOnline = true;
    mockSyncStatus.pendingCount = 0;
    rerender(
      <AccessibilityProvider>
        <OfflineBanner />
      </AccessibilityProvider>
    );

    await waitFor(() => expect(Animated.sequence).toHaveBeenCalled());
  });

  it('skips the animated sequence when reduce motion is on', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    mockSyncStatus.isOnline = false;
    mockSyncStatus.pendingCount = 0;
    const { rerender } = render(
      <AccessibilityProvider>
        <OfflineBanner />
      </AccessibilityProvider>
    );

    // Let the reduce-motion flag resolve before flipping online.
    await waitFor(() => {});

    mockSyncStatus.isOnline = true;
    rerender(
      <AccessibilityProvider>
        <OfflineBanner />
      </AccessibilityProvider>
    );

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(Animated.sequence).not.toHaveBeenCalled();
  });
});
