import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Colors } from '../../lib/theme';
import { hitSlopFor } from '../../lib/accessibility';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onFocus?: () => void;
  autoFocus?: boolean;
}

export default function DiscoverSearchBar({ value, onChangeText, onFocus, autoFocus }: Props) {
  const c = useColors();
  const s = makeStyles(c);

  return (
    <View style={s.wrap}>
      <Ionicons name="search" size={18} color={c.textMuted} />
      <TextInput
        style={s.input}
        placeholder="Search Parent Patch"
        placeholderTextColor={c.textMuted}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search Parent Patch"
        accessibilityHint="Search posts, parents, patches, resources, and Q and A"
      />
      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          hitSlop={hitSlopFor(24)}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Ionicons name="close-circle" size={18} color={c.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.inputBg,
      borderWidth: 1.5,
      borderColor: c.inputBorder,
      borderRadius: 16,
      paddingHorizontal: 16,
      height: 50,
      gap: 10,
    },
    input: { flex: 1, fontSize: 16, color: c.textPrimary, height: '100%' },
  });
}
