import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  Modal, Alert, ActivityIndicator, Linking, KeyboardAvoidingView, Platform, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';
import { COUNTRIES, STATES_BY_COUNTRY, CITIES_BY_STATE } from '../lib/villageData';

// ─── Categories ─────────────────────────────────────────────────────────────

interface Category {
  key: string;
  emoji: string;
  label: string;
}

const CATEGORIES: Category[] = [
  { key: 'pediatrician', emoji: '🩺', label: 'Pediatricians' },
  { key: 'obgyn',        emoji: '🤰', label: 'OB/GYN' },
  { key: 'midwife',      emoji: '👶', label: 'Midwives' },
  { key: 'doula',        emoji: '🌸', label: 'Doulas' },
  { key: 'lactation',    emoji: '🤱', label: 'Lactation Consultants' },
  { key: 'daycare',      emoji: '🏫', label: 'Daycare & Childcare' },
  { key: 'photographer', emoji: '📸', label: 'Newborn Photographers' },
  { key: 'dentist',      emoji: '🦷', label: 'Pediatric Dentists' },
  { key: 'therapist',    emoji: '🧠', label: 'Therapists & Counselors' },
  { key: 'chiro',        emoji: '💆', label: 'Chiro & Massage' },
  { key: 'classes',      emoji: '🎶', label: 'Baby & Toddler Classes' },
  { key: 'sleep',        emoji: '😴', label: 'Sleep Consultants' },
  { key: 'haircut',      emoji: '✂️', label: 'Kids Haircuts' },
  { key: 'other',        emoji: '📋', label: 'Other' },
];

const CAT_MAP: Record<string, Category> = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

// ─── Types ──────────────────────────────────────────────────────────────────

interface ServiceProvider {
  id: string;
  name: string;
  category: string;
  city: string;
  state: string | null;
  country: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  created_by: string | null;
  author: string | null;
  created_at: string;
}

interface ProviderReview {
  id: string;
  provider_id: string;
  user_id: string | null;
  author: string | null;
  rating: number;
  content: string | null;
  created_at: string;
}

interface Agg {
  avg: number;
  count: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const STAR_COLOR = '#F59E0B';

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <TouchableOpacity key={n} onPress={() => onChange(n)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
          <Text style={{ fontSize: 32, color: n <= value ? STAR_COLOR : '#D1D5DB' }}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function StarDisplay({ value, size = 14 }: { value: number; size?: number }) {
  const full  = Math.round(value);
  const empty = 5 - full;
  return (
    <Text style={{ fontSize: size, color: STAR_COLOR, letterSpacing: 1 }}>
      {'★'.repeat(full)}{'☆'.repeat(empty)}
    </Text>
  );
}

// ─── Picker modal (location) ────────────────────────────────────────────────

function PickerModal({
  visible, title, options, selected, onSelect, onClose, c,
}: {
  visible: boolean;
  title: string;
  options: string[];
  selected: string;
  onSelect: (v: string) => void;
  onClose: () => void;
  c: Colors;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20, paddingVertical: 16,
          borderBottomWidth: 1, borderBottomColor: c.separator,
        }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary }}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 18, color: c.textMuted }}>✕</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={options}
          keyExtractor={item => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => { onSelect(item); onClose(); }}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 20, paddingVertical: 16,
                borderBottomWidth: 1, borderBottomColor: c.separator,
                backgroundColor: selected === item ? c.cardBlush : 'transparent',
              }}
            >
              <Text style={{ fontSize: 15, color: c.textPrimary, fontWeight: selected === item ? '700' : '400' }}>
                {item}
              </Text>
              {selected === item && <Text style={{ color: c.primary, fontSize: 16 }}>✓</Text>}
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

function SelectBtn({ label, value, onPress, c }: { label: string; value: string; onPress: () => void; c: Colors }) {
  const hasValue = !!value;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5,
        borderColor: hasValue ? c.primary : c.separator,
        paddingHorizontal: 14, paddingVertical: 13, marginBottom: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, color: c.textMuted, fontWeight: '600', marginBottom: 2 }}>{label}</Text>
        <Text style={{ fontSize: 15, color: hasValue ? c.textPrimary : c.textMuted, fontWeight: hasValue ? '600' : '400' }}>
          {value || `Select ${label}`}
        </Text>
      </View>
      <Text style={{ fontSize: 18, color: c.textMuted }}>▾</Text>
    </TouchableOpacity>
  );
}

