import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '../lib/theme';
import { useAccessibility, ColorBlindType } from '../lib/AccessibilityContext';
import { MAX_FONT_SCALE } from '../lib/accessibility';
import { SectionHeader, SettingsRow } from './SettingsScreen';

const COLOR_BLIND_TYPES: { key: ColorBlindType; label: string }[] = [
  { key: 'protanopia', label: 'Protanopia' },
  { key: 'deuteranopia', label: 'Deuteranopia' },
  { key: 'tritanopia', label: 'Tritanopia' },
];

export default function AccessibilitySettings({ onBack }: { onBack: () => void }) {
  const c = useColors();
  const { settings, update, systemReduceMotion } = useAccessibility();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: c.separator,
        backgroundColor: c.card,
      }}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to Settings">
          <Text style={{ fontSize: 22, color: c.textMuted }}>←</Text>
        </TouchableOpacity>
        <Text
          allowFontScaling
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{ fontSize: 20, fontWeight: '800', color: c.textPrimary }}
        >
          Accessibility
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>

        {/* ── Display ─────────────────────────────────────────────── */}
        <SectionHeader label="Display" />
        <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.separator }}>
          <SettingsRow
            icon="◐"
            label="High Contrast Mode"
            sublabel="Stronger text and border contrast throughout the app"
            chevron={false}
            toggleValue={settings.highContrast}
            onPress={() => update('highContrast', !settings.highContrast)}
            right={
              <Switch
                value={settings.highContrast}
                onValueChange={v => update('highContrast', v)}
                trackColor={{ false: c.separator, true: c.sage }}
                thumbColor="#fff"
                importantForAccessibility="no"
                accessibilityElementsHidden
              />
            }
          />
          <SettingsRow
            icon="A"
            label="Large Text Mode"
            sublabel="Extra text scaling on top of your device's text size"
            chevron={false}
            toggleValue={settings.largeText}
            onPress={() => update('largeText', !settings.largeText)}
            right={
              <Switch
                value={settings.largeText}
                onValueChange={v => update('largeText', v)}
                trackColor={{ false: c.separator, true: c.sage }}
                thumbColor="#fff"
                importantForAccessibility="no"
                accessibilityElementsHidden
              />
            }
          />
        </View>

        {/* ── Motion ──────────────────────────────────────────────── */}
        <SectionHeader label="Motion" />
        <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.separator }}>
          <SettingsRow
            icon="◒"
            label="Reduce Animations"
            sublabel={systemReduceMotion
              ? "Already on via your device's Reduce Motion setting"
              : 'Minimizes motion and auto-playing animations in the app'}
            chevron={false}
            toggleValue={settings.reduceMotion}
            onPress={() => update('reduceMotion', !settings.reduceMotion)}
            right={
              <Switch
                value={settings.reduceMotion}
                onValueChange={v => update('reduceMotion', v)}
                trackColor={{ false: c.separator, true: c.sage }}
                thumbColor="#fff"
                importantForAccessibility="no"
                accessibilityElementsHidden
              />
            }
          />
        </View>

        {/* ── Interaction ─────────────────────────────────────────── */}
        <SectionHeader label="Interaction" />
        <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.separator }}>
          <SettingsRow
            icon="☝️"
            label="One-Handed Mode"
            sublabel="Moves save buttons to the bottom of the screen — great when holding your baby"
            chevron={false}
            toggleValue={settings.oneHandedMode}
            onPress={() => update('oneHandedMode', !settings.oneHandedMode)}
            right={
              <Switch
                value={settings.oneHandedMode}
                onValueChange={v => update('oneHandedMode', v)}
                trackColor={{ false: c.separator, true: c.sage }}
                thumbColor="#fff"
                importantForAccessibility="no"
                accessibilityElementsHidden
              />
            }
          />
          <SettingsRow
            icon="🎙️"
            label="Voice Control Hints"
            sublabel="Shows extra labels to help with Voice Control navigation"
            chevron={false}
            toggleValue={settings.voiceControlHints}
            onPress={() => update('voiceControlHints', !settings.voiceControlHints)}
            right={
              <Switch
                value={settings.voiceControlHints}
                onValueChange={v => update('voiceControlHints', v)}
                trackColor={{ false: c.separator, true: c.sage }}
                thumbColor="#fff"
                importantForAccessibility="no"
                accessibilityElementsHidden
              />
            }
          />
        </View>

        {/* ── Vision ──────────────────────────────────────────────── */}
        <SectionHeader label="Vision" />
        <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.separator }}>
          <SettingsRow
            icon="◍"
            label="Color Blind Mode"
            sublabel="Icon and pattern differentiation coming soon — this toggle doesn't change anything yet"
            chevron={false}
            toggleValue={settings.colorBlindMode}
            onPress={() => update('colorBlindMode', !settings.colorBlindMode)}
            right={
              <Switch
                value={settings.colorBlindMode}
                onValueChange={v => update('colorBlindMode', v)}
                trackColor={{ false: c.separator, true: c.sage }}
                thumbColor="#fff"
                importantForAccessibility="no"
                accessibilityElementsHidden
              />
            }
          />
          <View
            style={{
              flexDirection: 'row', gap: 8,
              paddingHorizontal: 20, paddingVertical: 14,
              backgroundColor: c.card,
              opacity: settings.colorBlindMode ? 1 : 0.4,
            }}
            accessibilityRole="radiogroup"
          >
            {COLOR_BLIND_TYPES.map(t => {
              const selected = settings.colorBlindType === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  disabled={!settings.colorBlindMode}
                  onPress={() => update('colorBlindType', t.key)}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 10,
                    borderWidth: 1.5,
                    borderColor: selected ? c.primary : c.separator,
                    backgroundColor: selected ? c.cardLavender : 'transparent',
                    alignItems: 'center',
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: !settings.colorBlindMode }}
                  accessibilityLabel={t.label}
                >
                  <Text
                    allowFontScaling
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                    style={{ fontSize: 12, fontWeight: '700', color: selected ? c.textPrimary : c.textMuted }}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Cognitive ───────────────────────────────────────────── */}
        <SectionHeader label="Cognitive" />
        <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.separator }}>
          <SettingsRow
            icon="◎"
            label="Simple Mode"
            sublabel="Simplifies language and reduces on-screen options — full rollout coming soon"
            chevron={false}
            toggleValue={settings.simpleMode}
            onPress={() => update('simpleMode', !settings.simpleMode)}
            right={
              <Switch
                value={settings.simpleMode}
                onValueChange={v => update('simpleMode', v)}
                trackColor={{ false: c.separator, true: c.sage }}
                thumbColor="#fff"
                importantForAccessibility="no"
                accessibilityElementsHidden
              />
            }
          />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
