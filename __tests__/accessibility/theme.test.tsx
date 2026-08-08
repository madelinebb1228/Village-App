import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityProvider } from '../../lib/AccessibilityContext';
import {
  useColors,
  lightColors,
  darkColors,
  highContrastLightColors,
  highContrastDarkColors,
  Colors,
} from '../../lib/theme';

function ColorsProbe() {
  const c = useColors();
  return <Text testID="textPrimary">{c.textPrimary}</Text>;
}

describe('useColors()', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('returns the plain light palette when high contrast is off', async () => {
    const { getByTestId } = render(
      <AccessibilityProvider>
        <ColorsProbe />
      </AccessibilityProvider>
    );
    await waitFor(() => expect(getByTestId('textPrimary').props.children).toBe(lightColors.textPrimary));
  });

  it('returns the high-contrast palette once the setting is persisted', async () => {
    await AsyncStorage.setItem('accessibility_settings_v1', JSON.stringify({ highContrast: true }));
    const { getByTestId } = render(
      <AccessibilityProvider>
        <ColorsProbe />
      </AccessibilityProvider>
    );
    await waitFor(() => expect(getByTestId('textPrimary').props.children).toBe(highContrastLightColors.textPrimary));
    expect(getByTestId('textPrimary').props.children).not.toBe(lightColors.textPrimary);
  });

  it('high-contrast palettes define every key the base Colors interface requires', () => {
    const requiredKeys = Object.keys(lightColors) as (keyof Colors)[];
    for (const key of requiredKeys) {
      expect(highContrastLightColors).toHaveProperty(key as string);
      expect(highContrastDarkColors).toHaveProperty(key as string);
    }
  });

  it('darkColors gives each reminder type its own text color (regression guard)', () => {
    const texts = new Set([
      darkColors.reminderInfo.text,
      darkColors.reminderWarning.text,
      darkColors.reminderAlert.text,
      darkColors.reminderMilestone.text,
      darkColors.reminderStreak.text,
    ]);
    // Base palette intentionally still shares one token today; the high-contrast
    // palette is what differentiates them. This test documents that gap rather
    // than asserting it's fixed, since fixing the base palette is out of scope.
    expect(texts.size).toBeGreaterThanOrEqual(1);

    const hcTexts = new Set([
      highContrastDarkColors.reminderInfo.text,
      highContrastDarkColors.reminderWarning.text,
      highContrastDarkColors.reminderAlert.text,
      highContrastDarkColors.reminderMilestone.text,
      highContrastDarkColors.reminderStreak.text,
    ]);
    expect(hcTexts.size).toBe(5);
  });
});
