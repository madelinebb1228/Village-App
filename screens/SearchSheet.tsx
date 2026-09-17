import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Image,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';
import { typography } from '../lib/typography';
import { hitSlopFor } from '../lib/accessibility';
import { useResponsive, maxWidthFor } from '../lib/responsive';
import { AppContext } from '../lib/AppContext';
import PublicProfileSheet from './PublicProfileSheet';
import UserAvatar from '../components/UserAvatar';
import { RESOURCES } from '../lib/resourcesData';
import { Village, VILLAGES } from '../lib/villageData';
import { searchPatches, joinPatch, leavePatch, fetchJoinedPatchIds, FREE_PATCH_LIMIT, fetchTrendingPosts, trendingTagsFromPosts, TrendingTag } from '../lib/discoverData';
import { useSubscription } from '../lib/subscriptionContext';
import { VillageCard } from '../components/village/VillageCard';
import VillageFeedSheet from './VillageFeedSheet';
import PostTypeBadge from '../components/feed/PostTypeBadge';

const TABS: { key: 'people' | 'posts' | 'patches' | 'groups' | 'resources'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'people', label: 'People', icon: 'person-outline' },
  { key: 'posts', label: 'Posts', icon: 'chatbubble-outline' },
  { key: 'patches', label: 'Patches', icon: 'leaf-outline' },
  { key: 'groups', label: 'Groups', icon: 'people-outline' },
  { key: 'resources', label: 'Resources', icon: 'book-outline' },
];

type SearchResource = typeof RESOURCES[number];

// `mom_groups` backs the separate Parent Groups directory (local meetups) —
// a real, distinct feature from the Patch/community system (VILLAGES +
// user_villages). This tab used to be mislabeled "Patches"; it now surfaces
// under its own "Groups" tab, and "Patches" below searches the real catalog.
interface SearchGroup {
  id: string;
  name: string;
  type: string;
  city: string | null;
  state_name: string | null;
  description: string | null;
  schedule: string | null;
  link: string | null;
}

interface SearchProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  parent_role: string | null;
}

interface SearchPost {
  id: string;
  user_id: string;
  author: string;
  content: string;
  post_type: 'text' | 'milestone' | 'question';
  created_at: string;
  image_url?: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 'modal' (default) is the existing mobile full-screen Modal. 'inline'
   * renders the same content with no Modal wrapper, for DesktopSecondaryHost
   * to place beside the sidebar. */
  presentation?: 'modal' | 'inline';
}

