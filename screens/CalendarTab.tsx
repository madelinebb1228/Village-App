import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';
import { useSubscription } from '../lib/subscriptionContext';
import SharedCalendar from './SharedCalendar';

export default function CalendarTab() {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const { isSubscribed, openPaywall } = useSubscription();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (active) {
          setUserId(user?.id ?? null);
          setLoading(false);
        }
      });
      return () => { active = false; };
    }, [])
  );

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={c.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.heading}>Calendar</Text>

        {isSubscribed ? (
          <SharedCalendar userId={userId} />
        ) : (
          <View style={s.premiumCard}>
            <Text style={s.premiumEmoji}>📅</Text>
            <Text style={s.premiumTitle}>Shared Parents Calendar</Text>
            <Text style={s.premiumBody}>
              Share schedules, appointments, and reminders with your co-parent or support circle — everyone stays on the same page.
            </Text>
            <TouchableOpacity style={s.premiumBtn} onPress={openPaywall} activeOpacity={0.85}
              accessibilityRole="button" accessibilityLabel="Unlock calendar">
              <Text style={s.premiumBtnText}>Unlock Calendar</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    content: { padding: 24, paddingBottom: 40 },
    heading: { fontSize: 26, fontWeight: '800', color: c.textSecondary, marginBottom: 16 },
    premiumCard: {
      marginTop: 8,
      backgroundColor: c.cardLavender,
      borderRadius: 20,
      padding: 24,
      alignItems: 'center',
      gap: 10,
    },
    premiumEmoji: { fontSize: 32 },
    premiumTitle: { fontSize: 18, fontWeight: '800', color: c.textPrimary },
    premiumBody: { fontSize: 14, color: c.textSecondary, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
    premiumBtn: {
      marginTop: 4,
      backgroundColor: c.lavender,
      borderRadius: 14,
      paddingVertical: 13,
      paddingHorizontal: 28,
    },
    premiumBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  });
}
