import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
  FlatList,
} from 'react-native';
import { useColors, Colors } from '../lib/theme';
import { supabase } from '../lib/supabase';
import {
  COUNTRIES,
  STATES_BY_COUNTRY,
  CITIES_BY_STATE,
  REGION_LABEL_BY_COUNTRY,
  DEFAULT_REGION_LABEL,
} from '../lib/villageData';

// ─── Types ────────────────────────────────────────────────────────────────────

type GroupType = 'in_person' | 'online' | 'hybrid';

type MomGroup = {
  id: string;
  name: string;
  type: GroupType;
  city: string | null;
  state_name: string | null;
  country: string | null;
  description: string | null;
  schedule: string | null;
  link: string | null;
  tags: string[] | null;
  is_free: boolean;
};

const TYPE_CONFIG: Record<GroupType, { label: string; emoji: string }> = {
  in_person: { label: 'In Person', emoji: '🏠' },
  online:    { label: 'Online',    emoji: '💻' },
  hybrid:    { label: 'Hybrid',    emoji: '🔄' },
};

const PRESET_TAGS = [
  'New Moms', 'Breastfeeding', 'NICU', 'Toddlers', 'Working Moms',
  'Single Moms', 'POC Moms', 'LGBTQ+ Friendly', 'Twins/Multiples',
  'Military', 'Pregnancy Loss', 'Postpartum Support', 'Faith-Based',
];

// ─── Location picker pieces ─────────────────────────────────────────────────────

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
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 18, color: c.textMuted }}>✕</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={options}
          keyExtractor={item => item}
          keyboardShouldPersistTaps="handled"
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

function LabeledInput({ label, value, onChangeText, placeholder, c }: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  c: Colors;
}) {
  const hasValue = !!value;
  return (
    <View style={{
      backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5,
      borderColor: hasValue ? c.primary : c.separator,
      paddingHorizontal: 14, paddingVertical: 9, marginBottom: 12,
    }}>
      <Text style={{ fontSize: 11, color: c.textMuted, fontWeight: '600', marginBottom: 2 }}>{label}</Text>
      <TextInput
        style={{ fontSize: 15, color: c.textPrimary, fontWeight: hasValue ? '600' : '400', padding: 0 }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.textMuted}
        autoCapitalize="words"
      />
    </View>
  );
}

// Country -> State/Region -> City. Dropdowns where we have built-in lists
// (US/Canada); free-text fallback for every other country so anyone can add
// their location.
function LocationPicker({
  country, state, city, setCountry, setState, setCity, c,
}: {
  country: string;
  state: string;
  city: string;
  setCountry: (v: string) => void;
  setState: (v: string) => void;
  setCity: (v: string) => void;
  c: Colors;
}) {
  const [target, setTarget] = useState<'country' | 'state' | 'city' | null>(null);

  const statesList = STATES_BY_COUNTRY[country] ?? [];
  const citiesList = state ? (CITIES_BY_STATE[state] ?? []) : [];
  const countryHasStates = statesList.length > 0;
  const cityHasOptions = citiesList.length > 0;
  const regionLabel = REGION_LABEL_BY_COUNTRY[country] ?? DEFAULT_REGION_LABEL;
  const showCity = countryHasStates ? !!state : true;

  return (
    <>
      <SelectBtn label="Country" value={country} c={c} onPress={() => setTarget('country')} />

      {countryHasStates ? (
        <SelectBtn label={regionLabel} value={state} c={c} onPress={() => setTarget('state')} />
      ) : (
        <LabeledInput
          label={regionLabel}
          value={state}
          onChangeText={setState}
          placeholder={`Enter ${regionLabel.toLowerCase()}`}
          c={c}
        />
      )}

      {showCity && (cityHasOptions ? (
        <SelectBtn label="City" value={city} c={c} onPress={() => setTarget('city')} />
      ) : (
        <LabeledInput label="City" value={city} onChangeText={setCity} placeholder="Enter city" c={c} />
      ))}

      <PickerModal
        visible={target === 'country'}
        title="Select Country"
        options={COUNTRIES}
        selected={country}
        onSelect={v => { setCountry(v); setState(''); setCity(''); }}
        onClose={() => setTarget(null)}
        c={c}
      />
      <PickerModal
        visible={target === 'state'}
        title={`Select ${regionLabel}`}
        options={statesList}
        selected={state}
        onSelect={v => { setState(v); setCity(''); }}
        onClose={() => setTarget(null)}
        c={c}
      />
      <PickerModal
        visible={target === 'city'}
        title="Select City"
        options={citiesList}
        selected={city}
        onSelect={setCity}
        onClose={() => setTarget(null)}
        c={c}
      />
    </>
  );
}

