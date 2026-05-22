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
} from 'react-native';
import { useColors, Colors } from '../lib/theme';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type GroupType = 'in_person' | 'online' | 'hybrid';

type MomGroup = {
  id: string;
  name: string;
  type: GroupType;
  city: string | null;
  state_name: string | null;
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
      {(group.city || group.state_name) && (
        <Text style={s.location}>
          📍 {[group.city, group.state_name].filter(Boolean).join(', ')}
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
  const [city, setCity]           = useState('');
  const [stateVal, setStateVal]   = useState('');
  const [desc, setDesc]           = useState('');
  const [schedule, setSchedule]   = useState('');
  const [link, setLink]           = useState('');
  const [isFree, setIsFree]       = useState(true);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const s = suggestStyles(c);

  const reset = () => {
    setName(''); setType('in_person'); setCity(''); setStateVal('');
    setDesc(''); setSchedule(''); setLink(''); setIsFree(true); setSelectedTags([]);
  };

  const toggleTag = (tag: string) =>
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );

  const submit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('group_suggestions').insert({
        name: name.trim(),
        type,
        city: city.trim() || null,
        state_name: stateVal.trim() || null,
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

            {/* Location (in-person only) */}
            {type !== 'online' && (
              <>
                <Text style={s.label}>City</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. Austin"
                  placeholderTextColor={c.textMuted}
                  value={city}
                  onChangeText={setCity}
                />
                <Text style={s.label}>State</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. TX or Texas"
                  placeholderTextColor={c.textMuted}
                  value={stateVal}
                  onChangeText={setStateVal}
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
              We review all submissions before adding them to the directory. Thank you for helping grow the village!
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
    label: { fontSize: 13, fontWeight: '700', color: c.textSecondary, marginTop: 10 },
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

  const [cityQuery, setCityQuery]       = useState('');
  const [searchedCity, setSearchedCity] = useState('');
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

  const searchLocal = async () => {
    const q = cityQuery.trim();
    if (!q) return;
    setLocalLoading(true);
    setSearchedCity(q);
    const { data } = await supabase
      .from('mom_groups')
      .select('*')
      .eq('type', 'in_person')
      .or(`city.ilike.%${q}%,state_name.ilike.%${q}%`)
      .order('name');
    setLocalGroups(data ?? []);
    setLocalLoading(false);
  };

  const hasSearched = searchedCity.length > 0;

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

        {/* Search */}
        <View style={s.searchCard}>
          <Text style={s.searchLabel}>📍 Search by city</Text>
          <View style={s.searchRow}>
            <TextInput
              style={s.searchInput}
              placeholder="e.g. Austin, Portland, Chicago..."
              placeholderTextColor={c.textMuted}
              value={cityQuery}
              onChangeText={setCityQuery}
              onSubmitEditing={searchLocal}
              returnKeyType="search"
            />
            <TouchableOpacity
              style={[s.searchBtn, !cityQuery.trim() && s.searchBtnDisabled]}
              onPress={searchLocal}
              disabled={!cityQuery.trim()}
            >
              <Text style={s.searchBtnText}>Search</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Local results */}
        {hasSearched && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Groups near {searchedCity}</Text>
            {localLoading ? (
              <ActivityIndicator color={c.blush} style={{ marginTop: 20 }} />
            ) : localGroups.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyEmoji}>🌱</Text>
                <Text style={s.emptyTitle}>No groups listed yet</Text>
                <Text style={s.emptyText}>
                  Know a great mom group in {searchedCity}? Be the first to add it!
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
          <Text style={s.sectionSubtitle}>These groups welcome moms everywhere</Text>
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
            Help other moms find their people — suggest a group and we'll review it.
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

    searchCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      gap: 10,
      marginBottom: 24,
    },
    searchLabel: { fontSize: 14, fontWeight: '700', color: c.textSecondary },
    searchRow: { flexDirection: 'row', gap: 10 },
    searchInput: {
      flex: 1,
      backgroundColor: c.bg,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      color: c.textPrimary,
      fontWeight: '500',
    },
    searchBtn: {
      backgroundColor: c.blush,
      borderRadius: 12,
      paddingHorizontal: 16,
      justifyContent: 'center',
    },
    searchBtnDisabled: { opacity: 0.45 },
    searchBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

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
