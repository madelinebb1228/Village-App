import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator, Alert, Image, Modal, ScrollView,
  StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { Colors, useColors } from '../lib/theme'
import LoadErrorBanner from '../components/LoadErrorBanner'
import {
  INTERESTS, KIDS_AGES, LOOKING_FOR, PARENTING_STYLES,
  MatchResult, MatchingProfile,
  findMatches, hasMatchingProfile, loadMyMatchingProfile,
  openOrCreateConversation, saveMatchingProfile, sendIntroMessage,
} from '../lib/matchingEngine'

// ─── Types ────────────────────────────────────────────────────────────────────

type SheetView = 'loading' | 'setup' | 'matches'

// ─── ChipGroup ────────────────────────────────────────────────────────────────

function ChipGroup({
  label, options, selected, onToggle, accent,
}: {
  label: string
  options: readonly { value: string; label: string }[]
  selected: string[]
  onToggle: (v: string) => void
  accent: string
}) {
  const c = useColors()
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary, marginBottom: 10 }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map(opt => {
          const active = selected.includes(opt.value)
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onToggle(opt.value)}
              activeOpacity={0.75}
              style={{
                paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                borderWidth: 1.5,
                backgroundColor: active ? accent + '22' : c.inputBg,
                borderColor: active ? accent : c.separator,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? accent : c.textMuted }}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

// ─── MatchCard ────────────────────────────────────────────────────────────────

function MatchCard({
  result, myId, onConnected,
}: {
  result: MatchResult
  myId: string
  onConnected: (name: string) => void
}) {
  const c   = useColors()
  const s   = useMemo(() => makeMatchCardStyles(c), [c])
  const { profile, score, reasons } = result

  const [connecting, setConnecting] = useState(false)
  const [connected,  setConnected]  = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const displayName = profile.display_name || profile.username || 'Parent'
  const initials    = displayName.charAt(0).toUpperCase()

  const scoreColor = score >= 70 ? c.sage : score >= 45 ? c.lavender : c.honey
  const scoreBg    = score >= 70 ? c.cardSage : score >= 45 ? c.cardLavender : c.cardHoney

  async function handleSend() {
    if (!draft.trim()) return
    setSending(true)
    try {
      const convId = await openOrCreateConversation(myId, profile.id)
      if (!convId) throw new Error('Could not start conversation')
      await sendIntroMessage(convId, myId, draft.trim())
      setConnected(true)
      setShowCompose(false)
      onConnected(displayName)
    } catch (err: any) {
      Alert.alert('Could not send', err?.message ?? 'Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <View style={s.card}>
      {/* Header row */}
      <View style={s.headerRow}>
        <View style={s.avatarWrap}>
          {profile.avatar_url
            ? <Image source={{ uri: profile.avatar_url }} style={s.avatar} />
            : <View style={s.avatarFallback}><Text style={s.avatarInitial}>{initials}</Text></View>
          }
        </View>
        <View style={s.nameBlock}>
          <Text style={s.displayName} numberOfLines={1}>{displayName}</Text>
          {profile.username && <Text style={s.username}>@{profile.username}</Text>}
          {profile.parent_role && <Text style={s.role}>{profile.parent_role}</Text>}
        </View>
        <View style={[s.scoreBadge, { backgroundColor: scoreBg }]}>
          <Text style={[s.scoreText, { color: scoreColor }]}>{score}%</Text>
          <Text style={s.scoreLabel}>match</Text>
        </View>
      </View>

      {/* Reasons */}
      <View style={s.reasonsBlock}>
        {reasons.slice(0, 3).map((r, i) => (
          <View key={i} style={s.reasonRow}>
            <Text style={s.reasonDot}>🔗</Text>
            <Text style={s.reasonText}>{r}</Text>
          </View>
        ))}
      </View>

      {/* Bio snippet */}
      {profile.bio && (
        <Text style={s.bio} numberOfLines={2}>{profile.bio}</Text>
      )}

      {/* Connect / compose */}
      {connected ? (
        <View style={s.connectedBadge}>
          <Text style={s.connectedText}>✅ Message sent!</Text>
        </View>
      ) : showCompose ? (
        <View style={s.composeWrap}>
          <TextInput
            style={s.composeInput}
            placeholder={`Introduce yourself to ${displayName}…`}
            placeholderTextColor={c.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            autoFocus
          />
          <View style={s.composeBtns}>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowCompose(false)} activeOpacity={0.7}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.sendBtn, (!draft.trim() || sending) && { opacity: 0.5 }]}
              onPress={handleSend}
              disabled={!draft.trim() || sending}
              activeOpacity={0.8}
            >
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.sendText}>Send</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[s.connectBtn, connecting && { opacity: 0.6 }]}
          onPress={() => setShowCompose(true)}
          disabled={connecting}
          activeOpacity={0.8}
        >
          <Text style={s.connectText}>💬 Connect</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FindYourPatchSheet({
  visible, onClose,
}: {
  visible: boolean
  onClose: () => void
}) {
  const c = useColors()
  const s = useMemo(() => makeStyles(c), [c])

  const [view,    setView]    = useState<SheetView>('loading')
  const [myId,    setMyId]    = useState<string | null>(null)
  const [myProfile, setMyProfile] = useState<MatchingProfile | null>(null)
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [matchesError, setMatchesError] = useState(false)
  const [connectedName, setConnectedName] = useState<string | null>(null)

  // Setup form state
  const [kidsAges,       setKidsAges]       = useState<string[]>([])
  const [interests,      setInterests]      = useState<string[]>([])
  const [styles,         setStyles_]        = useState<string[]>([])
  const [lookingFor,     setLookingFor]     = useState<string[]>([])
  const [city,           setCity]           = useState('')
  const [state,          setState]          = useState('')
  const [matchingOn,     setMatchingOn]     = useState(true)
  const [saving,         setSaving]         = useState(false)

  function toggle(arr: string[], setArr: (v: string[]) => void, val: string) {
    setArr(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val])
  }

  // Load on open
  useEffect(() => {
    if (!visible) return
    setView('loading')
    setConnectedName(null)
    loadProfile()
  }, [visible])

  const loadProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setMyId(user.id)
      const prof = await loadMyMatchingProfile(user.id)
      setMyProfile(prof)

      if (!prof || !hasMatchingProfile(prof)) {
        // Pre-fill form from existing profile data
        if (prof) {
          setKidsAges(prof.kids_ages)
          setInterests(prof.interests)
          setStyles_(prof.parenting_style)
          setLookingFor(prof.looking_for)
          setCity(prof.match_city ?? '')
          setState(prof.match_state ?? '')
          setMatchingOn(prof.matching_enabled)
        }
        setView('setup')
      } else {
        await loadAndShowMatches(prof)
      }
    } catch (err) {
      console.error('[FindYourPatch]', err)
      setView('setup')
    }
  }, [])

  async function loadAndShowMatches(prof: MatchingProfile) {
    setLoadingMatches(true)
    setMatchesError(false)
    setView('matches')
    try {
      const results = await findMatches(prof)
      setMatches(results)
    } catch (err) {
      console.error('[FindYourPatch] findMatches error', err)
      setMatchesError(true)
    } finally {
      setLoadingMatches(false)
    }
  }

  async function handleSaveSetup() {
    if (!myId) return
    if (kidsAges.length === 0 && interests.length === 0) {
      Alert.alert('Add a little more', 'Select at least your children\'s ages or a few interests so we can find good matches.')
      return
    }
    setSaving(true)
    try {
      await saveMatchingProfile(myId, {
        kids_ages:       kidsAges,
        parenting_style: styles,
        interests,
        looking_for:     lookingFor,
        match_city:      city.trim() || null,
        match_state:     state.trim() || null,
        matching_enabled: matchingOn,
      })
      const updatedProfile: MatchingProfile = {
        ...(myProfile ?? {
          id: myId, display_name: null, username: null, avatar_url: null,
          parent_role: null, bio: null,
        }),
        kids_ages:       kidsAges,
        parenting_style: styles,
        interests,
        looking_for:     lookingFor,
        match_city:      city.trim() || null,
        match_state:     state.trim() || null,
        matching_enabled: matchingOn,
      } as MatchingProfile
      setMyProfile(updatedProfile)
      await loadAndShowMatches(updatedProfile)
    } catch (err: any) {
      Alert.alert('Save failed', err?.message ?? 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={s.safe}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
            <Text style={s.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>
            {view === 'setup' ? '🤝 Set Up Your Profile' : '🤝 Meet Parents Like You'}
          </Text>
          <View style={s.closeBtn} />
        </View>

        {/* Loading */}
        {view === 'loading' && (
          <View style={s.center}>
            <ActivityIndicator size="large" color={c.primary} />
          </View>
        )}

        {/* Setup form */}
        {view === 'setup' && (
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.setupSubtitle}>
              Tell us about your family so we can match you with parents who just get it.
            </Text>

            <ChipGroup
              label="Your children's ages"
              options={KIDS_AGES}
              selected={kidsAges}
              onToggle={v => toggle(kidsAges, setKidsAges, v)}
              accent={c.lavender}
            />

            <ChipGroup
              label="Interests & situation"
              options={INTERESTS}
              selected={interests}
              onToggle={v => toggle(interests, setInterests, v)}
              accent={c.sage}
            />

            <ChipGroup
              label="Parenting style"
              options={PARENTING_STYLES}
              selected={styles}
              onToggle={v => toggle(styles, setStyles_, v)}
              accent={c.blush}
            />

            <ChipGroup
              label="What are you looking for?"
              options={LOOKING_FOR}
              selected={lookingFor}
              onToggle={v => toggle(lookingFor, setLookingFor, v)}
              accent={c.honey}
            />

            {/* Location */}
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary, marginBottom: 10 }}>
              Location (optional, for local matching)
            </Text>
            <Text style={{ fontSize: 12, color: c.textMuted, marginBottom: 10 }}>
              Only your city is shown to matches — never your exact location.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="City"
                placeholderTextColor={c.textMuted}
                value={city}
                onChangeText={setCity}
              />
              <TextInput
                style={[s.input, { width: 80 }]}
                placeholder="State"
                placeholderTextColor={c.textMuted}
                value={state}
                onChangeText={setState}
                autoCapitalize="characters"
                maxLength={2}
              />
            </View>

            {/* Privacy toggle */}
            <View style={s.privacyRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.privacyLabel}>Show me in matching</Text>
                <Text style={s.privacyHint}>Turn off to hide your profile from matches</Text>
              </View>
              <Switch
                value={matchingOn}
                onValueChange={setMatchingOn}
                trackColor={{ false: c.separator, true: c.lavender }}
                thumbColor="#fff"
              />
            </View>

            <TouchableOpacity
              style={[s.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSaveSetup}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.saveBtnText}>Find My Patch →</Text>
              }
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        )}

        {/* Matches view */}
        {view === 'matches' && (
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Connection success toast */}
            {connectedName && (
              <View style={s.successToast}>
                <Text style={s.successToastText}>🎉 Message sent to {connectedName}! Check your inbox.</Text>
              </View>
            )}

            {/* Edit profile link */}
            <TouchableOpacity
              style={s.editProfileBtn}
              onPress={() => {
                if (myProfile) {
                  setKidsAges(myProfile.kids_ages)
                  setInterests(myProfile.interests)
                  setStyles_(myProfile.parenting_style)
                  setLookingFor(myProfile.looking_for)
                  setCity(myProfile.match_city ?? '')
                  setState(myProfile.match_state ?? '')
                  setMatchingOn(myProfile.matching_enabled)
                }
                setView('setup')
              }}
              activeOpacity={0.7}
            >
              <Text style={s.editProfileText}>✏️ Edit my matching profile</Text>
            </TouchableOpacity>

            {loadingMatches ? (
              <View style={s.center}>
                <ActivityIndicator size="large" color={c.primary} />
                <Text style={s.loadingText}>Finding your people…</Text>
              </View>
            ) : matchesError ? (
              <View style={s.center}>
                <LoadErrorBanner
                  message="Couldn't load matches."
                  onRetry={() => { if (myProfile) loadAndShowMatches(myProfile); }}
                />
              </View>
            ) : matches.length === 0 ? (
              <View style={s.emptyState}>
                <Text style={s.emptyIcon}>🌿</Text>
                <Text style={s.emptyTitle}>No matches yet</Text>
                <Text style={s.emptyBody}>
                  Be one of the first! As more parents join the app, you'll start seeing matches here. Try adding more interests to improve your chances.
                </Text>
                <TouchableOpacity
                  style={[s.saveBtn, { marginTop: 20 }]}
                  onPress={() => { setView('setup') }}
                  activeOpacity={0.85}
                >
                  <Text style={s.saveBtnText}>Update my profile</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={s.matchCount}>
                  {matches.length} match{matches.length !== 1 ? 'es' : ''} found
                </Text>
                {myId && matches.map(result => (
                  <MatchCard
                    key={result.profile.id}
                    result={result}
                    myId={myId}
                    onConnected={name => setConnectedName(name)}
                  />
                ))}
              </>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safe:          { flex: 1, backgroundColor: c.bg },
    header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.separator },
    headerTitle:   { fontSize: 17, fontWeight: '700', color: c.textPrimary },
    closeBtn:      { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
    closeText:     { fontSize: 16, color: c.textMuted, fontWeight: '600' },
    center:        { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
    scroll:        { flex: 1 },
    scrollContent: { padding: 20 },
    setupSubtitle: { fontSize: 14, color: c.textMuted, lineHeight: 20, marginBottom: 24 },
    input: {
      backgroundColor: c.inputBg, borderRadius: 10, borderWidth: 1.5,
      borderColor: c.inputBorder, paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 14, color: c.textPrimary,
    },
    privacyRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 12, padding: 14, marginBottom: 24, borderWidth: 1, borderColor: c.separator },
    privacyLabel:  { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    privacyHint:   { fontSize: 12, color: c.textMuted, marginTop: 2 },
    saveBtn:       { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    saveBtnText:   { fontSize: 15, fontWeight: '700', color: '#fff' },
    editProfileBtn: { alignSelf: 'flex-end', marginBottom: 12 },
    editProfileText: { fontSize: 13, color: c.lavender, fontWeight: '600' },
    matchCount:    { fontSize: 13, color: c.textMuted, marginBottom: 12 },
    loadingText:   { fontSize: 14, color: c.textMuted, marginTop: 12 },
    emptyState:    { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
    emptyIcon:     { fontSize: 48, marginBottom: 12 },
    emptyTitle:    { fontSize: 18, fontWeight: '700', color: c.textPrimary, marginBottom: 8 },
    emptyBody:     { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 21 },
    successToast:  { backgroundColor: c.cardSage, borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: c.sage },
    successToastText: { fontSize: 13, color: c.sage, fontWeight: '600' },
  })
}

function makeMatchCardStyles(c: Colors) {
  return StyleSheet.create({
    card:          { backgroundColor: c.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: c.separator },
    headerRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
    avatarWrap:    { flexShrink: 0 },
    avatar:        { width: 48, height: 48, borderRadius: 24 },
    avatarFallback:{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.cardBlush, justifyContent: 'center', alignItems: 'center' },
    avatarInitial: { fontSize: 20, fontWeight: '700', color: c.blush },
    nameBlock:     { flex: 1 },
    displayName:   { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    username:      { fontSize: 12, color: c.textMuted },
    role:          { fontSize: 12, color: c.textMuted },
    scoreBadge:    { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    scoreText:     { fontSize: 16, fontWeight: '800' },
    scoreLabel:    { fontSize: 10, color: '#888', marginTop: -1 },
    reasonsBlock:  { marginBottom: 10 },
    reasonRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4 },
    reasonDot:     { fontSize: 12, marginTop: 1 },
    reasonText:    { fontSize: 13, color: c.textSecondary, flex: 1, lineHeight: 18 },
    bio:           { fontSize: 12, color: c.textMuted, lineHeight: 17, marginBottom: 10, fontStyle: 'italic' },
    connectBtn:    { backgroundColor: c.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
    connectText:   { fontSize: 14, fontWeight: '700', color: '#fff' },
    connectedBadge:{ backgroundColor: c.cardSage, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
    connectedText: { fontSize: 14, fontWeight: '700', color: c.sage },
    composeWrap:   { backgroundColor: c.inputBg, borderRadius: 10, padding: 10 },
    composeInput:  { minHeight: 70, fontSize: 14, color: c.textPrimary, marginBottom: 8 },
    composeBtns:   { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    cancelBtn:     { paddingHorizontal: 14, paddingVertical: 8 },
    cancelText:    { fontSize: 14, color: c.textMuted },
    sendBtn:       { backgroundColor: c.primary, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 },
    sendText:      { fontSize: 14, fontWeight: '700', color: '#fff' },
  })
}
