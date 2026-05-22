import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Modal, Alert, ActivityIndicator, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';

// ─── Static catalog ───────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  url: string;
  description: string;
  priceRange: '$' | '$$' | '$$$' | '$$$$';
}

interface Category {
  id: string;
  name: string;
  emoji: string;
}

const CATEGORIES: Category[] = [
  { id: 'strollers',      name: 'Strollers',            emoji: '🛻' },
  { id: 'car_seats',      name: 'Car Seats',             emoji: '🚗' },
  { id: 'monitors',       name: 'Baby Monitors',         emoji: '📷' },
  { id: 'sanitizers',     name: 'Bottle Sanitizers',     emoji: '🫧' },
  { id: 'bottles',        name: 'Bottles & Feeding',     emoji: '🍼' },
  { id: 'pumps',          name: 'Breast Pumps',          emoji: '🤱' },
  { id: 'carriers',       name: 'Carriers & Wraps',      emoji: '👶' },
  { id: 'sleep',          name: 'Sleep',                 emoji: '😴' },
  { id: 'diapering',      name: 'Diapering',             emoji: '🧷' },
  { id: 'bath',           name: 'Bath Time',             emoji: '🛁' },
  { id: 'gear',           name: 'Swings & Bouncers',     emoji: '🪑' },
  { id: 'postpartum',     name: 'Postpartum',            emoji: '💜' },
];

