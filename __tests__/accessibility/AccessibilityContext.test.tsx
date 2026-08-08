import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo } from 'react-native';
import {
  AccessibilityProvider,
  useAccessibility,
} from '../../lib/AccessibilityContext';
import { useOneHanded, OneHandedProvider } from '../../lib/OneHandedContext';

function Probe() {
  const { settings, update, isReduceMotionEnabled } = useAccessibility();
  return (
    <>
      <Text testID="highContrast">{String(settings.highContrast)}</Text>
      <Text testID="reduceMotion">{String(isReduceMotionEnabled)}</Text>
      <Text testID="toggle" onPress={() => update('highContrast', !settings.highContrast)}>
        toggle
      </Text>
    </>
  );
}

function OneHandedProbe() {
  const { isOneHanded, toggleOneHanded } = useOneHanded();
  return (
    <Text testID="oneHanded" onPress={toggleOneHanded}>
      {String(isOneHanded)}
    </Text>
  );
}

describe('AccessibilityContext', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads default settings when nothing is persisted', async () => {
    const { getByTestId } = render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>
    );
    await waitFor(() => expect(getByTestId('highContrast').props.children).toBe('false'));
  });

  it('persists updates to AsyncStorage and reflects them in state', async () => {
    const { getByTestId } = render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>
    );
    await waitFor(() => expect(getByTestId('highContrast').props.children).toBe('false'));

    await act(async () => {
      fireEvent.press(getByTestId('toggle'));
    });

    await waitFor(() => expect(getByTestId('highContrast').props.children).toBe('true'));

    const stored = await AsyncStorage.getItem('accessibility_settings_v1');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string).highContrast).toBe(true);
  });

  it('treats reduce motion as enabled when the OS reports it, even without a user override', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    const { getByTestId } = render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>
    );
    await waitFor(() => expect(getByTestId('reduceMotion').props.children).toBe('true'));
  });

  it('useOneHanded() compat shim mirrors AccessibilityContext state', async () => {
    const { getByTestId } = render(
      <OneHandedProvider>
        <OneHandedProbe />
      </OneHandedProvider>
    );
    await waitFor(() => expect(getByTestId('oneHanded').props.children).toBe('false'));

    await act(async () => {
      fireEvent.press(getByTestId('oneHanded'));
    });

    await waitFor(() => expect(getByTestId('oneHanded').props.children).toBe('true'));
  });
});
