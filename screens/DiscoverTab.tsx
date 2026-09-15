import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Colors } from '../lib/theme';
import { typography } from '../lib/typography';
import { hitSlopFor } from '../lib/accessibility';
import { useResponsive, maxWidthFor } from '../lib/responsive';
import { screenView, track } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { useBaby } from '../lib/babyContext';
import { getBabyAge } from '../lib/feedUtils';
import { useSubscription } from '../lib/subscriptionContext';
import { VILLAGES, Village, villagesByIds } from '../lib/villageData';
import { RESOURCES, CATEGORIES, Category, categoriesForAgeMonths, categoryAccent } from '../lib/resourcesData';
import { Activity } from '../lib/activitiesUtil';
import {
  DiscoverSearchResults, emptyResults, searchAll, SearchQuestion,
  fetchTrendingPosts, trendingTagsFromPosts, fetchPopularPosts, fetchRecentQuestions,
  TrendingTag, joinPatch, leavePatch, FREE_PATCH_LIMIT,
} from '../lib/discoverData';
import { Post, POST_TAGS } from '../types/feed';

import DiscoverSearchBar from '../components/discover/DiscoverSearchBar';
import DiscoverSection from '../components/discover/DiscoverSection';
import PatchPreviewCard from '../components/discover/PatchPreviewCard';
import ResourcePreviewCard from '../components/discover/ResourcePreviewCard';
import QuestionPreview from '../components/discover/QuestionPreview';
import VideoPreview from '../components/discover/VideoPreview';
import PersonPreviewCard from '../components/discover/PersonPreviewCard';
import PostPreviewCard from '../components/discover/PostPreviewCard';
import DiscoverEmptyState from '../components/discover/DiscoverEmptyState';
import { VillageCard } from '../components/village/VillageCard';
import ActivityCard from '../components/ActivityCard';

// ─── Reused resource destinations (unchanged from the old ResourcesTab) ───────
import QAScreen from './QAScreen';
import LocalServicesScreen from './LocalServicesScreen';
import BabyNameFinder from './BabyNameFinder';
import RecipesScreen from './RecipesScreen';
import BabyFoodChart from './BabyFoodChart';
import ProductReviewsScreen from './ProductReviewsScreen';
import ParentingAZ from './ParentingAZ';
import ParentGroupDirectory from './ParentGroupDirectory';
import ParentMarketplace from './ParentMarketplace';
import SmartShoppingLists from './SmartShoppingLists';
import ServiceProviderReviews from './ServiceProviderReviews';
import Breastfeeding101 from './Breastfeeding101';
import WaterSafety from './WaterSafety';
import ChokingSafety from './ChokingSafety';
import EmergencyContacts from './EmergencyContacts';
import ArticlesScreen from './ArticlesScreen';
import VideoGuidesScreen from './VideoGuidesScreen';
import ActivitiesScreen from './ActivitiesScreen';
import ActivityDetailScreen from './ActivityDetailScreen';
import PublicProfileSheet from './PublicProfileSheet';
import VillageFeedSheet from './VillageFeedSheet';

type ResourceId = typeof RESOURCES[number]['id'];
type SearchFilter = 'top' | 'posts' | 'parents' | 'patches' | 'resources' | 'qa';

const VIDEO_CATEGORIES = [
  { emoji: '🍼', title: 'Feeding', desc: 'Latching, paced bottle feeding, pumping setup' },
  { emoji: '😴', title: 'Sleep & Soothing', desc: 'Swaddling, safe sleep setup, calming techniques' },
  { emoji: '🛁', title: 'Bathing & Hygiene', desc: 'First baths, umbilical cord care, nail trimming' },
  { emoji: '🚑', title: 'Safety & First Aid', desc: 'Infant CPR, choking response, car seat installation' },
  { emoji: '🧸', title: 'Play & Development', desc: 'Tummy time, milestone activities by age' },
];

const FILTERS: { id: SearchFilter; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'posts', label: 'Posts' },
  { id: 'parents', label: 'Parents' },
  { id: 'patches', label: 'Patches' },
  { id: 'resources', label: 'Resources' },
  { id: 'qa', label: 'Q+A' },
];

