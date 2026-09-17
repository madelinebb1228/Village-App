import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Colors } from '../lib/theme';

// Permanent, calm safety guidance for the Patch Requests feature — never
// dismissible. Patch membership must never read as vetting: this is the one
// place in the app that says so out loud. Keep the tone informational (blue
// "info" tokens), not alarming (no red/warning tokens) — see the pass this
// was added for.
export default function PatchRequestSafetyNotice({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const s = makeStyles(c);
  return (
    <View style={[s.wrap, style]} accessibilityRole="text">
      <Ionicons name="shield-checkmark-outline" size={18} color={c.blue} style={s.icon} />
      <View style={{ flex: 1 }}>
        <Text style={s.title}>Before you connect</Text>
        <Text style={s.body}>
          Parent Patch doesn't background-check or verify members — being in a Patch means you
          share a community, not that someone is vetted or trustworthy. Keep first conversations
          in the app, and be cautious meeting anyone new in person. Never leave a child in the
          care of someone you only know through this app — for childcare, choose someone you
          personally trust, or a properly screened professional.
        </Text>
      </View>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: c.cardBlue,
      borderWidth: 1,
      borderColor: c.blue,
      borderRadius: 14,
      padding: 14,
      marginHorizontal: 16,
      marginBottom: 12,
    },
    icon: { marginTop: 1 },
    title: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: 3,
    },
    body: {
      fontSize: 12.5,
      lineHeight: 18,
      color: c.textSecondary,
    },
  });
}
