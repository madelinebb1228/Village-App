import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';
import UserAvatar from './UserAvatar';

export interface Story {
  id: string;
  user_id: string;
  author: string;
  image_url: string | null;
  video_url: string | null;
  text_content: string | null;
  bg_color: string | null;
  created_at: string;
  expires_at: string;
}

export interface StoryGroup {
  user_id: string;
  author: string;
  stories: Story[];
}

interface Props {
  currentUserId: string | null;
  onAddStory: () => void;
  onViewStories: (groups: StoryGroup[], startGroupIndex: number) => void;
  refreshKey?: number;
}

export default function StoriesBar({ currentUserId, onAddStory, onViewStories, refreshKey }: Props) {
  const c = useColors();
  const [myGroup, setMyGroup] = useState<StoryGroup | null>(null);
  const [otherGroups, setOtherGroups] = useState<StoryGroup[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());

  useEffect(() => { load(); }, [currentUserId, refreshKey]);

  async function load() {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from('stories')
      .select('*')
      .gt('expires_at', now)
      .order('created_at', { ascending: false });
    if (!data) return;

    const map = new Map<string, StoryGroup>();
    for (const s of data as Story[]) {
      if (!map.has(s.user_id)) map.set(s.user_id, { user_id: s.user_id, author: s.author, stories: [] });
      map.get(s.user_id)!.stories.push(s);
    }
    const all = Array.from(map.values());
    setMyGroup(all.find(g => g.user_id === currentUserId) ?? null);
    setOtherGroups(all.filter(g => g.user_id !== currentUserId));
  }

  function markGroupSeen(group: StoryGroup) {
    setSeen(prev => new Set([...prev, ...group.stories.map(s => s.id)]));
  }

  function allSeen(group: StoryGroup) {
    return group.stories.every(s => seen.has(s.id));
  }

  const allGroups: StoryGroup[] = [...(myGroup ? [myGroup] : []), ...otherGroups];
  const s = makeStyles(c);

  if (allGroups.length === 0 && !currentUserId) return null;

  return (
    <View style={s.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {/* My story / Add story */}
        <TouchableOpacity
          style={s.item}
          onPress={() => {
            if (myGroup) {
              markGroupSeen(myGroup);
              onViewStories(allGroups, 0);
            } else {
              onAddStory();
            }
          }}
          activeOpacity={0.8}
        >
          <View style={[s.ring, myGroup ? s.ringOwn : s.ringAdd]}>
            <View style={s.inner}>
              <UserAvatar userId={currentUserId ?? ''} name="Me" size={50} />
              {!myGroup && (
                <View style={s.plusBadge}>
                  <Text style={s.plusText}>+</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={s.label} numberOfLines={1}>{myGroup ? 'Your Story' : 'Add Story'}</Text>
        </TouchableOpacity>

        {/* Other users */}
        {otherGroups.map((group, i) => (
          <TouchableOpacity
            key={group.user_id}
            style={s.item}
            onPress={() => {
              markGroupSeen(group);
              onViewStories(allGroups, myGroup ? i + 1 : i);
            }}
            activeOpacity={0.8}
          >
            <View style={[s.ring, allSeen(group) ? s.ringSeen : s.ringUnseen]}>
              <View style={s.inner}>
                <UserAvatar userId={group.user_id} name={group.author} size={50} />
              </View>
            </View>
            <Text style={s.label} numberOfLines={1}>{group.author}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { marginBottom: 20 },
    scroll: { paddingHorizontal: 2, gap: 12, paddingVertical: 4 },
    item: { alignItems: 'center', width: 70 },
    ring: {
      width: 66, height: 66, borderRadius: 33,
      padding: 3, marginBottom: 5,
      justifyContent: 'center', alignItems: 'center',
    },
    inner: { width: 58, height: 58, borderRadius: 29, overflow: 'hidden' },
    ringUnseen: { borderWidth: 2.5, borderColor: c.primary },
    ringOwn:    { borderWidth: 2.5, borderColor: c.blush },
    ringSeen:   { borderWidth: 2,   borderColor: c.separator },
    ringAdd:    { borderWidth: 2,   borderColor: c.textMuted },
    plusBadge: {
      position: 'absolute', bottom: 0, right: 0,
      width: 20, height: 20, borderRadius: 10,
      backgroundColor: c.primary,
      justifyContent: 'center', alignItems: 'center',
      borderWidth: 1.5, borderColor: c.bg,
    },
    plusText: { color: '#fff', fontSize: 15, fontWeight: '800', lineHeight: 18 },
    label: { fontSize: 11, color: c.textSecondary, fontWeight: '600', textAlign: 'center', width: 70 },
  });
}
