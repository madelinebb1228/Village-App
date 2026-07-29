import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import NutritionTracker from './NutritionTracker';
import PostpartumMentalHealthTracker from './PostpartumMentalHealthTracker';
import { useColors } from '../lib/theme';

export default function YouTab() {
  const c = useColors();
  const [userId, setUserId] = useState<string | null>(null);

  const scrollRef   = useRef<ScrollView>(null);
  const sectionY    = useRef<Record<string, number>>({});
  const sectionRefs = useRef<Record<string, View | null>>({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const scrollToSection = useCallback((key: string) => {
    const view = sectionRefs.current[key];
    if (!view) {
      const y = sectionY.current[key];
      if (y !== undefined) scrollRef.current?.scrollTo({ y, animated: true });
      return;
    }
    try {
      (view as any).measureLayout(
        scrollRef.current as any,
        (_x: number, y: number) => {
          scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
        },
        () => {
          const y = sectionY.current[key];
          if (y !== undefined) scrollRef.current?.scrollTo({ y, animated: true });
        },
      );
    } catch {
      const y = sectionY.current[key];
      if (y !== undefined) scrollRef.current?.scrollTo({ y, animated: true });
    }
  }, []);

  const NAV_SECTIONS = [
    { key: 'nutrition', label: '💧 Nutrition' },
    { key: 'mental',    label: '🧠 Mental Health' },
  ] as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ fontSize: 28, fontWeight: '800', color: c.textPrimary, marginBottom: 28 }}>
          You
        </Text>

        {/* Quick nav */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 24, marginHorizontal: -4 }}
          contentContainerStyle={{ paddingHorizontal: 4, gap: 8, flexDirection: 'row' }}
        >
          {NAV_SECTIONS.map(sec => (
            <TouchableOpacity
              key={sec.key}
              onPress={() => scrollToSection(sec.key)}
              style={{
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                backgroundColor: c.card, borderWidth: 1.5, borderColor: c.separator,
              }}
              activeOpacity={0.75}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.textSecondary }}>{sec.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Nutrition & Hydration */}
        <View
          ref={ref => { sectionRefs.current['nutrition'] = ref; }}
          onLayout={e => { sectionY.current['nutrition'] = e.nativeEvent.layout.y; }}
        >
          <NutritionTracker userId={userId} />
        </View>

        {/* Mental Health */}
        <View
          ref={ref => { sectionRefs.current['mental'] = ref; }}
          onLayout={e => { sectionY.current['mental'] = e.nativeEvent.layout.y; }}
        >
          <PostpartumMentalHealthTracker userId={userId} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
