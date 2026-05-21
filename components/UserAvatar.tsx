import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import { useColors } from '../lib/theme';

// Module-level cache so each user's avatar is only fetched once per session
const cache: Record<string, string | null> = {};
const pending: Record<string, Promise<string | null>> = {};

function fetchAvatar(userId: string): Promise<string | null> {
  if (userId in cache) return Promise.resolve(cache[userId]);
  if (!pending[userId]) {
    pending[userId] = supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        const url = (data as any)?.avatar_url ?? null;
        cache[userId] = url;
        delete pending[userId];
        return url;
      });
  }
  return pending[userId];
}

interface Props {
  userId: string;
  name: string;
  size?: number;
}

export default function UserAvatar({ userId, name, size = 36 }: Props) {
  const c = useColors();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    userId in cache ? cache[userId] : null
  );

  useEffect(() => {
    if (!userId) return;
    fetchAvatar(userId).then(setAvatarUrl);
  }, [userId]);

  const radius = size / 2;
  const fontSize = Math.round(size * 0.4);

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: radius, backgroundColor: c.cardLavender }]}>
      <Text style={{ fontSize, fontWeight: '700', color: c.textSecondary }}>
        {name ? name.charAt(0).toUpperCase() : '?'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { justifyContent: 'center', alignItems: 'center' },
});
