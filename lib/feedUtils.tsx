import React from 'react';
import { Alert, Text } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';
import { AuthorProfile } from '../types/feed';

// ─── Date / formatting helpers ────────────────────────────────────────────────

// Prefers the poster's *current* username/display name (attached via attachAuthorProfiles
// below) over the `author` snapshot string stored on the post/comment at creation time,
// which goes stale the moment they change their username or display name. Falls back to
// the snapshot when no live profile was attached (or the profile is gone), so this is safe
// to use as a drop-in replacement for `post.author` / `comment.author` everywhere.
export function resolveAuthorName(entity: { author: string; profiles?: AuthorProfile }): string {
  return entity.profiles?.username || entity.profiles?.display_name || entity.author;
}

// Batch-resolves each row's current `profiles` (username/display_name) by user_id and
// attaches it as `.profiles`, for use with resolveAuthorName().
//
// Note: this can't be done as a single Supabase `.select('*, profiles!user_id(...)')`
// query — PostgREST embedding requires an actual foreign-key relationship, and
// posts.user_id / comments.user_id aren't set up with one to `profiles` (unlike e.g.
// patch_tasks.creator_id). So instead we batch-fetch the distinct posters' profiles in
// one extra query and merge them in client-side.
export async function attachAuthorProfiles<T extends { user_id: string; profiles?: AuthorProfile }>(
  rows: T[]
): Promise<T[]> {
  const ids = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean)));
  if (ids.length === 0) return rows;
  const { data } = await supabase.from('profiles').select('id, username, display_name').in('id', ids);
  const map = new Map((data ?? []).map((p: any) => [p.id, { username: p.username, display_name: p.display_name }]));
  return rows.map(r => ({ ...r, profiles: map.get(r.user_id) ?? r.profiles ?? null }));
}

export function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

export type GreetingIcon = 'flower' | 'sun' | 'moon';

export function greetingFor(hour: number, name?: string): { text: string; icon: GreetingIcon } {
  const base = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const icon: GreetingIcon = hour < 12 ? 'flower' : hour < 17 ? 'sun' : 'moon';
  const text = name ? `${base}, ${name}` : base;
  return { text, icon };
}

export function mlToOz(ml: number): string {
  return (ml / 29.5735).toFixed(1);
}

export type BabyAge = { ageDays: number; ageWeeks: number; monthsOld: number; isBirthdayToday: boolean };

export function getBabyAge(dob: string): BabyAge {
  const now = Date.now();
  const ageDays = Math.floor((now - new Date(dob).getTime()) / 86400000);
  const ageWeeks = Math.floor(ageDays / 7);

  // Parse the date-only string as a local calendar date, not UTC — `new Date("YYYY-MM-DD")`
  // parses as UTC midnight, and `.getMonth()`/`.getDate()` read back in the browser's local
  // timezone. In any timezone behind UTC (all of the Americas), a DOB on the 1st of a month
  // reads back as the last day of the *previous* month, silently adding a month to the age.
  const [y, m, day] = dob.split('T')[0].split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, day || 1);
  const today = new Date();
  const isBirthdayToday = today.getDate() === d.getDate();
  let monthsOld = (today.getFullYear() - d.getFullYear()) * 12 + (today.getMonth() - d.getMonth());
  if (today.getDate() < d.getDate()) monthsOld -= 1; // hasn't reached the DOB's day-of-month yet this month
  monthsOld = Math.max(0, monthsOld);

  return { ageDays, ageWeeks, monthsOld, isBirthdayToday };
}

export function babyAgeLabel(dob: string): string {
  const { ageWeeks, monthsOld } = getBabyAge(dob);
  return monthsOld >= 3
    ? `${monthsOld} month${monthsOld !== 1 ? 's' : ''} old`
    : `${ageWeeks} week${ageWeeks !== 1 ? 's' : ''} old`;
}

export function getTimeAgo(dateString: string): string {
  // Ensure the string is parsed as UTC (Supabase stores UTC; without Z JS may treat as local)
  const normalized = /Z|[+-]\d{2}:\d{2}$/.test(dateString) ? dateString : dateString + 'Z';
  const seconds = Math.floor((Date.now() - new Date(normalized).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ─── Media helpers ────────────────────────────────────────────────────────────

export function showSourcePicker(title: string): Promise<'camera' | 'library' | null> {
  return new Promise(resolve => {
    Alert.alert(title, '', [
      { text: 'Take Photo/Video', onPress: () => resolve('camera') },
      { text: 'Choose from Library', onPress: () => resolve('library') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

export async function uploadPostImage(uri: string, userId: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${userId}/post-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('baby-photos')
      .upload(path, blob, { contentType: `image/${ext}`, upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('baby-photos').getPublicUrl(path);
    return data.publicUrl;
  } catch (err: any) {
    console.warn('Post image upload failed:', err.message);
    return null;
  }
}

export async function uploadPostVideo(uri: string, userId: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'mp4';
    const path = `${userId}/video-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('baby-photos')
      .upload(path, blob, { contentType: `video/${ext}`, upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('baby-photos').getPublicUrl(path);
    return data.publicUrl;
  } catch (err: any) {
    console.warn('Post video upload failed:', err.message);
    return null;
  }
}

// ─── Mention helpers ──────────────────────────────────────────────────────────

export function extractMentions(text: string): string[] {
  const raw = text.match(/@(\w+)/g) ?? [];
  return [...new Set(raw.map(m => m.slice(1).toLowerCase()))];
}

export async function sendMentionNotifications(
  content: string,
  postId: string,
  actorId: string,
) {
  const usernames = extractMentions(content);
  if (usernames.length === 0) return;
  const { data: users } = await supabase
    .from('profiles')
    .select('id')
    .in('username', usernames)
    .neq('id', actorId);
  if (!users || users.length === 0) return;
  await supabase.from('notifications').insert(
    users.map((u: any) => ({
      user_id: u.id,
      type: 'mention',
      actor_id: actorId,
      post_id: postId,
      comment_preview: content.substring(0, 100),
      read: false,
    })) as any
  );
}

export function renderTextWithMentions(
  text: string,
  outerStyle: any,
  mentionColor: string,
  onMentionPress?: (username: string) => void,
  onHashtagPress?: (tag: string) => void,
): React.ReactElement {
  const parts = text.split(/(@\w+|#\w+)/);
  return (
    <Text style={outerStyle}>
      {parts.map((part, i) => {
        if (/^@\w+$/.test(part)) {
          return (
            <Text
              key={i}
              style={{ color: mentionColor, fontWeight: '700' }}
              onPress={onMentionPress ? () => onMentionPress(part.slice(1)) : undefined}
            >
              {part}
            </Text>
          );
        }
        if (/^#\w+$/.test(part)) {
          return (
            <Text
              key={i}
              style={{ color: '#57B2E8', fontWeight: '600' }}
              onPress={onHashtagPress ? () => onHashtagPress(part.slice(1)) : undefined}
            >
              {part}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
}