const PRODUCTS: Product[] = [
  // Strollers
  { id: 'uppababy_vista', name: 'Vista V2', brand: 'UPPAbaby', category: 'strollers', url: 'https://uppababy.com/vista/', description: 'Full-size modular stroller, grows from newborn to toddler. Compatible with bassinet and infant car seats.', priceRange: '$$$$' },
  { id: 'babyjogger_mini', name: 'City Mini GT2', brand: 'Baby Jogger', category: 'strollers', url: 'https://www.babyjogger.com/products/city-mini-gt2-stroller', description: 'All-terrain stroller with all-wheel suspension and hand-operated front wheel brake.', priceRange: '$$$' },
  { id: 'graco_modes', name: 'Modes Pram LX', brand: 'Graco', category: 'strollers', url: 'https://www.gracobaby.com/', description: 'Multi-mode stroller with 3 ride modes, works with Graco infant car seats.', priceRange: '$$' },
  { id: 'bugaboo_fox', name: 'Fox 5', brand: 'Bugaboo', category: 'strollers', url: 'https://www.bugaboo.com/', description: 'Premium stroller with smooth push and reversible seat. Lightweight and maneuverable.', priceRange: '$$$$' },
  { id: 'nuna_mixx', name: 'MIXX Next', brand: 'Nuna', category: 'strollers', url: 'https://www.nuna.eu/', description: 'Sleek full-feature stroller with one-hand fold and magnetic buckle.', priceRange: '$$$' },
  { id: 'chicco_bravo', name: 'Bravo Trio Travel System', brand: 'Chicco', category: 'strollers', url: 'https://www.chiccousa.com/', description: 'Travel system with KeyFit 30 infant car seat, quick fold, and large storage basket.', priceRange: '$$' },
  { id: 'bob_flex', name: 'Revolution Flex 3.0', brand: 'BOB Gear', category: 'strollers', url: 'https://www.bobgear.com/', description: 'Jogging stroller with swivel front wheel, ideal for running parents.', priceRange: '$$$' },
  { id: 'britax_bready', name: 'B-Ready G3', brand: 'Britax', category: 'strollers', url: 'https://us.britax.com/', description: 'Modular stroller with multiple seating configurations for growing families.', priceRange: '$$$' },

  // Car Seats
  { id: 'graco_4ever', name: '4Ever DLX 4-in-1', brand: 'Graco', category: 'car_seats', url: 'https://www.gracobaby.com/', description: 'Rear-facing 4–40 lbs, forward-facing up to 65 lbs, highback booster, backless booster. One seat for years.', priceRange: '$$' },
  { id: 'chicco_keyfit', name: 'KeyFit 35 Zip Air', brand: 'Chicco', category: 'car_seats', url: 'https://www.chiccousa.com/', description: 'Infant car seat with one-second attachment system and zip-off boot for easy cleaning.', priceRange: '$$' },
  { id: 'britax_marathon', name: 'Marathon ClickTight', brand: 'Britax', category: 'car_seats', url: 'https://us.britax.com/', description: 'Convertible seat with ClickTight installation system — easier and more secure.', priceRange: '$$$' },
  { id: 'uppababy_mesa', name: 'MESA V2', brand: 'UPPAbaby', category: 'car_seats', url: 'https://uppababy.com/', description: 'Infant car seat with MERYL® Newborn Insert and base fits most vehicles without extra base purchase.', priceRange: '$$$' },
  { id: 'clek_foonf', name: 'Foonf', brand: 'Clek', category: 'car_seats', url: 'https://www.clekinc.com/', description: 'Premium convertible seat with rigid LATCH and energy-absorbing foam. Narrow profile for 3-across.', priceRange: '$$$$' },
  { id: 'evenflo_everystage', name: 'EveryStage DLX', brand: 'Evenflo', category: 'car_seats', url: 'https://www.evenflo.com/', description: 'All-in-one seat rear-faces up to 50 lbs. SensorSafe technology included.', priceRange: '$$' },
  { id: 'nuna_rava', name: 'RAVA', brand: 'Nuna', category: 'car_seats', url: 'https://www.nuna.eu/', description: 'Convertible seat with Dream Drape™ privacy canopy and True Lock system for easy install.', priceRange: '$$$' },

  // Baby Monitors
  { id: 'nanit_pro', name: 'Nanit Pro Camera', brand: 'Nanit', category: 'monitors', url: 'https://www.nanit.com/', description: 'HD overhead monitor with sleep tracking, breathing wear band compatibility, and expert insights.', priceRange: '$$$' },
  { id: 'owlet_dream', name: 'Dream Sock + Cam', brand: 'Owlet', category: 'monitors', url: 'https://owletcare.com/', description: 'Smart sock tracks heart rate and oxygen, paired with HD video camera and two-way audio.', priceRange: '$$$' },
  { id: 'infant_optics', name: 'DXR-8 Pro', brand: 'Infant Optics', category: 'monitors', url: 'https://www.infantoptics.com/', description: 'Video monitor with interchangeable optical lenses and no WiFi — completely local signal.', priceRange: '$$' },
  { id: 'motorola_halo', name: 'Halo+', brand: 'Motorola', category: 'monitors', url: 'https://www.motorola.com/', description: 'Overhead crib monitor with 1080p HD, two-way audio, and lullabies.', priceRange: '$$' },
  { id: 'eufy_spaceview', name: 'SpaceView Pro', brand: 'Eufy', category: 'monitors', url: 'https://www.eufylife.com/', description: '720p baby monitor with 5" screen, pan/tilt, zoom, and 12-hour battery on parent unit.', priceRange: '$$' },

  // Bottle Sanitizers
  { id: 'philips_steam', name: 'Electric Steam Sterilizer', brand: 'Philips Avent', category: 'sanitizers', url: 'https://www.philips.com/', description: 'Sterilizes 6 bottles in 6 minutes. Keeps items sterile for up to 24 hours when closed.', priceRange: '$' },
  { id: 'drbrowns_sterilizer', name: 'Deluxe Electric Sterilizer', brand: "Dr. Brown's", category: 'sanitizers', url: 'https://www.drbrownsbaby.com/', description: 'Fits up to 6 wide-neck or narrow-neck bottles. Includes drying rack.', priceRange: '$' },
  { id: 'wabi_sterilizer', name: 'Premium Electric Steam Sterilizer & Dryer', brand: 'Wabi Baby', category: 'sanitizers', url: 'https://www.wabibaby.com/', description: 'Sterilizes AND dries — no air-dry wait time. Holds up to 8 bottles.', priceRange: '$$' },
  { id: 'baby_brezza_washer', name: 'Bottle Washer Pro', brand: 'Baby Brezza', category: 'sanitizers', url: 'https://www.babybrezza.com/', description: 'Automated bottle washer + sterilizer + dryer. Like a dishwasher just for bottles.', priceRange: '$$$' },
  { id: 'munchkin_uv', name: 'UV Sterilizer & Dryer', brand: 'Munchkin', category: 'sanitizers', url: 'https://www.munchkin.com/', description: 'UV-C light sterilizes in 59 seconds. Chemical-free and kills 99.9% of germs.', priceRange: '$$' },

  // Bottles & Feeding
  { id: 'drbrowns_bottles', name: "Options+ Wide-Neck Bottles", brand: "Dr. Brown's", category: 'bottles', url: 'https://www.drbrownsbaby.com/', description: 'Internal vent system reduces colic, gas, and spit-up. Converts to options bottle as baby grows.', priceRange: '$' },
  { id: 'avent_natural', name: 'Natural Response Baby Bottle', brand: 'Philips Avent', category: 'bottles', url: 'https://www.philips.com/', description: 'Breast-like nipple with flexible spiral design. Helps with breast-bottle combination.', priceRange: '$' },
  { id: 'comotomo', name: 'Baby Bottle', brand: 'Comotomo', category: 'bottles', url: 'https://comotomo.com/', description: 'Soft silicone bottle mimics breastfeeding. Wide-neck for easy cleaning.', priceRange: '$' },
  { id: 'nanobebe_flexi', name: 'Flexi Baby Bottle', brand: 'Nanobébé', category: 'bottles', url: 'https://nanobebe.com/', description: 'Breast-shaped design. Warms evenly and quickly — reduces hotspots.', priceRange: '$' },
  { id: 'tommee_tippee', name: 'Closer to Nature Bottle', brand: 'Tommee Tippee', category: 'bottles', url: 'https://www.tommeetippee.com/', description: 'Breast-like nipple flex, anti-colic valve, easy latch for combo-feeding babies.', priceRange: '$' },

  // Breast Pumps
  { id: 'spectra_s1', name: 'S1 Plus Electric Breast Pump', brand: 'Spectra', category: 'pumps', url: 'https://spectra-baby.com/', description: 'Hospital-grade closed system pump with rechargeable battery. Highly recommended by LCs.', priceRange: '$$' },
  { id: 'medela_maxflow', name: 'Pump In Style Max Flow', brand: 'Medela', category: 'pumps', url: 'https://www.medela.us/', description: 'Portable electric pump with MaxFlow technology for more milk in less time. Rechargeable.', priceRange: '$$' },
  { id: 'elvie_stride', name: 'Stride', brand: 'Elvie', category: 'pumps', url: 'https://www.elvie.com/', description: 'Hands-free wearable double pump. Pairs with app for tracking. Hospital-grade suction.', priceRange: '$$$' },
  { id: 'willow_go', name: 'Willow Go', brand: 'Willow', category: 'pumps', url: 'https://www.willowpump.com/', description: 'In-bra wearable pump — no tubes, totally hands-free. Works with regular milk bags.', priceRange: '$$$' },
  { id: 'momcozy_s12', name: 'S12 Pro Wearable Breast Pump', brand: 'Momcozy', category: 'pumps', url: 'https://momcozy.com/', description: 'Budget-friendly wearable pump with 9 suction levels and LCD display. Popular for on-the-go.', priceRange: '$' },
  { id: 'haakaa_silicone', name: 'Silicone Breast Pump', brand: 'Haakaa', category: 'pumps', url: 'https://www.haakaa.co.nz/', description: 'Passive suction manual pump — attaches to opposite breast while nursing to catch letdown.', priceRange: '$' },

  // Carriers
  { id: 'ergobaby_omni', name: 'Omni 360', brand: 'Ergobaby', category: 'carriers', url: 'https://ergobaby.com/', description: 'All-position soft structured carrier — front-in, front-out, hip, and back carry from newborn.', priceRange: '$$$' },
  { id: 'solly_wrap', name: 'Baby Wrap', brand: 'Solly Baby', category: 'carriers', url: 'https://sollybaby.com/', description: 'Ultra-lightweight TENCEL wrap. Stretchy and breathable, ideal for newborns.', priceRange: '$$' },
  { id: 'moby_wrap', name: 'Classic Wrap', brand: 'Moby', category: 'carriers', url: 'https://mobywrap.com/', description: 'Stretchy cotton wrap for newborn through 33 lbs. Machine washable.', priceRange: '$' },
  { id: 'babybjorn_one', name: 'One Air', brand: 'BabyBjörn', category: 'carriers', url: 'https://www.babybjorn.com/', description: 'Mesh carrier for all seasons — face-in, face-out, back carry. No infant insert needed.', priceRange: '$$$' },
  { id: 'lillebaby_complete', name: 'Complete All Seasons', brand: 'LÍLLÉbaby', category: 'carriers', url: 'https://lillebaby.com/', description: '6-position carrier with lumbar support and breathable panel. Great for all seasons.', priceRange: '$$' },

  // Sleep
  { id: 'snoo', name: 'SNOO Smart Sleeper', brand: 'Happiest Baby', category: 'sleep', url: 'https://www.happiestbaby.com/', description: 'Responsive bassinet that automatically soothes baby with motion and sound. Can rent for ~$100/mo.', priceRange: '$$$$' },
  { id: 'halo_bassinest', name: 'BassiNest Swivel Sleeper', category: 'sleep', brand: 'HALO', url: 'https://halo.com/', description: 'Swivels 360° to bring baby to bedside. Sidewall drops for easy access.', priceRange: '$$' },
  { id: 'mamaroo_sleep', name: 'MamaRoo Sleep Bassinet', brand: '4moms', category: 'sleep', url: 'https://www.4moms.com/', description: 'Bluetooth-enabled bassinet with 5 motions, 4 sounds, and a sleep tracker.', priceRange: '$$$' },
  { id: 'newton_mattress', name: 'Original Crib Mattress', brand: 'Newton', category: 'sleep', url: 'https://www.newtonbaby.com/', description: '100% breathable, washable mattress. Unique Wovenaire® core — passes breathability test.', priceRange: '$$$' },
  { id: 'yogasleep_dohm', name: 'Dohm Classic', brand: 'Yogasleep', category: 'sleep', url: 'https://yogasleep.com/', description: 'Original white noise machine with real fan — customizable tone and volume. Not a loop.', priceRange: '$' },
  { id: 'graco_dream', name: 'Dream Suite Bassinet', brand: 'Graco', category: 'sleep', url: 'https://www.gracobaby.com/', description: '2-in-1 bassinet and changer with vibration and sounds. Folds for travel.', priceRange: '$' },

  // Diapering
  { id: 'ubbi_pail', name: 'Steel Diaper Pail', brand: 'Ubbi', category: 'diapering', url: 'https://ubbi.com/', description: 'Stainless steel locks in odor without baking soda cartridges. Uses regular tall kitchen bags.', priceRange: '$$' },
  { id: 'diaper_dekor', name: 'Diaper Dekor Plus', brand: 'Diaper Dekor', category: 'diapering', url: 'https://www.diaperdekor.com/', description: 'Hands-free step to open, continuous liner — never step back. Strong odor control.', priceRange: '$' },
  { id: 'waterwipes', name: 'Original Baby Wipes', brand: 'WaterWipes', category: 'diapering', url: 'https://www.waterwipes.com/', description: '99.9% purified water — nothing else. Ideal for newborn sensitive skin.', priceRange: '$' },
  { id: 'honest_diapers', name: 'Clean Conscious Diapers', brand: 'The Honest Company', category: 'diapering', url: 'https://www.honest.com/', description: 'Plant-based, hypoallergenic diapers with fun prints. No harmful additives.', priceRange: '$$' },
  { id: 'keekaroo_changer', name: 'Peanut Changer', brand: 'Keekaroo', category: 'diapering', url: 'https://keekaroo.com/', description: 'Wipe-clean changing pad with contoured shape — no cover needed. Lifetime warranty.', priceRange: '$$' },

  // Bath
  { id: 'stokke_flexi', name: 'Flexi Bath XL', brand: 'Stokke', category: 'bath', url: 'https://www.stokke.com/', description: 'Foldable tub that grows from newborn sling to toddler. Compact when stored.', priceRange: '$$' },
  { id: 'frida_tub', name: '4-in-1 Grow-with-Me Bath Tub', brand: 'Frida Baby', category: 'bath', url: 'https://fridababy.com/', description: 'Newborn insert, infant sling, toddler seat, and stepping stool all in one tub.', priceRange: '$' },
  { id: 'primo_euro_spa', name: 'Euro Spa & Shower', brand: 'Primo', category: 'bath', url: 'https://www.primobaby.com/', description: 'Large tub with temperature-sensing drain and built-in seat. Fits inside adult tub.', priceRange: '$' },
  { id: 'frida_nosebulb', name: 'NoseFrida Snotsucker', brand: 'Frida Baby', category: 'bath', url: 'https://fridababy.com/', description: 'Parent-powered nasal aspirator — more effective than bulb syringes for clearing congestion.', priceRange: '$' },

  // Swings & Bouncers
  { id: 'mamaroo_swing', name: 'MamaRoo Multi-Motion Swing', brand: '4moms', category: 'gear', url: 'https://www.4moms.com/', description: '5 unique motions, Bluetooth app control, and 4 speeds. Works from birth to 25 lbs.', priceRange: '$$$' },
  { id: 'babybjorn_bouncer', name: 'Bouncer Balance Soft', brand: 'BabyBjörn', category: 'gear', url: 'https://www.babybjorn.com/', description: 'Ergonomic bouncer powered by baby\'s own movement. Works from newborn to 2 years.', priceRange: '$$$' },
  { id: 'fisher_rocker', name: 'Infant-to-Toddler Rocker', brand: 'Fisher-Price', category: 'gear', url: 'https://www.fisher-price.com/', description: 'Vibrating seat with removable toy bar. Reclines for newborns, sits up for toddlers.', priceRange: '$' },
  { id: 'graco_glider', name: 'Soothing System Glider', brand: 'Graco', category: 'gear', url: 'https://www.gracobaby.com/', description: 'Gliding swing motion with 6 speeds, 15 music/nature sounds, and plug-in option.', priceRange: '$$' },
  { id: 'ingenuity_boutique', name: 'Boutique Collection Swing', brand: 'Ingenuity', category: 'gear', url: 'https://ingenuity-baby.com/', description: 'Converts from swing to stationary seat. 6 speeds, 8 melodies, auto shut-off.', priceRange: '$' },

  // Postpartum
  { id: 'frida_recovery', name: 'Postpartum Recovery Kit', brand: 'Frida Mom', category: 'postpartum', url: 'https://fridababy.com/', description: 'Perineal foam, cooling pad liners, perineal spray, disposable underwear — complete recovery kit.', priceRange: '$' },
  { id: 'earth_mama_nipple', name: 'Organic Nipple Butter', brand: 'Earth Mama', category: 'postpartum', url: 'https://earthmamaorganics.com/', description: 'USDA-certified organic. Lanolin-free, safe for baby, no need to wipe off before nursing.', priceRange: '$' },
  { id: 'lansinoh_lanolin', name: 'Lanolin Nipple Cream', brand: 'Lansinoh', category: 'postpartum', url: 'https://www.lansinoh.com/', description: 'HPA Lanolin — the gold standard for sore nipples. Safe for baby, no need to remove.', priceRange: '$' },
  { id: 'kindred_bravely_robe', name: 'Labor & Delivery Robe', brand: 'Kindred Bravely', category: 'postpartum', url: 'https://www.kindredbravely.com/', description: 'Hospital-friendly robe with snaps for skin-to-skin and IV access. Nursing-friendly too.', priceRange: '$$' },
  { id: 'belly_bandit', name: 'Postpartum Belly Wrap', brand: 'Belly Bandit', category: 'postpartum', url: 'https://www.bellybandit.com/', description: 'Compression wrap supports core recovery after vaginal or C-section delivery.', priceRange: '$$' },
  { id: 'medela_softcup', name: 'Soft Shells for Sore Nipples', brand: 'Medela', category: 'postpartum', url: 'https://www.medela.us/', description: 'Worn inside bra to protect tender nipples from fabric contact. Allows air circulation.', priceRange: '$' },
];