// ─── GroupCard ────────────────────────────────────────────────────────────────

function GroupCard({
  group,
  c,
}: {
  group: MomGroup;
  c: ReturnType<typeof useColors>;
}) {
  const s = cardStyles(c);
  const typeConf = TYPE_CONFIG[group.type];
  const tags = group.tags ?? [];

  const openLink = () => {
    if (!group.link) return;
    const url = group.link.startsWith('http') ? group.link : `https://${group.link}`;
    Linking.openURL(url).catch(() =>
      Alert.alert('Could not open link', group.link ?? '')
    );
  };

  return (
    <View style={s.card}>
      {/* Name + type */}
      <View style={s.nameRow}>
        <Text style={s.name} numberOfLines={2}>{group.name}</Text>
        <View style={s.typeBadge}>
          <Text style={s.typeBadgeText}>{typeConf.emoji} {typeConf.label}</Text>
        </View>
      </View>

      {/* Location */}
      {(group.city || group.state_name || group.country) && (
        <Text style={s.location}>
          📍 {[group.city, group.state_name, group.country].filter(Boolean).join(', ')}
        </Text>
      )}

      {/* Description */}
      {!!group.description && (
        <Text style={s.description} numberOfLines={3}>{group.description}</Text>
      )}

      {/* Schedule */}
      {!!group.schedule && (
        <Text style={s.schedule}>🗓 {group.schedule}</Text>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <View style={s.tags}>
          {tags.map(tag => (
            <View key={tag} style={s.tag}>
              <Text style={s.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Footer row */}
      <View style={s.footer}>
        <View style={s.freeBadge}>
          <Text style={s.freeBadgeText}>{group.is_free ? '✓ Free' : 'Paid'}</Text>
        </View>
        {!!group.link && (
          <TouchableOpacity style={s.linkBtn} onPress={openLink}>
            <Text style={s.linkBtnText}>Visit Website →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const cardStyles = (c: Colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      gap: 8,
    },
    nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    name: { flex: 1, fontSize: 16, fontWeight: '800', color: c.textPrimary, lineHeight: 22 },
    typeBadge: {
      backgroundColor: c.cardLavender,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    typeBadgeText: { fontSize: 12, fontWeight: '700', color: c.textSecondary },
    location: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    description: { fontSize: 14, color: c.textSecondary, fontWeight: '500', lineHeight: 20 },
    schedule: { fontSize: 13, fontWeight: '600', color: c.textMuted },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tag: {
      backgroundColor: c.cardSage ?? c.cardLavender,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    tagText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
    footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
    freeBadge: {
      backgroundColor: c.cardHoney ?? c.card,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    freeBadgeText: { fontSize: 12, fontWeight: '700', color: c.textMuted },
    linkBtn: {
      marginLeft: 'auto',
      backgroundColor: c.cardBlue ?? c.card,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    linkBtnText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
  });

// ─── SuggestModal ─────────────────────────────────────────────────────────────

function SuggestModal({
  visible,
  onClose,
  c,
}: {
  visible: boolean;
  onClose: () => void;
  c: ReturnType<typeof useColors>;
}) {
  const [name, setName]           = useState('');
  const [type, setType]           = useState<GroupType>('in_person');
  const [country, setCountry]     = useState('United States');
  const [stateVal, setStateVal]   = useState('');
  const [city, setCity]           = useState('');
  const [desc, setDesc]           = useState('');
  const [schedule, setSchedule]   = useState('');
  const [link, setLink]           = useState('');
  const [isFree, setIsFree]       = useState(true);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const s = suggestStyles(c);

  const reset = () => {
    setName(''); setType('in_person'); setCountry('United States'); setStateVal(''); setCity('');
    setDesc(''); setSchedule(''); setLink(''); setIsFree(true); setSelectedTags([]);
  };

  const toggleTag = (tag: string) =>
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );

  const submit = async () => {
    if (!name.trim()) return;
    const isOnline = type === 'online';
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('group_suggestions').insert({
        name: name.trim(),
        type,
        city: isOnline ? null : (city.trim() || null),
        state_name: isOnline ? null : (stateVal.trim() || null),
        country: isOnline ? null : (country || null),
        description: desc.trim() || null,
        schedule: schedule.trim() || null,
        link: link.trim() || null,
        tags: selectedTags.length ? selectedTags : null,
        is_free: isFree,
        suggested_by: user?.id ?? null,
      });
      if (error) throw error;
      reset();
      onClose();
      Alert.alert('Thank you!', 'Your group has been submitted for review. We\'ll add it to the directory soon!');
    } catch {
      Alert.alert('Error', 'Could not submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <SafeAreaView style={s.container}>
          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Text style={s.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>Suggest a Group</Text>
            <TouchableOpacity onPress={submit} disabled={!name.trim() || submitting}>
              <Text style={[s.submitBtn, (!name.trim() || submitting) && s.submitDisabled]}>
                Submit
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            {/* Group name */}
            <Text style={s.label}>Group name *</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Austin New Moms Collective"
              placeholderTextColor={c.textMuted}
              value={name}
              onChangeText={setName}
            />

            {/* Type */}
            <Text style={s.label}>Meeting type *</Text>
            <View style={s.typeRow}>
              {(['in_person', 'online', 'hybrid'] as GroupType[]).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[s.typeChip, type === t && s.typeChipActive]}
                  onPress={() => setType(t)}
                >
                  <Text style={[s.typeChipText, type === t && s.typeChipTextActive]}>
                    {TYPE_CONFIG[t].emoji} {TYPE_CONFIG[t].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Location (skip for online-only groups) */}
            {type !== 'online' && (
              <>
                <Text style={s.label}>Location</Text>
                <LocationPicker
                  country={country}
                  state={stateVal}
                  city={city}
                  setCountry={setCountry}
                  setState={setStateVal}
                  setCity={setCity}
                  c={c}
                />
              </>
            )}

            {/* Description */}
            <Text style={s.label}>Description</Text>
            <TextInput
              style={[s.input, s.textarea]}
              placeholder="What is this group about? Who is it for?"
              placeholderTextColor={c.textMuted}
              value={desc}
              onChangeText={setDesc}
              multiline
              textAlignVertical="top"
            />

            {/* Schedule */}
            <Text style={s.label}>Meeting schedule</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Every Tuesday at 10am"
              placeholderTextColor={c.textMuted}
              value={schedule}
              onChangeText={setSchedule}
            />

            {/* Link */}
            <Text style={s.label}>Website or Facebook link</Text>
            <TextInput
              style={s.input}
              placeholder="https://..."
              placeholderTextColor={c.textMuted}
              value={link}
              onChangeText={setLink}
              autoCapitalize="none"
              keyboardType="url"
            />

            {/* Tags */}
            <Text style={s.label}>Tags (select all that apply)</Text>
            <View style={s.tagsGrid}>
              {PRESET_TAGS.map(tag => {
                const active = selectedTags.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[s.tagChip, active && s.tagChipActive]}
                    onPress={() => toggleTag(tag)}
                  >
                    <Text style={[s.tagChipText, active && s.tagChipTextActive]}>{tag}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Free toggle */}
            <View style={s.freeRow}>
              <Text style={s.label}>Free to join?</Text>
              <TouchableOpacity
                style={[s.freeToggle, isFree && s.freeToggleActive]}
                onPress={() => setIsFree(prev => !prev)}
              >
                <Text style={[s.freeToggleText, isFree && s.freeToggleTextActive]}>
                  {isFree ? '✓ Free' : 'Paid'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={s.hint}>
              We review all submissions before adding them to the directory. Thank you for helping grow the community!
            </Text>

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const suggestStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.card,
    },
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    cancel: { fontSize: 15, fontWeight: '600', color: c.textSecondary },
    submitBtn: { fontSize: 15, fontWeight: '700', color: c.blush },
    submitDisabled: { opacity: 0.4 },
    body: { padding: 20, gap: 6 },
    label: { fontSize: 13, fontWeight: '700', color: c.textSecondary, marginTop: 10, marginBottom: 4 },
    input: {
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 14,
      fontSize: 15,
      color: c.textPrimary,
      fontWeight: '500',
    },
    textarea: { height: 100 },
    typeRow: { flexDirection: 'row', gap: 8 },
    typeChip: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: 'center',
    },
    typeChipActive: { backgroundColor: c.blush },
    typeChipText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    typeChipTextActive: { color: '#fff', fontWeight: '700' },
    tagsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tagChip: {
      backgroundColor: c.card,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    tagChipActive: { backgroundColor: c.cardLavender, borderWidth: 1.5, borderColor: c.lavender },
    tagChipText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    tagChipTextActive: { color: c.textPrimary, fontWeight: '700' },
    freeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
    freeToggle: {
      backgroundColor: c.card,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 7,
    },
    freeToggleActive: { backgroundColor: c.cardSage ?? c.card, borderWidth: 1.5, borderColor: c.sage ?? c.lavender },
    freeToggleText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
    freeToggleTextActive: { color: c.textPrimary, fontWeight: '700' },
    hint: { fontSize: 13, color: c.textMuted, fontWeight: '500', lineHeight: 18, marginTop: 14 },
  });

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MomGroupDirectory({ onBack }: { onBack: () => void }) {
  const c = useColors();
  const s = mainStyles(c);

  const [country, setCountry]   = useState('United States');
  const [state, setState]       = useState('');
  const [city, setCity]         = useState('');

  const [searchedLabel, setSearchedLabel] = useState('');
  const [localGroups, setLocalGroups]   = useState<MomGroup[]>([]);
  const [onlineGroups, setOnlineGroups] = useState<MomGroup[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [onlineLoading, setOnlineLoading] = useState(true);
  const [showSuggest, setShowSuggest]   = useState(false);

  // Fetch online/hybrid groups on mount
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('mom_groups')
        .select('*')
        .in('type', ['online', 'hybrid'])
        .order('name');
      setOnlineGroups(data ?? []);
      setOnlineLoading(false);
    })();
  }, []);

  const canSearch = !!country && (!!state.trim() || !!city.trim());

  const searchLocal = async () => {
    if (!canSearch) return;
    setLocalLoading(true);
    setSearchedLabel([city.trim(), state.trim(), country].filter(Boolean).join(', '));

    let q = supabase
      .from('mom_groups')
      .select('*')
      .eq('type', 'in_person')
      .eq('country', country);
    if (state.trim()) q = q.ilike('state_name', state.trim());
    if (city.trim())  q = q.ilike('city', city.trim());
    q = q.order('name');

    const { data } = await q;
    setLocalGroups(data ?? []);
    setLocalLoading(false);
  };

  const hasSearched = searchedLabel.length > 0;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Resources</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Title */}
        <Text style={s.pageTitle}>Mom Group Directory</Text>
        <Text style={s.pageSubtitle}>
          Find your people — local meetups, online communities, and support groups
        </Text>

        {/* Find local groups */}
        <View style={s.locationCard}>
          <Text style={s.searchLabel}>📍 Find local groups</Text>
          <Text style={s.searchHint}>Pick your country, then your region and city.</Text>
          <LocationPicker
            country={country}
            state={state}
            city={city}
            setCountry={setCountry}
            setState={setState}
            setCity={setCity}
            c={c}
          />
          <TouchableOpacity
            style={[s.searchBtn, !canSearch && s.searchBtnDisabled]}
            onPress={searchLocal}
            disabled={!canSearch}
          >
            <Text style={s.searchBtnText}>Search</Text>
          </TouchableOpacity>
        </View>

        {/* Local results */}
        {hasSearched && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Groups near {searchedLabel}</Text>
            {localLoading ? (
              <ActivityIndicator color={c.blush} style={{ marginTop: 20 }} />
            ) : localGroups.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyEmoji}>🌱</Text>
                <Text style={s.emptyTitle}>No groups listed yet</Text>
                <Text style={s.emptyText}>
                  Know a great group in {searchedLabel}? Be the first to add it!
                </Text>
                <TouchableOpacity style={s.suggestBtnLarge} onPress={() => setShowSuggest(true)}>
                  <Text style={s.suggestBtnLargeText}>+ Add a Group</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.list}>
                {localGroups.map(g => <GroupCard key={g.id} group={g} c={c} />)}
              </View>
            )}
          </View>
        )}

        {/* Online / national groups */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Online & National Groups</Text>
          <Text style={s.sectionSubtitle}>These groups are open to everyone</Text>
          {onlineLoading ? (
            <ActivityIndicator color={c.blush} style={{ marginTop: 20 }} />
          ) : onlineGroups.length === 0 ? (
            <View style={s.emptySmall}>
              <Text style={s.emptySmallText}>No online groups listed yet.</Text>
            </View>
          ) : (
            <View style={s.list}>
              {onlineGroups.map(g => <GroupCard key={g.id} group={g} c={c} />)}
            </View>
          )}
        </View>

        {/* Suggest CTA */}
        <View style={s.suggestCta}>
          <Text style={s.suggestCtaTitle}>Know a group that's not listed?</Text>
          <Text style={s.suggestCtaText}>
            Help parents find their people — suggest a group and we'll review it.
          </Text>
          <TouchableOpacity style={s.suggestCtaBtn} onPress={() => setShowSuggest(true)}>
            <Text style={s.suggestCtaBtnText}>+ Suggest a Group</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <SuggestModal visible={showSuggest} onClose={() => setShowSuggest(false)} c={c} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const mainStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backArrow: { fontSize: 20, color: c.textSecondary, fontWeight: '700' },
    backLabel: { fontSize: 15, color: c.textSecondary, fontWeight: '700' },

    scroll: { padding: 20, paddingBottom: 40 },
    pageTitle: { fontSize: 26, fontWeight: '800', color: c.textPrimary, marginBottom: 6 },
    pageSubtitle: { fontSize: 14, color: c.textMuted, fontWeight: '500', lineHeight: 20, marginBottom: 20 },

    locationCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 24,
    },
    searchLabel: { fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 4 },
    searchHint: { fontSize: 13, color: c.textMuted, fontWeight: '500', marginBottom: 14 },
    searchBtn: {
      backgroundColor: c.blush,
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 2,
    },
    searchBtnDisabled: { opacity: 0.45 },
    searchBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

    section: { marginBottom: 28 },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: c.textPrimary, marginBottom: 4 },
    sectionSubtitle: { fontSize: 13, color: c.textMuted, fontWeight: '500', marginBottom: 12 },
    list: { gap: 12 },

    empty: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 28,
      alignItems: 'center',
      gap: 8,
    },
    emptyEmoji: { fontSize: 36 },
    emptyTitle: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
    emptyText: { fontSize: 14, color: c.textMuted, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
    suggestBtnLarge: {
      marginTop: 6,
      backgroundColor: c.blush,
      borderRadius: 20,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    suggestBtnLargeText: { fontSize: 14, fontWeight: '700', color: '#fff' },

    emptySmall: { paddingVertical: 20, alignItems: 'center' },
    emptySmallText: { fontSize: 14, color: c.textMuted, fontWeight: '500' },

    suggestCta: {
      backgroundColor: c.cardBlush,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: c.blush,
      padding: 20,
      gap: 6,
      alignItems: 'flex-start',
    },
    suggestCtaTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    suggestCtaText: { fontSize: 14, color: c.textSecondary, fontWeight: '500', lineHeight: 20 },
    suggestCtaBtn: {
      marginTop: 6,
      backgroundColor: c.blush,
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 9,
    },
    suggestCtaBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  });
