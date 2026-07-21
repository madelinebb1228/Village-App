import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors, Colors } from '../lib/theme';
import { supabase } from '../lib/supabase';

// ─── Data types ───────────────────────────────────────────────────────────────

interface FoodItem {
  name: string;
  emoji: string;
  prep: string;         // short preparation note
  notes?: string;       // extra context
  allergen?: boolean;   // top 9 allergen
  caution?: string;     // special caution to display
}

interface FoodGroup {
  category: string;
  emoji: string;
  items: FoodItem[];
}

interface Stage {
  key: string;
  label: string;        // "4–6 mo"
  fullLabel: string;    // "4–6 Months"
  texture: string;      // one-liner
  textureDetail: string;
  intro: string[];      // bullet points — what's new this stage
  groups: FoodGroup[];
}

// ─── Stage data ───────────────────────────────────────────────────────────────

const STAGES: Stage[] = [
  {
    key: '4-6',
    label: '4–6 mo',
    fullLabel: '4–6 Months',
    texture: 'Smooth, thin single-ingredient purees',
    textureDetail: 'Everything should be completely smooth — no lumps. Thin purees with breast milk, formula, or water. Introduce one new food every 3–5 days to watch for reactions.',
    intro: [
      'Start solids only when your baby shows readiness signs: good head control, sitting with support, showing interest in food.',
      'One new food at a time — wait 3–5 days before introducing the next.',
      'Breast milk or formula is still the main source of nutrition.',
    ],
    groups: [
      {
        category: 'Fruits', emoji: '🍎',
        items: [
          { name: 'Banana',       emoji: '🍌', prep: 'Mashed or pureed smooth' },
          { name: 'Avocado',      emoji: '🥑', prep: 'Mashed smooth with breast milk' },
          { name: 'Pear',         emoji: '🍐', prep: 'Cooked and pureed' },
          { name: 'Apple',        emoji: '🍎', prep: 'Steamed and pureed smooth' },
          { name: 'Peach',        emoji: '🍑', prep: 'Steamed and pureed, skin removed' },
          { name: 'Prune',        emoji: '🫐', prep: 'Pureed (great for constipation)' },
        ],
      },
      {
        category: 'Vegetables', emoji: '🥦',
        items: [
          { name: 'Sweet Potato', emoji: '🍠', prep: 'Baked or steamed, then pureed' },
          { name: 'Peas',         emoji: '🫛', prep: 'Steamed and pureed, strain for smoothness' },
          { name: 'Butternut Squash', emoji: '🎃', prep: 'Roasted and pureed' },
          { name: 'Carrots',      emoji: '🥕', prep: 'Steamed and pureed smooth' },
          { name: 'Green Beans',  emoji: '🫛', prep: 'Steamed and pureed, strain seeds' },
          { name: 'Zucchini',     emoji: '🥒', prep: 'Steamed and pureed' },
          { name: 'Parsnip',      emoji: '🌿', prep: 'Steamed and pureed' },
        ],
      },
      {
        category: 'Grains', emoji: '🌾',
        items: [
          { name: 'Iron-fortified Oatmeal Cereal', emoji: '🥣', prep: 'Thinned with breast milk or formula', notes: 'Great first grain — provides iron' },
          { name: 'Rice Cereal (single grain)',     emoji: '🍚', prep: 'Thinned to very loose consistency', notes: 'Limit arsenic exposure — oatmeal preferred' },
        ],
      },
    ],
  },

  {
    key: '6-8',
    label: '6–8 mo',
    fullLabel: '6–8 Months',
    texture: 'Thicker purees and soft mashes',
    textureDetail: 'Purees can be a bit thicker. Start working toward a mashed texture. Can now combine foods. This is the ideal window to introduce the major allergens.',
    intro: [
      'Introduce the Big 9 allergens one at a time during this window — early introduction reduces allergy risk.',
      'Add combination purees (e.g. apple + sweet potato).',
      'Begin protein foods like chicken, lentils, and eggs.',
      'Small amounts of plain whole-milk yogurt are fine.',
    ],
    groups: [
      {
        category: 'Fruits', emoji: '🍎',
        items: [
          { name: 'Mango',       emoji: '🥭', prep: 'Pureed or soft mashed' },
          { name: 'Blueberry',   emoji: '🫐', prep: 'Pureed or strained' },
          { name: 'Raspberry',   emoji: '🍓', prep: 'Pureed and strained (seeds)' },
          { name: 'Watermelon',  emoji: '🍉', prep: 'Pureed, seeds removed' },
          { name: 'Papaya',      emoji: '🍈', prep: 'Soft-mashed, seeds removed' },
          { name: 'Apricot',     emoji: '🍑', prep: 'Steamed and pureed, skin removed' },
          { name: 'Kiwi',        emoji: '🥝', prep: 'Pureed (introduce carefully — acidic)' },
        ],
      },
      {
        category: 'Vegetables', emoji: '🥦',
        items: [
          { name: 'Broccoli',    emoji: '🥦', prep: 'Steamed and pureed or mashed' },
          { name: 'Spinach',     emoji: '🌿', prep: 'Pureed into other purees (limit nitrates)' },
          { name: 'Beets',       emoji: '🫀', prep: 'Roasted and pureed — may color stool' },
          { name: 'Pumpkin',     emoji: '🎃', prep: 'Pureed (canned pure pumpkin is fine)' },
          { name: 'Cauliflower', emoji: '🌸', prep: 'Steamed and pureed' },
          { name: 'Asparagus',   emoji: '🌱', prep: 'Tips steamed and pureed' },
        ],
      },
      {
        category: 'Grains', emoji: '🌾',
        items: [
          { name: 'Oatmeal',         emoji: '🥣', prep: 'Cooked to a soft, smooth consistency' },
          { name: 'Whole Grain Toast', emoji: '🍞', prep: 'Softened in breast milk, small pieces', notes: 'Wheat — introduce as an allergen' },
          { name: 'Barley Cereal',   emoji: '🌾', prep: 'Cooked thin — offers variety' },
        ],
      },
      {
        category: 'Protein', emoji: '🍗',
        items: [
          { name: 'Chicken',     emoji: '🍗', prep: 'Pureed with broth — ensure fully cooked' },
          { name: 'Turkey',      emoji: '🦃', prep: 'Pureed smooth with liquid' },
          { name: 'Lentils',     emoji: '🫘', prep: 'Well-cooked and pureed smooth' },
          { name: 'Split Peas',  emoji: '🫛', prep: 'Cooked to mush, pureed' },
          { name: 'Tofu (soft)', emoji: '🫙', prep: 'Silken tofu pureed smooth', allergen: true, notes: 'Soy — introduce as allergen' },
          { name: 'Egg Yolk',    emoji: '🥚', prep: 'Hard-cooked yolk mashed with breast milk', allergen: true },
        ],
      },
      {
        category: 'Dairy & Allergens', emoji: '🧀',
        items: [
          { name: 'Plain Whole-Milk Yogurt', emoji: '🥛', prep: 'Plain, full-fat — no added sugar', allergen: true, notes: 'Cow\'s milk protein — introduce as allergen' },
          { name: 'Peanut Butter (thinned)',  emoji: '🥜', prep: 'Mix 1 tsp with 2–3 tsp breast milk until smooth', allergen: true, notes: 'Introduce early! Studies show it reduces allergy risk' },
          { name: 'Egg White',               emoji: '🥚', prep: 'Hard-cooked white mashed smooth', allergen: true },
          { name: 'Tree Nut Butter (thinned)',emoji: '🌰', prep: 'Almond/cashew butter thinned with breast milk', allergen: true },
          { name: 'Sesame Tahini (thinned)',  emoji: '🌿', prep: 'Thin with water or puree — introduce carefully', allergen: true },
        ],
      },
    ],
  },

  {
    key: '8-10',
    label: '8–10 mo',
    fullLabel: '8–10 Months',
    texture: 'Soft lumps, mashes & first finger foods',
    textureDetail: 'Baby is developing a pincer grasp. Offer soft pieces they can pick up. Foods should squish easily between your fingers. No teeth needed — gums are strong!',
    intro: [
      'Introduce soft finger foods to build independence and fine motor skills.',
      'Move toward chunkier textures — lumps are good now.',
      'Offer small soft pieces: think diced soft fruit, O-shaped cereal, small pasta.',
      'Family meal time together encourages trying new foods.',
    ],
    groups: [
      {
        category: 'Fruits', emoji: '🍎',
        items: [
          { name: 'Banana chunks',    emoji: '🍌', prep: '½-inch pieces — soft enough to gum' },
          { name: 'Soft melon',       emoji: '🍈', prep: 'Small cubes, very soft' },
          { name: 'Blueberries',      emoji: '🫐', prep: 'Halved or quartered — NOT whole (choking)' },
          { name: 'Strawberry',       emoji: '🍓', prep: 'Diced into small pieces, allergen watch', allergen: true },
          { name: 'Kiwi',             emoji: '🥝', prep: 'Soft cubes, skin removed' },
          { name: 'Ripe Pear',        emoji: '🍐', prep: 'Skin removed, soft diced pieces' },
          { name: 'Peach',            emoji: '🍑', prep: 'Soft diced pieces, skin removed' },
        ],
      },
      {
        category: 'Vegetables', emoji: '🥦',
        items: [
          { name: 'Soft-cooked Broccoli', emoji: '🥦', prep: 'Small florets cooked until very tender' },
          { name: 'Soft-cooked Carrots',  emoji: '🥕', prep: 'Small pieces cooked until squishable' },
          { name: 'Peas',                 emoji: '🫛', prep: 'Whole cooked peas — great for pincer grasp' },
          { name: 'Sweet Potato',         emoji: '🍠', prep: 'Soft cubes or thick mash' },
          { name: 'Corn',                 emoji: '🌽', prep: 'Off the cob, soft-cooked' },
          { name: 'Avocado',              emoji: '🥑', prep: 'Cubes or spears — soft and easy to grab' },
        ],
      },
      {
        category: 'Grains', emoji: '🌾',
        items: [
          { name: 'Small Pasta',       emoji: '🍝', prep: 'Overcooked slightly — very soft' },
          { name: 'Soft Bread',        emoji: '🍞', prep: 'Small cubes, avoid dense/crusty bread', allergen: true },
          { name: 'O-shaped Cereal',   emoji: '🫐', prep: 'Whole-grain puffs — great pincer grasp practice' },
          { name: 'Soft Pancake',      emoji: '🥞', prep: 'Small pieces — minimal added sugar', allergen: true },
          { name: 'Rice Cakes (plain)',emoji: '🍘', prep: 'Mini unsalted — dissolves easily' },
        ],
      },
      {
        category: 'Protein', emoji: '🍗',
        items: [
          { name: 'Ground Meat',       emoji: '🍗', prep: 'Well-cooked and moist — ground chicken, beef, or turkey' },
          { name: 'Flaked Fish',       emoji: '🐟', prep: 'Salmon or tilapia — check carefully for bones', allergen: true },
          { name: 'Scrambled Eggs',    emoji: '🥚', prep: 'Soft scrambled, small pieces', allergen: true },
          { name: 'Soft Beans',        emoji: '🫘', prep: 'Well-cooked, lightly mashed or whole if very soft' },
          { name: 'Tofu cubes',        emoji: '🫙', prep: 'Extra-firm, small cubes — easy to grab', allergen: true },
          { name: 'Hummus',            emoji: '🧆', prep: 'On soft toast or as dip for soft veggie strips', allergen: true },
        ],
      },
      {
        category: 'Dairy', emoji: '🧀',
        items: [
          { name: 'Full-fat Yogurt',    emoji: '🥛', prep: 'Plain, whole-milk — can mix with fruit puree', allergen: true },
          { name: 'Soft Cheese cubes',  emoji: '🧀', prep: 'Pasteurized only — mozzarella, colby, mild cheddar', allergen: true },
          { name: 'Cream Cheese',       emoji: '🧀', prep: 'Spread on soft toast strips', allergen: true },
        ],
      },
    ],
  },

  {
    key: '10-12',
    label: '10–12 mo',
    fullLabel: '10–12 Months',
    texture: 'Soft table foods, bite-sized pieces',
    textureDetail: 'Baby can handle most soft family foods cut into small pieces. Focus on a variety of flavors and textures. Everything should still be soft enough to squish.',
    intro: [
      'Eating 3 small meals + 1–2 snacks per day alongside breast milk or formula.',
      'Let baby self-feed as much as possible — messy is fine!',
      'Expose to family foods and seasonings (avoid heavy salt/sugar).',
      'Cow\'s milk is NOT yet the main drink — still breast milk or formula until 12 months.',
    ],
    groups: [
      {
        category: 'Fruits', emoji: '🍎',
        items: [
          { name: 'Most soft fruits',   emoji: '🍎', prep: 'Cut into small pieces — peel when needed' },
          { name: 'Citrus segments',    emoji: '🍊', prep: 'Small segments, membrane removed — watch for reaction' },
          { name: 'Grapes',             emoji: '🍇', prep: 'Quartered lengthwise — NEVER whole (choking risk)', caution: 'Must be quartered' },
          { name: 'Cherry Tomatoes',    emoji: '🍅', prep: 'Quartered — NEVER whole', caution: 'Must be quartered' },
          { name: 'Dried Fruit',        emoji: '🍇', prep: 'Chopped very small — sticky, limit quantity', caution: 'Choking risk if not cut small' },
        ],
      },
      {
        category: 'Vegetables', emoji: '🥦',
        items: [
          { name: 'Most cooked vegetables', emoji: '🥦', prep: 'Soft-cooked and cut into small pieces' },
          { name: 'Raw Avocado',            emoji: '🥑', prep: 'Soft enough to eat raw — bite-sized' },
          { name: 'Raw Banana',             emoji: '🍌', prep: 'Soft enough without cooking' },
          { name: 'Cooked Spinach/Kale',    emoji: '🌿', prep: 'Chopped finely into other foods' },
        ],
      },
      {
        category: 'Grains', emoji: '🌾',
        items: [
          { name: 'Soft Crackers',       emoji: '🫙', prep: 'Whole grain, low sodium' },
          { name: 'Pasta (any shape)',    emoji: '🍝', prep: 'Soft-cooked, cut if large' },
          { name: 'Rice',                emoji: '🍚', prep: 'Well-cooked, sticky rice easiest' },
          { name: 'French Toast strips', emoji: '🍞', prep: 'Small soft strips, minimal syrup', allergen: true },
          { name: 'Oatmeal',             emoji: '🥣', prep: 'Thicker now — can add fruit mix-ins' },
        ],
      },
      {
        category: 'Protein', emoji: '🍗',
        items: [
          { name: 'Soft meat pieces',    emoji: '🍗', prep: 'Small tender pieces — chicken, beef, pork, turkey' },
          { name: 'Fish',                emoji: '🐟', prep: 'Low-mercury fish — salmon, tilapia, cod. Check for bones.', allergen: true },
          { name: 'Eggs (any style)',    emoji: '🥚', prep: 'Scrambled, omelet strips, hard-boiled pieces', allergen: true },
          { name: 'All beans & lentils', emoji: '🫘', prep: 'Whole soft beans or lightly mashed' },
          { name: 'Nut butters on toast',emoji: '🥜', prep: 'Thin spread on soft bread — NEVER a spoonful', allergen: true, caution: 'Spread thinly only — thick globs are a choking risk' },
        ],
      },
      {
        category: 'Dairy', emoji: '🧀',
        items: [
          { name: 'Cheese',           emoji: '🧀', prep: 'Shredded or small cubes — pasteurized only', allergen: true },
          { name: 'Yogurt',           emoji: '🥛', prep: 'Plain whole-milk — can add fruit', allergen: true },
          { name: 'Butter in cooking',emoji: '🧈', prep: 'Small amounts in cooking is fine', allergen: true },
          { name: 'Cow\'s milk',      emoji: '🥛', prep: 'Small amounts in cooking OK — NOT as main drink until 12 mo', allergen: true, caution: 'Not as main drink until 12 months' },
        ],
      },
    ],
  },

  {
    key: '12+',
    label: '12+ mo',
    fullLabel: '12+ Months',
    texture: 'Most family foods',
    textureDetail: 'Baby can now eat most foods the family eats. Continue cutting into age-appropriate sizes and avoid hard, round, or sticky choking hazards.',
    intro: [
      'Honey is now safe (previously botulism risk under 12 months).',
      'Whole cow\'s milk can now be the main drink (up to 16–24 oz/day).',
      'Offer 3 meals + 2 snacks. Breast milk or formula optional.',
      'Continue avoiding major choking hazards — see below.',
    ],
    groups: [
      {
        category: 'What\'s New at 12 Months', emoji: '🎉',
        items: [
          { name: 'Honey',            emoji: '🍯', prep: 'Now safe! In cooking, baking, or as a spread', notes: 'Was off-limits due to botulism risk — now fine after 1st birthday' },
          { name: 'Whole Cow\'s Milk',emoji: '🥛', prep: '16–24 oz/day max — whole milk preferred', allergen: true, notes: 'Transition from formula; breast milk can continue as long as desired' },
          { name: 'Most Fish',        emoji: '🐟', prep: 'Low-mercury fish 2–3x/week', allergen: true },
          { name: 'Citrus juice',     emoji: '🍊', prep: '4 oz/day max of 100% juice — water is better', notes: 'Juice should never replace fruit' },
          { name: 'Cow\'s Milk Cheese & Yogurt', emoji: '🧀', prep: 'Wider variety now — still pasteurized only', allergen: true },
        ],
      },
      {
        category: 'Safe to Explore', emoji: '🍽️',
        items: [
          { name: 'Mild spices & herbs',  emoji: '🌿', prep: 'Garlic, cinnamon, cumin — great for flavor!' },
          { name: 'Toddler snacks',        emoji: '🍿', prep: 'Age-appropriate puffs, crackers, soft bars' },
          { name: 'Most family dinners',   emoji: '🍲', prep: 'Offer what you\'re eating — cut small, low salt' },
          { name: 'Nut butters',           emoji: '🥜', prep: 'Thin spread — not by the spoonful', allergen: true },
          { name: 'Shellfish',             emoji: '🦐', prep: 'Small tender pieces — continue allergen monitoring', allergen: true },
        ],
      },
    ],
  },
];