export default function DiscoverTab({ route, navigation }: any) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const { activeBaby } = useBaby();
  const { isSubscribed, openPaywall } = useSubscription();
  const { width: windowWidth, isDesktop } = useResponsive();
  const discoverMaxWidth = maxWidthFor(windowWidth, 'discover');
  const landingScrollRef = useRef<ScrollView>(null);

  // Web: restore keyboard focus to the landing ScrollView whenever this tab
  // regains focus (mount, tab switch) so arrow/PageUp/PageDown scrolling
  // works — see lib/webFocus.ts for why this is needed on web.
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'web') return;
    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement) return;
    (landingScrollRef.current as any)?.getScrollableNode?.()?.focus?.();
  }, []));

  const [familyRowWidth, setFamilyRowWidth] = useState(0);
  // Desktop: size cards from the section's own measured width so ~3 full
  // cards plus a small intentional peek of the next one show — avoids the
  // coincidental near-full-card clipping a fixed width produces at odd
  // container widths. Phone/tablet keep the original fixed card width.
  const familyCardWidth = isDesktop && familyRowWidth > 0
    ? Math.max(220, Math.floor((familyRowWidth - 20 - 12 * 3 - 50) / 3))
    : 260;

  const initialResourceId = route?.params?.initialResourceId as ResourceId | undefined;
  const [selected, setSelected] = useState<ResourceId | null>(initialResourceId ?? null);
  const [pendingTermId, setPendingTermId] = useState<string | null>(null);
  const [pendingQuestionId, setPendingQuestionId] = useState<string | undefined>(undefined);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [feedVillage, setFeedVillage] = useState<Village | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  // ── Search state ──
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SearchFilter>('top');
  // Lets a quick-action chip (e.g. "Search Patches") drop the user straight
  // into the search view with a filter pre-selected, even before they've
  // typed anything — otherwise setting `filter` alone would be invisible
  // since the search view only mounts once there's a query.
  const [forceSearchView, setForceSearchView] = useState(false);
  const [results, setResults] = useState<DiscoverSearchResults>(emptyResults());
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  // ── Patch membership (shared by search results + Discover Patches section) ──
  const [joinedPatchIds, setJoinedPatchIds] = useState<Set<string>>(new Set());
  const [joiningPatchId, setJoiningPatchId] = useState<string | null>(null);

  // ── Landing content ──
  const [landingLoading, setLandingLoading] = useState(true);
  const [landingRefreshing, setLandingRefreshing] = useState(false);
  const [trendingPosts, setTrendingPosts] = useState<Post[]>([]);
  const [trendingTags, setTrendingTags] = useState<TrendingTag[]>([]);
  const [popularPosts, setPopularPosts] = useState<Post[]>([]);
  const [recentQuestions, setRecentQuestions] = useState<SearchQuestion[]>([]);
  const [stageActivities, setStageActivities] = useState<Activity[]>([]);
  const [moreActivities, setMoreActivities] = useState<Activity[]>([]);
  const [categoryBrowse, setCategoryBrowse] = useState<Category | null>(null);

  useEffect(() => { screenView('Discover'); }, []);

  useEffect(() => {
    if (initialResourceId) setSelected(initialResourceId);
  }, [initialResourceId]);

  // ── Bootstrap: current user, follows, joined patches, landing content ──
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const [{ data: follows }, { data: villages }] = await Promise.all([
          supabase.from('follows').select('following_id').eq('follower_id', user.id),
          supabase.from('user_villages').select('village_id').eq('user_id', user.id),
        ]);
        if (follows) setFollowingIds(new Set(follows.map((r: any) => r.following_id)));
        if (villages) setJoinedPatchIds(new Set(villages.map((r: any) => r.village_id)));
      }
    })();
    loadLanding();
  }, []);

  const ageMonths = activeBaby?.birth_date ? getBabyAge(activeBaby.birth_date).monthsOld : null;

  const loadLanding = useCallback(async () => {
    setLandingLoading(true);
    try {
      const [trending, popular, questions] = await Promise.all([
        fetchTrendingPosts(5),
        fetchPopularPosts(3),
        fetchRecentQuestions(3),
      ]);
      setTrendingPosts(trending);
      setTrendingTags(trendingTagsFromPosts(trending, 6));
      setPopularPosts(popular);
      setRecentQuestions(questions);
    } catch (err: any) {
      console.warn('[Discover] loadLanding error:', err?.message);
    } finally {
      setLandingLoading(false);
    }
  }, []);

  // Age-relevant activities load once we know the active baby's age.
  useEffect(() => {
    (async () => {
      if (ageMonths == null) {
        const { data } = await supabase.from('activities').select('*').order('age_min_months', { ascending: true }).limit(6);
        setMoreActivities((data ?? []) as Activity[]);
        setStageActivities([]);
        return;
      }
      const { data } = await supabase
        .from('activities')
        .select('*')
        .lte('age_min_months', ageMonths)
        .gte('age_max_months', ageMonths)
        .limit(8);
      const forStage = (data ?? []) as Activity[];
      setStageActivities(forStage.slice(0, 3));
      setMoreActivities(forStage.slice(3, 6));
    })();
  }, [ageMonths]);

  // ── Debounced search ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(emptyResults());
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    debounceRef.current = setTimeout(async () => {
      const r = await searchAll(trimmed);
      setResults(r);
      setSearchLoading(false);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  async function toggleFollow(targetId: string) {
    if (!currentUserId) return;
    const isFollowing = followingIds.has(targetId);
    setFollowingIds(prev => {
      const next = new Set(prev);
      if (isFollowing) next.delete(targetId); else next.add(targetId);
      return next;
    });
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', targetId);
    } else {
      await (supabase as any).from('follows').insert({ follower_id: currentUserId, following_id: targetId });
    }
  }

  async function toggleJoinPatch(villageId: string) {
    const joined = joinedPatchIds.has(villageId);

    if (!joined && !isSubscribed && joinedPatchIds.size >= FREE_PATCH_LIMIT) {
      openPaywall('village_limit');
      return;
    }

    setJoiningPatchId(villageId);
    const { error } = joined ? await leavePatch(villageId) : await joinPatch(villageId);
    if (error) {
      Alert.alert('Something went wrong', joined ? "Couldn't leave this patch. Please try again." : "Couldn't join this patch. Please try again.");
    } else if (joined) {
      setJoinedPatchIds(prev => { const n = new Set(prev); n.delete(villageId); return n; });
      track('patch_left', { patch_id: villageId });
    } else {
      setJoinedPatchIds(prev => new Set([...prev, villageId]));
      track('patch_joined', { patch_id: villageId });
    }
    setJoiningPatchId(null);
  }

  function openQuestion(id: string) {
    setPendingQuestionId(id);
    setSelected('qa');
  }

  function goToPatchTab() {
    navigation?.navigate?.('Patch');
  }

  function focusPatchSearch() {
    setFilter('patches');
    setForceSearchView(true);
  }

  function exitSearch() {
    setQuery('');
    setForceSearchView(false);
    setFilter('top');
  }

  function openPost(post: Post) {
    navigation?.navigate?.('PostDetail', { postId: post.id, origin: 'Discover' });
  }

  function openVillageById(villageId: string) {
    const [v] = villagesByIds([villageId]);
    if (v) setFeedVillage(v);
  }

  // ─── Resource destination routing (unchanged behavior from ResourcesTab) ───

  if (selectedActivity) {
    return <ActivityDetailScreen activity={selectedActivity} onBack={() => setSelectedActivity(null)} />;
  }

  if (selected === 'breastfeeding_101') return <Breastfeeding101 onBack={() => setSelected(null)} />;
  if (selected === 'shopping_lists') return <SmartShoppingLists onBack={() => setSelected(null)} />;
  if (selected === 'babynames') return <BabyNameFinder onBack={() => setSelected(null)} />;
  if (selected === 'marketplace') return <ParentMarketplace onBack={() => setSelected(null)} />;
  if (selected === 'mom_groups') return <ParentGroupDirectory onBack={() => setSelected(null)} />;
  if (selected === 'parenting_az') {
    return (
      <ParentingAZ
        onBack={() => setSelected(null)}
        initialTermId={pendingTermId}
        onTermConsumed={() => setPendingTermId(null)}
      />
    );
  }
  if (selected === 'qa') {
    return (
      <QAScreen
        onBack={() => { setSelected(null); setPendingQuestionId(undefined); }}
        initialQuestionId={pendingQuestionId}
      />
    );
  }
  if (selected === 'local') return <LocalServicesScreen onBack={() => setSelected(null)} />;
  if (selected === 'product_reviews') return <ProductReviewsScreen onBack={() => setSelected(null)} />;
  if (selected === 'provider_reviews') return <ServiceProviderReviews onBack={() => setSelected(null)} />;
  if (selected === 'food_chart') return <BabyFoodChart onBack={() => setSelected(null)} />;
  if (selected === 'wic_recipes') return <RecipesScreen category="wic" onBack={() => setSelected(null)} />;
  if (selected === 'weaning_recipes') return <RecipesScreen category="weaning" onBack={() => setSelected(null)} />;
  if (selected === 'water_safety') return <WaterSafety onBack={() => setSelected(null)} />;
  if (selected === 'choking_safety') return <ChokingSafety onBack={() => setSelected(null)} />;
  if (selected === 'emergency') return <EmergencyContacts onBack={() => setSelected(null)} />;
  if (selected === 'articles') {
    return (
      <ArticlesScreen
        onBack={() => setSelected(null)}
        onTermPress={(termId) => { setPendingTermId(termId); setSelected('parenting_az'); }}
      />
    );
  }
  if (selected === 'videos') return <VideoGuidesScreen onBack={() => setSelected(null)} />;
  if (selected === 'activities') return <ActivitiesScreen onBack={() => setSelected(null)} />;

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length >= 2 || forceSearchView;

  // ─── Search results view ───

  if (isSearching) {
    return (
      <SafeAreaView style={s.container}>
      <View style={{ flex: 1, width: '100%', maxWidth: discoverMaxWidth, alignSelf: 'center' }}>
        <View style={s.searchHeader}>
          <View style={{ flex: 1 }}>
            <DiscoverSearchBar value={query} onChangeText={setQuery} autoFocus={forceSearchView} />
          </View>
          <TouchableOpacity onPress={exitSearch} accessibilityRole="button" accessibilityLabel="Back to Discover" style={s.cancelBtn} hitSlop={hitSlopFor(32)}>
            <Text style={s.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.id}
              style={[s.filterChip, filter === f.id && s.filterChipActive]}
              onPress={() => setFilter(f.id)}
              hitSlop={hitSlopFor(32)}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === f.id }}
              accessibilityLabel={`Filter results: ${f.label}`}
            >
              <Text style={[s.filterChipText, filter === f.id && s.filterChipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {trimmedQuery.length < 2 ? (
          <View style={s.center}>
            <Text style={s.hintText}>
              {filter === 'patches' ? 'Search Patches by name or description' : 'Search Parent Patch to get started'}
            </Text>
          </View>
        ) : searchLoading ? (
          <View style={s.center}><ActivityIndicator size="large" color={c.primary} /></View>
        ) : (
          <SearchResultsBody
            filter={filter}
            results={results}
            query={trimmedQuery}
            currentUserId={currentUserId}
            followingIds={followingIds}
            joinedPatchIds={joinedPatchIds}
            joiningPatchId={joiningPatchId}
            onToggleFollow={toggleFollow}
            onOpenPerson={setProfileUserId}
            onOpenPost={openPost}
            onOpenPatch={(v) => setFeedVillage(v)}
            onToggleJoinPatch={toggleJoinPatch}
            onOpenResource={(id) => setSelected(id as ResourceId)}
            onOpenQuestion={openQuestion}
            onBrowseResources={exitSearch}
            onAskQA={() => { exitSearch(); setSelected('qa'); }}
            c={c}
            s={s}
          />
        )}
      </View>

        <PublicProfileSheet userId={profileUserId} visible={profileUserId !== null} onClose={() => setProfileUserId(null)} />
        <VillageFeedSheet
          village={feedVillage}
          visible={feedVillage !== null}
          onClose={() => setFeedVillage(null)}
          joined={feedVillage !== null && joinedPatchIds.has(feedVillage.id)}
          onToggleJoin={() => feedVillage && toggleJoinPatch(feedVillage.id)}
        />
      </SafeAreaView>
    );
  }

  // ─── Landing view ───

  const myPatches = VILLAGES.filter(v => joinedPatchIds.has(v.id) && !v.hidden);
  const suggestedPatches = VILLAGES.filter(v => !joinedPatchIds.has(v.id) && !v.hidden).slice(0, 8);

  const stageCategories = ageMonths != null ? categoriesForAgeMonths(ageMonths) : null;
  const stageResources = stageCategories
    ? RESOURCES.filter(r => stageCategories.includes(r.category)).slice(0, 2)
    : RESOURCES.slice(0, 2);

  const categoryBrowseResources = categoryBrowse
    ? RESOURCES.filter(r => r.category === categoryBrowse)
    : [];

  type FamilyItem =
    | { kind: 'activity'; activity: Activity }
    | { kind: 'resource'; resource: typeof RESOURCES[number] };
  const familyItems: FamilyItem[] = [
    ...stageActivities.map(a => ({ kind: 'activity' as const, activity: a })),
    ...stageResources.map(r => ({ kind: 'resource' as const, resource: r })),
  ];

  function renderFamilyItem(item: FamilyItem, featured: boolean, width?: number) {
    if (item.kind === 'activity') {
      return (
        <ActivityCard
          key={item.activity.id}
          activity={item.activity}
          onPress={() => setSelectedActivity(item.activity)}
        />
      );
    }
    return (
      <ResourcePreviewCard
        key={item.resource.id}
        resource={item.resource}
        onPress={() => setSelected(item.resource.id)}
        width={featured ? undefined : width}
        variant={featured ? 'featured' : 'default'}
      />
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={{ flex: 1, width: '100%', maxWidth: discoverMaxWidth, alignSelf: 'center' }}>
      <ScrollView
        ref={landingScrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.landingScroll}
        keyboardShouldPersistTaps="handled"
        {...(Platform.OS === 'web' ? { tabIndex: 0, dataSet: { scrollRoot: 'true' } } : {})}
        refreshControl={
          <RefreshControl
            refreshing={landingRefreshing}
            onRefresh={async () => { setLandingRefreshing(true); await loadLanding(); setLandingRefreshing(false); }}
            tintColor={c.primary}
            colors={[c.primary]}
          />
        }
      >
        <View style={s.header}>
          <Text style={s.pageTitle}>Discover</Text>
        </View>

        <View style={s.searchWrap}>
          <DiscoverSearchBar value={query} onChangeText={setQuery} />
        </View>

        {/* 1. For Your Family. Desktop gets an intentional asymmetric layout
             (one large featured recommendation + two smaller supporting
             cards stacked beside it, matched to the same total height) so
             the section reads as "we picked something for you" rather than
             a scroll row. Phone/tablet keep the horizontal carousel —
             several scannable cards, swipeable, no awkward empty space.
             Deliberately the first thing after search: personalized/resource
             discovery leads, ahead of any single social post. */}
        <View onLayout={e => setFamilyRowWidth(e.nativeEvent.layout.width)}>
          <DiscoverSection
            title={activeBaby?.name && ageMonths != null ? `For ${activeBaby.name}'s stage` : 'For Your Family'}
            subtitle={ageMonths != null ? `Relevant for this stage (${ageMonths} mo)` : 'Commonly useful with Parent Patch families'}
            horizontal={!isDesktop && stageActivities.length + stageResources.length > 0}
          >
            {landingLoading ? (
              <ActivityIndicator color={c.primary} />
            ) : familyItems.length === 0 ? (
              <Text style={s.mutedNote}>You may find these helpful as you get started.</Text>
            ) : isDesktop ? (
              <View style={s.familyDesktopWrap}>
                <View style={s.familyFeatured}>
                  {renderFamilyItem(familyItems[0], true)}
                </View>
                {familyItems.length > 1 && (
                  <View style={s.familyStack}>
                    {familyItems.slice(1, 3).map(item => renderFamilyItem(item, false))}
                  </View>
                )}
              </View>
            ) : (
              familyItems.map(item => (
                <View key={item.kind === 'activity' ? item.activity.id : item.resource.id} style={{ width: familyCardWidth }}>
                  {renderFamilyItem(item, false, familyCardWidth)}
                </View>
              ))
            )}
          </DiscoverSection>
        </View>

        {/* 2. Trending Topics when real tag-frequency data clears the
             threshold (trendingTagsFromPosts — never fabricated); otherwise
             Browse Topics using the app's real topic taxonomy (POST_TAGS,
             the same list posts are actually tagged from) so topic
             exploration is never empty just because nothing is
             technically trending yet. Tapping either searches Discover —
             the same real search used everywhere else here. */}
        {trendingTags.length > 0 ? (
          <DiscoverSection title="Trending Topics" subtitle="What parents are tagging this week">
            <View style={s.tagRow}>
              {trendingTags.map(t => (
                <TouchableOpacity
                  key={t.tag}
                  style={s.tagChip}
                  onPress={() => setQuery(t.tag)}
                  hitSlop={hitSlopFor(30)}
                  accessibilityRole="button"
                  accessibilityLabel={`Search trending topic ${t.tag}`}
                >
                  <Text style={s.tagChipText}>#{t.tag}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </DiscoverSection>
        ) : (
          <DiscoverSection title="Browse Topics" subtitle="Explore what other parents post about">
            <View style={s.tagRow}>
              {POST_TAGS.map(tag => (
                <TouchableOpacity
                  key={tag}
                  style={s.tagChip}
                  onPress={() => setQuery(tag)}
                  hitSlop={hitSlopFor(30)}
                  accessibilityRole="button"
                  accessibilityLabel={`Search topic ${tag}`}
                >
                  <Text style={s.tagChipText}>{tag}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </DiscoverSection>
        )}

        {/* 3. Explore Categories — moved up from the bottom of the screen.
             Parent Patch's resource depth should be apparent early, not
             buried below several rounds of social content; this is the
             clearest existing "we have a real library" signal, so it leads
             the resource section rather than closing the screen. */}
        <DiscoverSection title="Explore Categories" subtitle="Browse the full Parent Patch library">
          <View style={s.categoryGrid}>
            {CATEGORIES.map(cat => {
              const active = categoryBrowse === cat;
              const accent = categoryAccent(cat, c);
              return (
                <TouchableOpacity
                  key={cat}
                  style={[
                    s.categoryTile,
                    active ? { backgroundColor: accent.text, borderColor: accent.text } : { backgroundColor: accent.bg, borderColor: accent.bg },
                  ]}
                  onPress={() => setCategoryBrowse(active ? null : cat)}
                  hitSlop={hitSlopFor(40)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Browse ${cat} resources`}
                >
                  <Text style={[s.categoryTileText, { color: active ? c.textOnColored : accent.text }]}>{cat}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {categoryBrowse && (
            <View style={{ marginTop: 14, gap: 10 }}>
              {categoryBrowseResources.map(r => (
                <ResourcePreviewCard key={r.id} resource={r} onPress={() => setSelected(r.id)} />
              ))}
            </View>
          )}
        </DiscoverSection>

        {/* 4. Trending posts — social discovery. Comes after the
             personalized/resource sections above by design (see item 11):
             Parent Patch's information depth should register before a
             single social post gets full-width prominence. */}
        {trendingPosts.length > 0 && (
          <DiscoverSection title="Trending in Parent Patch" subtitle="What parents are talking about this week">
            {trendingPosts.slice(0, 3).map(post => (
              <View key={post.id} style={{ marginBottom: 10 }}>
                <PostPreviewCard post={post} onPress={() => openPost(post)} onPressVillage={openVillageById} />
              </View>
            ))}
          </DiscoverSection>
        )}

        {/* 5. Popular in the Patch */}
        <DiscoverSection title="Popular in the Patch" subtitle="The most-loved posts across Parent Patch">
          {landingLoading ? (
            <ActivityIndicator color={c.primary} />
          ) : popularPosts.length === 0 ? (
            <Text style={s.mutedNote}>No popular posts yet — be the first to share something!</Text>
          ) : (
            popularPosts.map(post => (
              <PostPreviewCard key={post.id} post={post} onPress={() => openPost(post)} onPressVillage={openVillageById} />
            ))
          )}
        </DiscoverSection>

        {/* 6. Discover Patches */}
        <DiscoverSection title="Discover Patches" seeAllLabel="See all" onSeeAll={goToPatchTab}>
          <Text style={s.patchGroupLabel}>Your Patches</Text>
          {myPatches.length === 0 ? (
            <DiscoverEmptyState
              emoji="🌱"
              title="Find your people"
              message="Join Patches for your parenting stage, interests, or local community."
              actions={[{ label: 'Discover Patches', onPress: goToPatchTab }]}
            />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.patchRow}>
              {myPatches.slice(0, 8).map(v => (
                <PatchPreviewCard
                  key={v.id}
                  village={v}
                  joined
                  joining={joiningPatchId === v.id}
                  onJoin={() => toggleJoinPatch(v.id)}
                  onOpen={() => setFeedVillage(v)}
                />
              ))}
            </ScrollView>
          )}

          <Text style={[s.patchGroupLabel, { marginTop: 16 }]}>Discover Patches</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.patchRow}>
            {suggestedPatches.map(v => (
              <PatchPreviewCard
                key={v.id}
                village={v}
                joined={false}
                joining={joiningPatchId === v.id}
                onJoin={() => toggleJoinPatch(v.id)}
                onOpen={() => setFeedVillage(v)}
              />
            ))}
          </ScrollView>

          <View style={s.patchActionsRow}>
            <TouchableOpacity style={s.patchActionChip} hitSlop={hitSlopFor(34)} onPress={focusPatchSearch} accessibilityRole="button" accessibilityLabel="Search Patches">
              <Ionicons name="search-outline" size={14} color={c.textSecondary} />
              <Text style={s.patchActionChipText}>Search Patches</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.patchActionChip} hitSlop={hitSlopFor(34)} onPress={goToPatchTab} accessibilityRole="button" accessibilityLabel="Find Your Patch quiz">
              <Ionicons name="compass-outline" size={14} color={c.textSecondary} />
              <Text style={s.patchActionChipText}>Find Your Patch</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.patchActionChip} hitSlop={hitSlopFor(34)} onPress={goToPatchTab} accessibilityRole="button" accessibilityLabel="Request a Patch">
              <Ionicons name="mail-outline" size={14} color={c.textSecondary} />
              <Text style={s.patchActionChipText}>Request a Patch</Text>
            </TouchableOpacity>
          </View>
        </DiscoverSection>

        {/* 7. Watch & Learn */}
        <DiscoverSection title="Watch & Learn" seeAllLabel="See all" onSeeAll={() => setSelected('videos')} horizontal>
          {VIDEO_CATEGORIES.map(v => (
            <VideoPreview key={v.title} emoji={v.emoji} title={v.title} description={v.desc} onPress={() => setSelected('videos')} />
          ))}
        </DiscoverSection>

        {/* 8. Parent Q+A */}
        <DiscoverSection title="Parent Q+A" seeAllLabel="See all Q+A" onSeeAll={() => setSelected('qa')}>
          {landingLoading ? (
            <ActivityIndicator color={c.primary} />
          ) : recentQuestions.length === 0 ? (
            <Text style={s.mutedNote}>Be the first to ask a question in Parent Q+A.</Text>
          ) : (
            recentQuestions.map(q => (
              <QuestionPreview
                key={q.id}
                question={q.content}
                topic={q.topic}
                answerCount={q.answer_count}
                onPress={() => openQuestion(q.id)}
              />
            ))
          )}
        </DiscoverSection>

        {/* 8. Activities & Ideas */}
        <DiscoverSection title="Activities & Ideas" seeAllLabel="See all" onSeeAll={() => setSelected('activities')} horizontal>
          {moreActivities.map(a => (
            <View key={a.id} style={{ width: 220 }}>
              <ActivityCard activity={a} onPress={() => setSelectedActivity(a)} />
            </View>
          ))}
        </DiscoverSection>

        {/* 9. Near You */}
        <DiscoverSection title="Near You" subtitle="Local services and reviews from parents nearby">
          {RESOURCES.filter(r => r.id === 'local' || r.id === 'provider_reviews').map(r => (
            <ResourcePreviewCard key={r.id} resource={r} onPress={() => setSelected(r.id)} />
          ))}
        </DiscoverSection>
      </ScrollView>
      </View>

      <PublicProfileSheet userId={profileUserId} visible={profileUserId !== null} onClose={() => setProfileUserId(null)} />
      <VillageFeedSheet
        village={feedVillage}
        visible={feedVillage !== null}
        onClose={() => setFeedVillage(null)}
        joined={feedVillage !== null && joinedPatchIds.has(feedVillage.id)}
        onToggleJoin={() => feedVillage && toggleJoinPatch(feedVillage.id)}
      />
    </SafeAreaView>
  );
}

// ─── Search results body ───────────────────────────────────────────────────────

function SearchResultsBody({
  filter, results, query, currentUserId, followingIds, joinedPatchIds, joiningPatchId,
  onToggleFollow, onOpenPerson, onOpenPost, onOpenPatch, onToggleJoinPatch, onOpenResource,
  onOpenQuestion, onBrowseResources, onAskQA, c, s,
}: {
  filter: SearchFilter;
  results: DiscoverSearchResults;
  query: string;
  currentUserId: string | null;
  followingIds: Set<string>;
  joinedPatchIds: Set<string>;
  joiningPatchId: string | null;
  onToggleFollow: (id: string) => void;
  onOpenPerson: (id: string) => void;
  onOpenPost: (post: Post) => void;
  onOpenPatch: (v: Village) => void;
  onToggleJoinPatch: (id: string) => void;
  onOpenResource: (id: string) => void;
  onOpenQuestion: (id: string) => void;
  onBrowseResources: () => void;
  onAskQA: () => void;
  c: Colors;
  s: ReturnType<typeof makeStyles>;
}) {
  const totalCount =
    results.people.length + results.posts.length + results.patches.length +
    results.resources.length + results.questions.length;

  if (totalCount === 0) {
    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <DiscoverEmptyState
          emoji="🔍"
          title={`No results for "${query}"`}
          message="Try another term, or explore what Parent Patch already has."
          actions={[
            { label: 'Browse Resources', onPress: onBrowseResources },
            { label: 'Ask Parent Q+A', onPress: onAskQA },
          ]}
        />
      </ScrollView>
    );
  }

  const showPeople = filter === 'top' || filter === 'parents';
  const showPatches = filter === 'top' || filter === 'patches';
  const showResources = filter === 'top' || filter === 'resources';
  const showQuestions = filter === 'top' || filter === 'qa';
  const showPosts = filter === 'top' || filter === 'posts';

  const cap = (n: number) => (filter === 'top' ? n : 999);

  const visibleCount =
    (showPosts ? results.posts.length : 0) +
    (showPeople ? results.people.length : 0) +
    (showPatches ? results.patches.length : 0) +
    (showResources ? results.resources.length : 0) +
    (showQuestions ? results.questions.length : 0);

  if (visibleCount === 0) {
    const filterLabel = FILTERS.find(f => f.id === filter)?.label ?? filter;
    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <DiscoverEmptyState
          emoji="🔍"
          title={`No ${filterLabel.toLowerCase()} results for "${query}"`}
          message="Other categories have matches — try Top to see everything that matched."
          actions={[{ label: 'Browse Resources', onPress: onBrowseResources }, { label: 'Ask Parent Q+A', onPress: onAskQA }]}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.resultsScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      {...(Platform.OS === 'web' ? { tabIndex: 0, dataSet: { scrollRoot: 'true' } } : {})}>
      {showPosts && results.posts.length > 0 && (
        <View style={s.resultGroup}>
          {filter === 'top' && <Text style={s.resultGroupLabel}>Posts</Text>}
          {results.posts.slice(0, cap(4)).map(p => (
            <View key={p.id} style={{ marginBottom: 10 }}>
              <PostPreviewCard post={p} onPress={() => onOpenPost(p)} onPressVillage={(id) => { const [v] = villagesByIds([id]); if (v) onOpenPatch(v); }} />
            </View>
          ))}
        </View>
      )}

      {showPeople && results.people.length > 0 && (
        <View style={s.resultGroup}>
          {filter === 'top' && <Text style={s.resultGroupLabel}>Parents</Text>}
          {results.people.slice(0, cap(3)).map(p => (
            <View key={p.id} style={{ marginBottom: 8 }}>
              <PersonPreviewCard
                person={p}
                isMe={p.id === currentUserId}
                isFollowing={followingIds.has(p.id)}
                onPress={() => onOpenPerson(p.id)}
                onToggleFollow={() => onToggleFollow(p.id)}
              />
            </View>
          ))}
        </View>
      )}

      {showPatches && results.patches.length > 0 && (
        <View style={s.resultGroup}>
          {filter === 'top' && <Text style={s.resultGroupLabel}>Patches</Text>}
          {results.patches.slice(0, cap(3)).map(v => (
            <View key={v.id} style={{ marginBottom: 8 }}>
              <VillageCard
                village={v}
                joined={joinedPatchIds.has(v.id)}
                joining={joiningPatchId === v.id}
                onJoin={() => onToggleJoinPatch(v.id)}
                onOpen={() => onOpenPatch(v)}
                fullWidth
              />
            </View>
          ))}
        </View>
      )}

      {showResources && results.resources.length > 0 && (
        <View style={s.resultGroup}>
          {filter === 'top' && <Text style={s.resultGroupLabel}>Resources</Text>}
          {results.resources.slice(0, cap(3)).map(r => (
            <View key={r.id} style={{ marginBottom: 8 }}>
              <ResourcePreviewCard resource={r} onPress={() => onOpenResource(r.id)} />
            </View>
          ))}
        </View>
      )}

      {showQuestions && results.questions.length > 0 && (
        <View style={s.resultGroup}>
          {filter === 'top' && <Text style={s.resultGroupLabel}>Q+A</Text>}
          {results.questions.slice(0, cap(3)).map(q => (
            <View key={q.id} style={{ marginBottom: 8 }}>
              <QuestionPreview
                question={q.content}
                topic={q.topic}
                answerCount={q.answer_count}
                onPress={() => onOpenQuestion(q.id)}
              />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    landingScroll: { paddingBottom: 48 },
    header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    pageTitle: { ...typography.screenTitle, color: c.textPrimary },
    searchWrap: { paddingHorizontal: 20, marginTop: 10, marginBottom: 24 },

    searchHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
    cancelBtn: { paddingHorizontal: 4, paddingVertical: 8 },
    cancelBtnText: { fontSize: 15, fontWeight: '600', color: c.primary },
    hintText: { fontSize: 14, color: c.textMuted, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },
    filterScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: c.separator },
    filterRow: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 10, gap: 8 },
    filterChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: c.inputBg },
    filterChipActive: { backgroundColor: c.primary },
    filterChipText: { ...typography.tabLabel, color: c.textMuted },
    filterChipTextActive: { color: c.primaryText },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    resultsScroll: { padding: 20, paddingBottom: 48 },
    resultGroup: { marginBottom: 20 },
    resultGroupLabel: { fontSize: 13, fontWeight: '800', color: c.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 },

    mutedNote: { fontSize: 13, color: c.textMuted, paddingHorizontal: 20, lineHeight: 19 },

    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, marginBottom: 14 },
    tagChip: { borderWidth: 1.5, borderColor: c.separator, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: c.card },
    tagChipText: { ...typography.tabLabel, color: c.primary },

    patchGroupLabel: { fontSize: 13, fontWeight: '800', color: c.textMuted, marginBottom: 10, paddingHorizontal: 20, textTransform: 'uppercase', letterSpacing: 0.4 },
    patchRow: { paddingHorizontal: 20, gap: 12 },
    patchActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20, marginTop: 16 },
    patchActionChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: c.separator, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: c.card },
    patchActionChipText: { fontSize: 12.5, fontWeight: '700', color: c.textSecondary },

    familyDesktopWrap: { flexDirection: 'row', paddingHorizontal: 20, gap: 16, alignItems: 'stretch' },
    familyFeatured: { flex: 1.3 },
    familyStack: { flex: 1, gap: 12, justifyContent: 'space-between' },

    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20 },
    categoryTile: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
    categoryTileText: { fontSize: 13.5, fontWeight: '700' },
  });
