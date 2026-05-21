import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, FlatList,
  ActivityIndicator, Linking, Platform, TextInput, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';
import { COUNTRIES, STATES_BY_COUNTRY, CITIES_BY_STATE } from '../lib/villageData';

// ─── Service types ────────────────────────────────────────────────────────────

const SERVICE_TYPES = [
  { key: 'diapers',            emoji: '🍼', label: 'Free Diapers' },
  { key: 'wic',                emoji: '🥛', label: 'WIC Office' },
  { key: 'snap',               emoji: '🛒', label: 'SNAP / Food Stamps' },
  { key: 'food_pantry',        emoji: '🥫', label: 'Food Pantry / Food Bank' },
  { key: 'early_intervention', emoji: '🌱', label: 'Early Intervention' },
  { key: 'support',            emoji: '🤝', label: 'Parent Support Groups' },
  { key: 'parenting',          emoji: '👨‍👩‍👧', label: 'Parenting Classes' },
  { key: 'clothes',            emoji: '👕', label: 'Free Clothes' },
  { key: 'childcare',          emoji: '🏫', label: 'Childcare / Daycare' },
  { key: 'lactation',          emoji: '🤱', label: 'Lactation Support' },
  { key: 'mental_health',      emoji: '💙', label: 'Mental Health' },
  { key: 'formula',            emoji: '🍶', label: 'Free Formula' },
  { key: 'other',              emoji: '📋', label: 'Other / 211' },
] as const;

type ServiceKey = typeof SERVICE_TYPES[number]['key'];

// ─── National fallback resources ──────────────────────────────────────────────
// Shown when no local DB entries are found for the selection.

