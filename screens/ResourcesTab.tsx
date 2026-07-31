import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useColors, Colors } from '../lib/theme';
import QAScreen from './QAScreen';
import LocalServicesScreen from './LocalServicesScreen';
import BabyNameFinder from './BabyNameFinder';
import RecipesScreen from './RecipesScreen';
import BabyFoodChart from './BabyFoodChart';
import ProductReviewsScreen from './ProductReviewsScreen';
import ParentingAZ from './ParentingAZ';
import MomGroupDirectory from './MomGroupDirectory';
import ParentMarketplace from './ParentMarketplace';
import SmartShoppingLists from './SmartShoppingLists';
import ServiceProviderReviews from './ServiceProviderReviews';
import Breastfeeding101 from './Breastfeeding101';
import WaterSafety from './WaterSafety';
import ChokingSafety from './ChokingSafety';
import EmergencyContacts from './EmergencyContacts';
import ArticlesScreen from './ArticlesScreen';
import TopQuestionsScreen from './TopQuestionsScreen';
import VideoGuidesScreen from './VideoGuidesScreen';

// ─── Resource definitions ─────────────────────────────────────────────────────

const CARD_PALETTE: Array<{ bg: (c: Colors) => string; border: (c: Colors) => string }> = [
  { bg: c => c.cardBlush,    border: c => c.blush },
  { bg: c => c.cardSage,     border: c => c.sage },
  { bg: c => c.cardHoney,    border: c => c.honey },
  { bg: c => c.cardBlue,     border: c => c.blue },
  { bg: c => c.cardLavender, border: c => c.lavender },
];

const CATEGORIES = ['Safety', 'Feeding', 'Guides & Learning', 'Shopping & Gear', 'Community', 'Local & Reviews'] as const;
type Category = typeof CATEGORIES[number];

export const RESOURCES = [
  { id: 'breastfeeding_101', emoji: '🤱',  title: 'Breastfeeding 101',            description: 'Tips & tricks, common challenges, pumping guide, milk storage, recipes, and supplement reviews', category: 'Feeding' },
  { id: 'shopping_lists',    emoji: '🛍️',  title: 'Smart Shopping Lists',          description: 'Curated packing lists for hospital bags, travel, newborns, and more — or post your own', category: 'Shopping & Gear' },
  { id: 'babynames',         emoji: '🌸',  title: 'Baby Name Finder',              description: 'Browse hundreds of names with meanings, origins, and style tags', category: 'Guides & Learning' },
  { id: 'marketplace',       emoji: '🛍️',  title: 'Parent Marketplace',            description: 'Buy and sell gently used baby gear with parents in your city', category: 'Shopping & Gear' },
  { id: 'mom_groups',        emoji: '👨‍👩‍👧', title: 'Parent Groups',                  description: 'Find local meetups, online communities, and support groups near you', category: 'Community' },
  { id: 'parenting_az',      emoji: '📖',  title: 'Parenting A–Z',                 description: 'Plain-English explanations of methods, terms, and techniques every parent should know', category: 'Guides & Learning' },
  { id: 'qa',                emoji: '💬',  title: 'Parenting Q+A',                 description: 'Ask questions and get answers from other parents', category: 'Community' },
  { id: 'articles',          emoji: '📰',  title: 'Articles',                      description: 'Expert tips, guides, and parenting reads', category: 'Guides & Learning' },
  { id: 'local',             emoji: '📍',  title: 'Local Services',                description: 'Find pediatricians, lactation consultants, and more near you', category: 'Local & Reviews' },
  { id: 'product_reviews',   emoji: '⭐',  title: 'Product Reviews',               description: 'Community-rated strollers, car seats, pumps, monitors, and more', category: 'Shopping & Gear' },
  { id: 'provider_reviews',  emoji: '🏙️', title: 'Provider Reviews by City',      description: 'Reviews of local pediatricians, daycares, doulas, and more from parents in your city', category: 'Local & Reviews' },
  { id: 'food_chart',        emoji: '🍼',  title: 'What Can My Baby Eat?',         description: 'Age-by-age food guide with prep tips, allergen info, and safety notes', category: 'Feeding' },
  { id: 'wic_recipes',       emoji: '🧡',  title: 'WIC Recipes',                   description: 'Community recipes using WIC-eligible foods — share and upvote favorites', category: 'Feeding' },
  { id: 'weaning_recipes',   emoji: '🥣',  title: 'Weaning Recipes',               description: 'First foods, purees, and soft meals for babies 4–12+ months', category: 'Feeding' },
  { id: 'emergency',         emoji: '🚨',  title: 'Emergency Contacts',            description: 'Nurse lines, poison control, and urgent care resources', category: 'Safety' },
  { id: 'water_safety',      emoji: '🌊',  title: 'Water Safety',                  description: 'Drowning prevention, pool safety, and age-by-age guidance every parent should know', category: 'Safety' },
  { id: 'choking_safety',    emoji: '🫁',  title: 'Choking Safety',                description: 'Prevention, recognizing it, and how to clear it for infants and older kids', category: 'Safety' },
  { id: 'videos',            emoji: '🎬',  title: 'Video Guides',                  description: 'How-to videos for feeding, sleep, soothing, and more', category: 'Guides & Learning' },
  { id: 'top100',            emoji: '🔢',  title: '100 Questions Every Parent Asks', description: 'The most common parenting questions — answered', category: 'Guides & Learning' },
] as const satisfies ReadonlyArray<{ id: string; emoji: string; title: string; description: string; category: Category }>;

