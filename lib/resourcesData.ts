// Shared catalog of Resource destinations — extracted from the old ResourcesTab
// so both DiscoverTab (the browsing/search landing screen) and SearchSheet
// (Home's search modal) can reference the same data without duplicating it.

import type { Colors } from './theme';

export const CATEGORIES = ['Safety', 'Feeding', 'Guides & Learning', 'Shopping & Gear', 'Community', 'Local & Reviews'] as const;
export type Category = typeof CATEGORIES[number];

export const RESOURCES = [
  { id: 'breastfeeding_101', emoji: '🤱',  title: 'Breastfeeding 101',            description: 'Tips & tricks, common challenges, pumping guide, milk storage, recipes, and supplement reviews', category: 'Feeding' },
  { id: 'shopping_lists',    emoji: '🛍️',  title: 'Smart Shopping Lists',          description: 'Curated packing lists for hospital bags, travel, newborns, and more — or post your own', category: 'Shopping & Gear' },
  { id: 'babynames',         emoji: '🌸',  title: 'Baby Name Finder',              description: 'Browse hundreds of names with meanings, origins, and style tags', category: 'Guides & Learning' },
  { id: 'marketplace',       emoji: '🛍️',  title: 'Parent Marketplace',            description: 'Buy and sell gently used baby gear with parents in your city', category: 'Shopping & Gear' },
  { id: 'mom_groups',        emoji: '👨‍👩‍👧', title: 'Parent Groups',                  description: 'Find local meetups, online communities, and support groups near you', category: 'Community' },
  { id: 'parenting_az',      emoji: '📖',  title: 'Parenting A–Z',                 description: 'Plain-English explanations of methods, terms, and techniques every parent should know', category: 'Guides & Learning' },
  { id: 'qa',                emoji: '💬',  title: 'Parenting Q+A',                 description: 'Ask questions and get answers from other parents, plus 100+ common questions answered', category: 'Community' },
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
  { id: 'activities',        emoji: '🧩',  title: 'Activities & Play',             description: 'Age-appropriate activities and developmental play ideas for your baby', category: 'Guides & Learning' },
] as const satisfies ReadonlyArray<{ id: string; emoji: string; title: string; description: string; category: Category }>;

export type ResourceId = typeof RESOURCES[number]['id'];
export type Resource = typeof RESOURCES[number];

// Maps a baby's age in months to the resource categories most relevant to that
// stage, for Discover's lightweight "For Your Family" personalization. This is
// a hand-picked heuristic over real resource categories — not a data-backed
// per-resource age tag (none of the resource/article content is age-tagged
// today), so it's intentionally coarse.
export function categoriesForAgeMonths(months: number): Category[] {
  if (months < 4) return ['Safety', 'Feeding'];
  if (months < 12) return ['Feeding', 'Guides & Learning'];
  if (months < 24) return ['Guides & Learning', 'Community'];
  return ['Guides & Learning', 'Shopping & Gear'];
}

// Restrained, semantic color-per-category mapping — color communicates what
// kind of resource this is (not decoration). Reuses existing Parent Patch
// theme tokens; Local & Reviews and Shopping & Gear share blue since both are
// "practical/services" content rather than getting an invented sixth accent.
export function categoryAccent(category: Category, c: Colors): { bg: string; text: string } {
  switch (category) {
    case 'Feeding':           return { bg: c.cardBlush,    text: c.blush };
    case 'Safety':             return { bg: c.cardHoney,    text: c.honey };
    case 'Guides & Learning':  return { bg: c.cardLavender, text: c.lavender };
    case 'Community':          return { bg: c.cardSage,     text: c.sage };
    case 'Local & Reviews':    return { bg: c.cardBlue,     text: c.blue };
    case 'Shopping & Gear':    return { bg: c.cardBlue,     text: c.blue };
    default:                   return { bg: c.card,         text: c.textSecondary };
  }
}