// ─── Reviews modal ──────────────────────────────────────────────────────────

function ReviewsModal({
  provider, userId, onClose, c,
}: {
  provider: ServiceProvider;
  userId: string | null;
  onClose: () => void;
  c: Colors;
}) {
  const s = reviewModalStyles(c);
  const [reviews, setReviews]   = useState<ProviderReview[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating]     = useState(0);
  const [content, setContent]   = useState('');
  const [submitting, setSubmitting] = useState(false);

  const cat = CAT_MAP[provider.category];

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('service_provider_reviews')
      .select('*')
      .eq('provider_id', provider.id)
      .order('created_at', { ascending: false });
    setReviews((data ?? []) as ProviderReview[]);
    setLoading(false);
  }, [provider.id]);

  React.useEffect(() => { load(); }, [load]);

  async function submit() {
    if (rating < 1) { Alert.alert('Add a rating', 'Tap the stars to rate this provider.'); return; }
    if (!userId)    { Alert.alert('Sign in to leave a review'); return; }
    setSubmitting(true);

    const { data: profile } = await supabase.from('profiles').select('display_name, username').eq('id', userId).single();
    const author = profile?.display_name || profile?.username || 'Anonymous';

    const { data, error } = await supabase.from('service_provider_reviews').insert({
      provider_id: provider.id,
      user_id: userId,
      author,
      rating,
      content: content.trim() || null,
    }).select().single();

    setSubmitting(false);
    if (error) { Alert.alert('Could not post review', error.message); return; }
    setReviews(prev => [data as ProviderReview, ...prev]);
    setRating(0);
    setContent('');
    setShowForm(false);
  }

  function deleteReview(review: ProviderReview) {
    Alert.alert('Delete review', 'Remove your review?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('service_provider_reviews').delete().eq('id', review.id);
          setReviews(prev => prev.filter(r => r.id !== review.id));
        },
      },
    ]);
  }

  const count = reviews.length;
  const avg = count ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.close}>✕</Text>
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle} numberOfLines={1}>{provider.name}</Text>
            <Text style={s.headerSub}>{cat ? `${cat.emoji} ${cat.label}` : ''} · {provider.city}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowForm(v => !v)} style={s.addBtn}>
            <Text style={s.addBtnText}>{showForm ? 'Cancel' : '+ Review'}</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            {/* Summary */}
            {count > 0 && (
              <View style={s.summary}>
                <Text style={s.summaryAvg}>{avg.toFixed(1)}</Text>
                <View>
                  <StarDisplay value={avg} size={18} />
                  <Text style={s.summaryCount}>{count} review{count !== 1 ? 's' : ''}</Text>
                </View>
              </View>
            )}

            {/* Contact actions */}
            <View style={s.contactRow}>
              {provider.phone ? (
                <TouchableOpacity
                  style={[s.contactChip, { backgroundColor: c.cardSage }]}
                  onPress={() => Linking.openURL(`tel:${provider.phone!.replace(/[^\d+]/g, '')}`)}
                >
                  <Text style={s.contactChipText}>📞 {provider.phone}</Text>
                </TouchableOpacity>
              ) : null}
              {provider.website ? (
                <TouchableOpacity
                  style={[s.contactChip, { backgroundColor: c.cardBlue }]}
                  onPress={() => {
                    const url = provider.website!.startsWith('http') ? provider.website! : `https://${provider.website!}`;
                    Linking.openURL(url);
                  }}
                >
                  <Text style={s.contactChipText}>🌐 Website</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {provider.address ? <Text style={s.address}>📍 {provider.address}</Text> : null}

            {/* Add review form */}
            {showForm && (
              <View style={s.form}>
                <Text style={s.formLabel}>Your rating</Text>
                <StarPicker value={rating} onChange={setRating} />
                <Text style={[s.formLabel, { marginTop: 16 }]}>Tell other parents about your experience</Text>
                <TextInput
                  style={s.textArea}
                  value={content}
                  onChangeText={setContent}
                  placeholder="What was your experience like? Would you recommend them? Any tips?"
                  placeholderTextColor={c.textMuted}
                  multiline
                  textAlignVertical="top"
                />
                <TouchableOpacity style={s.submitBtn} onPress={submit} disabled={submitting} activeOpacity={0.85}>
                  {submitting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.submitText}>Post Review</Text>}
                </TouchableOpacity>
              </View>
            )}

            {/* Review list */}
            {loading ? (
              <ActivityIndicator color={c.primary} style={{ marginTop: 32 }} />
            ) : reviews.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyEmoji}>💬</Text>
                <Text style={s.emptyTitle}>No reviews yet</Text>
                <Text style={s.emptyBody}>Be the first to share your experience with this provider.</Text>
              </View>
            ) : (
              reviews.map(review => {
                const isOwn = review.user_id === userId;
                return (
                  <View key={review.id} style={s.reviewCard}>
                    <View style={s.reviewHeader}>
                      <StarDisplay value={review.rating} size={15} />
                      {isOwn && (
                        <TouchableOpacity onPress={() => deleteReview(review)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={s.deleteBtn}>Delete</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {review.content ? <Text style={s.reviewContent}>{review.content}</Text> : null}
                    <Text style={s.reviewMeta}>— {review.author || 'Anonymous'} · {timeAgo(review.created_at)}</Text>
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

// ─── Add provider modal ─────────────────────────────────────────────────────

function AddProviderModal({
  userId, country, state, city, defaultCategory, onClose, onAdded, c,
}: {
  userId: string | null;
  country: string;
  state: string;
  city: string;
  defaultCategory: string | null;
  onClose: () => void;
  onAdded: () => void;
  c: Colors;
}) {
  const s = addModalStyles(c);
  const [name, setName]         = useState('');
  const [catKey, setCatKey]     = useState(defaultCategory ?? '');
  const [address, setAddress]   = useState('');
  const [phone, setPhone]       = useState('');
  const [website, setWebsite]   = useState('');
  const [rating, setRating]     = useState(0);
  const [content, setContent]   = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim()) { Alert.alert('Name required', 'Enter the provider or business name.'); return; }
    if (!catKey)      { Alert.alert('Pick a category'); return; }
    if (!userId)      { Alert.alert('Sign in to add a provider'); return; }
    setSubmitting(true);

    const { data: profile } = await supabase.from('profiles').select('display_name, username').eq('id', userId).single();
    const author = profile?.display_name || profile?.username || 'Anonymous';

    const { data: provider, error } = await supabase.from('service_providers').insert({
      name: name.trim(),
      category: catKey,
      city,
      state: state || null,
      country: country || 'United States',
      address: address.trim() || null,
      phone: phone.trim() || null,
      website: website.trim() || null,
      created_by: userId,
      author,
    }).select().single();

    if (error || !provider) {
      setSubmitting(false);
      Alert.alert('Could not add provider', error?.message ?? 'Please try again.');
      return;
    }

    // Optional first review
    if (rating >= 1) {
      await supabase.from('service_provider_reviews').insert({
        provider_id: (provider as ServiceProvider).id,
        user_id: userId,
        author,
        rating,
        content: content.trim() || null,
      });
    }

    setSubmitting(false);
    onAdded();
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Add a Provider</Text>
          <TouchableOpacity onPress={submit} disabled={submitting} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            {submitting
              ? <ActivityIndicator size="small" color={c.primary} />
              : <Text style={s.save}>Add</Text>}
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            <View style={s.banner}>
              <Text style={s.bannerText}>📍 Adding in {[city, state].filter(Boolean).join(', ')}</Text>
            </View>

            <Text style={s.label}>Name *</Text>
            <TextInput style={s.input} value={name} onChangeText={setName}
              placeholder="e.g. Dr. Sarah Chen / Little Sprouts Daycare" placeholderTextColor={c.textMuted} />

            <Text style={s.label}>Category *</Text>
            <View style={s.catGrid}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.key}
                  style={[s.catChip, catKey === cat.key && s.catChipActive]}
                  onPress={() => setCatKey(cat.key)}
                  activeOpacity={0.75}
                >
                  <Text style={s.catChipEmoji}>{cat.emoji}</Text>
                  <Text style={[s.catChipText, catKey === cat.key && s.catChipTextActive]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Address (optional)</Text>
            <TextInput style={s.input} value={address} onChangeText={setAddress}
              placeholder="Street address or neighborhood" placeholderTextColor={c.textMuted} />

            <Text style={s.label}>Phone (optional)</Text>
            <TextInput style={s.input} value={phone} onChangeText={setPhone}
              placeholder="(555) 123-4567" placeholderTextColor={c.textMuted} keyboardType="phone-pad" />

            <Text style={s.label}>Website (optional)</Text>
            <TextInput style={s.input} value={website} onChangeText={setWebsite}
              placeholder="https://…" placeholderTextColor={c.textMuted}
              keyboardType="url" autoCapitalize="none" />

            <View style={s.divider} />

            <Text style={s.label}>Leave a review (optional)</Text>
            <StarPicker value={rating} onChange={setRating} />
            <TextInput style={[s.input, s.multiInput, { marginTop: 12 }]} value={content} onChangeText={setContent}
              placeholder="Share your experience to help other parents…"
              placeholderTextColor={c.textMuted} multiline textAlignVertical="top" />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Provider card ──────────────────────────────────────────────────────────

function ProviderCard({ provider, agg, onPress, c }: {
  provider: ServiceProvider;
  agg: Agg | undefined;
  onPress: () => void;
  c: Colors;
}) {
  const s = cardStyles(c);
  const cat = CAT_MAP[provider.category];
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.85}>
      <View style={s.cardTop}>
        <Text style={s.catEmoji}>{cat?.emoji ?? '📋'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{provider.name}</Text>
          <Text style={s.catLabel}>{cat?.label ?? 'Other'}</Text>
        </View>
        <Text style={s.chevron}>›</Text>
      </View>

      <View style={s.ratingRow}>
        {agg && agg.count > 0 ? (
          <>
            <StarDisplay value={agg.avg} size={13} />
            <Text style={s.ratingNum}>{agg.avg.toFixed(1)}</Text>
            <Text style={s.ratingCount}>· {agg.count} review{agg.count !== 1 ? 's' : ''}</Text>
          </>
        ) : (
          <Text style={s.noRating}>No reviews yet — be the first</Text>
        )}
      </View>

      {provider.address ? <Text style={s.address} numberOfLines={1}>📍 {provider.address}</Text> : null}
    </TouchableOpacity>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function ServiceProviderReviews({ onBack }: { onBack: () => void }) {
  const c = useColors();
  const s = styles(c);

  const [userId, setUserId] = useState<string | null>(null);

  const [country, setCountry] = useState('United States');
  const [state, setState]     = useState('');
  const [city, setCity]       = useState('');
  const [pickerTarget, setPickerTarget] = useState<'country' | 'state' | 'city' | null>(null);

  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [aggs, setAggs]           = useState<Record<string, Agg>>({});
  const [loading, setLoading]     = useState(false);
  const [loaded, setLoaded]       = useState(false);

  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [query, setQuery]         = useState('');

  const [reviewProvider, setReviewProvider] = useState<ServiceProvider | null>(null);
  const [showAdd, setShowAdd]               = useState(false);

  const states = country ? (STATES_BY_COUNTRY[country] ?? []) : [];
  const cities = state  ? (CITIES_BY_STATE[state]    ?? []) : [];

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const loadProviders = useCallback(async (ct: string, st: string, cy: string) => {
    if (!cy) return;
    setLoading(true);
    setLoaded(false);

    let q = supabase.from('service_providers').select('*').eq('country', ct).eq('city', cy);
    if (st) q = q.eq('state', st);
    q = q.order('name');
    const { data: provData } = await q;
    const list = (provData ?? []) as ServiceProvider[];

    const ids = list.map(p => p.id);
    const aggMap: Record<string, Agg> = {};
    if (ids.length) {
      const { data: revData } = await supabase
        .from('service_provider_reviews')
        .select('provider_id, rating')
        .in('provider_id', ids);
      const accum: Record<string, { sum: number; count: number }> = {};
      for (const id of ids) accum[id] = { sum: 0, count: 0 };
      for (const r of (revData ?? []) as Array<{ provider_id: string; rating: number }>) {
        if (!accum[r.provider_id]) continue;
        accum[r.provider_id].sum += r.rating;
        accum[r.provider_id].count++;
      }
      for (const id of ids) {
        const a = accum[id];
        aggMap[id] = { avg: a.count ? a.sum / a.count : 0, count: a.count };
      }
    }

    // Sort: most-reviewed / highest-rated first, then alphabetical
    list.sort((a, b) => {
      const aa = aggMap[a.id] ?? { avg: 0, count: 0 };
      const ba = aggMap[b.id] ?? { avg: 0, count: 0 };
      if (ba.count !== aa.count) return ba.count - aa.count;
      if (ba.avg !== aa.avg) return ba.avg - aa.avg;
      return a.name.localeCompare(b.name);
    });

    setProviders(list);
    setAggs(aggMap);
    setLoading(false);
    setLoaded(true);
  }, []);

  function selectCity(cy: string) {
    setCity(cy);
    setCatFilter(null);
    setQuery('');
    loadProviders(country, state, cy);
  }

  const reload = useCallback(() => {
    if (city) loadProviders(country, state, city);
  }, [city, country, state, loadProviders]);

  // Provider count per category (drives the "browse by type" grid)
  const catCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of providers) m[p.category] = (m[p.category] ?? 0) + 1;
    return m;
  }, [providers]);

  const isSearching = query.trim().length > 0;

  // Providers shown in list mode: search matches everything; otherwise the
  // selected type. The all-types grid renders separately (grid mode).
  const shownProviders = useMemo(() => {
    if (isSearching) {
      const qq = query.trim().toLowerCase();
      return providers.filter(p =>
        p.name.toLowerCase().includes(qq) ||
        (CAT_MAP[p.category]?.label.toLowerCase().includes(qq)) ||
        (p.address?.toLowerCase().includes(qq))
      );
    }
    if (catFilter) return providers.filter(p => p.category === catFilter);
    return providers;
  }, [providers, isSearching, query, catFilter]);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.headerBar}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Resources</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={s.pageTitle}>🏙️ Provider Reviews</Text>
        <Text style={s.pageSubtitle}>
          Real reviews of pediatricians, daycares, doulas & more — from parents in your city
        </Text>

        {/* Location */}
        <Text style={s.sectionLabel}>Your city</Text>
        <SelectBtn label="Country" value={country} c={c} onPress={() => setPickerTarget('country')} />
        {states.length > 0 && (
          <SelectBtn label="State / Province" value={state} c={c} onPress={() => setPickerTarget('state')} />
        )}
        {state && cities.length > 0 && (
          <SelectBtn label="City" value={city} c={c} onPress={() => setPickerTarget('city')} />
        )}

        {/* Prompt before a city is chosen */}
        {!city ? (
          <View style={s.prompt}>
            <Text style={s.promptEmoji}>🗺️</Text>
            <Text style={s.promptTitle}>Choose your city</Text>
            <Text style={s.promptBody}>
              Pick your state and city above to see local providers other parents have reviewed — or add your own.
            </Text>
          </View>
        ) : (
          <>
            {/* Search (across all types) */}
            {providers.length > 0 && (
              <View style={s.searchRow}>
                <Text style={s.searchIcon}>🔍</Text>
                <TextInput
                  style={s.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={`Search providers in ${city}…`}
                  placeholderTextColor={c.textMuted}
                  returnKeyType="search"
                />
                {query.length > 0 && (
                  <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={s.searchClear}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {loading ? (
              <ActivityIndicator color={c.primary} style={{ marginTop: 28 }} />
            ) : isSearching ? (
              /* ── Search results (all types) ── */
              shownProviders.length === 0 ? (
                <View style={s.empty}>
                  <Text style={s.emptyEmoji}>🔍</Text>
                  <Text style={s.emptyTitle}>No matches for "{query.trim()}"</Text>
                  <Text style={s.emptyBody}>Try a provider name or a type like "daycare".</Text>
                </View>
              ) : (
                <View style={{ gap: 12, marginTop: 14 }}>
                  {shownProviders.map(p => (
                    <ProviderCard key={p.id} provider={p} agg={aggs[p.id]} onPress={() => setReviewProvider(p)} c={c} />
                  ))}
                </View>
              )
            ) : catFilter ? (
              /* ── Single type list ── */
              <>
                <TouchableOpacity
                  style={s.backToTypes}
                  onPress={() => setCatFilter(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={s.backToTypesText}>← All types</Text>
                </TouchableOpacity>
                <Text style={s.typeHeading}>{CAT_MAP[catFilter]?.emoji} {CAT_MAP[catFilter]?.label}</Text>
                {shownProviders.length === 0 ? (
                  <View style={s.empty}>
                    <Text style={s.emptyEmoji}>{CAT_MAP[catFilter]?.emoji ?? '📋'}</Text>
                    <Text style={s.emptyTitle}>No {CAT_MAP[catFilter]?.label.toLowerCase()} in {city} yet</Text>
                    <Text style={s.emptyBody}>Be the first to add one — tap “Add a provider” below.</Text>
                  </View>
                ) : (
                  <View style={{ gap: 12, marginTop: 4 }}>
                    {shownProviders.map(p => (
                      <ProviderCard key={p.id} provider={p} agg={aggs[p.id]} onPress={() => setReviewProvider(p)} c={c} />
                    ))}
                  </View>
                )}
              </>
            ) : (
              /* ── All-types grid (greyed when none added yet) ── */
              <>
                <Text style={s.typesHeading}>Browse by type</Text>
                <View style={s.grid}>
                  {CATEGORIES.map(cat => {
                    const n = catCounts[cat.key] ?? 0;
                    const muted = n === 0;
                    return (
                      <TouchableOpacity
                        key={cat.key}
                        style={[s.gridTile, muted && s.gridTileMuted]}
                        onPress={() => setCatFilter(cat.key)}
                        activeOpacity={0.85}
                      >
                        <Text style={[s.gridEmoji, muted && s.gridDim]}>{cat.emoji}</Text>
                        <Text style={[s.gridLabel, muted && s.gridDim]} numberOfLines={2}>{cat.label}</Text>
                        <Text style={[s.gridCount, muted && s.gridCountMuted]}>
                          {n > 0 ? `${n} provider${n !== 1 ? 's' : ''}` : 'None yet'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Add provider */}
            <TouchableOpacity style={s.addCta} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
              <Text style={s.addCtaEmoji}>➕</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.addCtaTitle}>Add a provider</Text>
                <Text style={s.addCtaSub}>Know a great provider in {city}? Add them for other parents.</Text>
              </View>
              <Text style={s.addCtaArrow}>›</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Location pickers */}
      <PickerModal
        visible={pickerTarget === 'country'}
        title="Select Country"
        options={COUNTRIES}
        selected={country}
        onSelect={v => { setCountry(v); setState(''); setCity(''); setProviders([]); setLoaded(false); }}
        onClose={() => setPickerTarget(null)}
        c={c}
      />
      <PickerModal
        visible={pickerTarget === 'state'}
        title="Select State / Province"
        options={states}
        selected={state}
        onSelect={v => { setState(v); setCity(''); setProviders([]); setLoaded(false); }}
        onClose={() => setPickerTarget(null)}
        c={c}
      />
      <PickerModal
        visible={pickerTarget === 'city'}
        title="Select City"
        options={cities}
        selected={city}
        onSelect={selectCity}
        onClose={() => setPickerTarget(null)}
        c={c}
      />

      {/* Reviews modal */}
      {reviewProvider && (
        <ReviewsModal
          provider={reviewProvider}
          userId={userId}
          onClose={() => { setReviewProvider(null); reload(); }}
          c={c}
        />
      )}

      {/* Add provider modal */}
      {showAdd && (
        <AddProviderModal
          userId={userId}
          country={country}
          state={state}
          city={city}
          defaultCategory={catFilter}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); reload(); }}
          c={c}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = (c: Colors) =>
  StyleSheet.create({
    container:    { flex: 1, backgroundColor: c.bg },
    headerBar:    { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
    backBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backArrow:    { fontSize: 20, color: c.textSecondary, fontWeight: '700' },
    backLabel:    { fontSize: 15, color: c.textSecondary, fontWeight: '700' },
    scroll:       { padding: 20, paddingBottom: 48 },
    pageTitle:    { fontSize: 26, fontWeight: '800', color: c.textPrimary, marginBottom: 6 },
    pageSubtitle: { fontSize: 14, color: c.textMuted, fontWeight: '500', marginBottom: 20, lineHeight: 20 },
    sectionLabel: { fontSize: 15, fontWeight: '700', color: c.textSecondary, marginBottom: 12 },

    prompt:       { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 16, gap: 8 },
    promptEmoji:  { fontSize: 44 },
    promptTitle:  { fontSize: 18, fontWeight: '800', color: c.textPrimary },
    promptBody:   { fontSize: 14, color: c.textMuted, fontWeight: '500', textAlign: 'center', lineHeight: 20 },

    typesHeading: { fontSize: 18, fontWeight: '800', color: c.textPrimary, marginTop: 14, marginBottom: 12 },

    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    gridTile: {
      width: '48%', backgroundColor: c.card, borderRadius: 16, borderWidth: 1.5,
      borderColor: c.separator, padding: 14, marginBottom: 12, minHeight: 100,
    },
    gridTileMuted:  { backgroundColor: c.bg },
    gridEmoji:      { fontSize: 26, marginBottom: 6 },
    gridDim:        { opacity: 0.45 },
    gridLabel:      { fontSize: 14, fontWeight: '800', color: c.textPrimary },
    gridCount:      { fontSize: 12, fontWeight: '700', color: c.primary, marginTop: 6 },
    gridCountMuted: { color: c.textMuted, fontWeight: '600', fontStyle: 'italic' },

    typeHeading:     { fontSize: 18, fontWeight: '800', color: c.textPrimary, marginBottom: 12 },
    backToTypes:     { marginTop: 14, marginBottom: 8 },
    backToTypesText: { fontSize: 14, fontWeight: '700', color: c.textSecondary },

    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator,
      paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 11 : 4, marginTop: 14,
    },
    searchIcon:   { fontSize: 15 },
    searchInput:  { flex: 1, fontSize: 15, color: c.textPrimary },
    searchClear:  { fontSize: 15, color: c.textMuted },

    empty:        { alignItems: 'center', paddingVertical: 36, gap: 8 },
    emptyEmoji:   { fontSize: 40 },
    emptyTitle:   { fontSize: 17, fontWeight: '800', color: c.textPrimary, textAlign: 'center' },
    emptyBody:    { fontSize: 14, color: c.textMuted, fontWeight: '500', textAlign: 'center', lineHeight: 20, paddingHorizontal: 12 },

    addCta: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.cardLavender, borderRadius: 16, borderWidth: 1.5, borderColor: c.lavender,
      padding: 16, marginTop: 18,
    },
    addCtaEmoji:  { fontSize: 24 },
    addCtaTitle:  { fontSize: 15, fontWeight: '800', color: c.textPrimary, marginBottom: 2 },
    addCtaSub:    { fontSize: 13, color: c.textSecondary, fontWeight: '500', lineHeight: 18 },
    addCtaArrow:  { fontSize: 24, color: c.textMuted, fontWeight: '700' },
  });

const cardStyles = (c: Colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.card, borderRadius: 16, borderWidth: 1.5, borderColor: c.separator,
      padding: 16, gap: 10,
    },
    cardTop:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
    catEmoji:   { fontSize: 28 },
    name:       { fontSize: 16, fontWeight: '800', color: c.textPrimary, marginBottom: 2 },
    catLabel:   { fontSize: 12, fontWeight: '600', color: c.textMuted },
    chevron:    { fontSize: 24, color: c.textMuted, fontWeight: '700' },
    ratingRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    ratingNum:  { fontSize: 13, fontWeight: '800', color: c.textPrimary },
    ratingCount:{ fontSize: 12, fontWeight: '600', color: c.textMuted },
    noRating:   { fontSize: 13, fontWeight: '600', color: c.textMuted, fontStyle: 'italic' },
    address:    { fontSize: 12, color: c.textMuted, fontWeight: '500' },
  });

const reviewModalStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    close:       { fontSize: 20, color: c.textMuted, fontWeight: '700', width: 28 },
    headerCenter:{ flex: 1 },
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    headerSub:   { fontSize: 12, color: c.textMuted, fontWeight: '600', marginTop: 1 },
    addBtn: {
      backgroundColor: c.primary, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8,
    },
    addBtnText:  { color: '#fff', fontSize: 13, fontWeight: '700' },
    body:        { padding: 20, paddingBottom: 48 },

    summary: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: c.card, borderRadius: 14, borderWidth: 1.5, borderColor: c.separator,
      padding: 16, marginBottom: 14,
    },
    summaryAvg:  { fontSize: 36, fontWeight: '800', color: c.textPrimary },
    summaryCount:{ fontSize: 12, color: c.textMuted, fontWeight: '600', marginTop: 2 },

    contactRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    contactChip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
    contactChipText: { fontSize: 12, fontWeight: '700', color: c.textPrimary },
    address:     { fontSize: 13, color: c.textMuted, fontWeight: '500', marginBottom: 8 },

    form: {
      backgroundColor: c.card, borderRadius: 16, borderWidth: 1.5, borderColor: c.cardBorder,
      padding: 16, marginBottom: 18,
    },
    formLabel:   { fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 10 },
    textArea: {
      backgroundColor: c.inputBg, borderRadius: 12, borderWidth: 1.5, borderColor: c.inputBorder,
      padding: 12, fontSize: 14, color: c.textPrimary, minHeight: 90,
    },
    submitBtn: {
      backgroundColor: c.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 14,
    },
    submitText:  { color: '#fff', fontSize: 15, fontWeight: '700' },

    empty:       { alignItems: 'center', paddingVertical: 36, gap: 8 },
    emptyEmoji:  { fontSize: 40 },
    emptyTitle:  { fontSize: 17, fontWeight: '800', color: c.textPrimary },
    emptyBody:   { fontSize: 14, color: c.textMuted, fontWeight: '500', textAlign: 'center', lineHeight: 20, paddingHorizontal: 16 },

    reviewCard: {
      backgroundColor: c.card, borderRadius: 14, borderWidth: 1.5, borderColor: c.separator,
      padding: 14, marginBottom: 12, gap: 8,
    },
    reviewHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    deleteBtn:     { fontSize: 12, color: c.signOut, fontWeight: '700' },
    reviewContent: { fontSize: 14, color: c.textPrimary, lineHeight: 20 },
    reviewMeta:    { fontSize: 12, color: c.textMuted, fontWeight: '600' },
  });

const addModalStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    cancel:      { fontSize: 15, color: c.textMuted, fontWeight: '600' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    save:        { fontSize: 15, color: c.primary, fontWeight: '800' },
    body:        { padding: 20, paddingBottom: 48 },

    banner: {
      backgroundColor: c.cardSage, borderRadius: 12, padding: 12, marginBottom: 18,
    },
    bannerText:  { fontSize: 13, color: c.textPrimary, fontWeight: '600' },

    label:       { fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 8, marginTop: 4 },
    input: {
      backgroundColor: c.inputBg, borderRadius: 12, borderWidth: 1.5, borderColor: c.inputBorder,
      padding: 12, fontSize: 14, color: c.textPrimary, marginBottom: 14,
    },
    multiInput:  { minHeight: 80 },

    catGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    catChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
      backgroundColor: c.card, borderWidth: 1.5, borderColor: c.separator,
    },
    catChipActive:     { backgroundColor: c.primary, borderColor: c.primary },
    catChipEmoji:      { fontSize: 14 },
    catChipText:       { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    catChipTextActive: { color: '#fff' },

    divider:     { height: 1, backgroundColor: c.separator, marginVertical: 18 },
  });