type ResourceId = typeof RESOURCES[number]['id'];

// ─── Detail placeholder screen ────────────────────────────────────────────────

function ResourceDetail({
  id,
  onBack,
}: {
  id: ResourceId;
  onBack: () => void;
}) {
  const c = useColors();
  const resourceIndex = RESOURCES.findIndex(r => r.id === id);
  const resource = RESOURCES[resourceIndex]!;
  const palette = CARD_PALETTE[resourceIndex % CARD_PALETTE.length];
  const s = detailStyles(c);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button" accessibilityLabel="Back to Resources">
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Resources</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.body}>
        <View style={[s.heroCard, { backgroundColor: palette.bg(c), borderColor: palette.border(c) }]}>
          <Text style={s.heroEmoji}>{resource.emoji}</Text>
          <Text style={s.heroTitle}>{resource.title}</Text>
          <Text style={s.heroDesc}>{resource.description}</Text>
        </View>

        <View style={s.comingSoon}>
          <Text style={s.comingSoonEmoji}>🌱</Text>
          <Text style={s.comingSoonTitle}>Coming soon</Text>
          <Text style={s.comingSoonText}>
            We're working on filling this section with great content for you. Check back soon!
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Main Resources landing screen ───────────────────────────────────────────

export default function ResourcesTab({ route }: any) {
  const c = useColors();
  const s = styles(c);
  const initialResourceId = route?.params?.initialResourceId as ResourceId | undefined;
  const [selected, setSelected] = useState<ResourceId | null>(initialResourceId ?? null);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category | 'All'>('All');

  const catScrollRef = useRef<ScrollView>(null);
  const catScrollX   = useRef(0);
  const catContentW  = useRef(0);
  const catLayoutW   = useRef(0);
  const [catArrows, setCatArrows] = useState({ left: false, right: true });

  React.useEffect(() => {
    if (initialResourceId) setSelected(initialResourceId);
  }, [initialResourceId]);

  const filteredResources = useMemo(() => {
    const q = query.trim().toLowerCase();
    return RESOURCES.filter(r => {
      const matchesCategory = activeCategory === 'All' || r.category === activeCategory;
      const matchesQuery = !q || r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [query, activeCategory]);

  if (selected === 'breastfeeding_101') {
    return <Breastfeeding101 onBack={() => setSelected(null)} />;
  }

  if (selected === 'shopping_lists') {
    return <SmartShoppingLists onBack={() => setSelected(null)} />;
  }

  if (selected === 'babynames') {
    return <BabyNameFinder onBack={() => setSelected(null)} />;
  }

  if (selected === 'marketplace') {
    return <ParentMarketplace onBack={() => setSelected(null)} />;
  }

  if (selected === 'mom_groups') {
    return <MomGroupDirectory onBack={() => setSelected(null)} />;
  }

  if (selected === 'parenting_az') {
    return <ParentingAZ onBack={() => setSelected(null)} />;
  }

  if (selected === 'qa') {
    return <QAScreen onBack={() => setSelected(null)} />;
  }

  if (selected === 'local') {
    return <LocalServicesScreen onBack={() => setSelected(null)} />;
  }

  if (selected === 'product_reviews') {
    return <ProductReviewsScreen onBack={() => setSelected(null)} />;
  }

  if (selected === 'provider_reviews') {
    return <ServiceProviderReviews onBack={() => setSelected(null)} />;
  }

  if (selected === 'food_chart') {
    return <BabyFoodChart onBack={() => setSelected(null)} />;
  }

  if (selected === 'wic_recipes') {
    return <RecipesScreen category="wic" onBack={() => setSelected(null)} />;
  }

  if (selected === 'weaning_recipes') {
    return <RecipesScreen category="weaning" onBack={() => setSelected(null)} />;
  }

  if (selected === 'water_safety') {
    return <WaterSafety onBack={() => setSelected(null)} />;
  }

  if (selected === 'choking_safety') {
    return <ChokingSafety onBack={() => setSelected(null)} />;
  }

  if (selected === 'emergency') {
    return <EmergencyContacts onBack={() => setSelected(null)} />;
  }

  if (selected === 'articles') {
    return <ArticlesScreen onBack={() => setSelected(null)} />;
  }

  if (selected === 'top100') {
    return <TopQuestionsScreen onBack={() => setSelected(null)} />;
  }

  if (selected === 'videos') {
    return <VideoGuidesScreen onBack={() => setSelected(null)} />;
  }

  if (selected) {
    return <ResourceDetail id={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.pageTitle}>Resources</Text>
        <Text style={s.pageSubtitle}>Everything you need to support your parenting journey</Text>

        <TextInput
          style={s.searchInput}
          placeholder="Search resources…"
          placeholderTextColor={c.textMuted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          accessibilityLabel="Search resources"
        />

        <View style={s.categoryRowWrap}>
          <TouchableOpacity
            onPress={() => {
              const maxX = Math.max(0, catContentW.current - catLayoutW.current);
              catScrollX.current = Math.max(0, catScrollX.current - 200);
              catScrollRef.current?.scrollTo({ x: catScrollX.current, animated: true });
              setCatArrows({ left: catScrollX.current > 0, right: catScrollX.current < maxX });
            }}
            activeOpacity={0.7}
            style={[s.categoryArrow, { opacity: catArrows.left ? 1 : 0.25 }]}
            disabled={!catArrows.left}
            accessibilityRole="button" accessibilityLabel="Scroll categories left"
          >
            <Text style={s.categoryArrowText}>‹</Text>
          </TouchableOpacity>

          <View style={{ flex: 1, overflow: 'hidden' }}>
            <ScrollView
              ref={catScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              onScroll={e => {
                const x = e.nativeEvent.contentOffset.x;
                catScrollX.current = x;
                const maxX = Math.max(0, catContentW.current - catLayoutW.current);
                setCatArrows({ left: x > 4, right: x < maxX - 4 });
              }}
              onContentSizeChange={w => {
                catContentW.current = w;
                const maxX = Math.max(0, w - catLayoutW.current);
                setCatArrows(a => ({ ...a, right: catScrollX.current < maxX - 4 }));
              }}
              onLayout={e => {
                catLayoutW.current = e.nativeEvent.layout.width;
                const maxX = Math.max(0, catContentW.current - e.nativeEvent.layout.width);
                setCatArrows(a => ({ ...a, right: catScrollX.current < maxX - 4 }));
              }}
              scrollEventThrottle={16}
              contentContainerStyle={s.categoryRow}
            >
              {(['All', ...CATEGORIES] as const).map(cat => {
                const active = activeCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    activeOpacity={0.8}
                    style={[s.categoryChip, active && { backgroundColor: c.primary, borderColor: c.primary }]}
                    onPress={() => setActiveCategory(cat)}
                    accessibilityRole="button" accessibilityLabel={`Filter by ${cat}`}
                  >
                    <Text style={[s.categoryChipText, active && s.categoryChipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <TouchableOpacity
            onPress={() => {
              const maxX = Math.max(0, catContentW.current - catLayoutW.current);
              catScrollX.current = Math.min(maxX, catScrollX.current + 200);
              catScrollRef.current?.scrollTo({ x: catScrollX.current, animated: true });
              setCatArrows({ left: catScrollX.current > 0, right: catScrollX.current < maxX });
            }}
            activeOpacity={0.7}
            style={[s.categoryArrow, { opacity: catArrows.right ? 1 : 0.25 }]}
            disabled={!catArrows.right}
            accessibilityRole="button" accessibilityLabel="Scroll categories right"
          >
            <Text style={s.categoryArrowText}>›</Text>
          </TouchableOpacity>
        </View>

        {filteredResources.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyStateEmoji}>🔍</Text>
            <Text style={s.emptyStateText}>No resources match "{query}"</Text>
          </View>
        ) : (
          <View style={s.cards}>
            {filteredResources.map(r => {
              const palette = CARD_PALETTE[RESOURCES.indexOf(r) % CARD_PALETTE.length];
              return (
              <TouchableOpacity
                key={r.id}
                activeOpacity={0.8}
                style={[s.card, { backgroundColor: palette.bg(c), borderColor: palette.border(c) }]}
                onPress={() => setSelected(r.id)}
                accessibilityRole="button" accessibilityLabel={r.title}
              >
                <Text style={s.cardEmoji}>{r.emoji}</Text>
                <View style={s.cardText}>
                  <Text style={s.cardTitle}>{r.title}</Text>
                  <Text style={s.cardDesc}>{r.description}</Text>
                </View>
                <Text style={s.cardChevron}>›</Text>
              </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    scroll: { padding: 20, paddingBottom: 40 },
    pageTitle: {
      fontSize: 28,
      fontWeight: '800',
      color: c.textPrimary,
      marginBottom: 6,
    },
    pageSubtitle: {
      fontSize: 14,
      color: c.textMuted,
      fontWeight: '500',
      marginBottom: 20,
    },
    searchInput: {
      backgroundColor: c.inputBg,
      borderWidth: 1.5,
      borderColor: c.inputBorder,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 15,
      color: c.textPrimary,
      marginBottom: 14,
    },
    categoryRowWrap: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    categoryArrow:     { paddingHorizontal: 6, paddingVertical: 8, justifyContent: 'center', alignItems: 'center' },
    categoryArrowText: { fontSize: 22, fontWeight: '600', color: c.textSecondary, lineHeight: 26 },
    categoryRow: { gap: 8, paddingHorizontal: 4 },
    categoryChip: {
      borderWidth: 1.5,
      borderColor: c.separator,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: c.card,
    },
    categoryChipText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textSecondary,
    },
    categoryChipTextActive: {
      color: c.primaryText,
    },
    emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
    emptyStateEmoji: { fontSize: 32 },
    emptyStateText: { fontSize: 14, color: c.textMuted, fontWeight: '600' },
    cards: { gap: 12, overflow: 'visible' },
    card: {
      borderRadius: 16,
      borderWidth: 2,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    cardEmoji: { fontSize: 32 },
    cardText: { flex: 1 },
    cardTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: c.textPrimary,
      marginBottom: 3,
    },
    cardDesc: {
      fontSize: 13,
      color: c.textSecondary,
      fontWeight: '500',
      lineHeight: 18,
    },
    cardChevron: {
      fontSize: 24,
      color: c.textMuted,
      fontWeight: '700',
    },
  });

const detailStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    backArrow: {
      fontSize: 20,
      color: c.textSecondary,
      fontWeight: '700',
    },
    backLabel: {
      fontSize: 15,
      color: c.textSecondary,
      fontWeight: '700',
    },
    body: { padding: 20, paddingBottom: 40, gap: 20 },
    heroCard: {
      borderRadius: 20,
      borderWidth: 2,
      padding: 24,
      alignItems: 'center',
      gap: 8,
    },
    heroEmoji: { fontSize: 48 },
    heroTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: c.textPrimary,
      textAlign: 'center',
    },
    heroDesc: {
      fontSize: 14,
      color: c.textSecondary,
      fontWeight: '500',
      textAlign: 'center',
      lineHeight: 20,
    },
    comingSoon: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 28,
      alignItems: 'center',
      gap: 8,
    },
    comingSoonEmoji: { fontSize: 36 },
    comingSoonTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: c.textPrimary,
    },
    comingSoonText: {
      fontSize: 14,
      color: c.textMuted,
      fontWeight: '500',
      textAlign: 'center',
      lineHeight: 20,
    },
  });