// ─── Always-avoid data ────────────────────────────────────────────────────────

const ALWAYS_AVOID = [
  {
    category: 'Under 12 Months',
    color: '#FEE2E2',
    border: '#EF4444',
    textColor: '#991B1B',
    items: [
      { emoji: '🍯', name: 'Honey', reason: 'Risk of infant botulism — including in baked goods' },
      { emoji: '🥛', name: 'Cow\'s milk as main drink', reason: 'Hard on kidneys and low in iron — breast milk or formula only' },
      { emoji: '🧂', name: 'Added salt', reason: 'Immature kidneys cannot process excess sodium' },
      { emoji: '🍬', name: 'Added sugar', reason: 'No nutritional value; sets up sugar preferences early' },
      { emoji: '🫖', name: 'Tea & coffee', reason: 'Interferes with iron absorption; caffeine unsafe for babies' },
      { emoji: '🍹', name: 'Juice (under 6 mo)', reason: 'No nutritional benefit — water and breast milk only' },
    ],
  },
  {
    category: 'Choking Hazards (All Ages Under 4)',
    color: '#FEF3C7',
    border: '#D97706',
    textColor: '#92400E',
    items: [
      { emoji: '🍇', name: 'Whole grapes or cherry tomatoes', reason: 'Always quarter lengthwise' },
      { emoji: '🥕', name: 'Raw hard vegetables', reason: 'Carrots, celery, apples — must be cooked soft or grated' },
      { emoji: '🥜', name: 'Whole nuts', reason: 'Finely ground or as thinned nut butter only' },
      { emoji: '🍿', name: 'Popcorn', reason: 'Hard to chew; pieces can block airway' },
      { emoji: '🫐', name: 'Whole blueberries (under 9 mo)', reason: 'Halve or quarter until baby has a good pincer grasp' },
      { emoji: '🍖', name: 'Large chunks of meat', reason: 'Always shred or mince finely' },
      { emoji: '🍭', name: 'Hard candy or gummies', reason: 'Never appropriate for babies or toddlers' },
    ],
  },
  {
    category: 'High-Mercury Fish (All Ages)',
    color: '#EDE9FF',
    border: '#7C3AED',
    textColor: '#4C1D95',
    items: [
      { emoji: '🦈', name: 'Shark', reason: 'Very high mercury — avoid entirely for babies and toddlers' },
      { emoji: '🐠', name: 'Swordfish', reason: 'High mercury — avoid' },
      { emoji: '🐡', name: 'King mackerel', reason: 'High mercury — avoid' },
      { emoji: '🐟', name: 'Tilefish (Gulf of Mexico)', reason: 'High mercury — avoid' },
      { emoji: '🍣', name: 'Bigeye tuna', reason: 'High mercury — light canned tuna (2–3x/week) is OK' },
    ],
  },
];

