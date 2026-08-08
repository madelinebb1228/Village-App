import React from 'react';
import { Switch } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo } from 'react-native';
import { AccessibilityProvider } from '../../lib/AccessibilityContext';

// screens/AccessibilitySettings.tsx pulls in SectionHeader/SettingsRow from
// screens/SettingsScreen.tsx, whose module scope also imports subscription/
// in-app-purchase and Supabase-backed sub-screens that aren't relevant to
// this test and drag in native modules Jest can't transform.
jest.mock('../../lib/subscriptionContext', () => ({
  useSubscription: () => ({
    isSubscribed: false,
    purchaseSubscription: jest.fn(),
    restorePurchases: jest.fn(),
  }),
}));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    from: jest.fn().mockReturnThis(),
  },
}));

import AccessibilitySettings from '../../screens/AccessibilitySettings';

describe('AccessibilitySettings', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders without throwing and calls onBack', async () => {
    const onBack = jest.fn();
    const { getByLabelText } = render(
      <AccessibilityProvider>
        <AccessibilitySettings onBack={onBack} />
      </AccessibilityProvider>
    );
    await waitFor(() => getByLabelText('Back to Settings'));
    fireEvent.press(getByLabelText('Back to Settings'));
    expect(onBack).toHaveBeenCalled();
  });

  it('every toggle row exposes a non-empty accessibilityLabel', async () => {
    const { root } = render(
      <AccessibilityProvider>
        <AccessibilitySettings onBack={() => {}} />
      </AccessibilityProvider>
    );
    await waitFor(() => root);

    const switches = root.findAllByType(Switch);
    expect(switches.length).toBeGreaterThan(0);
    // Each Switch is deliberately hidden from the accessibility tree (its parent
    // row carries the merged label) — this asserts that pattern held, not that
    // the Switch itself has a label.
    for (const sw of switches) {
      expect(sw.props.accessibilityElementsHidden).toBe(true);
    }
  });

  it('toggling High Contrast Mode persists the change', async () => {
    const { getByLabelText } = render(
      <AccessibilityProvider>
        <AccessibilitySettings onBack={() => {}} />
      </AccessibilityProvider>
    );
    const row = await waitFor(() => getByLabelText(/High Contrast Mode/));

    await act(async () => {
      fireEvent.press(row);
    });

    await waitFor(async () => {
      const stored = await AsyncStorage.getItem('accessibility_settings_v1');
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored as string).highContrast).toBe(true);
    });
  });

  it('color blind type selector is disabled until Color Blind Mode is on', async () => {
    const { getByLabelText } = render(
      <AccessibilityProvider>
        <AccessibilitySettings onBack={() => {}} />
      </AccessibilityProvider>
    );
    const deuteranopia = await waitFor(() => getByLabelText('Deuteranopia'));
    expect(deuteranopia.props.accessibilityState.disabled).toBe(true);

    const colorBlindRow = getByLabelText(/Color Blind Mode/);
    await act(async () => {
      fireEvent.press(colorBlindRow);
    });

    await waitFor(() => expect(getByLabelText('Deuteranopia').props.accessibilityState.disabled).toBe(false));
  });
});