// ─── Supabase types ───────────────────────────────────────────────────────────

type Vote = 1 | -1;

interface ProductReview {
  id: string;
  product_id: string;
  user_id: string;
  author: string;
  sentiment: 'loved' | 'mixed' | 'didnt_love';
  content: string;
  rating_value: number | null;
  rating_usability: number | null;
  rating_quality: number | null;
  created_at: string;
}

interface AvgRatings {
  value: number;
  usability: number;
  quality: number;
  count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRICE_LABEL: Record<string, string> = { '$': 'Budget-friendly', '$$': 'Mid-range', '$$$': 'Premium', '$$$$': 'Luxury' };

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function avg(n: number, count: number) {
  return count === 0 ? 0 : Math.round((n / count) * 10) / 10;
}

const SENTIMENT_CONFIG = {
  loved:      { label: '👍 Loved it',       bg: '#D1FAE5', border: '#059669', text: '#065F46' },
  mixed:      { label: '🤷 Mixed feelings',  bg: '#FEF3C7', border: '#D97706', text: '#92400E' },
  didnt_love: { label: "👎 Didn't love it",  bg: '#FEE2E2', border: '#EF4444', text: '#991B1B' },
};

const RATING_DIMS = [
  { key: 'rating_value',     label: 'Value for Money', emoji: '💰' },
  { key: 'rating_usability', label: 'Ease of Use',     emoji: '⚙️'  },
  { key: 'rating_quality',   label: 'Quality',         emoji: '🏆' },
] as const;
type RatingKey = typeof RATING_DIMS[number]['key'];

// ─── Star components ──────────────────────────────────────────────────────────

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <TouchableOpacity key={n} onPress={() => onChange(n)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
          <Text style={{ fontSize: 26, color: n <= value ? '#F59E0B' : '#D1D5DB' }}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function StarDisplay({ value, size = 13 }: { value: number; size?: number }) {
  const full  = Math.floor(value);
  const empty = 5 - full;
  return (
    <Text style={{ fontSize: size, color: '#F59E0B', letterSpacing: 1 }}>
      {'★'.repeat(full)}{'☆'.repeat(empty)}
    </Text>
  );
}

// ─── Request modal ────────────────────────────────────────────────────────────

function RequestModal({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const c = useColors();
  const s = requestModalStyles(c);
  const [productName, setProductName] = useState('');
  const [brand,       setBrand]       = useState('');
  const [catId,       setCatId]       = useState('');
  const [url,         setUrl]         = useState('');
  const [notes,       setNotes]       = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  async function submit() {
    if (!productName.trim()) { Alert.alert('Product name required'); return; }
    if (!brand.trim())       { Alert.alert('Brand required'); return; }
    if (!catId)              { Alert.alert('Please select a category'); return; }
    if (!userId)             { Alert.alert('Sign in to submit a request'); return; }

    setSubmitting(true);
    const { data: profile } = await supabase.from('profiles').select('display_name, username').eq('id', userId).single();
    const author = profile?.display_name || profile?.username || 'Anonymous';

    const { error } = await supabase.from('product_requests').insert({
      user_id: userId, author,
      product_name: productName.trim(),
      brand: brand.trim(),
      category: catId,
      url: url.trim() || null,
      notes: notes.trim() || null,
    });

    setSubmitting(false);
    if (error) { Alert.alert('Could not submit', error.message); return; }
    Alert.alert('Request submitted! 🎉', "We'll review your suggestion and add it soon.", [
      { text: 'OK', onPress: onClose },
    ]);
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Request a Product</Text>
          <TouchableOpacity onPress={submit} disabled={submitting} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            {submitting
              ? <ActivityIndicator size="small" color={c.primary} />
              : <Text style={s.submit}>Submit</Text>}
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            <View style={s.banner}>
              <Text style={s.bannerText}>Don't see a product you love? Request it and we'll add it to the catalog!</Text>
            </View>

            <Text style={s.label}>Product name *</Text>
            <TextInput style={s.input} value={productName} onChangeText={setProductName}
              placeholder="e.g. Boppy Original Nursing Pillow" placeholderTextColor={c.textMuted} />

            <Text style={s.label}>Brand *</Text>
            <TextInput style={s.input} value={brand} onChangeText={setBrand}
              placeholder="e.g. Boppy" placeholderTextColor={c.textMuted} />

            <Text style={s.label}>Category *</Text>
            <View style={s.catGrid}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[s.catChip, catId === cat.id && s.catChipActive]}
                  onPress={() => setCatId(cat.id)}
                  activeOpacity={0.75}
                >
                  <Text style={s.catChipEmoji}>{cat.emoji}</Text>
                  <Text style={[s.catChipText, catId === cat.id && s.catChipTextActive]}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Website URL (optional)</Text>
            <TextInput style={s.input} value={url} onChangeText={setUrl}
              placeholder="https://…" placeholderTextColor={c.textMuted}
              keyboardType="url" autoCapitalize="none" />

            <Text style={s.label}>Why should we add it? (optional)</Text>
            <TextInput style={[s.input, s.multiInput]} value={notes} onChangeText={setNotes}
              placeholder="Tell us what makes it great…"
              placeholderTextColor={c.textMuted} multiline textAlignVertical="top" />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Reviews modal ────────────────────────────────────────────────────────────

function ReviewsModal({
  product, userId, onClose,
}: {
  product: Product; userId: string | null; onClose: () => void;
}) {
  const c = useColors();
  const s = reviewModalStyles(c);
  const [reviews,    setReviews]    = useState<ProductReview[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [sentiment,  setSentiment]  = useState<'loved' | 'mixed' | 'didnt_love'>('loved');
  const [content,    setContent]    = useState('');
  const [ratings,    setRatings]    = useState<Record<RatingKey, number>>({ rating_value: 0, rating_usability: 0, rating_quality: 0 });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('product_reviews')
      .select('*')
      .eq('product_id', product.id)
      .order('created_at', { ascending: false });
    setReviews((data ?? []) as ProductReview[]);
    setLoading(false);
  }, [product.id]);

  React.useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!content.trim()) { Alert.alert('Write something first'); return; }
    if (!userId) { Alert.alert('Sign in to leave a review'); return; }
    setSubmitting(true);

    const { data: profile } = await supabase.from('profiles').select('display_name, username').eq('id', userId).single();
    const author = profile?.display_name || profile?.username || 'Anonymous';

    const { data, error } = await supabase.from('product_reviews').insert({
      product_id: product.id,
      user_id: userId,
      author,
      sentiment,
      content: content.trim(),
      rating_value:     ratings.rating_value     || null,
      rating_usability: ratings.rating_usability || null,
      rating_quality:   ratings.rating_quality   || null,
    }).select().single();

    setSubmitting(false);
    if (error) { Alert.alert('Could not post review', error.message); return; }
    setReviews(prev => [data as ProductReview, ...prev]);
    setContent('');
    setRatings({ rating_value: 0, rating_usability: 0, rating_quality: 0 });
    setShowForm(false);
  }

  async function deleteReview(review: ProductReview) {
    Alert.alert('Delete review', 'Remove your review?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('product_reviews').delete().eq('id', review.id);
          setReviews(prev => prev.filter(r => r.id !== review.id));
        },
      },
    ]);
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.close}>✕</Text>
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle} numberOfLines={1}>{product.name}</Text>
            <Text style={s.headerBrand}>{product.brand}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowForm(v => !v)} style={s.addBtn}>
            <Text style={s.addBtnText}>{showForm ? 'Cancel' : '+ Review'}</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            {/* Add review form */}
            {showForm && (
              <View style={s.form}>
                <Text style={s.formLabel}>How do you feel about it?</Text>
                <View style={s.sentimentRow}>
                  {(Object.keys(SENTIMENT_CONFIG) as Array<keyof typeof SENTIMENT_CONFIG>).map(key => {
                    const cfg = SENTIMENT_CONFIG[key];
                    const active = sentiment === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[s.sentimentChip, { borderColor: cfg.border, backgroundColor: active ? cfg.bg : 'transparent' }]}
                        onPress={() => setSentiment(key)}
                        activeOpacity={0.75}
                      >
                        <Text style={[s.sentimentText, { color: active ? cfg.text : c.textMuted }]}>{cfg.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={s.formLabel}>Rate it</Text>
                {RATING_DIMS.map(dim => (
                  <View key={dim.key} style={s.ratingRow}>
                    <Text style={s.ratingDimLabel}>{dim.emoji} {dim.label}</Text>
                    <StarPicker
                      value={ratings[dim.key]}
                      onChange={v => setRatings(prev => ({ ...prev, [dim.key]: v }))}
                    />
                  </View>
                ))}

                <Text style={[s.formLabel, { marginTop: 8 }]}>Tell other moms about it</Text>
                <TextInput
                  style={s.textArea}
                  value={content}
                  onChangeText={setContent}
                  placeholder="What did you like or dislike? Would you recommend it? Any tips?"
                  placeholderTextColor={c.textMuted}
                  multiline
                  textAlignVertical="top"
                />
                <TouchableOpacity style={s.submitBtn} onPress={submit} disabled={submitting} activeOpacity={0.8}>
                  {submitting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.submitText}>Post Review</Text>}
                </TouchableOpacity>
              </View>
            )}

            {/* Reviews list */}
            {loading ? (
              <ActivityIndicator color={c.primary} style={{ marginTop: 32 }} />
            ) : reviews.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyEmoji}>💬</Text>
                <Text style={s.emptyTitle}>No reviews yet</Text>
                <Text style={s.emptyBody}>Be the first to share your experience!</Text>
              </View>
            ) : (
              reviews.map(review => {
                const cfg = SENTIMENT_CONFIG[review.sentiment];
                const isOwn = review.user_id === userId;
                return (
                  <View key={review.id} style={s.reviewCard}>
                    <View style={s.reviewHeader}>
                      <View style={[s.sentimentBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                        <Text style={[s.sentimentBadgeText, { color: cfg.text }]}>{cfg.label}</Text>
                      </View>
                      {isOwn && (
                        <TouchableOpacity onPress={() => deleteReview(review)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={s.deleteBtn}>Delete</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {(review.rating_value || review.rating_usability || review.rating_quality) ? (
                      <View style={s.reviewRatings}>
                        {RATING_DIMS.map(dim => {
                          const val = review[dim.key as keyof ProductReview] as number | null;
                          if (!val) return null;
                          return (
                            <View key={dim.key} style={s.reviewRatingRow}>
                              <Text style={s.reviewRatingLabel}>{dim.emoji} {dim.label}</Text>
                              <StarDisplay value={val} />
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                    <Text style={s.reviewContent}>{review.content}</Text>
                    <Text style={s.reviewMeta}>— {review.author} · {timeAgo(review.created_at)}</Text>
                  </View>
                );
              })
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Product card ─────────────────────────────────────────────────────────────

function ProductCard({
  product, upvotes, downvotes, userVote, reviewCount, avgRatings,
  onUpvote, onDownvote, onReviews,
}: {
  product: Product;
  upvotes: number; downvotes: number; userVote: Vote | null; reviewCount: number;
  avgRatings: AvgRatings | null;
  onUpvote: () => void; onDownvote: () => void; onReviews: () => void;
}) {
  const c = useColors();
  const s = productCardStyles(c);

  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={s.cardBody}>
          <Text style={s.name}>{product.name}</Text>
          <Text style={s.brand}>{product.brand}</Text>
          <View style={s.priceRow}>
            <Text style={s.priceRange}>{product.priceRange}</Text>
            <Text style={s.priceLabel}>{PRICE_LABEL[product.priceRange]}</Text>
          </View>
          <Text style={s.description} numberOfLines={2}>{product.description}</Text>
        </View>
      </View>

      {avgRatings && avgRatings.count > 0 && (
        <View style={s.ratingsRow}>
          {([
            { emoji: '💰', val: avgRatings.value },
            { emoji: '⚙️',  val: avgRatings.usability },
            { emoji: '🏆', val: avgRatings.quality },
          ]).map(({ emoji, val }, i) => val > 0 ? (
            <View key={i} style={s.ratingChip}>
              <Text style={s.ratingChipEmoji}>{emoji}</Text>
              <StarDisplay value={val} size={11} />
              <Text style={s.ratingChipNum}>{val.toFixed(1)}</Text>
            </View>
          ) : null)}
          <Text style={s.ratingChipCount}>({avgRatings.count} review{avgRatings.count !== 1 ? 's' : ''})</Text>
        </View>
      )}

      <View style={s.actions}>
        {/* Upvote */}
        <TouchableOpacity
          style={[s.voteBtn, userVote === 1 && s.voteBtnUpActive]}
          onPress={onUpvote}
          activeOpacity={0.75}
        >
          <Text style={[s.voteArrow, userVote === 1 && s.voteArrowUpActive]}>👍</Text>
          <Text style={[s.voteCount, userVote === 1 && s.voteCountUpActive]}>{upvotes}</Text>
        </TouchableOpacity>

        {/* Downvote */}
        <TouchableOpacity
          style={[s.voteBtn, userVote === -1 && s.voteBtnDownActive]}
          onPress={onDownvote}
          activeOpacity={0.75}
        >
          <Text style={[s.voteArrow, userVote === -1 && s.voteArrowDownActive]}>👎</Text>
          <Text style={[s.voteCount, userVote === -1 && s.voteCountDownActive]}>{downvotes}</Text>
        </TouchableOpacity>

        {/* Reviews */}
        <TouchableOpacity style={s.reviewsBtn} onPress={onReviews} activeOpacity={0.75}>
          <Text style={s.reviewsBtnText}>💬 {reviewCount > 0 ? `${reviewCount} review${reviewCount !== 1 ? 's' : ''}` : 'Reviews'}</Text>
        </TouchableOpacity>

        {/* Website */}
        <TouchableOpacity
          style={s.linkBtn}
          onPress={() => Linking.openURL(product.url)}
          activeOpacity={0.75}
        >
          <Text style={s.linkBtnText}>🔗 Website</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProductReviewsScreen({ onBack }: { onBack: () => void }) {
  const c = useColors();
  const s = styles(c);

  const [userId,         setUserId]         = useState<string | null>(null);
  const [selectedCat,   setSelectedCat]    = useState<string | null>(null);
  const [query,         setQuery]          = useState('');
  const [votes,         setVotes]          = useState<Record<string, { up: number; down: number; mine: Vote | null }>>({});
  const [reviewCounts,  setReviewCounts]   = useState<Record<string, number>>({});
  const [avgRatings,    setAvgRatings]     = useState<Record<string, AvgRatings>>({});
  const [loadingVotes,  setLoadingVotes]   = useState(false);
  const [reviewProduct, setReviewProduct]  = useState<Product | null>(null);
  const [showRequest,   setShowRequest]    = useState(false);

  // ── Init ──────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  // ── Load votes + review counts for a category ─────────────────────────────

  const loadCategoryData = useCallback(async (catId: string) => {
    setLoadingVotes(true);
    const ids = PRODUCTS.filter(p => p.category === catId).map(p => p.id);
    if (!ids.length) { setLoadingVotes(false); return; }

    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id ?? null;
    if (uid) setUserId(uid);

    const [votesRes, reviewsRes] = await Promise.all([
      supabase.from('product_votes').select('product_id, user_id, vote').in('product_id', ids),
      supabase.from('product_reviews')
        .select('product_id, rating_value, rating_usability, rating_quality')
        .in('product_id', ids),
    ]);

    const voteMap: Record<string, { up: number; down: number; mine: Vote | null }> = {};
    const countMap: Record<string, number> = {};
    const ratingAccum: Record<string, { value: number; usability: number; quality: number; count: number }> = {};

    for (const id of ids) {
      voteMap[id]     = { up: 0, down: 0, mine: null };
      countMap[id]    = 0;
      ratingAccum[id] = { value: 0, usability: 0, quality: 0, count: 0 };
    }
    for (const v of (votesRes.data ?? []) as any[]) {
      if (!voteMap[v.product_id]) continue;
      if (v.vote === 1)  voteMap[v.product_id].up++;
      if (v.vote === -1) voteMap[v.product_id].down++;
      if (v.user_id === uid) voteMap[v.product_id].mine = v.vote as Vote;
    }
    for (const r of (reviewsRes.data ?? []) as any[]) {
      countMap[r.product_id] = (countMap[r.product_id] ?? 0) + 1;
      const acc = ratingAccum[r.product_id];
      if (!acc) continue;
      if (r.rating_value)     acc.value     += r.rating_value;
      if (r.rating_usability) acc.usability += r.rating_usability;
      if (r.rating_quality)   acc.quality   += r.rating_quality;
      acc.count++;
    }

    const avgMap: Record<string, AvgRatings> = {};
    for (const id of ids) {
      const a = ratingAccum[id];
      avgMap[id] = {
        value:     avg(a.value,     a.count),
        usability: avg(a.usability, a.count),
        quality:   avg(a.quality,   a.count),
        count:     a.count,
      };
    }

    setVotes(prev => ({ ...prev, ...voteMap }));
    setReviewCounts(prev => ({ ...prev, ...countMap }));
    setAvgRatings(prev => ({ ...prev, ...avgMap }));
    setLoadingVotes(false);
  }, []);

  // ── Vote ──────────────────────────────────────────────────────────────────

  async function castVote(product: Product, direction: Vote) {
    if (!userId) { Alert.alert('Sign in to vote'); return; }
    const current = votes[product.id] ?? { up: 0, down: 0, mine: null };
    const isSame = current.mine === direction;
    const newVote = isSame ? null : direction;

    // Optimistic
    setVotes(prev => {
      const entry = prev[product.id] ?? { up: 0, down: 0, mine: null };
      let up   = entry.up;
      let down = entry.down;
      if (entry.mine === 1)  up--;
      if (entry.mine === -1) down--;
      if (newVote === 1)  up++;
      if (newVote === -1) down++;
      return { ...prev, [product.id]: { up, down, mine: newVote } };
    });

    if (isSame) {
      await supabase.from('product_votes').delete().eq('product_id', product.id).eq('user_id', userId);
    } else {
      await supabase.from('product_votes').upsert({ product_id: product.id, user_id: userId, vote: direction }, { onConflict: 'product_id,user_id' });
    }
  }

  // ── Search ────────────────────────────────────────────────────────────────

  const isSearching = query.trim().length > 0;
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = query.toLowerCase();
    return PRODUCTS.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      CATEGORIES.find(c => c.id === p.category)?.name.toLowerCase().includes(q)
    );
  }, [query, isSearching]);

  // ── Category products ─────────────────────────────────────────────────────

  const categoryProducts = selectedCat
    ? PRODUCTS.filter(p => p.category === selectedCat)
    : [];
  const selectedCategory = CATEGORIES.find(c => c.id === selectedCat);

  // Open category
  function openCategory(catId: string) {
    setSelectedCat(catId);
    loadCategoryData(catId);
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderProduct(product: Product) {
    const v = votes[product.id] ?? { up: 0, down: 0, mine: null };
    return (
      <ProductCard
        key={product.id}
        product={product}
        upvotes={v.up}
        downvotes={v.down}
        userVote={v.mine}
        reviewCount={reviewCounts[product.id] ?? 0}
        avgRatings={avgRatings[product.id] ?? null}
        onUpvote={() => castVote(product, 1)}
        onDownvote={() => castVote(product, -1)}
        onReviews={() => {
          setReviewProduct(product);
          // Load this product's data if not yet loaded
          if (!(product.id in votes)) {
            supabase.from('product_votes').select('product_id, user_id, vote').eq('product_id', product.id)
              .then(({ data }) => {
                let up = 0, down = 0, mine: Vote | null = null;
                for (const v of (data ?? []) as any[]) {
                  if (v.vote === 1) up++;
                  if (v.vote === -1) down++;
                  if (v.user_id === userId) mine = v.vote;
                }
                setVotes(prev => ({ ...prev, [product.id]: { up, down, mine } }));
              });
            supabase.from('product_reviews').select('product_id', { count: 'exact', head: true }).eq('product_id', product.id)
              .then(({ count }) => setReviewCounts(prev => ({ ...prev, [product.id]: count ?? 0 })));
          }
        }}
      />
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => {
            if (selectedCat && !isSearching) { setSelectedCat(null); return; }
            onBack();
          }}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>{selectedCat && !isSearching ? 'All Categories' : 'Resources'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={s.pageTitle}>⭐ Product Reviews</Text>
        <Text style={s.pageSubtitle}>Community-rated baby gear — upvote, downvote, and share your thoughts</Text>

        {/* Search */}
        <View style={s.searchRow}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={text => { setQuery(text); setSelectedCat(null); }}
            placeholder="Search products, brands, or categories…"
            placeholderTextColor={c.textMuted}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Search results */}
        {isSearching ? (
          searchResults.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>🔍</Text>
              <Text style={s.emptyTitle}>No results for "{query}"</Text>
              <Text style={s.emptyBody}>Try a brand name, product type, or category.</Text>
            </View>
          ) : (
            <>
              <Text style={s.resultsLabel}>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</Text>
              {searchResults.map(p => renderProduct(p))}
            </>
          )
        ) : selectedCat ? (
          /* Category product list */
          <>
            <Text style={s.catHeading}>{selectedCategory?.emoji} {selectedCategory?.name}</Text>
            {loadingVotes
              ? <ActivityIndicator color={c.primary} style={{ marginTop: 20 }} />
              : categoryProducts.map(p => renderProduct(p))
            }
          </>
        ) : (
          /* Category grid */
          <>
            <View style={s.grid}>
              {CATEGORIES.map(cat => {
                const count = PRODUCTS.filter(p => p.category === cat.id).length;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={s.catCard}
                    onPress={() => openCategory(cat.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.catEmoji}>{cat.emoji}</Text>
                    <Text style={s.catName}>{cat.name}</Text>
                    <Text style={s.catCount}>{count} products</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={s.requestBtn} onPress={() => setShowRequest(true)} activeOpacity={0.8}>
              <Text style={s.requestBtnEmoji}>✨</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.requestBtnTitle}>Don't see your product?</Text>
                <Text style={s.requestBtnSub}>Request it and we'll add it to the catalog</Text>
              </View>
              <Text style={s.requestBtnArrow}>›</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {showRequest && (
        <RequestModal userId={userId} onClose={() => setShowRequest(false)} />
      )}

      {reviewProduct && (
        <ReviewsModal
          product={reviewProduct}
          userId={userId}
          onClose={() => {
            // Refresh review count for this product
            supabase.from('product_reviews').select('product_id', { count: 'exact', head: true }).eq('product_id', reviewProduct.id)
              .then(({ count }) => setReviewCounts(prev => ({ ...prev, [reviewProduct.id]: count ?? 0 })));
            setReviewProduct(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (c: Colors) =>
  StyleSheet.create({
    container:    { flex: 1, backgroundColor: c.bg },
    header:       { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
    backBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backArrow:    { fontSize: 20, color: c.textSecondary, fontWeight: '700' },
    backLabel:    { fontSize: 15, color: c.textSecondary, fontWeight: '700' },
    scroll:       { padding: 20, paddingBottom: 48 },
    pageTitle:    { fontSize: 26, fontWeight: '800', color: c.textPrimary, marginBottom: 6 },
    pageSubtitle: { fontSize: 14, color: c.textMuted, fontWeight: '500', marginBottom: 18 },

    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.card, borderRadius: 12, borderWidth: 1,
      borderColor: c.separator, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 20,
    },
    searchIcon:  { fontSize: 15 },
    searchInput: { flex: 1, fontSize: 15, color: c.textPrimary, fontWeight: '500' },
    searchClear: { fontSize: 14, color: c.textMuted, fontWeight: '700' },

    grid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    catCard: {
      width: '47%', backgroundColor: c.card, borderRadius: 16,
      borderWidth: 1, borderColor: c.separator, padding: 16, alignItems: 'center', gap: 6,
    },
    catEmoji: { fontSize: 32 },
    catName:  { fontSize: 14, fontWeight: '800', color: c.textPrimary, textAlign: 'center' },
    catCount: { fontSize: 12, color: c.textMuted, fontWeight: '500' },

    catHeading:   { fontSize: 20, fontWeight: '800', color: c.textPrimary, marginBottom: 16 },
    resultsLabel: { fontSize: 13, color: c.textMuted, fontWeight: '600', marginBottom: 12 },

    requestBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      marginTop: 16, backgroundColor: c.card, borderRadius: 16,
      borderWidth: 1.5, borderColor: c.primary, borderStyle: 'dashed',
      padding: 16,
    },
    requestBtnEmoji: { fontSize: 22 },
    requestBtnTitle: { fontSize: 14, fontWeight: '800', color: c.primary },
    requestBtnSub:   { fontSize: 12, color: c.textMuted, fontWeight: '500', marginTop: 2 },
    requestBtnArrow: { fontSize: 22, color: c.primary, fontWeight: '700' },

    empty:      { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
    emptyBody:  { fontSize: 13, color: c.textMuted, fontWeight: '500', textAlign: 'center' },
  });

const productCardStyles = (c: Colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.card, borderRadius: 16, borderWidth: 1,
      borderColor: c.separator, padding: 16, marginBottom: 12, gap: 14,
    },
    cardTop:     { flexDirection: 'row', gap: 12 },
    cardBody:    { flex: 1, gap: 4 },
    name:        { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    brand:       { fontSize: 13, color: c.textMuted, fontWeight: '600' },
    priceRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    priceRange:  { fontSize: 13, fontWeight: '800', color: c.honey },
    priceLabel:  { fontSize: 12, color: c.textMuted, fontWeight: '500' },
    description: { fontSize: 13, color: c.textSecondary, fontWeight: '500', lineHeight: 18, marginTop: 2 },
    actions:     { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    voteBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderWidth: 1.5, borderColor: c.separator, borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 7, backgroundColor: c.bgAlt,
    },
    voteBtnUpActive:   { borderColor: '#059669', backgroundColor: '#D1FAE5' },
    voteBtnDownActive: { borderColor: '#EF4444', backgroundColor: '#FEE2E2' },
    voteArrow:         { fontSize: 14 },
    voteArrowUpActive:   { },
    voteArrowDownActive: { },
    voteCount:           { fontSize: 13, fontWeight: '800', color: c.textMuted },
    voteCountUpActive:   { color: '#059669' },
    voteCountDownActive: { color: '#EF4444' },
    reviewsBtn: {
      flexDirection: 'row', alignItems: 'center',
      borderWidth: 1.5, borderColor: c.separator, borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 7, backgroundColor: c.bgAlt,
    },
    reviewsBtnText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    linkBtn: {
      flexDirection: 'row', alignItems: 'center',
      borderWidth: 1.5, borderColor: c.primary, borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 7, backgroundColor: c.cardLavender,
    },
    linkBtnText: { fontSize: 13, fontWeight: '700', color: c.primary },

    ratingsRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    ratingChip:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
    ratingChipEmoji: { fontSize: 11 },
    ratingChipNum: { fontSize: 11, fontWeight: '700', color: c.textMuted },
    ratingChipCount: { fontSize: 11, color: c.textMuted, fontWeight: '500' },
  });

const reviewModalStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    close:        { fontSize: 18, color: c.textMuted, fontWeight: '700' },
    headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
    headerTitle:  { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    headerBrand:  { fontSize: 12, color: c.textMuted, fontWeight: '500' },
    addBtn:       { backgroundColor: c.cardLavender, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
    addBtnText:   { fontSize: 13, fontWeight: '800', color: c.primary },
    body:         { padding: 20, gap: 12, paddingBottom: 48 },

    form:        { backgroundColor: c.card, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: c.separator },
    formLabel:   { fontSize: 13, fontWeight: '800', color: c.textMuted },
    sentimentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    sentimentChip: { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 8 },
    sentimentText: { fontSize: 12, fontWeight: '700' },
    textArea: {
      backgroundColor: c.inputBg, borderRadius: 12, borderWidth: 1, borderColor: c.inputBorder,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: c.textPrimary,
      fontWeight: '500', minHeight: 90, textAlignVertical: 'top',
    },
    submitBtn: {
      backgroundColor: c.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    },
    submitText: { fontSize: 15, fontWeight: '800', color: '#fff' },

    empty:      { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyEmoji: { fontSize: 36 },
    emptyTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    emptyBody:  { fontSize: 13, color: c.textMuted, fontWeight: '500', textAlign: 'center' },

    ratingRow:      { gap: 4, marginBottom: 6 },
    ratingDimLabel: { fontSize: 13, fontWeight: '700', color: c.textSecondary },

    reviewRatings:   { gap: 4, marginBottom: 4 },
    reviewRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    reviewRatingLabel: { fontSize: 11, fontWeight: '600', color: c.textMuted, width: 110 },

    reviewCard: {
      backgroundColor: c.card, borderRadius: 14, borderWidth: 1,
      borderColor: c.separator, padding: 14, gap: 8,
    },
    reviewHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sentimentBadge:    { borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 4 },
    sentimentBadgeText:{ fontSize: 11, fontWeight: '800' },
    deleteBtn:         { fontSize: 13, color: '#EF4444', fontWeight: '700' },
    reviewContent:     { fontSize: 14, color: c.textPrimary, fontWeight: '500', lineHeight: 20 },
    reviewMeta:        { fontSize: 12, color: c.textMuted, fontWeight: '500' },
  });

const requestModalStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    cancel:      { fontSize: 16, color: c.textMuted, fontWeight: '600' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    submit:      { fontSize: 16, color: c.primary, fontWeight: '800' },
    body:        { padding: 20, gap: 10, paddingBottom: 48 },
    banner:      { backgroundColor: c.cardLavender, borderRadius: 12, padding: 14, marginBottom: 6 },
    bannerText:  { fontSize: 13, color: c.lavender, fontWeight: '600', lineHeight: 19 },
    label:       { fontSize: 13, fontWeight: '800', color: c.textMuted, marginTop: 6 },
    input: {
      backgroundColor: c.inputBg, borderRadius: 12, borderWidth: 1, borderColor: c.inputBorder,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.textPrimary, fontWeight: '500',
    },
    multiInput: { minHeight: 80, paddingTop: 12, textAlignVertical: 'top' },
    catGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    catChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      borderWidth: 1.5, borderColor: c.separator, borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.card,
    },
    catChipActive:    { borderColor: c.primary, backgroundColor: c.cardLavender },
    catChipEmoji:     { fontSize: 14 },
    catChipText:      { fontSize: 13, fontWeight: '700', color: c.textMuted },
    catChipTextActive:{ color: c.primary },
  });