// ─── Prep tip lookup (exported for use in BabyFoodTracker) ───────────────────

const STOP_WORDS = new Set(['with', 'from', 'and', 'into', 'soft', 'cooked', 'most', 'plain', 'whole', 'small', 'high', 'milk', 'style', 'type', 'some', 'very'])

function significantWords(name: string): string[] {
  return name.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !STOP_WORDS.has(w))
}

export function findPrepTip(flavorName: string): { prep: string; emoji: string; name: string } | null {
  const lower = flavorName.toLowerCase()
  for (const stage of STAGES) {
    for (const group of stage.groups) {
      for (const item of group.items) {
        const words = significantWords(item.name)
        if (words.length > 0 && words.some(w => lower.includes(w))) {
          return { prep: item.prep, emoji: item.emoji, name: item.name }
        }
      }
    }
  }
  return null
}

function isItemTried(itemName: string, triedFlavors: Set<string>): boolean {
  const words = significantWords(itemName)
  if (words.length === 0) return false
  for (const flavor of triedFlavors) {
    if (words.some(w => flavor.includes(w))) return true
  }
  return false
}

// ─── Search index ─────────────────────────────────────────────────────────────

interface SearchResult {
  stageKey: string;
  stageLabel: string;
  category: string;
  item: FoodItem;
}