function getTimeAgo(dateString: string): string {
  const normalized = /Z|[+-]\d{2}:\d{2}$/.test(dateString) ? dateString : dateString + 'Z';
  const seconds = Math.floor((Date.now() - new Date(normalized).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function SearchSheet({ visible, onClose, presentation = 'modal' }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const { width: windowWidth, isDesktop } = useResponsive();
  const columnStyle = { width: '100%' as const, maxWidth: maxWidthFor(windowWidth, 'inbox'), alignSelf: 'center' as const };
  const { pushSecondary } = useContext(AppContext);

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'people' | 'posts' | 'patches' | 'groups' | 'resources'>('people');
  const [people, setPeople] = useState<SearchProfile[]>([]);
  const [posts, setPosts] = useState<SearchPost[]>([]);
  const [patches, setPatches] = useState<Village[]>([]);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [resources, setResources] = useState<SearchResource[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  const [joinedPatchIds, setJoinedPatchIds] = useState<Set<string>>(new Set());
  const [joiningPatchId, setJoiningPatchId] = useState<string | null>(null);
  const [feedVillage, setFeedVillage] = useState<Village | null>(null);
  const { isSubscribed, openPaywall } = useSubscription();

  // Pre-search content — only real data (see Discover's identical trending
  // logic in lib/discoverData.ts). No recent-search history or "suggested
  // people" here since nothing in the app actually tracks either yet.
  const [trendingTags, setTrendingTags] = useState<TrendingTag[]>([]);
  const PRESEARCH_RESOURCES = useMemo(() => RESOURCES.slice(0, 6), []);
  // Same real catalog filter Discover's own "Discover Patches" section
  // uses — no new fetch, VILLAGES is a static import.
  const suggestedPatches = useMemo(
    () => VILLAGES.filter(v => !joinedPatchIds.has(v.id) && !v.hidden).slice(0, 8),
    [joinedPatchIds],
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setPeople([]);
      setPosts([]);
      setPatches([]);
      setGroups([]);
      setResources([]);
      setExpandedId(null);
      setProfileUserId(null);
      return;
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id);
        loadFollowing(user.id);
      }
    });
    fetchJoinedPatchIds().then(setJoinedPatchIds);
    fetchTrendingPosts(20).then(posts => setTrendingTags(trendingTagsFromPosts(posts, 6)));
  }, [visible]);

  async function loadFollowing(userId: string) {
    const { data } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId);
    if (data) setFollowingIds(new Set(data.map((r: any) => r.following_id)));
  }

  async function toggleJoinPatch(villageId: string) {
    const joined = joinedPatchIds.has(villageId);
    if (!joined && !isSubscribed && joinedPatchIds.size >= FREE_PATCH_LIMIT) {
      onClose();
      openPaywall('village_limit');
      return;
    }
    setJoiningPatchId(villageId);
    const { error } = joined ? await leavePatch(villageId) : await joinPatch(villageId);
    if (error) {
      Alert.alert('Something went wrong', joined ? "Couldn't leave this patch. Please try again." : "Couldn't join this patch. Please try again.");
    } else if (joined) {
      setJoinedPatchIds(prev => { const n = new Set(prev); n.delete(villageId); return n; });
    } else {
      setJoinedPatchIds(prev => new Set([...prev, villageId]));
    }
    setJoiningPatchId(null);
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setExpandedId(null);
    if (query.trim().length < 2) {
      setPeople([]);
      setPosts([]);
      setPatches([]);
      setGroups([]);
      setResources([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => doSearch(query.trim()), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, tab]);

  async function doSearch(q: string) {
    try {
      if (tab === 'people') {
        const { data } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, parent_role')
          .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
          .limit(25);
        setPeople(data ?? []);
      } else if (tab === 'posts') {
        const { data } = await supabase
          .from('posts')
          .select('id, user_id, author, content, post_type, created_at, image_url')
          .ilike('content', `%${q}%`)
          .order('created_at', { ascending: false })
          .limit(25);
        setPosts(data ?? []);
      } else if (tab === 'patches') {
        // Real Patch catalog — same client-side search DiscoverTab uses, so
        // "Patches" means the same thing (and returns the same results) here
        // as it does in Discover.
        setPatches(searchPatches(q));
      } else if (tab === 'groups') {
        const { data } = await supabase
          .from('mom_groups')
          .select('id, name, type, city, state_name, description, schedule, link')
          .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
          .order('name')
          .limit(25);
        setGroups((data ?? []) as SearchGroup[]);
      } else {
        const needle = q.toLowerCase();
        setResources(
          RESOURCES.filter(r =>
            r.title.toLowerCase().includes(needle) ||
            r.description.toLowerCase().includes(needle) ||
            r.category.toLowerCase().includes(needle),
          ),
        );
      }
    } catch (err: any) {
      console.warn('SearchSheet error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  function openProfile(userId: string) {
    if (isDesktop) pushSecondary({ type: 'profile', userId });
    else setProfileUserId(userId);
  }

  function openVillageFeed(v: Village) {
    if (isDesktop) pushSecondary({ type: 'villageFeed', villageId: v.id });
    else setFeedVillage(v);
  }

  async function toggleFollow(targetId: string) {
    if (!currentUserId) return;
    const isFollowing = followingIds.has(targetId);

    setFollowingIds(prev => {
      const next = new Set(prev);
      if (isFollowing) next.delete(targetId);
      else next.add(targetId);
      return next;
    });

    if (isFollowing) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', targetId);
    } else {
      await supabase.from('follows').insert({
        follower_id: currentUserId,
        following_id: targetId,
      });
    }
  }

  const trimmedQuery = query.trim();
  const hasResults =
    tab === 'people' ? people.length > 0
    : tab === 'posts' ? posts.length > 0
    : tab === 'patches' ? patches.length > 0
    : tab === 'groups' ? groups.length > 0
    : resources.length > 0;

  if (presentation === 'inline' && !visible) return null;
  const Wrapper: any = presentation === 'modal' ? Modal : React.Fragment;
  const wrapperProps: any = presentation === 'modal'
    ? { visible, animationType: 'slide', presentationStyle: 'pageSheet', onRequestClose: onClose }
    : {};

  return (
    <>
      <Wrapper {...wrapperProps}>
        <SafeAreaView style={s.safeArea}>
          {/* ── Shell header ── */}
          <View style={s.shellHeader}>
            <Text style={s.shellTitle}>Search</Text>
            <TouchableOpacity onPress={onClose} style={s.cancelBtn} hitSlop={hitSlopFor(20)}
              accessibilityRole="button" accessibilityLabel="Close search">
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <View style={[s.content, columnStyle]}>
            {/* ── Search bar ── */}
            <View style={s.searchInputWrap}>
              <Ionicons name="search" size={17} color={c.textMuted} style={s.searchIcon} />
              <TextInput
                style={s.searchInput}
                placeholder="Search people, posts, patches, groups, resources..."
                placeholderTextColor={c.textMuted}
                value={query}
                onChangeText={setQuery}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} style={s.clearBtn} hitSlop={hitSlopFor(20)}
                  accessibilityRole="button" accessibilityLabel="Clear search">
                  <Ionicons name="close-circle" size={17} color={c.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* ── Tab bar ── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBarScroll} contentContainerStyle={s.tabBar}>
              {TABS.map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={s.tabBtn}
                  onPress={() => setTab(t.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: tab === t.key }}
                  accessibilityLabel={`${t.label} search results`}
                >
                  <Ionicons name={t.icon} size={16} color={tab === t.key ? c.primary : c.textMuted} />
                  <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
                  {tab === t.key && <View style={s.tabUnderline} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* ── Body ── */}
          <View style={[s.body, trimmedQuery.length < 2 && isDesktop ? undefined : columnStyle]}>
          {loading ? (
            <View style={s.center}>
              <ActivityIndicator color={c.primary} size="large" />
            </View>
          ) : trimmedQuery.length < 2 ? (
            // Pre-query: a real discovery workspace, not a search box sitting
            // above a mostly-blank page. Three sections, three different
            // visual treatments (chips / community cards / info rows) built
            // entirely from data already loaded or statically bundled — no
            // new fetches, nothing fabricated.
            <ScrollView contentContainerStyle={[s.preSearchContent, isDesktop ? { maxWidth: 1040, alignSelf: 'center', width: '100%' } : columnStyle]} showsVerticalScrollIndicator={false}>
              <Text style={s.preSearchGreeting}>
                {tab === 'people' ? 'Find people in your community'
                  : tab === 'posts' ? 'Search posts across Parent Patch'
                  : tab === 'patches' ? 'Find your next Patch'
                  : tab === 'groups' ? 'Find local Parent Groups'
                  : 'Search safety guides and resources'}
              </Text>

              {trendingTags.length > 0 && (
                <View style={s.preSearchSection}>
                  <Text style={s.preSearchSectionTitle}>Trending Topics</Text>
                  <View style={s.trendingTagRow}>
                    {trendingTags.map(t => (
                      <TouchableOpacity
                        key={t.tag}
                        style={s.trendingTagChip}
                        onPress={() => { setTab('posts'); setQuery(t.tag); }}
                        accessibilityRole="button"
                        accessibilityLabel={`Search posts tagged ${t.tag}`}
                      >
                        <Text style={s.trendingTagText}>#{t.tag}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Asymmetric pair on desktop — Patches wider/identity-driven,
                  Resources narrower/informational. Stacks on phone/tablet. */}
              <View style={isDesktop ? s.preSearchSplitRow : undefined}>
                {suggestedPatches.length > 0 && (
                  <View style={[s.preSearchSection, isDesktop && s.preSearchSplitMain]}>
                    <View style={s.preSearchSectionHeaderRow}>
                      <Text style={s.preSearchSectionTitle}>Discover Patches</Text>
                      <TouchableOpacity onPress={() => { setTab('patches'); setQuery('parent'); }} accessibilityRole="button" accessibilityLabel="See all Patches">
                        <Text style={s.preSearchSeeAll}>Browse all</Text>
                      </TouchableOpacity>
                    </View>
                    <ScrollView
                      horizontal={!isDesktop}
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={isDesktop ? { gap: 10 } : { gap: 10, paddingRight: 12 }}
                    >
                      {suggestedPatches.slice(0, isDesktop ? 8 : 4).map((v, i) => (
                        <View key={v.id} style={!isDesktop ? { width: 240 } : undefined}>
                          <VillageCard
                            village={v}
                            joined={joinedPatchIds.has(v.id)}
                            joining={joiningPatchId === v.id}
                            onJoin={() => toggleJoinPatch(v.id)}
                            onOpen={() => openVillageFeed(v)}
                            fullWidth={isDesktop}
                            colorIndex={i}
                            soft
                          />
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <View style={[s.preSearchSection, isDesktop && s.preSearchSplitRail]}>
                  <Text style={s.preSearchSectionTitle}>Resources</Text>
                  <View style={{ gap: 8 }}>
                    {PRESEARCH_RESOURCES.map(resource => (
                      <TouchableOpacity
                        key={resource.id}
                        style={s.resourceRow}
                        onPress={() => { setTab('resources'); setQuery(resource.title); }}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${resource.title} in Resources`}
                      >
                        <View style={s.resourceIconBubble}>
                          <Text style={s.resourceEmoji}>{resource.emoji}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.resourceTitle} numberOfLines={1}>{resource.title}</Text>
                          <Text style={s.resourceCategory} numberOfLines={1}>{resource.category}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={15} color={c.textMuted} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </ScrollView>
          ) : tab === 'people' ? (
            <ScrollView
              contentContainerStyle={s.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {!hasResults ? (
                <Text style={s.emptyText}>No people found for "{trimmedQuery}"</Text>
              ) : (
                people.map(p => {
                  const name = p.display_name || p.username || 'Parent';
                  const initial = name.charAt(0).toUpperCase();
                  const isMe = p.id === currentUserId;
                  const isFollowing = followingIds.has(p.id);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={s.personRow}
                      onPress={() => openProfile(p.id)}
                      activeOpacity={0.75}
                    >
                      <View style={s.personAvatar}>
                        {p.avatar_url ? (
                          <Image source={{ uri: p.avatar_url }} style={s.personAvatarImg} />
                        ) : (
                          <Text style={s.personAvatarText}>{initial}</Text>
                        )}
                      </View>
                      <View style={s.personInfo}>
                        <Text style={s.personName}>{name}</Text>
                        {p.username ? (
                          <Text style={s.personUsername}>@{p.username}</Text>
                        ) : null}
                        {p.parent_role ? (
                          <Text style={s.personRole}>{p.parent_role}</Text>
                        ) : null}
                      </View>
                      {isMe ? (
                        <View style={s.youChip}>
                          <Text style={s.youChipText}>You</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[s.followBtn, isFollowing && s.followBtnActive]}
                          onPress={() => toggleFollow(p.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={[s.followBtnText, isFollowing && s.followBtnTextActive]}>
                            {isFollowing ? 'Following' : 'Follow'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          ) : tab === 'posts' ? (
            <ScrollView
              contentContainerStyle={s.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {!hasResults ? (
                <Text style={s.emptyText}>No posts found for "{trimmedQuery}"</Text>
              ) : (
                posts.map(post => (
                  // Flat, borderless row — the same social-post language as
                  // Home, not a bordered/shadowed "search result" card.
                  <TouchableOpacity
                    key={post.id}
                    style={s.socialPostRow}
                    onPress={() => openProfile(post.user_id)}
                    activeOpacity={0.78}
                  >
                    <View style={s.postCardHeader}>
                      <UserAvatar userId={post.user_id} name={post.author} size={36} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.postAuthor}>{post.author}</Text>
                        <Text style={s.postTime}>{getTimeAgo(post.created_at)}</Text>
                      </View>
                      <PostTypeBadge postType={post.post_type} />
                    </View>
                    {post.content ? (
                      <Text style={s.postContent} numberOfLines={3}>{post.content}</Text>
                    ) : null}
                    {post.image_url ? (
                      <Text style={s.postHasPhoto}>📷 Photo</Text>
                    ) : null}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          ) : tab === 'patches' ? (
            <ScrollView
              contentContainerStyle={s.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {!hasResults ? (
                <Text style={s.emptyText}>No Patches found for "{trimmedQuery}"</Text>
              ) : (
                patches.map(village => (
                  <View key={village.id} style={{ marginBottom: 8 }}>
                    <VillageCard
                      village={village}
                      joined={joinedPatchIds.has(village.id)}
                      joining={joiningPatchId === village.id}
                      onJoin={() => toggleJoinPatch(village.id)}
                      onOpen={() => openVillageFeed(village)}
                      fullWidth
                    />
                  </View>
                ))
              )}
            </ScrollView>
          ) : tab === 'groups' ? (
            <ScrollView
              contentContainerStyle={s.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {!hasResults ? (
                <Text style={s.emptyText}>No groups found for "{trimmedQuery}"</Text>
              ) : (
                groups.map(group => {
                  const expanded = expandedId === group.id;
                  const location = [group.city, group.state_name].filter(Boolean).join(', ');
                  return (
                    <TouchableOpacity
                      key={group.id}
                      style={s.postCard}
                      onPress={() => setExpandedId(expanded ? null : group.id)}
                      activeOpacity={0.78}
                    >
                      <Text style={s.postAuthor}>{group.name}</Text>
                      {location ? <Text style={s.postTime}>{location}</Text> : null}
                      {group.description ? (
                        <Text style={s.postContent} numberOfLines={expanded ? undefined : 2}>
                          {group.description}
                        </Text>
                      ) : null}
                      {expanded && (
                        <>
                          {group.schedule ? (
                            <Text style={s.postHasPhoto}>🗓 {group.schedule}</Text>
                          ) : null}
                          {group.link ? (
                            <TouchableOpacity onPress={() => Linking.openURL(group.link!)}>
                              <Text style={[s.postHasPhoto, { color: c.primary }]}>🔗 Open link</Text>
                            </TouchableOpacity>
                          ) : null}
                        </>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          ) : (
            <ScrollView
              contentContainerStyle={s.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {!hasResults ? (
                <Text style={s.emptyText}>No resources found for "{trimmedQuery}"</Text>
              ) : (
                resources.map(resource => {
                  const expanded = expandedId === resource.id;
                  return (
                    <TouchableOpacity
                      key={resource.id}
                      style={s.postCard}
                      onPress={() => setExpandedId(expanded ? null : resource.id)}
                      activeOpacity={0.78}
                    >
                      <View style={s.postCardHeader}>
                        <Text style={s.postTypeBadge}>{resource.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={s.postAuthor}>{resource.title}</Text>
                          <Text style={s.postTime}>{resource.category}</Text>
                        </View>
                      </View>
                      <Text style={s.postContent} numberOfLines={expanded ? undefined : 2}>
                        {resource.description}
                      </Text>
                      {expanded ? (
                        <Text style={s.postHasPhoto}>Open the Resources tab to view this in full</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          )}
          </View>
        </SafeAreaView>
      </Wrapper>

      {/* Nested public profile viewer — mobile only; on desktop, openProfile()
          pushes onto the shared secondary stack instead (see DesktopSecondaryHost). */}
      {!isDesktop && (
        <PublicProfileSheet
          userId={profileUserId}
          visible={profileUserId !== null}
          onClose={() => setProfileUserId(null)}
          dismissParents={onClose}
        />
      )}

      {/* Nested Patch feed viewer — mobile only; desktop opens via
          pushSecondary({type:'villageFeed'}) into DesktopSecondaryHost. */}
      {!isDesktop && (
        <VillageFeedSheet
          village={feedVillage}
          visible={feedVillage !== null}
          onClose={() => setFeedVillage(null)}
          joined={feedVillage !== null && joinedPatchIds.has(feedVillage.id)}
          onToggleJoin={() => feedVillage && toggleJoinPatch(feedVillage.id)}
        />
      )}
    </>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: c.bg },

    shellHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.separator,
    },
    shellTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },

    content: { width: '100%', paddingHorizontal: 16 },
    body: { flex: 1, paddingHorizontal: 16 },

    searchInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.inputBg,
      borderRadius: 14,
      paddingHorizontal: 12,
      height: 44,
      marginTop: 12,
    },
    searchIcon: { marginRight: 8 },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: c.textPrimary,
    },
    clearBtn: { padding: 4 },
    cancelBtn: { paddingHorizontal: 4 },
    cancelText: { fontSize: 15, color: c.primary, fontWeight: '600' },

    tabBarScroll: {
      flexGrow: 0,
      borderBottomWidth: 1,
      borderBottomColor: c.separator,
      marginTop: 4,
    },
    tabBar: {
      flexDirection: 'row',
      gap: 20,
    },
    tabBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 10,
      position: 'relative',
    },
    tabText: { fontSize: 13.5, fontWeight: '600', color: c.textMuted },
    tabTextActive: { color: c.primary, fontWeight: '700' },
    tabUnderline: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 2.5,
      borderRadius: 2,
      backgroundColor: c.primary,
    },

    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

    // Pre-search state — top-anchored, real data only (see Search's fetch effect).
    preSearchContent: { paddingTop: 20, paddingBottom: 40, paddingHorizontal: 16 },
    preSearchGreeting: { ...typography.sectionTitle, fontSize: 19, color: c.textPrimary, marginBottom: 20 },
    preSearchSection: { marginBottom: 24 },
    preSearchSectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    preSearchSectionTitle: { fontSize: 13, fontWeight: '800', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    preSearchSeeAll: { fontSize: 12.5, fontWeight: '700', color: c.primary },
    trendingTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    trendingTagChip: {
      backgroundColor: c.cardLavender, borderRadius: 16,
      paddingHorizontal: 12, paddingVertical: 7,
    },
    trendingTagText: { fontSize: 13, fontWeight: '700', color: c.primary },

    // Desktop asymmetric pair: Patches wider/left, Resources narrower/right.
    preSearchSplitRow: { flexDirection: 'row', gap: 28, alignItems: 'flex-start' },
    preSearchSplitMain: { flex: 1, marginBottom: 0 },
    preSearchSplitRail: { width: 320, marginBottom: 0 },

    resourceRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.card, borderRadius: 13, borderWidth: 1, borderColor: c.separator,
      paddingVertical: 10, paddingHorizontal: 11, minHeight: 56,
    },
    resourceIconBubble: {
      width: 34, height: 34, borderRadius: 11, backgroundColor: c.cardBlue,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    resourceEmoji: { fontSize: 16 },
    resourceTitle: { fontSize: 13.5, fontWeight: '700', color: c.textPrimary },
    resourceCategory: { fontSize: 11.5, color: c.textMuted, fontWeight: '600', marginTop: 1 },

    listContent: { paddingVertical: 16, paddingBottom: 48 },
    emptyText: {
      fontSize: 15,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: 32,
    },

    // ── People results ──────────────────────────────────────────────────────────
    personRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 8,
      gap: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    personAvatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: c.boyBg,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
      flexShrink: 0,
    },
    personAvatarImg: { width: 46, height: 46, borderRadius: 23 },
    personAvatarText: { fontSize: 18, fontWeight: '800', color: c.primary },
    personInfo: { flex: 1 },
    personName: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    personUsername: { fontSize: 13, color: c.textMuted, marginTop: 1 },
    personRole: { fontSize: 11, color: c.textMuted, marginTop: 2, fontStyle: 'italic' },

    followBtn: {
      borderWidth: 1.5,
      borderColor: c.primary,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 6,
      flexShrink: 0,
    },
    followBtnActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    followBtnText: { fontSize: 13, fontWeight: '700', color: c.primary },
    followBtnTextActive: { color: '#fff' },

    youChip: {
      backgroundColor: c.cardHoney,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 5,
      flexShrink: 0,
    },
    youChipText: { fontSize: 12, fontWeight: '700', color: c.textMuted },

    // ── Post results ────────────────────────────────────────────────────────────
    postCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    // Post results specifically — flat, matches Home's own post row.
    socialPostRow: {
      paddingVertical: 14, paddingHorizontal: 2,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    postCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8,
    },
    postAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.boyBg,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    postAvatarText: { fontSize: 13, fontWeight: '800', color: c.primary },
    postAuthor: { fontSize: 14, fontWeight: '700', color: c.textSecondary },
    postTime: { fontSize: 11, color: c.textMuted, marginTop: 1 },
    postTypeBadge: { fontSize: 18 },
    postContent: {
      fontSize: 14,
      color: c.textSecondary,
      lineHeight: 20,
    },
    postHasPhoto: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 6,
      fontStyle: 'italic',
    },
  });
}