const NATIONAL_RESOURCES: Record<string, Array<{ name: string; description: string; contact: string; url?: string }>> = {
  diapers: [
    {
      name: 'National Diaper Bank Network',
      description: 'Connects families to free diapers through a nationwide network of diaper banks.',
      contact: 'Find a bank at nationaldiaperbanknetwork.org',
    },
    {
      name: 'Baby2Baby',
      description: 'Provides diapers and baby essentials to children in need across the US.',
      contact: 'baby2baby.org',
    },
    {
      name: '211 Helpline',
      description: 'Call or text 211 to be connected with local diaper assistance programs in your area.',
      contact: 'Call or text 211',
    },
  ],
  wic: [
    {
      name: 'USDA WIC Program',
      description: 'Find your nearest WIC clinic for nutrition support, formula, and healthy food benefits for pregnant and postpartum moms and children under 5.',
      contact: 'wic.fns.usda.gov — search "WIC clinic locator"',
    },
    {
      name: '211 Helpline',
      description: 'Call 211 to be connected with your local WIC office.',
      contact: 'Call or text 211',
    },
  ],
  snap: [
    {
      name: 'SNAP Benefits (Food Stamps)',
      description: 'Apply for monthly grocery assistance through the federal SNAP program.',
      contact: 'benefits.gov — search "SNAP" to apply in your state',
    },
    {
      name: '211 Helpline',
      description: 'Call 211 for help applying for SNAP and other food assistance benefits.',
      contact: 'Call or text 211',
    },
  ],
  food_pantry: [
    {
      name: 'Feeding America',
      description: 'Find your nearest food bank. Over 200 food banks across the US.',
      contact: 'feedingamerica.org — search "find your local food bank"',
    },
    {
      name: 'Meals on Wheels',
      description: 'Meal delivery for seniors and families in need.',
      contact: 'mealsonwheelsamerica.org',
    },
    {
      name: '211 Helpline',
      description: 'Call 211 to find food pantries open near you today.',
      contact: 'Call or text 211',
    },
  ],
  clothes: [
    {
      name: 'Baby2Baby',
      description: 'Free baby and children\'s clothing for families in need.',
      contact: 'baby2baby.org',
    },
    {
      name: 'Clothes4Souls',
      description: 'Free clothing distributions for families in need across the US.',
      contact: 'clothes4souls.org',
    },
    {
      name: '211 Helpline',
      description: 'Call 211 for local clothing assistance programs and pop-up shops.',
      contact: 'Call or text 211',
    },
  ],
  parenting: [
    {
      name: 'Zero to Three',
      description: 'Free online parenting classes and resources for parents of children 0–3.',
      contact: 'zerotothree.org',
    },
    {
      name: 'CDC Learn the Signs. Act Early.',
      description: 'Free developmental milestone resources and local parenting programs.',
      contact: 'cdc.gov — search "Learn the Signs Act Early"',
    },
    {
      name: '211 Helpline',
      description: 'Call 211 for local in-person parenting class programs.',
      contact: 'Call or text 211',
    },
  ],
  childcare: [
    {
      name: 'Child Care Aware of America',
      description: 'Find affordable, quality childcare and learn about subsidy programs in your state.',
      contact: 'childcareaware.org',
    },
    {
      name: 'Head Start / Early Head Start',
      description: 'Free childcare and early education for income-eligible families with children 0–5.',
      contact: 'eclkc.ohs.acf.hhs.gov — search "Head Start locator"',
    },
    {
      name: '211 Helpline',
      description: 'Call 211 for local childcare subsidies and sliding-scale programs.',
      contact: 'Call or text 211',
    },
  ],
  lactation: [
    {
      name: 'WIC Breastfeeding Support',
      description: 'Free lactation consulting and breast pumps available through WIC.',
      contact: 'wic.fns.usda.gov',
    },
    {
      name: 'La Leche League International',
      description: 'Free in-person and virtual breastfeeding support groups.',
      contact: 'llli.org — search "find a group"',
    },
    {
      name: 'Postpartum Support International',
      description: 'Helpline and local support for breastfeeding and postpartum challenges.',
      contact: 'postpartum.net or call 1-800-944-4773',
    },
  ],
  mental_health: [
    {
      name: 'Postpartum Support International',
      description: 'Support for postpartum depression, anxiety, and perinatal mental health. Free helpline.',
      contact: '1-800-944-4773 or postpartum.net',
    },
    {
      name: 'SAMHSA Helpline',
      description: 'Free, confidential mental health and substance use treatment referral service.',
      contact: '1-800-662-4357 (free, 24/7)',
    },
    {
      name: '988 Suicide & Crisis Lifeline',
      description: 'Call or text 988 for immediate mental health crisis support.',
      contact: 'Call or text 988',
    },
  ],
  formula: [
    {
      name: 'WIC Program',
      description: 'WIC provides free formula to income-eligible families with infants.',
      contact: 'wic.fns.usda.gov — find your clinic',
    },
    {
      name: 'Baby2Baby',
      description: 'Distributes baby formula to families in need.',
      contact: 'baby2baby.org',
    },
    {
      name: '211 Helpline',
      description: 'Call 211 to find local formula assistance.',
      contact: 'Call or text 211',
    },
  ],
  early_intervention: [
    {
      name: 'IDEA Early Intervention (Part C)',
      description: 'Every state has a federally funded Early Intervention program for children 0–3 with developmental delays or disabilities. Free evaluations and services.',
      contact: 'Call your state health department or dial 211',
    },
    {
      name: 'CDC Learn the Signs. Act Early.',
      description: 'Free developmental milestone resources and how to request an Early Intervention evaluation.',
      contact: 'cdc.gov — search "Learn the Signs Act Early"',
    },
  ],
  support: [
    {
      name: 'Postpartum Support International',
      description: 'Free helpline and local support groups for postpartum depression, anxiety, and parenting challenges.',
      contact: '1-800-944-4773 or postpartum.net',
    },
    {
      name: 'Zero to Three',
      description: 'Expert resources and virtual support groups for parents of babies and toddlers.',
      contact: 'zerotothree.org',
    },
    {
      name: '211 Helpline',
      description: 'Call 211 to find local parent support groups and family resource centers near you.',
      contact: 'Call or text 211',
    },
  ],
  other: [
    {
      name: '211 Helpline',
      description: 'The all-purpose social services helpline. Call or text 211 to find any type of local assistance.',
      contact: 'Call or text 211',
    },
    {
      name: 'Benefits.gov',
      description: 'Search all federal benefit programs you may qualify for.',
      contact: 'benefits.gov',
    },
    {
      name: 'FindHelp.org',
      description: 'Search thousands of free and reduced-cost programs near you.',
      contact: 'findhelp.org',
    },
  ],
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocalResource {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  service_type: string;
  city: string | null;
  state: string | null;
  country: string;
}

// ─── Picker modal ─────────────────────────────────────────────────────────────

function PickerModal({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
  c,
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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
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

// ─── Select button ─────────────────────────────────────────────────────────────

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
      <View>
        <Text style={{ fontSize: 11, color: c.textMuted, fontWeight: '600', marginBottom: 2 }}>{label}</Text>
        <Text style={{ fontSize: 15, color: hasValue ? c.textPrimary : c.textMuted, fontWeight: hasValue ? '600' : '400' }}>
          {value || `Select ${label}`}
        </Text>
      </View>
      <Text style={{ fontSize: 18, color: c.textMuted }}>▾</Text>
    </TouchableOpacity>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LocalServicesScreen({ onBack }: { onBack: () => void }) {
  const c = useColors();

  const [serviceType, setServiceType] = useState<ServiceKey | ''>('');
  const [country, setCountry]         = useState('');
  const [state, setState]             = useState('');
  const [city, setCity]               = useState('');

  const [pickerTarget, setPickerTarget] = useState<'country' | 'state' | 'city' | null>(null);

  const [results, setResults]     = useState<LocalResource[]>([]);
  const [searched, setSearched]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  const [showSuggest, setShowSuggest]   = useState(false);
  const [suggestName, setSuggestName]   = useState('');
  const [suggestPhone, setSuggestPhone] = useState('');
  const [suggestSite, setSuggestSite]   = useState('');
  const [suggestDesc, setSuggestDesc]   = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [submitDone, setSubmitDone]     = useState(false);

  const states = country ? (STATES_BY_COUNTRY[country] ?? []) : [];
  const cities = state  ? (CITIES_BY_STATE[state]    ?? []) : [];

  // ─── Search ─────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    if (!serviceType) return;
    setLoading(true);
    setSearched(false);
    setQueryError(null);
    try {
      let query = supabase
        .from('local_resources')
        .select('*')
        .eq('service_type', serviceType);

      if (country) query = query.eq('country', country);
      if (state)   query = query.eq('state', state);
      // Include statewide (null city) resources alongside city-specific ones
      if (city)    query = query.or(`city.eq.${city},city.is.null`);

      query = query.order('name');
      const { data, error } = await query;
      if (error) setQueryError(error.message);
      setResults(data ?? []);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, [serviceType, country, state, city]);

  const handleSuggest = useCallback(async () => {
    if (!suggestName.trim()) return;
    setSubmitting(true);
    await supabase.from('resource_suggestions').insert({
      name: suggestName.trim(),
      phone: suggestPhone.trim() || null,
      website: suggestSite.trim() || null,
      description: suggestDesc.trim() || null,
      service_type: serviceType || null,
      city: city || null,
      state: state || null,
      country: country || 'United States',
    });
    setSubmitting(false);
    setSubmitDone(true);
  }, [suggestName, suggestPhone, suggestSite, suggestDesc, serviceType, city, state, country]);

  const closeSuggest = () => {
    setShowSuggest(false);
    setSuggestName(''); setSuggestPhone(''); setSuggestSite(''); setSuggestDesc('');
    setSubmitDone(false);
  };

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const serviceLabel = SERVICE_TYPES.find(s => s.key === serviceType)?.label ?? '';
  const nationalFallbacks = serviceType ? (NATIONAL_RESOURCES[serviceType] ?? []) : [];
  const showFallbacks = searched && results.length === 0;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: c.separator,
      }}>
        <TouchableOpacity onPress={onBack} style={{ marginRight: 12 }}>
          <Text style={{ fontSize: 22, color: c.textMuted }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: c.textPrimary }}>📍 Local Services</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">

        {/* ── Service type ── */}
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.textSecondary, marginBottom: 12 }}>
          What are you looking for?
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {SERVICE_TYPES.map(s => {
            const active = serviceType === s.key;
            return (
              <TouchableOpacity
                key={s.key}
                onPress={() => setServiceType(s.key)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20,
                  backgroundColor: active ? c.primary : c.card,
                  borderWidth: 1.5, borderColor: active ? c.primary : c.separator,
                }}
                activeOpacity={0.75}
              >
                <Text style={{ fontSize: 14 }}>{s.emoji}</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : c.textSecondary }}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Location ── */}
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.textSecondary, marginBottom: 12 }}>
          Where are you located?
        </Text>

        <SelectBtn label="Country" value={country} c={c} onPress={() => setPickerTarget('country')} />

        {states.length > 0 && (
          <SelectBtn
            label="State / Province"
            value={state}
            c={c}
            onPress={() => setPickerTarget('state')}
          />
        )}

        {state && cities.length > 0 && (
          <SelectBtn
            label="City"
            value={city}
            c={c}
            onPress={() => setPickerTarget('city')}
          />
        )}

        {/* ── Search button ── */}
        <TouchableOpacity
          onPress={handleSearch}
          disabled={!serviceType || loading}
          style={{
            backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14,
            alignItems: 'center', marginTop: 8, marginBottom: 28,
            opacity: serviceType ? 1 : 0.45,
          }}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Find Resources</Text>
          }
        </TouchableOpacity>

        {/* ── Query error (debug) ── */}
        {queryError && (
          <Text style={{ color: 'red', marginBottom: 12, fontSize: 13 }}>
            Error: {queryError}
          </Text>
        )}

        {/* ── DB results ── */}
        {searched && results.length > 0 && (
          <>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 12 }}>
              {results.length} result{results.length !== 1 ? 's' : ''} near you
            </Text>
            {results.map(r => (
              <View key={r.id} style={{
                backgroundColor: c.card, borderRadius: 14, padding: 16,
                marginBottom: 12, borderWidth: 1.5, borderColor: c.separator,
              }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary, marginBottom: 4 }}>
                  {r.name}
                </Text>
                {r.description ? (
                  <Text style={{ fontSize: 13, color: c.textSecondary, lineHeight: 19, marginBottom: 8 }}>
                    {r.description}
                  </Text>
                ) : null}
                {r.address ? (
                  <Text style={{ fontSize: 12, color: c.textMuted, marginBottom: 4 }}>📍 {r.address}</Text>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {r.phone && r.phone !== 'N/A' ? (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`tel:${r.phone!.replace(/\D/g, '')}`)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                        backgroundColor: c.cardSage, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}
                    >
                      <Text style={{ fontSize: 12, color: c.textPrimary, fontWeight: '600' }}>📞 {r.phone}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {r.website && r.website !== 'N/A' ? (
                    <TouchableOpacity
                      onPress={() => {
                        const url = r.website!.startsWith('http') ? r.website! : `https://${r.website!}`;
                        Linking.openURL(url);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                        backgroundColor: c.cardBlue, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}
                    >
                      <Text style={{ fontSize: 12, color: c.textPrimary, fontWeight: '600' }}>🌐 Visit Website</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── National fallbacks ── */}
        {(showFallbacks || (!searched && serviceType)) && nationalFallbacks.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: c.separator }} />
              <Text style={{ fontSize: 12, color: c.textMuted, fontWeight: '600' }}>
                {showFallbacks ? 'No local results — national resources' : 'National resources'}
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: c.separator }} />
            </View>
            {nationalFallbacks.map((r, i) => {
              const isUrl = r.contact?.startsWith('http') || r.contact?.includes('.');
              const isPhone = /^\d{3}[-.\s]?\d{3}[-.\s]?\d{4}$/.test(r.contact ?? '') || r.contact === '211';
              return (
                <View key={i} style={{
                  backgroundColor: c.cardBlush, borderRadius: 14, padding: 16,
                  marginBottom: 12, borderWidth: 1.5, borderColor: c.blush,
                }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary, marginBottom: 4 }}>
                    {r.name}
                  </Text>
                  <Text style={{ fontSize: 13, color: c.textSecondary, lineHeight: 19, marginBottom: 8 }}>
                    {r.description}
                  </Text>
                  {r.url ? (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(r.url!)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                        backgroundColor: c.cardBlue, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
                        alignSelf: 'flex-start' }}
                    >
                      <Text style={{ fontSize: 12, color: c.textPrimary, fontWeight: '600' }}>🌐 Visit Website</Text>
                    </TouchableOpacity>
                  ) : isUrl ? (
                    <TouchableOpacity
                      onPress={() => {
                        const url = r.contact.startsWith('http') ? r.contact : `https://${r.contact}`;
                        Linking.openURL(url);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                        backgroundColor: c.cardBlue, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
                        alignSelf: 'flex-start' }}
                    >
                      <Text style={{ fontSize: 12, color: c.textPrimary, fontWeight: '600' }}>🌐 Visit Website</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={{ fontSize: 12, color: c.textMuted, fontWeight: '600' }}>{r.contact}</Text>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* ── 211 deep link + suggest ── */}
        {searched && (
          <View style={{ gap: 10, marginBottom: 8 }}>
            <TouchableOpacity
              onPress={() => {
                const loc = [city, state].filter(Boolean).join(', ');
                const url = loc
                  ? `https://www.211.org/search#location=${encodeURIComponent(loc)}`
                  : 'https://www.211.org/';
                Linking.openURL(url);
              }}
              style={{
                backgroundColor: c.cardSage, borderRadius: 14, padding: 16,
                borderWidth: 1.5, borderColor: c.sage,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary, marginBottom: 4 }}>
                🔍 Search 211.org for more resources
              </Text>
              <Text style={{ fontSize: 13, color: c.textSecondary, lineHeight: 19 }}>
                211 has verified listings for every city in the US — food, housing, childcare, health services, and more. Tap to search{city || state ? ` near ${[city, state].filter(Boolean).join(', ')}` : ''}.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowSuggest(true)}
              style={{
                backgroundColor: c.cardLavender, borderRadius: 14, padding: 16,
                borderWidth: 1.5, borderColor: c.lavender,
                flexDirection: 'row', alignItems: 'center', gap: 10,
              }}
            >
              <Text style={{ fontSize: 22 }}>➕</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary, marginBottom: 2 }}>
                  Know a resource we're missing?
                </Text>
                <Text style={{ fontSize: 13, color: c.textSecondary }}>
                  Suggest it and help other parents in your community.
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* ── Picker modals ── */}
      <PickerModal
        visible={pickerTarget === 'country'}
        title="Select Country"
        options={COUNTRIES}
        selected={country}
        onSelect={v => { setCountry(v); setState(''); setCity(''); }}
        onClose={() => setPickerTarget(null)}
        c={c}
      />
      <PickerModal
        visible={pickerTarget === 'state'}
        title="Select State / Province"
        options={states}
        selected={state}
        onSelect={v => { setState(v); setCity(''); }}
        onClose={() => setPickerTarget(null)}
        c={c}
      />
      <PickerModal
        visible={pickerTarget === 'city'}
        title="Select City"
        options={cities}
        selected={city}
        onSelect={setCity}
        onClose={() => setPickerTarget(null)}
        c={c}
      />

      {/* ── Suggest a resource modal ── */}
      <Modal visible={showSuggest} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: c.textPrimary, marginBottom: 4 }}>
                Suggest a Resource
              </Text>
              <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 20 }}>
                We'll review your suggestion and add it to help other parents.
              </Text>

              {submitDone ? (
                <View style={{ alignItems: 'center', paddingVertical: 24, gap: 10 }}>
                  <Text style={{ fontSize: 36 }}>🙌</Text>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: c.textPrimary }}>Thank you!</Text>
                  <Text style={{ fontSize: 14, color: c.textSecondary, textAlign: 'center' }}>
                    Your suggestion has been submitted. We'll review it soon.
                  </Text>
                  <TouchableOpacity onPress={closeSuggest} style={{ marginTop: 8, backgroundColor: c.primary, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12 }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Done</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {[
                    { label: 'Organization name *', value: suggestName, set: setSuggestName, placeholder: 'e.g. Bundles of Hope Diaper Bank' },
                    { label: 'Phone number', value: suggestPhone, set: setSuggestPhone, placeholder: 'e.g. (205) 607-2112' },
                    { label: 'Website', value: suggestSite, set: setSuggestSite, placeholder: 'e.g. https://example.org' },
                    { label: 'What do they offer?', value: suggestDesc, set: setSuggestDesc, placeholder: 'e.g. Free diapers, wipes, referrals' },
                  ].map(f => (
                    <View key={f.label} style={{ marginBottom: 14 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 6 }}>{f.label}</Text>
                      <TextInput
                        value={f.value}
                        onChangeText={f.set}
                        placeholder={f.placeholder}
                        placeholderTextColor={c.textMuted}
                        style={{
                          backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5,
                          borderColor: c.separator, padding: 12, fontSize: 14, color: c.textPrimary,
                        }}
                      />
                    </View>
                  ))}
                  <Text style={{ fontSize: 12, color: c.textMuted, marginBottom: 16 }}>
                    📍 Will be listed under: {[serviceType, city, state].filter(Boolean).join(', ') || 'no location selected'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity onPress={closeSuggest} style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator, padding: 14, alignItems: 'center' }}>
                      <Text style={{ fontWeight: '700', color: c.textSecondary }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSuggest}
                      disabled={!suggestName.trim() || submitting}
                      style={{ flex: 2, borderRadius: 12, backgroundColor: c.primary, padding: 14, alignItems: 'center', opacity: suggestName.trim() ? 1 : 0.45 }}
                    >
                      {submitting
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={{ fontWeight: '700', color: '#fff' }}>Submit Suggestion</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
