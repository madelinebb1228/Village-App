/*
  Supabase migration — run once in SQL editor:

  CREATE TABLE IF NOT EXISTS shopping_lists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    title text NOT NULL,
    category text NOT NULL DEFAULT 'general',
    description text,
    author_name text,
    is_seeded boolean DEFAULT false,
    seed_key text,
    created_at timestamptz DEFAULT now()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS shopping_lists_seed_key_idx
    ON shopping_lists(seed_key) WHERE seed_key IS NOT NULL;

  CREATE TABLE IF NOT EXISTS shopping_list_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id uuid REFERENCES shopping_lists(id) ON DELETE CASCADE,
    name text NOT NULL,
    why_it_helps text,
    link_url text,
    price text,
    image_url text,
    sort_order integer DEFAULT 0
  );

  ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;
  ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "Anyone can view shopping lists" ON shopping_lists FOR SELECT USING (true);
  CREATE POLICY "Authenticated users can create lists" ON shopping_lists FOR INSERT WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "Users can update own lists" ON shopping_lists FOR UPDATE USING (auth.uid() = user_id);
  CREATE POLICY "Users can delete own lists" ON shopping_lists FOR DELETE USING (auth.uid() = user_id);

  CREATE POLICY "Anyone can view list items" ON shopping_list_items FOR SELECT USING (true);
  CREATE POLICY "List owner can insert items" ON shopping_list_items FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM shopping_lists WHERE id = list_id AND user_id = auth.uid())
  );
  CREATE POLICY "List owner can delete items" ON shopping_list_items FOR DELETE USING (
    EXISTS (SELECT 1 FROM shopping_lists WHERE id = list_id AND user_id = auth.uid())
  );

  -- If shopping_lists already exists, add seed_key column:
  -- ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS seed_key text;
  -- CREATE UNIQUE INDEX IF NOT EXISTS shopping_lists_seed_key_idx ON shopping_lists(seed_key) WHERE seed_key IS NOT NULL;
  -- CREATE POLICY "Users can update own lists" ON shopping_lists FOR UPDATE USING (auth.uid() = user_id);
*/

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';
import { useSubscription } from '../lib/subscriptionContext';
import ReportModal from '../components/ReportModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ListItem {
  id: string;
  name: string;
  whyItHelps?: string;
  linkUrl?: string;
  price?: string;
  imageUrl?: string;
  sortOrder: number;
}