function buildSearchIndex(): SearchResult[] {
  const results: SearchResult[] = [];
  for (const stage of STAGES) {
    for (const group of stage.groups) {
      for (const item of group.items) {
        results.push({ stageKey: stage.key, stageLabel: stage.fullLabel, category: group.category, item });
      }
    }
  }
  return results;
}

const SEARCH_INDEX = buildSearchIndex();

// ─── Components ───────────────────────────────────────────────────────────────

function FoodRow({ item, showStage, stageLabel, tried }: { item: FoodItem; showStage?: boolean; stageLabel?: string; tried?: boolean }) {
  const c = useColors();
  const s = rowStyles(c);

  return (
    <View style={s.row}>
      <Text style={s.emoji}>{item.emoji}</Text>
      <View style={s.body}>
        <View style={s.nameRow}>
          <Text style={s.name}>{item.name}</Text>
          {tried && (
            <View style={s.triedBadge}>
              <Text style={s.triedText}>✓ Tried</Text>
            </View>
          )}
          {item.allergen && (
            <View style={s.allergenBadge}>
              <Text style={s.allergenText}>Allergen</Text>
            </View>
          )}
          {showStage && stageLabel && (
            <View style={s.stageBadge}>
              <Text style={s.stageText}>{stageLabel}</Text>
            </View>
          )}
        </View>
        <Text style={s.prep}>{item.prep}</Text>
        {item.notes   && <Text style={s.notes}>{item.notes}</Text>}
        {item.caution && (
          <View style={s.cautionRow}>
            <Text style={s.cautionIcon}>⚠️</Text>
            <Text style={s.cautionText}>{item.caution}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function BabyFoodChart({ onBack, babyId }: { onBack: () => void; babyId?: string | null }) {
  const c = useColors();
  const s = styles(c);

  const [selectedStage, setSelectedStage] = useState(STAGES[1].key); // default 6–8 mo
  const [query, setQuery]                 = useState('');
  const [triedFlavors, setTriedFlavors]   = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!babyId) return;
    supabase
      .from('baby_food_logs')
      .select('flavor')
      .eq('baby_id', babyId)
      .then(({ data }) => {
        if (data) setTriedFlavors(new Set(data.map((r: { flavor: string }) => r.flavor.toLowerCase())));
      });
  }, [babyId]);

  const stage = STAGES.find(st => st.key === selectedStage)!;

  const searchResults = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_INDEX.filter(r =>
      r.item.name.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      (r.item.notes ?? '').toLowerCase().includes(q)
    );
  }, [query]);

  const isSearching = query.trim().length > 0;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Resources</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={s.pageTitle}>🍼 What Can My Baby Eat?</Text>
        <Text style={s.pageSubtitle}>Age-by-age food guide with prep tips and safety notes</Text>

        {/* Search */}
        <View style={s.searchRow}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search any food (e.g. banana, eggs)…"
            placeholderTextColor={c.textMuted}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {isSearching ? (
          /* ── Search results ── */
          searchResults.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>🤔</Text>
              <Text style={s.emptyTitle}>No results for "{query}"</Text>
              <Text style={s.emptyBody}>Try a different food name, or check the Always Avoid list below.</Text>
            </View>
          ) : (
            <View style={s.card}>
              <Text style={s.cardTitle}>Results for "{query}"</Text>
              {searchResults.map((r, i) => (
                <View key={i}>
                  <FoodRow item={r.item} showStage stageLabel={r.stageLabel} tried={isItemTried(r.item.name, triedFlavors)} />
                  {i < searchResults.length - 1 && <View style={s.divider} />}
                </View>
              ))}
            </View>
          )
        ) : (
          /* ── Stage browser ── */
          <>
            {/* Stage selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.stageScroll} contentContainerStyle={s.stageScrollContent}>
              {STAGES.map(st => (
                <TouchableOpacity
                  key={st.key}
                  style={[s.stageChip, selectedStage === st.key && s.stageChipActive]}
                  onPress={() => setSelectedStage(st.key)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.stageChipText, selectedStage === st.key && s.stageChipTextActive]}>
                    {st.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Texture card */}
            <View style={s.textureCard}>
              <Text style={s.textureBig}>{stage.texture}</Text>
              <Text style={s.textureDetail}>{stage.textureDetail}</Text>
              {stage.intro.length > 0 && (
                <View style={s.introList}>
                  {stage.intro.map((pt, i) => (
                    <View key={i} style={s.introRow}>
                      <Text style={s.introBullet}>•</Text>
                      <Text style={s.introText}>{pt}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Suggested: untried foods from this stage */}
            {triedFlavors.size > 0 && (() => {
              const untried = stage.groups.flatMap(g => g.items).filter(item => !isItemTried(item.name, triedFlavors));
              if (untried.length === 0) return null;
              const suggestions = untried.slice(0, 5);
              return (
                <View style={[s.card, { borderColor: c.honey, borderWidth: 1.5 }]}>
                  <Text style={s.cardTitle}>✨ Suggested for {stage.label} — not tried yet</Text>
                  {suggestions.map((item, i) => (
                    <View key={item.name}>
                      <FoodRow item={item} />
                      {i < suggestions.length - 1 && <View style={s.divider} />}
                    </View>
                  ))}
                  {untried.length > 5 && (
                    <Text style={[s.cardTitle, { fontSize: 12, fontWeight: '500', color: c.textMuted, marginTop: 8, marginBottom: 0 }]}>
                      + {untried.length - 5} more untried foods in this stage
                    </Text>
                  )}
                </View>
              );
            })()}

            {/* Food groups */}
            {stage.groups.map(group => (
              <View key={group.category} style={s.card}>
                <Text style={s.cardTitle}>{group.emoji} {group.category}</Text>
                {group.items.map((item, i) => (
                  <View key={item.name}>
                    <FoodRow item={item} tried={isItemTried(item.name, triedFlavors)} />
                    {i < group.items.length - 1 && <View style={s.divider} />}
                  </View>
                ))}
              </View>
            ))}
          </>
        )}

        {/* Always avoid — always visible */}
        <Text style={s.avoidTitle}>🚫 Always Avoid</Text>
        {ALWAYS_AVOID.map(section => (
          <View key={section.category} style={[s.avoidCard, { backgroundColor: section.color, borderColor: section.border }]}>
            <Text style={[s.avoidCategory, { color: section.textColor }]}>{section.category}</Text>
            {section.items.map((item, i) => (
              <View key={i} style={s.avoidRow}>
                <Text style={s.avoidEmoji}>{item.emoji}</Text>
                <View style={s.avoidBody}>
                  <Text style={[s.avoidName, { color: section.textColor }]}>{item.name}</Text>
                  <Text style={[s.avoidReason, { color: section.textColor }]}>{item.reason}</Text>
                </View>
              </View>
            ))}
          </View>
        ))}

        <View style={s.disclaimer}>
          <Text style={s.disclaimerText}>
            ⚕️ This guide is for general reference only. Always consult your pediatrician before starting solids or if your baby has allergies, reflux, or other health concerns.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (c: Colors) =>
  StyleSheet.create({
    container:   { flex: 1, backgroundColor: c.bg },
    header:      { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
    backBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backArrow:   { fontSize: 20, color: c.textSecondary, fontWeight: '700' },
    backLabel:   { fontSize: 15, color: c.textSecondary, fontWeight: '700' },
    scroll:      { padding: 20, paddingBottom: 48 },
    pageTitle:   { fontSize: 26, fontWeight: '800', color: c.textPrimary, marginBottom: 6 },
    pageSubtitle:{ fontSize: 14, color: c.textMuted, fontWeight: '500', marginBottom: 18 },

    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.card, borderRadius: 12, borderWidth: 1,
      borderColor: c.separator, paddingHorizontal: 12, paddingVertical: 11,
      marginBottom: 18,
    },
    searchIcon:  { fontSize: 15 },
    searchInput: { flex: 1, fontSize: 15, color: c.textPrimary, fontWeight: '500' },
    searchClear: { fontSize: 14, color: c.textMuted, fontWeight: '700' },

    stageScroll:        { marginBottom: 16 },
    stageScrollContent: { gap: 8, paddingRight: 4 },
    stageChip: {
      paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20,
      borderWidth: 1.5, borderColor: c.separator, backgroundColor: c.card,
    },
    stageChipActive:     { borderColor: c.primary, backgroundColor: c.cardLavender },
    stageChipText:       { fontSize: 14, fontWeight: '700', color: c.textMuted },
    stageChipTextActive: { color: c.primary },

    textureCard: {
      backgroundColor: c.cardSage, borderRadius: 16, padding: 16,
      marginBottom: 16, gap: 6,
    },
    textureBig:    { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    textureDetail: { fontSize: 13, color: c.textSecondary, fontWeight: '500', lineHeight: 19 },
    introList:     { gap: 5, marginTop: 6 },
    introRow:      { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    introBullet:   { fontSize: 14, color: c.sage, fontWeight: '800', lineHeight: 20 },
    introText:     { flex: 1, fontSize: 13, color: c.textSecondary, fontWeight: '500', lineHeight: 19 },

    card: {
      backgroundColor: c.card, borderRadius: 16, borderWidth: 1,
      borderColor: c.separator, padding: 16, marginBottom: 14,
    },
    cardTitle: { fontSize: 15, fontWeight: '800', color: c.textPrimary, marginBottom: 12 },
    divider:   { height: 1, backgroundColor: c.separator, marginVertical: 10 },

    empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
    emptyBody:  { fontSize: 13, color: c.textMuted, fontWeight: '500', textAlign: 'center', lineHeight: 19 },

    avoidTitle: { fontSize: 18, fontWeight: '800', color: c.textPrimary, marginTop: 8, marginBottom: 12 },
    avoidCard:  { borderRadius: 16, borderWidth: 1.5, padding: 16, marginBottom: 12, gap: 10 },
    avoidCategory: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
    avoidRow:   { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    avoidEmoji: { fontSize: 20 },
    avoidBody:  { flex: 1, gap: 2 },
    avoidName:  { fontSize: 14, fontWeight: '700' },
    avoidReason:{ fontSize: 12, fontWeight: '500', lineHeight: 17 },

    disclaimer: { backgroundColor: c.cardBlue, borderRadius: 12, padding: 14, marginTop: 8 },
    disclaimerText: { fontSize: 12, color: c.textSecondary, fontWeight: '500', lineHeight: 18 },
  });

const rowStyles = (c: Colors) =>
  StyleSheet.create({
    row:      { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    emoji:    { fontSize: 22, lineHeight: 28 },
    body:     { flex: 1, gap: 3 },
    nameRow:  { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    name:     { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    triedBadge: {
      backgroundColor: '#D1FAE5', borderRadius: 6, borderWidth: 1,
      borderColor: '#6EE7B7', paddingHorizontal: 6, paddingVertical: 2,
    },
    triedText: { fontSize: 10, fontWeight: '800', color: '#065F46' },
    allergenBadge: {
      backgroundColor: '#FEE2E2', borderRadius: 6, borderWidth: 1,
      borderColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2,
    },
    allergenText: { fontSize: 10, fontWeight: '800', color: '#991B1B' },
    stageBadge: {
      backgroundColor: c.cardLavender, borderRadius: 6, borderWidth: 1,
      borderColor: c.lavender, paddingHorizontal: 6, paddingVertical: 2,
    },
    stageText:  { fontSize: 10, fontWeight: '800', color: c.lavender },
    prep:       { fontSize: 13, color: c.textSecondary, fontWeight: '500', lineHeight: 18 },
    notes:      { fontSize: 12, color: c.textMuted, fontWeight: '500', lineHeight: 17 },
    cautionRow: { flexDirection: 'row', gap: 4, alignItems: 'flex-start', marginTop: 2 },
    cautionIcon:{ fontSize: 12 },
    cautionText:{ flex: 1, fontSize: 12, color: '#D97706', fontWeight: '700', lineHeight: 17 },
  });
