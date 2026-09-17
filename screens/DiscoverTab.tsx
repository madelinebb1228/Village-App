import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import { useResponsive, maxWidthFor, useMeasuredWidth, fitCardsToWidth } from '../lib/responsive';
import { AppContext } from '../lib/AppContext';
import { screenView, track } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { useBaby } from '../lib/babyContext';
import { getBabyAge, babyAgeLabel } from '../lib/feedUtils';
import { useSubscription } from '../lib/subscriptionContext';
import { VILLAGES, Village, villagesByIds } from '../lib/villageData';
import { RESOURCES, CATEGORIES, Category, categoriesForAgeMonths, categoryAccent, categoryIcon } from '../lib/resourcesData';
import { Activity, areaIcon, cardPalette, difficultyLabel } from '../lib/activitiesUtil';
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
import CategoryNavTile from '../components/discover/CategoryNavTile';
import StageItemRow from '../components/discover/StageItemRow';
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

// Near You renders these two RESOURCES entries as functional destination
// chrome rather than content, so they get a specific Ionicon each instead
// of their catalog emoji (see ResourcePreviewCard's `icon` prop).
const NEAR_YOU_ICONS: Record<string, keyof typeof import('@expo/vector-icons').Ionicons.glyphMap> = {
  local: 'location-outline',
  provider_reviews: 'star-outline',
};

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

  // Phone/tablet stage-hub carousel fallback width, used only until the row
  // below has measured itself (see stageCarouselRow/stageCarouselFit).
  const familyCardWidth = 260;
  const exploreCategoriesYRef = useRef(0);
  // Measures the stage hub's own tablet/phone carousel row so its card
  // width is computed from real rendered width rather than a fixed 260px —
  // a fixed width against a variable-width column (especially right around
  // the desktop breakpoint, e.g. with browser devtools open) produces an
  // arbitrary, sometimes-tiny peek of the next card that reads as an
  // accidental clip rather than an intentional "swipe for more" affordance.
  // STAGE_PEEK_RESERVE is subtracted from the measured width before fitting
  // whole cards, so whatever's left over for the next (partially visible)
  // card is always a deliberate, consistent peek rather than a random
  // modulo remainder.
  const stageCarouselRow = useMeasuredWidth();

  // Desktop row-fitting for the horizontal-carousel sections below (Watch &
  // Learn, Discover Patches, Popular in the Patch, Activities & Ideas). A
  // fixed card width against a variable-width column either clips a partial
  // card at the edge or leaves a wide desktop row mostly empty — windowWidth
  // alone can't tell us the real available width here (it depends on where
  // it falls relative to the sidebar + Discover's own maxWidth column), so
  // each row measures itself via onLayout instead. Phone/tablet keep the
  // original fixed-width horizontal ScrollView.
  const watchLearnRow = useMeasuredWidth();
  const patchesRow = useMeasuredWidth();
  const activitiesRow = useMeasuredWidth();
  const popularRow = useMeasuredWidth();

  const initialResourceId = route?.params?.initialResourceId as ResourceId | undefined;
  const [selected, setSelected] = useState<ResourceId | null>(initialResourceId ?? null);
  const [pendingTermId, setPendingTermId] = useState<string | null>(null);
  const [pendingQuestionId, setPendingQuestionId] = useState<string | undefined>(undefined);
  const [autoAskQA, setAutoAskQA] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [feedVillage, setFeedVillage] = useState<Village | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const { pushSecondary } = useContext(AppContext);
  function openProfile(userId: string) {
    if (isDesktop) pushSecondary({ type: 'profile', userId });
    else setProfileUserId(userId);
  }

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
  const stageCategories = ageMonths != null ? categoriesForAgeMonths(ageMonths) : null;

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

  // Routes into QAScreen's own existing "Ask a question" modal (search →
  // write, inserts into qa_questions) rather than building a second composer.
  function askQuestion() {
    setAutoAskQA(true);
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

  function openVillageFeed(v: Village) {
    if (isDesktop) pushSecondary({ type: 'villageFeed', villageId: v.id });
    else setFeedVillage(v);
  }

  function openVillageById(villageId: string) {
    const [v] = villagesByIds([villageId]);
    if (v) openVillageFeed(v);
  }

  // Stage hub's "Explore more for this stage" — routes into the real
  // Explore Categories browse for the most stage-relevant category rather
  // than a fabricated destination, then scrolls it into view.
  function exploreStageCategory() {
    if (!stageCategories || stageCategories.length === 0) return;
    setCategoryBrowse(stageCategories[0]);
    landingScrollRef.current?.scrollTo({ y: Math.max(0, exploreCategoriesYRef.current - 12), animated: true });
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
        autoAsk={autoAskQA}
        onAutoAskConsumed={() => setAutoAskQA(false)}
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
            onOpenPerson={openProfile}
            onOpenPost={openPost}
            onOpenPatch={(v) => openVillageFeed(v)}
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
        {!isDesktop && (
          <VillageFeedSheet
            village={feedVillage}
            visible={feedVillage !== null}
            onClose={() => setFeedVillage(null)}
            joined={feedVillage !== null && joinedPatchIds.has(feedVillage.id)}
            onToggleJoin={() => feedVillage && toggleJoinPatch(feedVillage.id)}
          />
        )}
      </SafeAreaView>
    );
  }

  // ─── Landing view ───

  const myPatches = VILLAGES.filter(v => joinedPatchIds.has(v.id) && !v.hidden);
  const suggestedPatches = VILLAGES.filter(v => !joinedPatchIds.has(v.id) && !v.hidden).slice(0, 8);

  // "Trending in Parent Patch" reframed around the real trending TAG rather
  // than a single post's own like count (a low-like post can legitimately be
  // part of an actively-discussed topic). trendingTopic is just
  // trendingTags[0] — real tag-frequency data, already computed in
  // loadLanding via trendingTagsFromPosts, never fabricated. That count is
  // only a frequency among the ~5 posts already loaded as "trending" (not a
  // real "posts this week" total), so it's intentionally not shown as a
  // number — see the "Trending topic" copy below instead.
  const trendingTopic = trendingTags[0] ?? null;
  const representativePost = trendingTopic
    ? trendingPosts.find(p => p.tags?.includes(trendingTopic.tag)) ?? trendingPosts[0]
    : null;

  const stageResources = stageCategories
    ? RESOURCES.filter(r => stageCategories.includes(r.category)).slice(0, 2)
    : RESOURCES.slice(0, 2);

  const categoryBrowseResources = categoryBrowse
    ? RESOURCES.filter(r => r.category === categoryBrowse)
    : [];

  type FamilyItem =
    | { kind: 'activity'; activity: Activity }
    | { kind: 'resource'; resource: typeof RESOURCES[number] };
  // Interleaved (not activities-then-resources) so the stage hub's featured
  // slot and first few rows mix content types — otherwise, whenever there
  // are 3+ stage activities, the hub reads as an activity-recommendation
  // widget and resources never surface above the fold. See lib/activitiesUtil
  // for areaIcon/cardPalette and lib/resourcesData for categoryIcon/Accent,
  // reused below for the compact rows.
  const familyItems: FamilyItem[] = [];
  {
    const maxLen = Math.max(stageActivities.length, stageResources.length);
    for (let i = 0; i < maxLen; i++) {
      if (stageActivities[i]) familyItems.push({ kind: 'activity', activity: stageActivities[i] });
      if (stageResources[i]) familyItems.push({ kind: 'resource', resource: stageResources[i] });
    }
  }

  function familyItemKey(item: FamilyItem) {
    return item.kind === 'activity' ? `activity-${item.activity.id}` : `resource-${item.resource.id}`;
  }

  function renderFamilyItem(item: FamilyItem, featured: boolean, width?: number) {
    if (item.kind === 'activity') {
      return (
        <ActivityCard
          key={item.activity.id}
          activity={item.activity}
          onPress={() => setSelectedActivity(item.activity)}
          variant={featured ? 'featured' : 'default'}
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

  // Compact row rendering for the stage hub's secondary items (desktop) —
  // same underlying data as renderFamilyItem, lighter visual weight.
  function renderFamilyRow(item: FamilyItem) {
    if (item.kind === 'activity') {
      const a = item.activity;
      const palette = cardPalette(a, c);
      return (
        <StageItemRow
          key={familyItemKey(item)}
          icon={areaIcon(a.developmental_areas?.[0] ?? '')}
          accentBg={palette.bg}
          accentColor={palette.border}
          title={a.title}
          meta={`Activity · ${a.duration_minutes} min · ${difficultyLabel(a.difficulty)}`}
          onPress={() => setSelectedActivity(a)}
        />
      );
    }
    const r = item.resource;
    const accent = categoryAccent(r.category, c);
    return (
      <StageItemRow
        key={familyItemKey(item)}
        icon={categoryIcon(r.category)}
        accentBg={accent.bg}
        accentColor={accent.text}
        title={r.title}
        meta={r.category}
        onPress={() => setSelected(r.id)}
      />
    );
  }

  const watchLearnFit = fitCardsToWidth(watchLearnRow.width, VIDEO_CATEGORIES.length, { gap: 12, minWidth: 140, maxWidth: 224, targetWidth: 200 });
  const yourPatchesFit = fitCardsToWidth(patchesRow.width, myPatches.length, { gap: 12, minWidth: 230, maxWidth: 300, targetWidth: 260 });
  const discoverPatchesFit = fitCardsToWidth(patchesRow.width, suggestedPatches.length, { gap: 12, minWidth: 230, maxWidth: 300, targetWidth: 260 });
  const activitiesFit = fitCardsToWidth(activitiesRow.width, moreActivities.length, { gap: 12, minWidth: 230, maxWidth: 340, targetWidth: 260 });
  const popularFit = fitCardsToWidth(popularRow.width, popularPosts.length, { gap: 12, minWidth: 230, maxWidth: 300, targetWidth: 260 });
  const watchLearnFitted = isDesktop && watchLearnRow.width > 0;
  const patchesFitted = isDesktop && patchesRow.width > 0;
  const activitiesFitted = isDesktop && activitiesRow.width > 0;
  const popularFitted = isDesktop && popularRow.width > 0;

  const STAGE_PEEK_RESERVE = 56;
  const stageCarouselMeasured = stageCarouselRow.width > 0;
  const stageCarouselFit = fitCardsToWidth(
    stageCarouselMeasured ? Math.max(0, stageCarouselRow.width - STAGE_PEEK_RESERVE) : 0,
    familyItems.length,
    { gap: 12, minWidth: 200, maxWidth: 280, targetWidth: 260 },
  );
  const stageCardWidth = stageCarouselMeasured ? stageCarouselFit.cardWidth : familyCardWidth;

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

        {/* 1. Stage/family hub — "here's what across Parent Patch may be
             useful for your family right now," not an activity widget. One
             featured recommendation (interleaved activity/resource, so it
             isn't always an activity) plus a few compact rows for the rest,
             layered by scale rather than stacked as same-weight cards.
             Desktop: row + column of rows side by side. Phone/tablet: the
             original horizontal carousel, adapted rather than squeezed.
             Deliberately the first thing after search: personalized/resource
             discovery leads, ahead of any single social post. */}
        <DiscoverSection
          title={activeBaby?.name && ageMonths != null ? `${activeBaby.name} · ${babyAgeLabel(activeBaby.birth_date!)}` : 'For Your Family'}
          subtitle={ageMonths != null ? 'Relevant for this stage' : 'You might find this useful as you get started'}
        >
          {landingLoading ? (
            <ActivityIndicator color={c.primary} />
          ) : familyItems.length === 0 ? (
            <Text style={s.mutedNote}>You may find these helpful as you get started.</Text>
          ) : isDesktop ? (
            <>
              <View style={s.stageHubRow}>
                <View style={s.stageFeatured}>
                  {renderFamilyItem(familyItems[0], true)}
                </View>
                {familyItems.length > 1 && (
                  <View style={s.stageRows}>
                    {familyItems.slice(1).map(item => renderFamilyRow(item))}
                  </View>
                )}
              </View>
              {stageCategories && (
                <TouchableOpacity
                  style={s.stageExploreLink}
                  onPress={exploreStageCategory}
                  hitSlop={hitSlopFor(20)}
                  accessibilityRole="button"
                  accessibilityLabel={`Explore more ${stageCategories[0]} resources for this stage`}
                >
                  <Text style={s.stageExploreLinkText}>Explore more for this stage</Text>
                  <Ionicons name="arrow-forward" size={14} color={c.primary} />
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <View onLayout={stageCarouselRow.onLayout}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.stageHorizontalRow}>
                  {familyItems.map(item => (
                    <View key={familyItemKey(item)} style={{ width: stageCardWidth }}>
                      {renderFamilyItem(item, false, stageCardWidth)}
                    </View>
                  ))}
                </ScrollView>
              </View>
              {stageCategories && (
                <TouchableOpacity
                  style={s.stageExploreLink}
                  onPress={exploreStageCategory}
                  hitSlop={hitSlopFor(20)}
                  accessibilityRole="button"
                  accessibilityLabel={`Explore more ${stageCategories[0]} resources for this stage`}
                >
                  <Text style={s.stageExploreLinkText}>Explore more for this stage</Text>
                  <Ionicons name="arrow-forward" size={14} color={c.primary} />
                </TouchableOpacity>
              )}
            </>
          )}
        </DiscoverSection>

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
             the resource section rather than closing the screen. Rendered
             as compact icon nav tiles (not text chips like Browse Topics
             above, not the old giant color pills) so the distinction is
             visible at a glance: Browse Topics = what parents are
             discussing, Explore Categories = Parent Patch's own library. */}
        <View onLayout={e => { exploreCategoriesYRef.current = e.nativeEvent.layout.y; }}>
          <DiscoverSection title="Explore Categories" subtitle="Browse the full Parent Patch library">
            <View style={s.categoryGrid}>
              {CATEGORIES.map(cat => (
                <CategoryNavTile
                  key={cat}
                  category={cat}
                  active={categoryBrowse === cat}
                  onPress={() => setCategoryBrowse(categoryBrowse === cat ? null : cat)}
                />
              ))}
            </View>

            {categoryBrowse && (
              <View style={{ marginTop: 14, gap: 10 }}>
                {categoryBrowseResources.map(r => (
                  <ResourcePreviewCard key={r.id} resource={r} onPress={() => setSelected(r.id)} />
                ))}
              </View>
            )}
          </DiscoverSection>
        </View>

        {/* 4. Trending posts — social discovery. Comes after the
             personalized/resource sections above by design (see item 11):
             Parent Patch's information depth should register before a
             single social post gets full-width prominence.
             Framed around the trending TOPIC (real tag frequency) rather
             than presenting posts as individually "trending" — a topic can
             be actively discussed even when its example post has few likes
             yet, which read as a contradiction under the old per-post
             framing. Falls back to the previous multi-post stack if there's
             no tag data to build a topic from (e.g. untagged trending
             posts), so this never shows less than before. */}
        {trendingPosts.length > 0 && (
          <DiscoverSection title="Trending in Parent Patch" subtitle="What parents are talking about this week">
            {trendingTopic && representativePost ? (
              <>
                <View style={s.trendingTopicHeader}>
                  <View style={s.trendingTopicBadge}>
                    <Ionicons name="flame-outline" size={13} color={c.lavender} />
                    <Text style={s.trendingTopicBadgeText}>Trending topic</Text>
                  </View>
                  <Text style={s.trendingTopicName} numberOfLines={1}>{trendingTopic.tag}</Text>
                </View>
                <PostPreviewCard post={representativePost} onPress={() => openPost(representativePost)} onPressVillage={openVillageById} />
              </>
            ) : (
              trendingPosts.slice(0, 3).map(post => (
                <View key={post.id} style={{ marginBottom: 10 }}>
                  <PostPreviewCard post={post} onPress={() => openPost(post)} onPressVillage={openVillageById} />
                </View>
              ))
            )}
          </DiscoverSection>
        )}

        {/* 5. Discover Patches. Desktop sizes/caps visible cards to what the
             measured row width actually fits (fitCardsToWidth) instead of a
             fixed 260px card — a brittle width either clips a partial card
             at the edge (the bug here) or wastes space. Showing fewer
             complete cards is fine since the section already has "See all".
             Phone/tablet keep the original fixed-width horizontal scroll. */}
        <DiscoverSection title="Discover Patches" seeAllLabel="See all" onSeeAll={goToPatchTab}>
          <View onLayout={patchesRow.onLayout}>
            <Text style={s.patchGroupLabel}>Your Patches</Text>
            {myPatches.length === 0 ? (
              <DiscoverEmptyState
                emoji="🌱"
                title="Find your people"
                message="Join Patches for your parenting stage, interests, or local community."
                actions={[{ label: 'Discover Patches', onPress: goToPatchTab }]}
              />
            ) : patchesFitted ? (
              <View style={s.fittedRow}>
                {myPatches.slice(0, yourPatchesFit.visibleCount).map(v => (
                  <PatchPreviewCard
                    key={v.id}
                    village={v}
                    joined
                    joining={joiningPatchId === v.id}
                    onJoin={() => toggleJoinPatch(v.id)}
                    onOpen={() => openVillageFeed(v)}
                    width={yourPatchesFit.cardWidth}
                  />
                ))}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.patchRow}>
                {myPatches.slice(0, 8).map(v => (
                  <PatchPreviewCard
                    key={v.id}
                    village={v}
                    joined
                    joining={joiningPatchId === v.id}
                    onJoin={() => toggleJoinPatch(v.id)}
                    onOpen={() => openVillageFeed(v)}
                  />
                ))}
              </ScrollView>
            )}

            <Text style={[s.patchGroupLabel, { marginTop: 16 }]}>Discover Patches</Text>
            {patchesFitted ? (
              <View style={s.fittedRow}>
                {suggestedPatches.slice(0, discoverPatchesFit.visibleCount).map(v => (
                  <PatchPreviewCard
                    key={v.id}
                    village={v}
                    joined={false}
                    joining={joiningPatchId === v.id}
                    onJoin={() => toggleJoinPatch(v.id)}
                    onOpen={() => openVillageFeed(v)}
                    width={discoverPatchesFit.cardWidth}
                  />
                ))}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.patchRow}>
                {suggestedPatches.map(v => (
                  <PatchPreviewCard
                    key={v.id}
                    village={v}
                    joined={false}
                    joining={joiningPatchId === v.id}
                    onJoin={() => toggleJoinPatch(v.id)}
                    onOpen={() => openVillageFeed(v)}
                  />
                ))}
              </ScrollView>
            )}
          </View>

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

        {/* 6. Watch & Learn. Desktop fits all 5 categories across the row
             (shrinking card width within a readable range) rather than
             clipping the last one in a carousel that doesn't need to be
             one — there's room, so it shouldn't look like an accidental
             mobile carousel. Phone/tablet keep horizontal scrolling. */}
        <DiscoverSection title="Watch & Learn" seeAllLabel="See all" onSeeAll={() => setSelected('videos')}>
          <View onLayout={watchLearnRow.onLayout}>
            {watchLearnFitted ? (
              <View style={s.fittedRow}>
                {VIDEO_CATEGORIES.map(v => (
                  <VideoPreview key={v.title} emoji={v.emoji} title={v.title} description={v.desc} onPress={() => setSelected('videos')} width={watchLearnFit.cardWidth} />
                ))}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.horizontalScrollRow}>
                {VIDEO_CATEGORIES.map(v => (
                  <VideoPreview key={v.title} emoji={v.emoji} title={v.title} description={v.desc} onPress={() => setSelected('videos')} />
                ))}
              </ScrollView>
            )}
          </View>
        </DiscoverSection>

        {/* 7. Parent Q+A. Empty state routes "Ask a question" into
             QAScreen's own existing ask flow (autoAsk) rather than a
             duplicate composer — see askQuestion above. */}
        <DiscoverSection title="Parent Q+A" seeAllLabel="See all Q+A" onSeeAll={() => setSelected('qa')}>
          {landingLoading ? (
            <ActivityIndicator color={c.primary} />
          ) : recentQuestions.length === 0 ? (
            <View style={s.qaEmptyState}>
              <Text style={s.qaEmptyText}>No questions yet. Start the conversation.</Text>
              <TouchableOpacity
                style={s.qaEmptyBtn}
                onPress={askQuestion}
                hitSlop={hitSlopFor(20)}
                accessibilityRole="button"
                accessibilityLabel="Ask a question in Parent Q and A"
              >
                <Ionicons name="add" size={16} color={c.primaryText} />
                <Text style={s.qaEmptyBtnText}>Ask a question</Text>
              </TouchableOpacity>
            </View>
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

        {/* 8. Popular in the Patch — deliberately kept apart from Trending
             (above, near the top) and given a lighter/compact horizontal
             treatment so two near-identical vertical post stacks never sit
             back-to-back; this reads as a secondary, supporting signal. */}
        <DiscoverSection title="Popular in the Patch" subtitle="More posts worth a look">
          <View onLayout={popularRow.onLayout}>
            {landingLoading ? (
              <ActivityIndicator color={c.primary} />
            ) : popularPosts.length === 0 ? (
              <Text style={s.mutedNote}>No popular posts yet — be the first to share something!</Text>
            ) : popularFitted ? (
              <View style={s.fittedRow}>
                {popularPosts.slice(0, popularFit.visibleCount).map(post => (
                  <PostPreviewCard key={post.id} post={post} width={popularFit.cardWidth} onPress={() => openPost(post)} onPressVillage={openVillageById} />
                ))}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.horizontalScrollRow}>
                {popularPosts.map(post => (
                  <PostPreviewCard key={post.id} post={post} width={260} onPress={() => openPost(post)} onPressVillage={openVillageById} />
                ))}
              </ScrollView>
            )}
          </View>
        </DiscoverSection>

        {/* 9. Activities & Ideas. This had the opposite problem from Watch &
             Learn/Discover Patches: only 2-3 fixed-220px cards in a much
             wider desktop row, leaving it mostly empty. Desktop grows the
             cards to fill the row (capped so they don't become giant
             panels) instead of fabricating more content to fill the space. */}
        <DiscoverSection title="Activities & Ideas" seeAllLabel="See all" onSeeAll={() => setSelected('activities')}>
          <View onLayout={activitiesRow.onLayout}>
            {activitiesFitted ? (
              <View style={s.fittedRow}>
                {moreActivities.slice(0, activitiesFit.visibleCount).map(a => (
                  <View key={a.id} style={{ width: activitiesFit.cardWidth }}>
                    <ActivityCard activity={a} onPress={() => setSelectedActivity(a)} />
                  </View>
                ))}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.horizontalScrollRow}>
                {moreActivities.map(a => (
                  <View key={a.id} style={{ width: 220 }}>
                    <ActivityCard activity={a} onPress={() => setSelectedActivity(a)} />
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </DiscoverSection>

        {/* 10. Near You. Functional chrome (not resource content identity,
             unlike other ResourcePreviewCard emoji), so these two get an
             explicit Ionicon per destination instead of their catalog
             emoji — matching Explore Categories/Track/sidebar. */}
        <DiscoverSection title="Near You" subtitle="Local services and reviews from parents nearby">
          {RESOURCES.filter(r => r.id === 'local' || r.id === 'provider_reviews').map(r => (
            <ResourcePreviewCard key={r.id} resource={r} onPress={() => setSelected(r.id)} icon={NEAR_YOU_ICONS[r.id]} />
          ))}
        </DiscoverSection>
      </ScrollView>
      </View>

      <PublicProfileSheet userId={profileUserId} visible={profileUserId !== null} onClose={() => setProfileUserId(null)} />
      {!isDesktop && (
        <VillageFeedSheet
          village={feedVillage}
          visible={feedVillage !== null}
          onClose={() => setFeedVillage(null)}
          joined={feedVillage !== null && joinedPatchIds.has(feedVillage.id)}
          onToggleJoin={() => feedVillage && toggleJoinPatch(feedVillage.id)}
        />
      )}
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

    stageHubRow: { flexDirection: 'row', gap: 16, alignItems: 'stretch' },
    stageFeatured: { flex: 1.3 },
    stageRows: { flex: 1, gap: 8 },
    stageHorizontalRow: { gap: 12 },
    stageExploreLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
    stageExploreLinkText: { ...typography.tabLabel, color: c.primary },

    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

    // Shared by the desktop-fitted rows (Watch & Learn, Discover Patches,
    // Popular in the Patch, Activities & Ideas) and their phone/tablet
    // horizontal-scroll fallback — see fitCardsToWidth in lib/responsive.
    fittedRow: { flexDirection: 'row', gap: 12 },
    horizontalScrollRow: { gap: 12 },

    trendingTopicHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
    trendingTopicBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: c.cardLavender, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
    },
    trendingTopicBadgeText: { fontSize: 11.5, fontWeight: '700', color: c.lavender },
    trendingTopicName: { fontSize: 16, fontWeight: '800', color: c.textPrimary, flexShrink: 1 },

    qaEmptyState: { gap: 10 },
    qaEmptyText: { fontSize: 13, color: c.textMuted, lineHeight: 18 },
    qaEmptyBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
      backgroundColor: c.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9,
    },
    qaEmptyBtnText: { fontSize: 13, fontWeight: '700', color: c.primaryText },
  });
