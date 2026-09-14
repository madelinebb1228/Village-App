// Shared search/fetch helpers for the Discover tab. Extracted as plain
// functions (rather than living inside DiscoverTab.tsx) so the search logic
// stays testable and DiscoverTab.tsx doesn't balloon into a mega-file.
//
// Note: Patch search here queries the real Patch catalog (VILLAGES +
// user_villages) — NOT the `mom_groups` table. SearchSheet.tsx's "Patches"
// tab actually queries `mom_groups` (that's the Parent Groups directory, a
// different resource), which is a pre-existing mislabel on Home's search
// left untouched here to avoid changing Home.
import { supabase } from './supabase';
import { Post } from '../types/feed';
import { VILLAGES, Village } from './villageData';
import { RESOURCES, Resource } from './resourcesData';

export interface SearchProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  parent_role: string | null;
}

export interface SearchQuestion {
  id: string;
  author: string;
  content: string;
  topic: string;
  answer_count: number;
  vote_score: number;
  created_at: string;
}

export interface DiscoverSearchResults {
  people: SearchProfile[];
  posts: Post[];
  patches: Village[];
  resources: Resource[];
  questions: SearchQuestion[];
}

export function emptyResults(): DiscoverSearchResults {
  return { people: [], posts: [], patches: [], resources: [], questions: [] };
}

export async function searchPeople(q: string): Promise<SearchProfile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, parent_role')
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(20);
  return data ?? [];
}

export async function searchPosts(q: string): Promise<Post[]> {
  const { data } = await supabase
    .from('posts')
    .select('*')
    .ilike('content', `%${q}%`)
    .order('created_at', { ascending: false })
    .limit(20);
  return (data ?? []) as Post[];
}

export function searchPatches(q: string): Village[] {
  const needle = q.toLowerCase();
  return VILLAGES.filter(v =>
    !v.hidden &&
    (v.name.toLowerCase().includes(needle) || v.description.toLowerCase().includes(needle)),
  );
}

// ─── Patch membership mutations ────────────────────────────────────────────────
// Shared by DiscoverTab and SearchSheet so the real Patch catalog is joined/left
// through one code path, not duplicated per screen.

export const FREE_PATCH_LIMIT = 5;

export async function joinPatch(villageId: string): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in' };
  const { error } = await (supabase as any).from('user_villages').insert({ user_id: user.id, village_id: villageId });
  return { error: error?.message ?? null };
}

export async function leavePatch(villageId: string): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in' };
  const { error } = await supabase.from('user_villages').delete().eq('user_id', user.id).eq('village_id', villageId);
  return { error: error?.message ?? null };
}

export async function fetchJoinedPatchIds(): Promise<Set<string>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();
  const { data } = await supabase.from('user_villages').select('village_id').eq('user_id', user.id);
  return new Set((data ?? []).map((r: any) => r.village_id));
}

export function searchResources(q: string): Resource[] {
  const needle = q.toLowerCase();
  return RESOURCES.filter(r =>
    r.title.toLowerCase().includes(needle) ||
    r.description.toLowerCase().includes(needle) ||
    r.category.toLowerCase().includes(needle),
  );
}

export async function searchQuestions(q: string): Promise<SearchQuestion[]> {
  const { data } = await supabase
    .from('qa_questions')
    .select('id, author, content, topic, answer_count, vote_score, created_at')
    .ilike('content', `%${q}%`)
    .order('vote_score', { ascending: false })
    .limit(20);
  return (data ?? []) as SearchQuestion[];
}

export async function searchAll(q: string): Promise<DiscoverSearchResults> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return emptyResults();
  const [people, posts, questions] = await Promise.all([
    searchPeople(trimmed),
    searchPosts(trimmed),
    searchQuestions(trimmed),
  ]);
  return {
    people,
    posts,
    questions,
    patches: searchPatches(trimmed),
    resources: searchResources(trimmed),
  };
}

// ─── Trending ─────────────────────────────────────────────────────────────────

export interface TrendingTag {
  tag: string;
  count: number;
}

// Same scoring HomeTab.fetchTrendingPosts uses (likes*2 + recency bonus),
// kept as its own copy here rather than importing from HomeTab so Discover
// has zero coupling to Home's internals.
export async function fetchTrendingPosts(limit = 5): Promise<Post[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('posts')
    .select('*')
    .gte('created_at', since)
    .order('likes', { ascending: false })
    .limit(20);
  if (!data) return [];

  const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
  const scored = (data as Post[]).map(p => ({
    post: p,
    score: (p.likes || 0) * 2 + (new Date(p.created_at).getTime() > cutoff24h ? 5 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.post);
}

// Real trending "topics" — tag frequency across the same recent/popular post
// pool used for trending posts, not fabricated engagement numbers.
export function trendingTagsFromPosts(posts: Post[], limit = 6): TrendingTag[] {
  const counts = new Map<string, number>();
  posts.forEach(p => (p.tags ?? []).forEach(t => counts.set(t, (counts.get(t) ?? 0) + 1)));
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function fetchPopularPosts(limit = 3): Promise<Post[]> {
  const { data } = await supabase
    .from('posts')
    .select('*')
    .order('likes', { ascending: false })
    .limit(limit);
  return (data ?? []) as Post[];
}

export async function fetchRecentQuestions(limit = 3): Promise<SearchQuestion[]> {
  const { data } = await supabase
    .from('qa_questions')
    .select('id, author, content, topic, answer_count, vote_score, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as SearchQuestion[];
}

export function timeAgo(dateString: string): string {
  const normalized = /Z|[+-]\d{2}:\d{2}$/.test(dateString) ? dateString : dateString + 'Z';
  const seconds = Math.floor((Date.now() - new Date(normalized).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