interface ShoppingList {
  id: string;
  title: string;
  category: string;
  description: string;
  authorName: string;
  isSeeded: boolean;
  seedKey?: string;
  items: ListItem[];
  createdAt?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_EMAIL = 'madelinebb1228@gmail.com';

const CATEGORIES = [
  { id: 'all',        label: 'All',           emoji: '✨' },
  { id: 'hospital',   label: 'Hospital Bag',  emoji: '🏥' },
  { id: 'travel',     label: 'Travel',        emoji: '✈️' },
  { id: 'newborn',    label: 'Newborn',       emoji: '👶' },
  { id: 'diaper_bag', label: 'Diaper Bag',    emoji: '🎒' },
  { id: 'sleep',      label: 'Sleep',         emoji: '🌙' },
  { id: 'feeding',    label: 'Feeding',       emoji: '🍼' },
  { id: 'nursery',    label: 'Nursery',       emoji: '🏠' },
];

function categoryEmoji(id: string) {
  return CATEGORIES.find(c => c.id === id)?.emoji ?? '📋';
}

// ─── Seeded lists ─────────────────────────────────────────────────────────────

const SEEDED_LISTS: ShoppingList[] = [
  {
    id: 'seed_hospital_mom',
    title: 'Hospital Bag — What Mom Actually Needs',
    category: 'hospital',
    description: 'Skip the 50-item Pinterest list. Here\'s what you\'ll actually reach for.',
    authorName: 'patch team',
    isSeeded: true,
    items: [
      { id: 'hm1', name: 'Long phone charger (10 ft)', whyItHelps: 'Hospital outlets are across the room. A short cable will drive you crazy.', price: '$8–15', linkUrl: '', imageUrl: '', sortOrder: 0 },
      { id: 'hm2', name: 'Chapstick + face mist', whyItHelps: 'Labor is hot and drying. You\'ll want both between contractions.', price: '$5–12', linkUrl: '', imageUrl: '', sortOrder: 1 },
      { id: 'hm3', name: 'Hair ties × 5', whyItHelps: 'You\'ll want your hair out of your face. Bring more than you think — they vanish.', price: '$3', linkUrl: '', imageUrl: '', sortOrder: 2 },
      { id: 'hm4', name: 'Loose going-home outfit', whyItHelps: 'Your body won\'t look or feel like before. High-waisted leggings and a soft top are perfect.', price: '$20–40', linkUrl: '', imageUrl: '', sortOrder: 3 },
      { id: 'hm5', name: 'Flip flops', whyItHelps: 'For the shower. Hospital floors are not barefoot territory.', price: '$5–15', linkUrl: '', imageUrl: '', sortOrder: 4 },
      { id: 'hm6', name: 'Snacks + Gatorade', whyItHelps: 'Hospital cafeteria closes. Pack Gatorade, granola bars, trail mix, and anything you\'ll want post-delivery.', price: '$15–25', linkUrl: '', imageUrl: '', sortOrder: 5 },
      { id: 'hm7', name: 'Robe or button-front PJs', whyItHelps: 'The hospital gown is awkward. Bring something cozy that opens easily for skin-to-skin and nursing.', price: '$25–60', linkUrl: '', imageUrl: '', sortOrder: 6 },
      { id: 'hm8', name: 'Nursing bra (if breastfeeding)', whyItHelps: 'You\'ll want this immediately after delivery. Bring 1–2.', price: '$20–45', linkUrl: '', imageUrl: '', sortOrder: 7 },
      { id: 'hm9', name: 'Nipple cream', whyItHelps: 'Lanolin or Motherlove. Start using it on day 1.', price: '$8–15', linkUrl: 'https://motherlove.com', imageUrl: '', sortOrder: 8 },
      { id: 'hm10', name: 'Pillow from home', whyItHelps: 'Hospital pillows are flat. Bring yours in a colored pillowcase so nurses don\'t take it.', price: 'free', linkUrl: '', imageUrl: '', sortOrder: 9 },
    ],
  },
  {
    id: 'seed_hospital_partner',
    title: 'Hospital Bag — For Your Partner / Support Person',
    category: 'hospital',
    description: 'The support person is often forgotten. Don\'t let them be unprepared.',
    authorName: 'patch team',
    isSeeded: true,
    items: [
      { id: 'hp1', name: 'Clothes for 2–3 days', whyItHelps: 'You may be there longer than expected. Pack at least 2 changes.', price: 'varies', linkUrl: '', imageUrl: '', sortOrder: 0 },
      { id: 'hp2', name: 'Snacks and cash', whyItHelps: 'Partners often can\'t leave the room. Pack your own food — don\'t rely on cafeteria hours.', price: '$20–30', linkUrl: '', imageUrl: '', sortOrder: 1 },
      { id: 'hp3', name: 'Phone charger + portable battery', whyItHelps: 'You\'ll both be on your phones. A portable battery saves trips to the outlet.', price: '$20–40', linkUrl: '', imageUrl: '', sortOrder: 2 },
      { id: 'hp4', name: 'Pillow + small blanket', whyItHelps: 'The pull-out chair or cot is not comfortable. Your own pillow helps.', price: 'free', linkUrl: '', imageUrl: '', sortOrder: 3 },
      { id: 'hp5', name: 'List of who to call or text', whyItHelps: 'You won\'t want to think. Have a list ready so you can send one text and be done.', price: 'free', linkUrl: '', imageUrl: '', sortOrder: 4 },
      { id: 'hp6', name: 'Comfortable walking shoes', whyItHelps: 'You\'ll be on your feet the whole time.', price: 'varies', linkUrl: '', imageUrl: '', sortOrder: 5 },
      { id: 'hp7', name: 'Downloaded show or book', whyItHelps: 'There\'s a lot of waiting. Hospital WiFi is unreliable. Download offline entertainment.', price: 'free', linkUrl: '', imageUrl: '', sortOrder: 6 },
    ],
  },
  {
    id: 'seed_flying_baby',
    title: 'Flying with a Baby (Under 1 Year)',
    category: 'travel',
    description: 'Surviving your first flight with a lap infant. You\'ve got this.',
    authorName: 'patch team',
    isSeeded: true,
    items: [
      { id: 'fb1', name: 'Baby carrier or wrap', whyItHelps: 'Keeps your hands free through security and during boarding. Baby often sleeps in it too.', price: '$30–150', linkUrl: '', imageUrl: '', sortOrder: 0 },
      { id: 'fb2', name: 'Gate-check bag for stroller', whyItHelps: 'Airlines are rough on gear. A padded bag protects your stroller from getting damaged on the tarmac.', price: '$15–40', linkUrl: 'https://www.amazon.com/s?k=gate+check+stroller+bag', imageUrl: '', sortOrder: 1 },
      { id: 'fb3', name: 'Extra outfits × 2 (for baby)', whyItHelps: 'Blowouts happen at altitude. Bring more than you think.', price: 'varies', linkUrl: '', imageUrl: '', sortOrder: 2 },
      { id: 'fb4', name: 'Extra shirt for you', whyItHelps: 'Spit-up doesn\'t care if you\'re on a plane. Pack one in your carry-on.', price: 'varies', linkUrl: '', imageUrl: '', sortOrder: 3 },
      { id: 'fb5', name: 'Pre-measured formula in dispenser', whyItHelps: 'Scooping formula during turbulence is a mess. Use a formula dispenser or single-serve packets.', price: '$5–12', linkUrl: '', imageUrl: '', sortOrder: 4 },
      { id: 'fb6', name: 'Pacifiers × 2', whyItHelps: 'Sucking helps relieve ear pressure during takeoff and landing. Always bring a backup.', price: '$5–15', linkUrl: '', imageUrl: '', sortOrder: 5 },
      { id: 'fb7', name: 'Portable white noise machine', whyItHelps: 'Blocks cabin noise and signals sleep to baby. Hatch Travel is popular.', price: '$20–50', linkUrl: 'https://hatch.co', imageUrl: '', sortOrder: 6 },
      { id: 'fb8', name: 'Snack pouches (if eating solids)', whyItHelps: 'Self-feeding keeps older babies occupied. Puree pouches are self-contained and mess-free.', price: '$2–5 each', linkUrl: '', imageUrl: '', sortOrder: 7 },
      { id: 'fb9', name: 'Ziploc bags (variety)', whyItHelps: 'For wet clothes, dirty diapers in a pinch, or anything that needs to be contained.', price: '$3–5', linkUrl: '', imageUrl: '', sortOrder: 8 },
      { id: 'fb10', name: 'Tablet with downloaded shows (toddlers)', whyItHelps: 'For babies over 12 months, a screen is your best friend on a long flight. Download offline before you go.', price: 'free', linkUrl: '', imageUrl: '', sortOrder: 9 },
    ],
  },
  {
    id: 'seed_newborn_week1',
    title: 'Newborn First Week at Home',
    category: 'newborn',
    description: 'Everything you\'ll actually reach for in those first wild days.',
    authorName: 'patch team',
    isSeeded: true,
    items: [
      { id: 'nw1', name: 'Swaddle blankets × 4+', whyItHelps: 'You\'ll go through these fast. Muslin ones are easy to fold, soft, and breathable.', price: '$15–40', linkUrl: '', imageUrl: '', sortOrder: 0 },
      { id: 'nw2', name: 'White noise machine', whyItHelps: 'A game changer for soothing. Use it from day one. Baby was used to constant sound in the womb.', price: '$30–80', linkUrl: 'https://hatch.co', imageUrl: '', sortOrder: 1 },
      { id: 'nw3', name: 'Pacifiers — try 2–3 brands', whyItHelps: 'Babies are picky. Buy a few different styles before committing to a set.', price: '$5–15', linkUrl: '', imageUrl: '', sortOrder: 2 },
      { id: 'nw4', name: 'Swing or bouncer', whyItHelps: 'Lets you set baby down safely so you can eat, shower, or just breathe.', price: '$60–200', linkUrl: '', imageUrl: '', sortOrder: 3 },
      { id: 'nw5', name: 'Nipple cream (if breastfeeding)', whyItHelps: 'Start using it immediately after every feed. Don\'t wait until it hurts.', price: '$8–15', linkUrl: '', imageUrl: '', sortOrder: 4 },
      { id: 'nw6', name: 'Nursing pillow', whyItHelps: 'Boppy or My Brest Friend both work. Saves your arms and wrists during long feeds.', price: '$30–50', linkUrl: '', imageUrl: '', sortOrder: 5 },
      { id: 'nw7', name: 'Stool softener for mom', whyItHelps: 'Non-negotiable postpartum. Talk to your OB — most recommend starting before you leave the hospital.', price: '$5–10', linkUrl: '', imageUrl: '', sortOrder: 6 },
      { id: 'nw8', name: 'One-handed snacks stocked in fridge', whyItHelps: 'You\'ll be nursing constantly. String cheese, hard boiled eggs, granola bars — anything you can grab and eat.', price: 'varies', linkUrl: '', imageUrl: '', sortOrder: 7 },
      { id: 'nw9', name: 'Heavy overnight pads', whyItHelps: 'Postpartum bleeding is heavy for days. Don\'t bring home only pantyliners.', price: '$6–12', linkUrl: '', imageUrl: '', sortOrder: 8 },
      { id: 'nw10', name: 'Baby nail file or scratch mittens', whyItHelps: 'Newborns scratch themselves. File nails gently or use mittens until you\'re comfortable trimming.', price: '$5–15', linkUrl: '', imageUrl: '', sortOrder: 9 },
    ],
  },
  {
    id: 'seed_diaper_bag',
    title: 'Diaper Bag: The Real Essentials',
    category: 'diaper_bag',
    description: 'What actually needs to be in your bag every single time you leave the house.',
    authorName: 'patch team',
    isSeeded: true,
    items: [
      { id: 'db1', name: 'Diapers (4+ for a day out)', whyItHelps: 'Under-packing diapers is the most common mistake. Always bring more than you think you\'ll need.', price: 'varies', linkUrl: '', imageUrl: '', sortOrder: 0 },
      { id: 'db2', name: 'Full-size wipe pack', whyItHelps: 'Travel packs run out fast. Bring the real thing — you\'ll use them for everything.', price: '$3–6', linkUrl: '', imageUrl: '', sortOrder: 1 },
      { id: 'db3', name: 'Portable changing pad', whyItHelps: 'Not every restroom has a changing station. This gives you a clean surface anywhere.', price: '$10–25', linkUrl: '', imageUrl: '', sortOrder: 2 },
      { id: 'db4', name: 'Extra outfit for baby × 2', whyItHelps: 'Blowouts are inevitable. Two changes minimum.', price: 'varies', linkUrl: '', imageUrl: '', sortOrder: 3 },
      { id: 'db5', name: 'Extra shirt for you', whyItHelps: 'You will get spit on or pooped on. Pack one.', price: 'varies', linkUrl: '', imageUrl: '', sortOrder: 4 },
      { id: 'db6', name: 'Burp cloths × 3', whyItHelps: 'Muslin cloths are multipurpose — burp cloth, shade cloth, light blanket, emergency changing pad.', price: '$10–20', linkUrl: '', imageUrl: '', sortOrder: 5 },
      { id: 'db7', name: 'Pacifier clip', whyItHelps: 'Stops pacifiers from landing on the floor every 5 minutes.', price: '$8–15', linkUrl: '', imageUrl: '', sortOrder: 6 },
      { id: 'db8', name: 'Hand sanitizer', whyItHelps: 'For diaper changes when you can\'t get to a sink.', price: '$2–4', linkUrl: '', imageUrl: '', sortOrder: 7 },
      { id: 'db9', name: 'Snacks (if eating solids)', whyItHelps: 'Puffs and pouches keep older babies calm in restaurants and waiting rooms.', price: '$2–5', linkUrl: '', imageUrl: '', sortOrder: 8 },
    ],
  },
  {
    id: 'seed_breastfeeding_kit',
    title: 'Breastfeeding Starter Kit',
    category: 'feeding',
    description: 'Set yourself up for success in the early weeks.',
    authorName: 'patch team',
    isSeeded: true,
    items: [
      { id: 'bf1', name: 'Haakaa silicone pump', whyItHelps: 'Attaches to the other breast while you nurse. Catches passive letdown — you can collect oz without any effort.', price: '$12–25', linkUrl: 'https://www.amazon.com/s?k=haakaa+pump', imageUrl: '', sortOrder: 0 },
      { id: 'bf2', name: 'Nursing bras × 3', whyItHelps: 'Wire-free, easy clip access. Buy a few — you\'ll live in them. Size up from pre-pregnancy.', price: '$15–35 each', linkUrl: '', imageUrl: '', sortOrder: 1 },
      { id: 'bf3', name: 'Nursing pads (washable + disposable)', whyItHelps: 'Leaking is very common in the first weeks. Have both types so you always have clean ones.', price: '$8–20', linkUrl: '', imageUrl: '', sortOrder: 2 },
      { id: 'bf4', name: 'Nipple cream', whyItHelps: 'Apply after every single feed in the early weeks. Don\'t wait until it\'s painful.', price: '$8–20', linkUrl: 'https://motherlove.com', imageUrl: '', sortOrder: 3 },
      { id: 'bf5', name: 'Nursing pillow', whyItHelps: 'Boppy or My Brest Friend. Keeps baby at the right height so you\'re not hunched over for hours.', price: '$30–50', linkUrl: '', imageUrl: '', sortOrder: 4 },
      { id: 'bf6', name: 'Breast pump (check insurance first)', whyItHelps: 'Many insurance plans cover a pump fully. Check with your provider before buying.', price: '$0–350', linkUrl: 'https://www.aeroflowbreastpumps.com', imageUrl: '', sortOrder: 5 },
      { id: 'bf7', name: 'Milk storage bags', whyItHelps: 'Lansinoh or Kiinde are popular. Label each bag with date and amount. Lay flat to freeze.', price: '$10–20', linkUrl: '', imageUrl: '', sortOrder: 6 },
      { id: 'bf8', name: 'Large water bottle (40+ oz)', whyItHelps: 'Breastfeeding makes you intensely thirsty. Keep a huge cup at every nursing spot.', price: '$15–40', linkUrl: '', imageUrl: '', sortOrder: 7 },
    ],
  },
  {
    id: 'seed_sleep_setup',
    title: 'Safe Sleep Setup',
    category: 'sleep',
    description: 'Everything you need for safe, sane sleep — for baby and for you.',
    authorName: 'patch team',
    isSeeded: true,
    items: [
      { id: 'ss1', name: 'Firm, flat sleep surface', whyItHelps: 'A firm mattress in a crib, bassinet, or play yard is the safest place for baby to sleep. No soft surfaces.', price: 'varies', linkUrl: '', imageUrl: '', sortOrder: 0 },
      { id: 'ss2', name: 'Fitted crib sheets × 3', whyItHelps: 'Middle-of-the-night sheet changes are real. Have backups ready so you\'re not doing laundry at 3am.', price: '$10–20 each', linkUrl: '', imageUrl: '', sortOrder: 1 },
      { id: 'ss3', name: 'White noise machine', whyItHelps: 'Mimics womb sounds. Helps baby fall asleep and stay asleep through household noise.', price: '$30–80', linkUrl: 'https://hatch.co', imageUrl: '', sortOrder: 2 },
      { id: 'ss4', name: 'Swaddle blankets × 4', whyItHelps: 'Swaddling suppresses the startle reflex that wakes newborns. Practice before leaving the hospital.', price: '$15–40', linkUrl: '', imageUrl: '', sortOrder: 3 },
      { id: 'ss5', name: 'Sleep sack (once swaddling stops)', whyItHelps: 'After 2 months or when baby starts rolling, transition to a sleep sack instead of blankets.', price: '$20–40', linkUrl: '', imageUrl: '', sortOrder: 4 },
      { id: 'ss6', name: 'Blackout curtains', whyItHelps: 'Darkness helps regulate baby\'s circadian rhythm. Essential for daytime naps.', price: '$25–60', linkUrl: '', imageUrl: '', sortOrder: 5 },
      { id: 'ss7', name: 'Red nightlight', whyItHelps: 'Red light doesn\'t disrupt melatonin like white or blue light. Use for overnight feeds and diaper changes.', price: '$15–35', linkUrl: '', imageUrl: '', sortOrder: 6 },
      { id: 'ss8', name: 'Baby monitor', whyItHelps: 'Video monitors give peace of mind. Audio-only works too — choose what fits your budget.', price: '$30–300', linkUrl: '', imageUrl: '', sortOrder: 7 },
    ],
  },
];

// ─── Image upload ─────────────────────────────────────────────────────────────

async function uploadItemImage(uri: string, userId: string): Promise<string | null> {
  try {
    const res = await fetch(uri);
    const blob = await res.blob();
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `shopping-lists/${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('baby-photos')
      .upload(path, blob, { contentType: `image/${ext === 'png' ? 'png' : 'jpeg'}` });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('baby-photos').getPublicUrl(path);
    return publicUrl;
  } catch {
    return null;
  }
}

// ─── ListCard ─────────────────────────────────────────────────────────────────

function ListCard({
  list, onPress, onReport, reported, c,
}: {
  list: ShoppingList; onPress: () => void;
  onReport?: () => void; reported?: boolean; c: Colors;
}) {
  const s = listCardStyles(c);
  const cardColors = [
    { bg: c.cardLavender, border: c.lavender },
    { bg: c.cardHoney,    border: c.honey    },
    { bg: c.cardSage,     border: c.sage     },
    { bg: c.cardBlush,    border: c.blush    },
    { bg: c.cardBlue,     border: c.blue     },
  ];
  const colorIdx = Math.abs(list.id.charCodeAt(list.id.length - 1) % cardColors.length);
  const { bg, border } = cardColors[colorIdx];

  return (
    <View style={[s.card, { backgroundColor: bg, borderColor: border }]}>
      <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
        <View style={s.row}>
          <Text style={s.emoji}>{categoryEmoji(list.category)}</Text>
          <View style={s.info}>
            <Text style={s.title} numberOfLines={2}>{list.title}</Text>
            <Text style={s.desc} numberOfLines={2}>{list.description}</Text>
            <View style={s.meta}>
              <View style={s.countBadge}>
                <Text style={s.countText}>{list.items.length} items</Text>
              </View>
              <Text style={s.author}>by {list.authorName}</Text>
            </View>
          </View>
          <Text style={s.chevron}>›</Text>
        </View>
      </TouchableOpacity>
      {onReport && (
        <View style={s.reportRow}>
          {reported ? (
            <Text style={s.reportedLabel}>Reported</Text>
          ) : (
            <TouchableOpacity onPress={onReport} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Text style={s.flagBtn}>🚩 Report</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const listCardStyles = (c: Colors) =>
  StyleSheet.create({
    card: { borderRadius: 16, borderWidth: 2, padding: 16, marginBottom: 12 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    emoji: { fontSize: 28, marginTop: 2 },
    info: { flex: 1, gap: 4 },
    title: { fontSize: 15, fontWeight: '800', color: c.textPrimary, lineHeight: 20 },
    desc: { fontSize: 13, color: c.textSecondary, fontWeight: '500', lineHeight: 18 },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    countBadge: { backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
    countText: { fontSize: 12, fontWeight: '700', color: c.textSecondary },
    author: { fontSize: 12, color: c.textMuted, fontWeight: '500' },
    chevron: { fontSize: 22, color: c.textMuted, fontWeight: '700', alignSelf: 'center' },
    reportRow: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 16, paddingVertical: 8 },
    flagBtn: { fontSize: 12, color: c.textMuted, fontWeight: '600' },
    reportedLabel: { fontSize: 12, color: c.textMuted, fontStyle: 'italic' },
  });

// ─── ItemCard ─────────────────────────────────────────────────────────────────

function ItemCard({ item, index, c }: { item: ListItem; index: number; c: Colors }) {
  const s = itemCardStyles(c);
  const hasImage = !!item.imageUrl;
  const hasLink = !!item.linkUrl;

  return (
    <View style={s.card}>
      {hasImage && (
        <Image source={{ uri: item.imageUrl }} style={s.image} resizeMode="cover" />
      )}
      <View style={s.body}>
        <View style={s.nameRow}>
          <View style={s.numBadge}>
            <Text style={s.numText}>{index + 1}</Text>
          </View>
          <Text style={s.name}>{item.name}</Text>
          {item.price ? (
            <View style={s.priceBadge}>
              <Text style={s.priceText}>{item.price}</Text>
            </View>
          ) : null}
        </View>
        {item.whyItHelps ? (
          <Text style={s.why}>{item.whyItHelps}</Text>
        ) : null}
        {hasLink && (
          <TouchableOpacity
            style={s.linkBtn}
            onPress={() => Linking.openURL(item.linkUrl!).catch(() => {})}
            activeOpacity={0.75}
          >
            <Text style={s.linkText}>Shop / Buy ›</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const itemCardStyles = (c: Colors) =>
  StyleSheet.create({
    card: { backgroundColor: c.card, borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
    image: { width: '100%', height: 180 },
    body: { padding: 14, gap: 6 },
    nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' },
    numBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.lavender, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
    numText: { fontSize: 11, fontWeight: '800', color: '#fff' },
    name: { flex: 1, fontSize: 15, fontWeight: '800', color: c.textPrimary, lineHeight: 20 },
    priceBadge: { backgroundColor: c.cardHoney, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, flexShrink: 0 },
    priceText: { fontSize: 12, fontWeight: '700', color: c.textSecondary },
    why: { fontSize: 13, color: c.textSecondary, fontWeight: '500', lineHeight: 19, paddingLeft: 30 },
    linkBtn: { alignSelf: 'flex-start', marginLeft: 30, marginTop: 4, backgroundColor: c.cardBlue, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 },
    linkText: { fontSize: 13, fontWeight: '700', color: c.blue },
  });

// ─── Shared item form helper ──────────────────────────────────────────────────

function ItemForm({
  fName, setFName,
  fWhy, setFWhy,
  fPrice, setFPrice,
  fLink, setFLink,
  fImageUri, setFImageUri,
  existingImageUrl,
  title,
  onCancel,
  onSubmit,
  submitLabel,
  c,
}: {
  fName: string; setFName: (v: string) => void;
  fWhy: string; setFWhy: (v: string) => void;
  fPrice: string; setFPrice: (v: string) => void;
  fLink: string; setFLink: (v: string) => void;
  fImageUri: string | null; setFImageUri: (v: string | null) => void;
  existingImageUrl?: string;
  title: string;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  c: Colors;
}) {
  const s = itemFormStyles(c);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setFImageUri(result.assets[0].uri);
    }
  };

  const displayImage = fImageUri || existingImageUrl || null;

  return (
    <View style={s.box}>
      <Text style={s.boxTitle}>{title}</Text>
      <TextInput style={s.input} placeholder="Item name *" placeholderTextColor={c.textMuted} value={fName} onChangeText={setFName} />
      <TextInput style={[s.input, s.textarea]} placeholder="Why does this help? (optional)" placeholderTextColor={c.textMuted} value={fWhy} onChangeText={setFWhy} multiline numberOfLines={2} />
      <View style={s.row2}>
        <TextInput style={[s.input, s.half]} placeholder="Price (e.g. $15–30)" placeholderTextColor={c.textMuted} value={fPrice} onChangeText={setFPrice} />
        <TextInput style={[s.input, s.half]} placeholder="Shop / Affiliate link" placeholderTextColor={c.textMuted} value={fLink} onChangeText={setFLink} autoCapitalize="none" keyboardType="url" />
      </View>
      <TouchableOpacity style={s.imagePicker} onPress={pickImage} activeOpacity={0.8}>
        {displayImage ? (
          <Image source={{ uri: displayImage }} style={s.imagePreview} resizeMode="cover" />
        ) : (
          <Text style={s.imagePickerText}>📷  Add photo (optional)</Text>
        )}
      </TouchableOpacity>
      {displayImage ? (
        <TouchableOpacity onPress={() => setFImageUri('')} style={s.removePhoto}>
          <Text style={s.removePhotoText}>Remove photo</Text>
        </TouchableOpacity>
      ) : null}
      <View style={s.actions}>
        <TouchableOpacity style={s.cancelBtn} onPress={onCancel}>
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.submitBtn, !fName.trim() && s.submitBtnDisabled]} onPress={onSubmit} disabled={!fName.trim()}>
          <Text style={s.submitText}>{submitLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const itemFormStyles = (c: Colors) => StyleSheet.create({
  box: { backgroundColor: c.card, borderRadius: 16, padding: 16, gap: 10, marginTop: 8 },
  boxTitle: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
  input: { backgroundColor: c.bgAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.textPrimary, fontWeight: '500' },
  textarea: { minHeight: 72, textAlignVertical: 'top', paddingTop: 12 },
  row2: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  imagePicker: { backgroundColor: c.bgAlt, borderRadius: 12, height: 80, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  imagePreview: { width: '100%', height: '100%' },
  imagePickerText: { fontSize: 14, color: c.textMuted, fontWeight: '600' },
  removePhoto: { alignSelf: 'flex-start' },
  removePhotoText: { fontSize: 12, color: c.textMuted, fontWeight: '600', textDecorationLine: 'underline' },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 4 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: c.bgAlt },
  cancelText: { fontSize: 14, fontWeight: '700', color: c.textMuted },
  submitBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: c.lavender },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});

// ─── CreateListModal ──────────────────────────────────────────────────────────

function CreateListModal({
  visible, onClose, onCreated, currentUserId, currentUserName, c,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (list: ShoppingList) => void;
  currentUserId: string | null;
  currentUserName: string;
  c: Colors;
}) {
  const s = createStyles(c);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('newborn');
  const [description, setDescription] = useState('');
  const [draftItems, setDraftItems] = useState<ListItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingItem, setUploadingItem] = useState(false);

  const [fName, setFName] = useState('');
  const [fWhy, setFWhy] = useState('');
  const [fPrice, setFPrice] = useState('');
  const [fLink, setFLink] = useState('');
  const [fImageUri, setFImageUri] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);

  const reset = () => {
    setTitle(''); setCategory('newborn'); setDescription(''); setDraftItems([]);
    clearItem(); setAddingItem(false);
  };

  const clearItem = () => { setFName(''); setFWhy(''); setFPrice(''); setFLink(''); setFImageUri(null); };

  const addItem = () => {
    if (!fName.trim()) return;
    setDraftItems(prev => [...prev, {
      id: `draft_${Date.now()}`,
      name: fName.trim(),
      whyItHelps: fWhy.trim() || undefined,
      price: fPrice.trim() || undefined,
      linkUrl: fLink.trim() || undefined,
      imageUrl: fImageUri ?? undefined,
      sortOrder: draftItems.length,
    }]);
    clearItem(); setAddingItem(false);
  };

  const submit = async () => {
    if (!title.trim() || draftItems.length === 0 || !currentUserId) return;
    setSubmitting(true);
    try {
      const { data: listData, error: listError } = await (supabase as any)
        .from('shopping_lists')
        .insert({ user_id: currentUserId, title: title.trim(), category, description: description.trim() || null, author_name: currentUserName, is_seeded: false })
        .select().single();
      if (listError) throw listError;
      const listId = (listData as any).id;

      const uploadedItems: ListItem[] = [];
      for (let i = 0; i < draftItems.length; i++) {
        const item = draftItems[i];
        let imageUrl: string | undefined = undefined;
        if (item.imageUrl && item.imageUrl.startsWith('file')) {
          setUploadingItem(true);
          imageUrl = (await uploadItemImage(item.imageUrl, currentUserId)) ?? undefined;
          setUploadingItem(false);
        }
        uploadedItems.push({ ...item, imageUrl, sortOrder: i });
      }

      const { error: itemsError } = await (supabase as any).from('shopping_list_items').insert(
        uploadedItems.map(item => ({ list_id: listId, name: item.name, why_it_helps: item.whyItHelps ?? null, link_url: item.linkUrl ?? null, price: item.price ?? null, image_url: item.imageUrl ?? null, sort_order: item.sortOrder }))
      );
      if (itemsError) throw itemsError;

      onCreated({ id: listId, title: title.trim(), category, description: description.trim(), authorName: currentUserName, isSeeded: false, items: uploadedItems, createdAt: new Date().toISOString() });
      reset(); onClose();
    } catch {
      Alert.alert('Error', 'Could not save your list. Please try again.');
    } finally {
      setSubmitting(false); setUploadingItem(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { reset(); onClose(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <SafeAreaView style={s.container}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Text style={s.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>New List</Text>
            <TouchableOpacity onPress={submit} disabled={!title.trim() || draftItems.length === 0 || submitting}>
              <Text style={[s.postBtn, (!title.trim() || draftItems.length === 0 || submitting) && s.postBtnDisabled]}>
                {submitting ? '...' : 'Post'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>List title *</Text>
            <TextInput style={s.input} placeholder="e.g. Hospital bag must-haves" placeholderTextColor={c.textMuted} value={title} onChangeText={setTitle} />

            <Text style={s.fieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll}>
              {CATEGORIES.filter(cat => cat.id !== 'all').map(cat => (
                <TouchableOpacity key={cat.id} style={[s.catChip, category === cat.id && s.catChipActive]} onPress={() => setCategory(cat.id)} activeOpacity={0.7}>
                  <Text style={s.catChipText}>{cat.emoji} {cat.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={s.fieldLabel}>Description</Text>
            <TextInput style={[s.input, s.textarea]} placeholder="What's this list for? Any tips?" placeholderTextColor={c.textMuted} value={description} onChangeText={setDescription} multiline numberOfLines={3} />

            <Text style={s.fieldLabel}>Items ({draftItems.length})</Text>
            {draftItems.map((item, idx) => (
              <View key={item.id} style={s.draftItem}>
                {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={s.draftItemImage} resizeMode="cover" /> : null}
                <View style={s.draftItemBody}>
                  <Text style={s.draftItemName} numberOfLines={1}>{idx + 1}. {item.name}</Text>
                  {item.price ? <Text style={s.draftItemMeta}>{item.price}</Text> : null}
                  {item.whyItHelps ? <Text style={s.draftItemWhy} numberOfLines={2}>{item.whyItHelps}</Text> : null}
                  {item.linkUrl ? <Text style={s.draftItemLink} numberOfLines={1}>🔗 {item.linkUrl}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => setDraftItems(prev => prev.filter(i => i.id !== item.id))} style={s.removeBtn}>
                  <Text style={s.removeText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            {addingItem ? (
              <ItemForm
                fName={fName} setFName={setFName}
                fWhy={fWhy} setFWhy={setFWhy}
                fPrice={fPrice} setFPrice={setFPrice}
                fLink={fLink} setFLink={setFLink}
                fImageUri={fImageUri} setFImageUri={setFImageUri}
                title="Add an item"
                onCancel={() => { clearItem(); setAddingItem(false); }}
                onSubmit={addItem}
                submitLabel="Add item"
                c={c}
              />
            ) : (
              <TouchableOpacity style={s.addItemTrigger} onPress={() => setAddingItem(true)} activeOpacity={0.8}>
                <Text style={s.addItemTriggerText}>+ Add an item</Text>
              </TouchableOpacity>
            )}

            {submitting && (
              <View style={s.loadingRow}>
                <ActivityIndicator size="small" color={c.lavender} />
                <Text style={s.loadingText}>{uploadingItem ? 'Uploading photos...' : 'Saving list...'}</Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (c: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.separator },
  headerTitle: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
  cancel: { fontSize: 16, color: c.textMuted, fontWeight: '600' },
  postBtn: { fontSize: 16, color: c.lavender, fontWeight: '800' },
  postBtnDisabled: { opacity: 0.35 },
  scroll: { padding: 20, paddingBottom: 60, gap: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: c.textMuted, marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.textPrimary, fontWeight: '500' },
  textarea: { minHeight: 72, textAlignVertical: 'top', paddingTop: 12 },
  catScroll: { marginBottom: 4 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: c.card, marginRight: 8 },
  catChipActive: { backgroundColor: c.lavender },
  catChipText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
  draftItem: { backgroundColor: c.card, borderRadius: 12, marginBottom: 8, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  draftItemImage: { width: 64, height: 64 },
  draftItemBody: { flex: 1, padding: 10, gap: 2 },
  draftItemName: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
  draftItemMeta: { fontSize: 12, color: c.textMuted, fontWeight: '500' },
  draftItemWhy: { fontSize: 12, color: c.textSecondary, fontWeight: '500' },
  draftItemLink: { fontSize: 11, color: c.blue, fontWeight: '600' },
  removeBtn: { paddingHorizontal: 12, paddingVertical: 12 },
  removeText: { fontSize: 16, color: c.textMuted },
  addItemTrigger: { borderWidth: 2, borderStyle: 'dashed', borderColor: c.lavender, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  addItemTriggerText: { fontSize: 15, fontWeight: '700', color: c.lavender },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, justifyContent: 'center' },
  loadingText: { fontSize: 14, color: c.textMuted, fontWeight: '500' },
});

// ─── AdminEditModal ───────────────────────────────────────────────────────────

function AdminEditModal({
  visible, list, onClose, onSave, c,
}: {
  visible: boolean;
  list: ShoppingList | null;
  onClose: () => void;
  onSave: (title: string, desc: string, items: ListItem[]) => Promise<void>;
  c: Colors;
}) {
  const s = adminEditStyles(c);

  const [listTitle, setListTitle] = useState('');
  const [listDesc, setListDesc] = useState('');
  const [items, setItems] = useState<ListItem[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fName, setFName] = useState('');
  const [fWhy, setFWhy] = useState('');
  const [fPrice, setFPrice] = useState('');
  const [fLink, setFLink] = useState('');
  const [fImageUri, setFImageUri] = useState<string | null>(null);

  useEffect(() => {
    if (list && visible) {
      setListTitle(list.title);
      setListDesc(list.description);
      setItems(list.items.map(i => ({ ...i })));
      setEditingIdx(null);
      setAddingItem(false);
      clearForm();
    }
  }, [list, visible]);

  const clearForm = () => { setFName(''); setFWhy(''); setFPrice(''); setFLink(''); setFImageUri(null); };

  const startEdit = (idx: number) => {
    const item = items[idx];
    setFName(item.name);
    setFWhy(item.whyItHelps ?? '');
    setFPrice(item.price ?? '');
    setFLink(item.linkUrl ?? '');
    setFImageUri(item.imageUrl || null);
    setEditingIdx(idx);
    setAddingItem(false);
  };

  const saveEdit = () => {
    if (editingIdx === null) return;
    const updated = [...items];
    updated[editingIdx] = {
      ...updated[editingIdx],
      name: fName.trim() || updated[editingIdx].name,
      whyItHelps: fWhy.trim() || undefined,
      price: fPrice.trim() || undefined,
      linkUrl: fLink.trim() || undefined,
      imageUrl: fImageUri !== null ? (fImageUri || undefined) : updated[editingIdx].imageUrl,
    };
    setItems(updated);
    setEditingIdx(null);
    clearForm();
  };

  const deleteItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx).map((item, i) => ({ ...item, sortOrder: i })));
    if (editingIdx === idx) { setEditingIdx(null); clearForm(); }
  };

  const addItem = () => {
    if (!fName.trim()) return;
    setItems(prev => [...prev, {
      id: `draft_${Date.now()}`,
      name: fName.trim(),
      whyItHelps: fWhy.trim() || undefined,
      price: fPrice.trim() || undefined,
      linkUrl: fLink.trim() || undefined,
      imageUrl: fImageUri || undefined,
      sortOrder: prev.length,
    }]);
    clearForm();
    setAddingItem(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(listTitle.trim() || (list?.title ?? ''), listDesc.trim(), items);
    } finally {
      setSaving(false);
    }
  };

  if (!list) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <SafeAreaView style={s.container}>
          <View style={s.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>Edit List</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              <Text style={[s.saveBtn, saving && s.saveBtnDisabled]}>{saving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <View style={s.adminBadge}>
              <Text style={s.adminBadgeText}>🔑  Admin — changes are saved to the database for all users</Text>
            </View>

            <Text style={s.fieldLabel}>List title</Text>
            <TextInput style={s.input} value={listTitle} onChangeText={setListTitle} placeholderTextColor={c.textMuted} />

            <Text style={s.fieldLabel}>Description</Text>
            <TextInput style={[s.input, s.textarea]} value={listDesc} onChangeText={setListDesc} multiline numberOfLines={3} placeholderTextColor={c.textMuted} />

            <Text style={s.fieldLabel}>Items ({items.length})</Text>

            {items.map((item, idx) => (
              <View key={`${item.id}-${idx}`}>
                {editingIdx === idx ? (
                  <ItemForm
                    fName={fName} setFName={setFName}
                    fWhy={fWhy} setFWhy={setFWhy}
                    fPrice={fPrice} setFPrice={setFPrice}
                    fLink={fLink} setFLink={setFLink}
                    fImageUri={fImageUri} setFImageUri={setFImageUri}
                    existingImageUrl={item.imageUrl}
                    title={`Editing item ${idx + 1}`}
                    onCancel={() => { setEditingIdx(null); clearForm(); }}
                    onSubmit={saveEdit}
                    submitLabel="Done"
                    c={c}
                  />
                ) : (
                  <View style={s.itemRow}>
                    <Text style={s.itemNum}>{idx + 1}</Text>
                    <View style={s.itemInfo}>
                      <Text style={s.itemName} numberOfLines={1}>{item.name}</Text>
                      <View style={s.itemMeta}>
                        {item.price ? <Text style={s.metaPrice}>{item.price}</Text> : null}
                        {item.linkUrl ? <Text style={s.metaLink}>🔗 link</Text> : null}
                        {item.imageUrl ? <Text style={s.metaImg}>📷 photo</Text> : null}
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => startEdit(idx)} style={s.editBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}>
                      <Text style={s.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteItem(idx)} style={s.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}>
                      <Text style={s.deleteBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}

            {addingItem ? (
              <ItemForm
                fName={fName} setFName={setFName}
                fWhy={fWhy} setFWhy={setFWhy}
                fPrice={fPrice} setFPrice={setFPrice}
                fLink={fLink} setFLink={setFLink}
                fImageUri={fImageUri} setFImageUri={setFImageUri}
                title="New item"
                onCancel={() => { clearForm(); setAddingItem(false); }}
                onSubmit={addItem}
                submitLabel="Add"
                c={c}
              />
            ) : (
              <TouchableOpacity
                style={s.addTrigger}
                onPress={() => { clearForm(); setEditingIdx(null); setAddingItem(true); }}
                activeOpacity={0.8}
              >
                <Text style={s.addTriggerText}>+ Add item</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const adminEditStyles = (c: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.separator },
  headerTitle: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
  cancel: { fontSize: 16, color: c.textMuted, fontWeight: '600' },
  saveBtn: { fontSize: 16, color: c.lavender, fontWeight: '800' },
  saveBtnDisabled: { opacity: 0.35 },
  scroll: { padding: 20, paddingBottom: 60, gap: 4 },
  adminBadge: { backgroundColor: c.cardHoney, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  adminBadgeText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: c.textMuted, marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.textPrimary, fontWeight: '500' },
  textarea: { minHeight: 72, textAlignVertical: 'top', paddingTop: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, gap: 8 },
  itemNum: { fontSize: 13, fontWeight: '800', color: c.textMuted, width: 18 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
  itemMeta: { flexDirection: 'row', gap: 8, marginTop: 2, flexWrap: 'wrap' },
  metaPrice: { fontSize: 11, color: c.textMuted, fontWeight: '600' },
  metaLink: { fontSize: 11, color: c.blue, fontWeight: '700' },
  metaImg: { fontSize: 11, color: c.sage, fontWeight: '700' },
  editBtn: { backgroundColor: c.cardBlue, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  editBtnText: { fontSize: 13, fontWeight: '700', color: c.blue },
  deleteBtn: { paddingHorizontal: 4 },
  deleteBtnText: { fontSize: 18, color: c.textMuted },
  addTrigger: { borderWidth: 2, borderStyle: 'dashed', borderColor: c.lavender, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  addTriggerText: { fontSize: 15, fontWeight: '700', color: c.lavender },
});

// ─── Detail view ──────────────────────────────────────────────────────────────

function ListDetail({
  list, onBack, c, isAdmin, onAdminEdit,
}: {
  list: ShoppingList;
  onBack: () => void;
  c: Colors;
  isAdmin: boolean;
  onAdminEdit: () => void;
}) {
  const s = detailStyles(c);
  const catColors = [
    { bg: c.cardLavender, border: c.lavender },
    { bg: c.cardHoney,    border: c.honey    },
    { bg: c.cardSage,     border: c.sage     },
    { bg: c.cardBlush,    border: c.blush    },
    { bg: c.cardBlue,     border: c.blue     },
  ];
  const colorIdx = Math.abs(list.id.charCodeAt(list.id.length - 1) % catColors.length);
  const { bg, border } = catColors[colorIdx];

  return (
    <SafeAreaView style={s.container}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Lists</Text>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity onPress={onAdminEdit} style={s.adminEditBtn} activeOpacity={0.8}>
            <Text style={s.adminEditText}>✏️  Edit List</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={[s.heroCard, { backgroundColor: bg, borderColor: border }]}>
          <Text style={s.heroEmoji}>{categoryEmoji(list.category)}</Text>
          <Text style={s.heroTitle}>{list.title}</Text>
          {list.description ? <Text style={s.heroDesc}>{list.description}</Text> : null}
          <Text style={s.heroMeta}>by {list.authorName} · {list.items.length} items</Text>
        </View>

        {list.items.map((item, idx) => (
          <ItemCard key={item.id} item={item} index={idx} c={c} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const detailStyles = (c: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  topBar: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backArrow: { fontSize: 20, color: c.textSecondary, fontWeight: '700' },
  backLabel: { fontSize: 15, color: c.textSecondary, fontWeight: '700' },
  adminEditBtn: { backgroundColor: c.cardHoney, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7 },
  adminEditText: { fontSize: 14, fontWeight: '800', color: c.honey },
  scroll: { padding: 20, paddingBottom: 40, gap: 12 },
  heroCard: { borderRadius: 20, borderWidth: 2, padding: 24, alignItems: 'center', gap: 6, marginBottom: 4 },
  heroEmoji: { fontSize: 44 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: c.textPrimary, textAlign: 'center' },
  heroDesc: { fontSize: 14, color: c.textSecondary, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
  heroMeta: { fontSize: 12, color: c.textMuted, fontWeight: '600', marginTop: 4 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SmartShoppingLists({ onBack }: { onBack: () => void }) {
  const c = useColors();
  const s = mainStyles(c);
  const { isSubscribed, openPaywall } = useSubscription();

  const [view, setView] = useState<'browse' | 'detail'>('browse');
  const [selectedList, setSelectedList] = useState<ShoppingList | null>(null);
  const [userLists, setUserLists] = useState<ShoppingList[]>([]);
  const [seededDbMap, setSeededDbMap] = useState<Record<string, ShoppingList>>({});
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [reportingListId, setReportingListId] = useState<string | null>(null);
  const [reportedListIds, setReportedListIds] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState('Parent');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEditList, setAdminEditList] = useState<ShoppingList | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUserId(data.user.id);
        if (data.user.email === ADMIN_EMAIL) setIsAdmin(true);
        supabase
          .from('profiles')
          .select('display_name, username')
          .eq('id', data.user.id)
          .single()
          .then(({ data: p }: { data: any }) => {
            if (p) setCurrentUserName(p.display_name || p.username || 'Parent');
          });
      }
    });
    fetchUserLists();
  }, []);

  // When seededDbMap updates (e.g. after admin save), keep selectedList in sync
  useEffect(() => {
    if (!selectedList?.isSeeded) return;
    const seedKey = selectedList.seedKey ?? selectedList.id;
    const updated = seededDbMap[seedKey];
    if (updated && updated.id !== selectedList.id) setSelectedList(updated);
  }, [seededDbMap]);

  const fetchUserLists = async () => {
    setLoading(true);
    try {
      const [{ data: listsData }, { data: seededData }] = await Promise.all([
        supabase.from('shopping_lists').select('*').eq('is_seeded', false).order('created_at', { ascending: false }),
        supabase.from('shopping_lists').select('*').eq('is_seeded', true),
      ]);

      const allIds = [
        ...(listsData ?? []).map((l: any) => l.id),
        ...(seededData ?? []).map((l: any) => l.id),
      ];

      const { data: itemsData } = allIds.length
        ? await supabase.from('shopping_list_items').select('*').in('list_id', allIds).order('sort_order', { ascending: true })
        : { data: [] };

      const itemsByList: Record<string, ListItem[]> = {};
      for (const item of (itemsData ?? [])) {
        if (!itemsByList[item.list_id]) itemsByList[item.list_id] = [];
        itemsByList[item.list_id].push({
          id: item.id,
          name: item.name,
          whyItHelps: item.why_it_helps ?? undefined,
          linkUrl: item.link_url ?? undefined,
          price: item.price ?? undefined,
          imageUrl: item.image_url ?? undefined,
          sortOrder: item.sort_order,
        });
      }

      const mapped: ShoppingList[] = (listsData ?? []).map((l: any) => ({
        id: l.id,
        title: l.title,
        category: l.category,
        description: l.description ?? '',
        authorName: l.author_name ?? 'Parent',
        isSeeded: false,
        items: itemsByList[l.id] ?? [],
        createdAt: l.created_at,
      }));

      const overrides: Record<string, ShoppingList> = {};
      for (const l of (seededData ?? [])) {
        if (l.seed_key) {
          overrides[l.seed_key] = {
            id: l.id,
            title: l.title,
            category: l.category,
            description: l.description ?? '',
            authorName: l.author_name ?? 'village team',
            isSeeded: true,
            seedKey: l.seed_key,
            items: itemsByList[l.id] ?? [],
            createdAt: l.created_at,
          };
        }
      }

      setUserLists(mapped);
      setSeededDbMap(overrides);
    } catch {
      // silently fail — seeded lists still show
    } finally {
      setLoading(false);
    }
  };

  const saveAdminEdits = async (title: string, desc: string, editedItems: ListItem[]) => {
    if (!adminEditList || !currentUserId) return;

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(adminEditList.id);

    try {
      let listId: string;

      if (isUUID) {
        listId = adminEditList.id;
        await supabase.from('shopping_lists').update({ title, description: desc || null }).eq('id', listId);
      } else {
        const { data: newList, error } = await supabase
          .from('shopping_lists')
          .insert({
            user_id: currentUserId,
            title,
            category: adminEditList.category,
            description: desc || null,
            author_name: 'village team',
            is_seeded: true,
            seed_key: adminEditList.id,
          })
          .select()
          .single();
        if (error) throw error;
        listId = (newList as any).id;
      }

      // Replace all items (delete + re-insert)
      await supabase.from('shopping_list_items').delete().eq('list_id', listId);

      const itemRows: any[] = [];
      for (let i = 0; i < editedItems.length; i++) {
        const item = editedItems[i];
        let imageUrl = item.imageUrl;
        if (imageUrl && imageUrl.startsWith('file')) {
          imageUrl = (await uploadItemImage(imageUrl, currentUserId)) ?? undefined;
        }
        itemRows.push({
          list_id: listId,
          name: item.name,
          why_it_helps: item.whyItHelps ?? null,
          link_url: item.linkUrl ?? null,
          price: item.price ?? null,
          image_url: imageUrl ?? null,
          sort_order: i,
        });
      }

      if (itemRows.length > 0) {
        await supabase.from('shopping_list_items').insert(itemRows);
      }

      setAdminEditList(null);
      await fetchUserLists();
    } catch {
      Alert.alert('Error', 'Could not save changes. Please try again.');
    }
  };

  const allLists = [
    ...SEEDED_LISTS.map(sl => seededDbMap[sl.id] ?? sl),
    ...userLists,
  ];

  const filtered = allLists.filter(list => {
    const matchCat = selectedCategory === 'all' || list.category === selectedCategory;
    const q = search.toLowerCase().trim();
    const matchSearch = !q ||
      list.title.toLowerCase().includes(q) ||
      list.description.toLowerCase().includes(q) ||
      list.authorName.toLowerCase().includes(q) ||
      list.items.some(i => i.name.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });

  const openList = (list: ShoppingList) => {
    setSelectedList(list);
    setView('detail');
  };

  const submitListReport = async (reason: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !reportingListId) return;
    await supabase.from('community_reports').insert({
      reporter_id: user.id,
      content_type: 'shopping_list',
      content_id: reportingListId,
      reason,
    });
    setReportedListIds(prev => new Set([...prev, reportingListId]));
    setReportingListId(null);
  };

  if (view === 'detail' && selectedList) {
    return (
      <>
        <ListDetail
          list={selectedList}
          onBack={() => setView('browse')}
          c={c}
          isAdmin={isAdmin}
          onAdminEdit={() => setAdminEditList(selectedList)}
        />
        <AdminEditModal
          visible={!!adminEditList}
          list={adminEditList}
          onClose={() => setAdminEditList(null)}
          onSave={saveAdminEdits}
          c={c}
        />
      </>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Resources</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.pageTitle}>Smart Shopping Lists</Text>
            <Text style={s.pageSubtitle}>Curated lists for every moment of parenting</Text>
          </View>
          {isSubscribed && (
            <TouchableOpacity style={s.createBtn} onPress={() => setShowCreate(true)} activeOpacity={0.8}>
              <Text style={s.createBtnText}>+ New list</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.searchRow}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            placeholder="Search lists or items..."
            placeholderTextColor={c.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll} contentContainerStyle={{ paddingRight: 20 }}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[s.catChip, selectedCategory === cat.id && s.catChipActive]}
              onPress={() => setSelectedCategory(cat.id)}
              activeOpacity={0.75}
            >
              <Text style={[s.catChipText, selectedCategory === cat.id && s.catChipTextActive]}>
                {cat.emoji} {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={s.resultsCount}>{filtered.length} list{filtered.length !== 1 ? 's' : ''}</Text>

        {loading ? (
          <ActivityIndicator size="small" color={c.lavender} style={{ marginTop: 20 }} />
        ) : filtered.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🛍️</Text>
            <Text style={s.emptyTitle}>No lists found</Text>
            <Text style={s.emptyText}>Try a different search or be the first to share a list!</Text>
          </View>
        ) : (
          filtered.map(list => (
            <ListCard
              key={list.id}
              list={list}
              onPress={() => openList(list)}
              onReport={!list.isSeeded ? () => setReportingListId(list.id) : undefined}
              reported={reportedListIds.has(list.id)}
              c={c}
            />
          ))
        )}
      </ScrollView>

      <CreateListModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={newList => {
          setUserLists(prev => [newList, ...prev]);
          openList(newList);
        }}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        c={c}
      />

      <ReportModal
        visible={reportingListId !== null}
        title="Report List"
        onClose={() => setReportingListId(null)}
        onSubmit={submitListReport}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const mainStyles = (c: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  topBar: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backArrow: { fontSize: 20, color: c.textSecondary, fontWeight: '700' },
  backLabel: { fontSize: 15, color: c.textSecondary, fontWeight: '700' },
  scroll: { padding: 20, paddingBottom: 40 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  pageTitle: { fontSize: 26, fontWeight: '800', color: c.textPrimary, marginBottom: 4 },
  pageSubtitle: { fontSize: 13, color: c.textMuted, fontWeight: '500' },
  createBtn: { backgroundColor: c.lavender, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginTop: 4 },
  createBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 2, marginBottom: 14, gap: 6 },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 15, color: c.textPrimary, fontWeight: '500', paddingVertical: 10 },
  catScroll: { marginBottom: 14, marginLeft: -20, paddingLeft: 20 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: c.card, marginRight: 8 },
  catChipActive: { backgroundColor: c.lavender },
  catChipText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
  catChipTextActive: { color: '#fff' },
  resultsCount: { fontSize: 12, color: c.textMuted, fontWeight: '600', marginBottom: 12 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: c.textPrimary },
  emptyText: { fontSize: 14, color: c.textMuted, fontWeight: '500', textAlign: 'center' },
});
