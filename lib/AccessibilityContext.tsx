import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'accessibility_settings_v1';

export type ColorBlindType = 'protanopia' | 'deuteranopia' | 'tritanopia';

export interface AccessibilitySettings {
  oneHandedMode: boolean;
  reduceMotion: boolean;
  highContrast: boolean;
  largeText: boolean;
  colorBlindMode: boolean;
  colorBlindType: ColorBlindType;
  voiceControlHints: boolean;
  simpleMode: boolean;
}

const DEFAULT_SETTINGS: AccessibilitySettings = {
  oneHandedMode: false,
  reduceMotion: false,
  highContrast: false,
  largeText: false,
  colorBlindMode: false,
  colorBlindType: 'deuteranopia',
  voiceControlHints: false,
  simpleMode: false,
};

const LARGE_TEXT_FONT_SCALE = 1.3;

interface AccessibilityContextType {
  settings: AccessibilitySettings;
  update: <K extends keyof AccessibilitySettings>(key: K, value: AccessibilitySettings[K]) => void;
  systemReduceMotion: boolean;
  systemScreenReaderEnabled: boolean;
  isReduceMotionEnabled: boolean;
  fontScale: number;
  // Back-compat surface for the former standalone OneHandedContext.
  isOneHanded: boolean;
  toggleOneHanded: () => void;
}

const AccessibilityContext = createContext<AccessibilityContextType>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
  systemReduceMotion: false,
  systemScreenReaderEnabled: false,
  isReduceMotionEnabled: false,
  fontScale: 1,
  isOneHanded: false,
  toggleOneHanded: () => {},
});

export function useAccessibility(): AccessibilityContextType {
  return useContext(AccessibilityContext);
}

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AccessibilitySettings>(DEFAULT_SETTINGS);
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);
  const [systemScreenReaderEnabled, setSystemScreenReaderEnabled] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch {
        // Ignore corrupt/legacy stored value, fall back to defaults.
      }
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted) setSystemReduceMotion(value);
    });
    AccessibilityInfo.isScreenReaderEnabled().then(value => {
      if (mounted) setSystemScreenReaderEnabled(value);
    });

    const reduceMotionSub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduceMotion);
    const screenReaderSub = AccessibilityInfo.addEventListener('screenReaderChanged', setSystemScreenReaderEnabled);

    return () => {
      mounted = false;
      reduceMotionSub.remove();
      screenReaderSub.remove();
    };
  }, []);

  const update = useCallback(<K extends keyof AccessibilitySettings>(key: K, value: AccessibilitySettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleOneHanded = useCallback(() => {
    update('oneHandedMode', !settings.oneHandedMode);
  }, [settings.oneHandedMode, update]);

  const value = useMemo<AccessibilityContextType>(() => ({
    settings,
    update,
    systemReduceMotion,
    systemScreenReaderEnabled,
    isReduceMotionEnabled: settings.reduceMotion || systemReduceMotion,
    fontScale: settings.largeText ? LARGE_TEXT_FONT_SCALE : 1,
    isOneHanded: settings.oneHandedMode,
    toggleOneHanded,
  }), [settings, update, systemReduceMotion, systemScreenReaderEnabled, toggleOneHanded]);

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}
