import React, { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, Modal,
  ActivityIndicator, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';
import { typography } from '../lib/typography';
import { hitSlopFor } from '../lib/accessibility';
import { useResponsive, maxWidthFor } from '../lib/responsive';
import { Village, VILLAGES } from '../lib/villageData';
import { fetchJoinedPatchIds } from '../lib/discoverData';
import { AppContext } from '../lib/AppContext';
import PatchRequestSafetyNotice from '../components/PatchRequestSafetyNotice';
import { mentionsChildcare } from '../lib/childcareKeywords';
import UserAvatar from '../components/UserAvatar';
import PublicProfileSheet from './PublicProfileSheet';
import MessagesInbox from './MessagesInbox';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: { value: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'meal_train',     label: 'Meal Train',     icon: 'restaurant-outline' },
  { value: 'errand',         label: 'Errand Run',     icon: 'cart-outline' },
  { value: 'recommendation', label: 'Recommend',      icon: 'bulb-outline' },
  { value: 'playdate',       label: 'Playdate',       icon: 'happy-outline' },
  { value: 'emergency',      label: 'Emergency',      icon: 'alert-circle-outline' },
  { value: 'general',        label: 'General Help',   icon: 'chatbubble-outline' },
]

const URGENCY: { value: string; label: string; icon?: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'normal',    label: 'Normal' },
  { value: 'urgent',    label: 'Urgent', icon: 'flash-outline' },
  { value: 'emergency', label: 'ASAP', icon: 'alert-circle-outline' },
]

// `null` = destination not chosen yet (blocks submit when there's a real
// choice to make). `'all'` = explicit "post to every Patch I'm in" — a real,
// existing broadcast option (village_id: null in the DB), not the same as
// "unselected". A specific value is a Patch id.
type Destination = string | 'all' | null;

function getCategoryMeta(value: string) {
  return CATEGORIES.find(c => c.value === value) ?? CATEGORIES[5];
}

function getCategoryColors(value: string, c: Colors) {
  switch (value) {
    case 'meal_train':     return { bg: c.cardHoney,   border: c.honey }
    case 'errand':         return { bg: c.cardBlush,   border: c.blush }
    case 'recommendation': return { bg: c.cardBlue,    border: c.blue }
    case 'playdate':       return { bg: c.cardSage,    border: c.sage }
    case 'emergency':      return { bg: '#FEE2E2',     border: '#DC2626' }
    default:               return { bg: c.cardLavender, border: c.lavender }
  }
}

function getUrgencyColor(urgency: string): string {
  if (urgency === 'emergency') return '#DC2626'
  if (urgency === 'urgent')    return '#D97706'
  return ''
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SheetView = 'feed' | 'create'

interface PatchTask {
  id: string
  creator_id: string
  village_id: string | null
  category: string
  title: string
  description: string | null
  urgency: string
  needed_by: string | null
  status: string
  created_at: string
  profiles: { display_name: string | null; username: string | null } | null
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({
  task, myId, volunteered, volunteerCount, onVolunteer, onWithdraw, onComplete, onOpenProfile, onMessage, s, c,
}: {
  task: PatchTask
  myId: string
  volunteered: boolean
  volunteerCount: number
  onVolunteer: (id: string) => void
  onWithdraw:  (id: string) => void
  onComplete:  (id: string) => void
  onOpenProfile: (userId: string) => void
  onMessage:  (userId: string) => void
  s: ReturnType<typeof makeStyles>
  c: Colors
}) {
  const meta        = getCategoryMeta(task.category)
  const colors      = getCategoryColors(task.category, c)
  const isOwn       = task.creator_id === myId
  const name        = task.profiles?.display_name || task.profiles?.username || 'A parent'
  const patchInfo   = task.village_id ? VILLAGES.find(v => v.id === task.village_id) : null

  return (
    <View style={[s.taskCard, { borderLeftColor: colors.border }]}>
      {/* Author identity first, like a real social post — the community
          member asking is the headline, not the category tag. */}
      <View style={s.taskTopRow}>
        <TouchableOpacity
          style={s.authorRow}
          onPress={() => onOpenProfile(task.creator_id)}
          accessibilityRole="button"
          accessibilityLabel={`View ${name}'s profile`}
          disabled={isOwn}
        >
          <UserAvatar userId={task.creator_id} name={name} size={36} />
          <View>
            <Text style={s.taskAuthor}>{name}</Text>
            <Text style={s.taskMeta}>
              {patchInfo ? `${patchInfo.emoji} ${patchInfo.name}` : 'Parent Patch'} · {timeAgo(task.created_at)}
            </Text>
          </View>
        </TouchableOpacity>
        {task.urgency !== 'normal' && (
          <View style={[s.urgencyBadge, { backgroundColor: getUrgencyColor(task.urgency) }]}>
            <Ionicons name={task.urgency === 'emergency' ? 'alert-circle-outline' : 'flash-outline'} size={11} color="#fff" />
            <Text style={s.urgencyBadgeText}>{task.urgency === 'emergency' ? 'ASAP' : 'Urgent'}</Text>
          </View>
        )}
      </View>

      {/* Category — a small selective accent chip, not a full-card fill */}
      <View style={[s.categoryChip, { backgroundColor: colors.bg, borderColor: colors.border }]}>
        <Ionicons name={meta.icon} size={11} color={colors.border} />
        <Text style={[s.categoryChipText, { color: colors.border }]}>{meta.label}</Text>
      </View>

      {/* Title */}
      <Text style={s.taskTitle}>{task.title}</Text>

      {/* Description */}
      {task.description ? (
        <Text style={s.taskDesc} numberOfLines={3}>{task.description}</Text>
      ) : null}

      {volunteerCount > 0 && (
        <View style={s.volunteerCountRow}>
          <Ionicons name="people-outline" size={12} color={c.textMuted} />
          <Text style={s.volunteerCount}>{volunteerCount} {volunteerCount === 1 ? 'parent' : 'parents'} helping</Text>
        </View>
      )}

      {/* Footer actions */}
      <View style={s.taskFooter}>
        {task.status === 'completed' ? (
          <View style={s.completedBadge}>
            <Ionicons name="checkmark" size={13} color={c.sage} />
            <Text style={s.completedBadgeText}>Done</Text>
          </View>
        ) : isOwn ? (
          // Owner management — visually secondary to the community actions below,
          // never a colored pill, so it doesn't compete with "I Can Help!"/"Message".
          <TouchableOpacity onPress={() => onComplete(task.id)} hitSlop={hitSlopFor(8)}>
            <Text style={s.markDoneLink}>Mark Done</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <TouchableOpacity
              style={s.messageBtn}
              onPress={() => onMessage(task.creator_id)}
              accessibilityRole="button"
              accessibilityLabel={`Message ${name}`}
            >
              <Ionicons name="chatbubble-outline" size={14} color={c.textSecondary} />
            </TouchableOpacity>
            {volunteered ? (
              <TouchableOpacity style={s.helpingBtn} onPress={() => onWithdraw(task.id)}>
                <Ionicons name="checkmark-circle" size={14} color={c.honey} />
                <Text style={s.helpingBtnText}>Helping</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[s.helpBtn, { backgroundColor: colors.border }]}
                onPress={() => onVolunteer(task.id)}
              >
                <Ionicons name="hand-left-outline" size={14} color="#fff" />
                <Text style={s.helpBtnText}>I Can Help!</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  )
}

// ─── Main Sheet ───────────────────────────────────────────────────────────────

interface Props {
  visible: boolean
  onClose: () => void
  /** 'modal' (default): existing mobile full-screen Modal. 'inline': no
   * Modal wrapper, for DesktopSecondaryHost to place beside the sidebar. */
  presentation?: 'modal' | 'inline'
}

export default function PatchTasksSheet({ visible, onClose, presentation = 'modal' }: Props) {
  const c = useColors()
  const s = useMemo(() => makeStyles(c), [c])
  const { width: windowWidth, isDesktop } = useResponsive()
  const { pushSecondary } = useContext(AppContext)
  // Desktop: feed + a compact "Your Patches" rail form a deliberate
  // asymmetric two-column composition instead of one centered column with
  // dead space on either side. Phone/tablet keep the original single
  // centered column, untouched.
  const feedColumnStyle = isDesktop
    ? { width: 640 as const }
    : { width: '100%' as const, maxWidth: maxWidthFor(windowWidth, 'inbox'), alignSelf: 'center' as const }
  const formColumnStyle = { width: '100%' as const, maxWidth: maxWidthFor(windowWidth, 'form'), alignSelf: 'center' as const }

  // Mobile-only fallback targets for the dual-branch openProfile/openMessage
  // below — desktop pushes onto the shared secondary stack instead (see
  // DesktopSecondaryHost).
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [messageUserId, setMessageUserId] = useState<string | null>(null)
  function openProfile(userId: string) {
    if (isDesktop) pushSecondary({ type: 'profile', userId })
    else setProfileUserId(userId)
  }
  function openMessage(userId: string) {
    if (isDesktop) pushSecondary({ type: 'messages', openWithUserId: userId })
    else setMessageUserId(userId)
  }

  // Canonical Patch-membership source (same fetchJoinedPatchIds() +
  // VILLAGES-catalog filter VillageTab.tsx uses) — fetched here directly so
  // this sheet works correctly from ANY entry point (VillageTab's card, the
  // global Create > Ask for Help flow, or DesktopSecondaryHost) without a
  // parent needing to pass membership down as props. `membershipLoading`
  // starts true so an empty `myVillages` is never mistaken for "genuinely
  // zero Patches" before the fetch resolves.
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set())
  const [membershipLoading, setMembershipLoading] = useState(true)
  const myVillages = useMemo(() => VILLAGES.filter(v => joinedIds.has(v.id)), [joinedIds])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setMembershipLoading(true)
    fetchJoinedPatchIds().then(ids => {
      if (!cancelled) { setJoinedIds(ids); setMembershipLoading(false) }
    })
    return () => { cancelled = true }
  }, [visible])

  const [view,          setView]          = useState<SheetView>('feed')
  const [tasks,         setTasks]         = useState<PatchTask[]>([])
  const [myVolunteered, setMyVolunteered] = useState<Set<string>>(new Set())
  const [volCounts,     setVolCounts]     = useState<Record<string, number>>({})
  const [loading,       setLoading]       = useState(false)
  const [myId,          setMyId]          = useState('')
  const [submitting,    setSubmitting]    = useState<string | null>(null) // task id or 'create'

  // Create form state
  const [formCategory,    setFormCategory]    = useState('general')
  const [formTitle,       setFormTitle]       = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formUrgency,     setFormUrgency]     = useState('normal')
  const [formVillageId,   setFormVillageId]   = useState<Destination>(myVillages.length === 1 ? myVillages[0].id : null)
  const showChildcareNudge = useMemo(
    () => mentionsChildcare(`${formTitle} ${formDescription}`),
    [formTitle, formDescription]
  )

  // Feed filter
  const [filterVillageId, setFilterVillageId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setMyId(data.user.id)
    })
  }, [])

  // myVillages can arrive after this sheet first mounts (VillageTab loads
  // membership async) — keep the single-Patch preselect in sync once it does.
  useEffect(() => {
    if (myVillages.length === 1 && formVillageId === null) {
      setFormVillageId(myVillages[0].id)
    }
  }, [myVillages])

  const loadTasks = useCallback(async () => {
    setLoading(true)
    let tasksQuery = (supabase
      .from('patch_tasks') as any)
      .select('id,creator_id,village_id,category,title,description,urgency,needed_by,status,created_at,profiles!creator_id(display_name,username)')
      .in('status', ['open', 'completed'])
      .order('created_at', { ascending: false })
      .limit(60)
    if (filterVillageId !== null) {
      tasksQuery = tasksQuery.eq('village_id', filterVillageId)
    }
    const [tasksRes, myVolRes, allVolRes] = await Promise.all([
      tasksQuery,
      myId
        ? (supabase.from('patch_task_volunteers') as any)
            .select('task_id')
            .eq('user_id', myId)
        : Promise.resolve({ data: [] }),
      (supabase.from('patch_task_volunteers') as any)
        .select('task_id'),
    ])

    if (tasksRes.data) setTasks(tasksRes.data as PatchTask[])

    const mySet = new Set<string>((myVolRes.data ?? []).map((r: any) => r.task_id as string))
    setMyVolunteered(mySet)

    const counts: Record<string, number> = {}
    for (const r of (allVolRes.data ?? [])) {
      counts[r.task_id] = (counts[r.task_id] ?? 0) + 1
    }
    setVolCounts(counts)
    setLoading(false)
  }, [myId, filterVillageId])

  useEffect(() => {
    if (visible && myId) loadTasks()
  }, [visible, myId, loadTasks])

  function resetCreate() {
    setFormCategory('general')
    setFormTitle('')
    setFormDescription('')
    setFormUrgency('normal')
    setFormVillageId(myVillages.length === 1 ? myVillages[0].id : null)
  }

  async function handleCreate() {
    if (!formTitle.trim() || !myId || formVillageId === null) return
    setSubmitting('create')
    const { error } = await (supabase.from('patch_tasks') as any).insert({
      creator_id:  myId,
      village_id:  formVillageId === 'all' ? null : formVillageId,
      category:    formCategory,
      title:       formTitle.trim(),
      description: formDescription.trim() || null,
      urgency:     formUrgency,
      status:      'open',
    })
    setSubmitting(null)
    if (error) { Alert.alert('Could not post', error.message); return }
    resetCreate()
    setView('feed')
    loadTasks()
  }

  async function handleVolunteer(taskId: string) {
    if (!myId) return
    setSubmitting(taskId)
    await (supabase.from('patch_task_volunteers') as any).insert({ task_id: taskId, user_id: myId })
    setSubmitting(null)
    setMyVolunteered(prev => new Set([...prev, taskId]))
    setVolCounts(prev => ({ ...prev, [taskId]: (prev[taskId] ?? 0) + 1 }))
  }

  async function handleWithdraw(taskId: string) {
    if (!myId) return
    await (supabase.from('patch_task_volunteers') as any)
      .delete()
      .eq('task_id', taskId)
      .eq('user_id', myId)
    setMyVolunteered(prev => { const n = new Set(prev); n.delete(taskId); return n })
    setVolCounts(prev => ({ ...prev, [taskId]: Math.max(0, (prev[taskId] ?? 1) - 1) }))
  }

  async function handleComplete(taskId: string) {
    Alert.alert('Mark as done?', 'This will close the request.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Done', style: 'default',
        onPress: async () => {
          await (supabase.from('patch_tasks') as any).update({ status: 'completed' }).eq('id', taskId)
          setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'completed' } : t))
        },
      },
    ])
  }

  // Sort: emergency open first, then open by newest, then completed at bottom
  const sortedTasks = useMemo(() => {
    const open  = tasks.filter(t => t.status === 'open')
    const done  = tasks.filter(t => t.status === 'completed')
    const emergency = open.filter(t => t.urgency === 'emergency')
    const rest      = open.filter(t => t.urgency !== 'emergency')
    return [...emergency, ...rest, ...done]
  }, [tasks])

  const openCount = tasks.filter(t => t.status === 'open').length

  if (presentation === 'inline' && !visible) return null
  const Wrapper: any = presentation === 'modal' ? Modal : React.Fragment
  const wrapperProps: any = presentation === 'modal'
    ? { visible, animationType: 'slide', presentationStyle: 'pageSheet', onRequestClose: onClose }
    : {}

  return (
    <>
    <Wrapper {...wrapperProps}>
      <SafeAreaView style={s.safe}>
        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity onPress={view === 'create' ? () => setView('feed') : onClose} style={s.headerLeft}
            hitSlop={hitSlopFor(20)} accessibilityRole="button"
            accessibilityLabel={view === 'create' ? 'Back' : 'Close'}>
            <Ionicons name={view === 'create' ? 'chevron-back' : 'close'} size={22} color={view === 'create' ? c.primary : c.textPrimary} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { flex: 1, textAlign: 'center' }]}>
            {view === 'create' ? 'New Request' : 'Patch Requests'}
          </Text>
          <View style={s.headerRight}>
            {view === 'feed' && (
              <TouchableOpacity style={s.newBtn} onPress={() => setView('create')} accessibilityRole="button" accessibilityLabel="New request">
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={s.newBtnText}>New</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Feed ── */}
        {view === 'feed' && (
          <View style={isDesktop ? s.desktopSplitRow : s.mobileFeedWrap}>
            <ScrollView
              style={isDesktop ? { width: 640, flexGrow: 0 } : { flex: 1 }}
              contentContainerStyle={[s.feedScrollContent, !isDesktop && feedColumnStyle]}
              showsVerticalScrollIndicator={false}
            >
              {/* Header block — a real page heading, not a thin utility
                  strip, so this reads as its own destination rather than a
                  sheet pasted beside the sidebar. */}
              <View style={s.boardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.boardTitle}>Community Help Board</Text>
                  <Text style={s.boardSubtitle}>Ask for anything, or lend a hand when you can.</Text>
                </View>
                {openCount > 0 && (
                  <View style={s.openBadge}>
                    <Text style={s.openBadgeNum}>{openCount}</Text>
                    <Text style={s.openBadgeText}>open</Text>
                  </View>
                )}
              </View>

              <PatchRequestSafetyNotice style={{ marginHorizontal: 0 }} />

              {/* Patch filter pills — phone/tablet only; desktop filters
                  from the "Your Patches" rail instead (see below). */}
              {!isDesktop && myVillages.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={s.filterScroll}
                  contentContainerStyle={s.filterScrollContent}
                >
                  <TouchableOpacity
                    style={[s.filterPill, filterVillageId === null && s.filterPillActive]}
                    onPress={() => setFilterVillageId(null)}
                  >
                    <Text style={[s.filterPillText, filterVillageId === null && s.filterPillTextActive]}>
                      All Patches
                    </Text>
                  </TouchableOpacity>
                  {myVillages.map(v => (
                    <TouchableOpacity
                      key={v.id}
                      style={[s.filterPill, filterVillageId === v.id && s.filterPillActive]}
                      onPress={() => setFilterVillageId(prev => prev === v.id ? null : v.id)}
                    >
                      <Text style={[s.filterPillText, filterVillageId === v.id && s.filterPillTextActive]}>
                        {v.emoji} {v.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {isDesktop && filterVillageId !== null && (
                <View style={s.activeFilterRow}>
                  <Text style={s.activeFilterText}>
                    Showing {VILLAGES.find(v => v.id === filterVillageId)?.name ?? 'this Patch'} only
                  </Text>
                  <TouchableOpacity onPress={() => setFilterVillageId(null)} hitSlop={hitSlopFor(20)}>
                    <Text style={s.activeFilterClear}>Show all</Text>
                  </TouchableOpacity>
                </View>
              )}

              {loading ? (
                <View style={s.center}>
                  <ActivityIndicator color={c.primary} size="large" />
                </View>
              ) : sortedTasks.length === 0 ? (
                <View style={s.emptyState}>
                  <Ionicons name="home-outline" size={40} color={c.textMuted} style={{ marginBottom: 12 }} />
                  <Text style={s.emptyTitle}>No requests yet</Text>
                  <Text style={s.emptySub}>
                    Be the first to ask for help or offer your neighbors something.
                  </Text>
                  <TouchableOpacity style={s.emptyBtn} onPress={() => setView('create')}>
                    <Text style={s.emptyBtnText}>Post a Request</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  {sortedTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      myId={myId}
                      volunteered={myVolunteered.has(task.id)}
                      volunteerCount={volCounts[task.id] ?? 0}
                      onVolunteer={handleVolunteer}
                      onWithdraw={handleWithdraw}
                      onComplete={handleComplete}
                      onOpenProfile={openProfile}
                      onMessage={openMessage}
                      s={s}
                      c={c}
                    />
                  ))}
                </View>
              )}
              <View style={{ height: 40 }} />
            </ScrollView>

            {/* Desktop-only contextual rail — real joined-Patch data already
                loaded above, doubling as the desktop filter control instead
                of repeating the mobile pill row beside a wide empty canvas. */}
            {isDesktop && (
              <View style={s.rail}>
                <View style={s.railCard}>
                  <Text style={s.railTitle}>Your Patches</Text>
                  <TouchableOpacity
                    style={[s.railRow, filterVillageId === null && s.railRowActive]}
                    onPress={() => setFilterVillageId(null)}
                    accessibilityRole="button" accessibilityLabel="Show requests from all your Patches"
                  >
                    <View style={[s.railEmojiBubble, { backgroundColor: c.cardLavender }]}>
                      <Ionicons name="apps" size={14} color={c.primary} />
                    </View>
                    <Text style={[s.railRowText, filterVillageId === null && s.railRowTextActive]}>All Patches</Text>
                  </TouchableOpacity>
                  {myVillages.length === 0 ? (
                    <Text style={s.railEmptyText}>Join a Patch to start asking for help.</Text>
                  ) : (
                    myVillages.map(v => (
                      <TouchableOpacity
                        key={v.id}
                        style={[s.railRow, filterVillageId === v.id && s.railRowActive]}
                        onPress={() => setFilterVillageId(prev => prev === v.id ? null : v.id)}
                        accessibilityRole="button" accessibilityLabel={`Filter requests to ${v.name}`}
                      >
                        <View style={s.railEmojiBubble}>
                          <Text style={s.railEmoji}>{v.emoji}</Text>
                        </View>
                        <Text style={[s.railRowText, filterVillageId === v.id && s.railRowTextActive]} numberOfLines={1}>{v.name}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>

                <View style={s.railCard}>
                  <Text style={s.railTitle}>Post a Request</Text>
                  <Text style={s.railHint}>Need a hand? Your Patch is here for you.</Text>
                  <TouchableOpacity style={s.railCta} onPress={() => setView('create')} accessibilityRole="button" accessibilityLabel="New request">
                    <Ionicons name="add" size={15} color="#fff" />
                    <Text style={s.railCtaText}>New Request</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── Create Form ── */}
        {view === 'create' && membershipLoading ? (
          <View style={s.center}>
            <ActivityIndicator color={c.primary} size="large" />
          </View>
        ) : view === 'create' && myVillages.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="home-outline" size={40} color={c.textMuted} style={{ marginBottom: 12 }} />
            <Text style={s.emptyTitle}>Join a Patch first</Text>
            <Text style={s.emptySub}>
              Requests go out to a Patch you belong to — join one to start asking for help.
            </Text>
            <TouchableOpacity style={s.emptyBtn} onPress={onClose}>
              <Text style={s.emptyBtnText}>Discover Patches</Text>
            </TouchableOpacity>
          </View>
        ) : view === 'create' && (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView contentContainerStyle={[s.createContent, formColumnStyle]} showsVerticalScrollIndicator={false}>

              <Text style={s.composerTitle}>New Request</Text>
              <Text style={s.composerSubtitle}>Share what you need with your Patch.</Text>

              {/* Post to (patch selector) — required */}
              <Text style={s.formLabel}>Where should this go?</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 4 }}
                contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
              >
                {myVillages.length > 1 && (
                  <TouchableOpacity
                    style={[s.patchPill, formVillageId === 'all' && s.patchPillActive]}
                    onPress={() => setFormVillageId('all')}
                    accessibilityRole="button" accessibilityState={{ selected: formVillageId === 'all' }}
                  >
                    <Ionicons name="apps-outline" size={14} color={formVillageId === 'all' ? c.primary : c.textMuted} />
                    <Text style={[s.patchPillText, formVillageId === 'all' && s.patchPillTextActive]}>All Patches</Text>
                  </TouchableOpacity>
                )}
                {myVillages.map(v => (
                  <TouchableOpacity
                    key={v.id}
                    style={[s.patchPill, formVillageId === v.id && s.patchPillActive]}
                    onPress={() => setFormVillageId(v.id)}
                    accessibilityRole="button" accessibilityState={{ selected: formVillageId === v.id }}
                  >
                    <Text style={[s.patchPillText, formVillageId === v.id && s.patchPillTextActive]}>
                      {v.emoji} {v.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={s.patchPillHint}>
                {formVillageId === null
                  ? 'Choose where this request should go.'
                  : formVillageId === 'all'
                  ? 'Visible to everyone across all your Patches.'
                  : 'Only members of this Patch will see your request.'}
              </Text>

              {/* Compose block — title + details are the actual request,
                  front and center; category/urgency are refinements below. */}
              <Text style={s.formLabel}>What do you need?</Text>
              <TextInput
                style={s.titleInput}
                placeholder={
                  formCategory === 'meal_train'      ? 'e.g. "Meal train for our new arrival"' :
                  formCategory === 'errand'           ? 'e.g. "Can someone grab diapers? Running low!"' :
                  formCategory === 'recommendation'   ? 'e.g. "Best pediatrician near Elmwood Park?"' :
                  formCategory === 'playdate'         ? 'e.g. "Who\'s free Tuesday 10am for a playdate?"' :
                  formCategory === 'emergency'        ? 'e.g. "Stuck at work — can someone get Lily from daycare?"' :
                  'e.g. "Could use a hand with..."'
                }
                placeholderTextColor={c.textMuted}
                value={formTitle}
                onChangeText={setFormTitle}
                maxLength={100}
              />
              <TextInput
                style={s.descInput}
                placeholder="Add details that would help people who want to help you... (optional)"
                placeholderTextColor={c.textMuted}
                value={formDescription}
                onChangeText={setFormDescription}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
              />

              {showChildcareNudge && (
                <View style={s.childcareNudge}>
                  <Ionicons name="people-outline" size={16} color={c.blue} style={{ marginTop: 1 }} />
                  <Text style={s.childcareNudgeText}>
                    Planning to have someone watch your child? Choose someone you personally know
                    and trust, or a screened professional — not someone you've only connected with
                    through the app.
                  </Text>
                </View>
              )}

              {/* Category — light, mostly borderless chips; color only on
                  the selected one. */}
              <Text style={s.formLabel}>What kind of help?</Text>
              <View style={s.categoryGrid}>
                {CATEGORIES.map(cat => {
                  const active = formCategory === cat.value
                  const colors = getCategoryColors(cat.value, c)
                  return (
                    <TouchableOpacity
                      key={cat.value}
                      style={[s.categoryBtn, active && { backgroundColor: colors.bg, borderColor: colors.border }]}
                      onPress={() => setFormCategory(cat.value)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name={cat.icon} size={15} color={active ? colors.border : c.textMuted} />
                      <Text style={[s.categoryBtnLabel, active && { color: colors.border, fontWeight: '700' }]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {/* Urgency — one segmented control instead of three separate
                  bordered boxes. */}
              <Text style={s.formLabel}>How urgent?</Text>
              <View style={s.urgencyRow}>
                {URGENCY.map((u, i) => (
                  <TouchableOpacity
                    key={u.value}
                    style={[
                      s.urgencySeg,
                      i > 0 && { borderLeftWidth: 1, borderLeftColor: c.separator },
                      formUrgency === u.value && { backgroundColor: getUrgencyColor(u.value) || c.primary },
                    ]}
                    onPress={() => setFormUrgency(u.value)}
                    activeOpacity={0.8}
                  >
                    {u.icon && (
                      <Ionicons name={u.icon} size={13} color={formUrgency === u.value ? '#fff' : c.textMuted} />
                    )}
                    <Text style={[
                      s.urgencyBtnText,
                      formUrgency === u.value && { color: '#fff', fontWeight: '700' },
                    ]}>
                      {u.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <PatchRequestSafetyNotice style={{ marginHorizontal: 0, marginTop: 24, marginBottom: 0 }} />

              {/* Submit */}
              <TouchableOpacity
                style={[s.submitBtn, (!formTitle.trim() || formVillageId === null || submitting === 'create') && { opacity: 0.45 }]}
                onPress={handleCreate}
                disabled={!formTitle.trim() || formVillageId === null || submitting === 'create'}
                activeOpacity={0.85}
              >
                {submitting === 'create'
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.submitBtnText}>
                      {formVillageId === null
                        ? 'Choose a Patch to continue'
                        : formVillageId === 'all'
                        ? 'Post Request'
                        : `Share with ${myVillages.find(v => v.id === formVillageId)?.name ?? 'Patch'}`}
                    </Text>
                }
              </TouchableOpacity>

              <View style={{ height: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </Wrapper>

    {/* Mobile-only fallbacks — desktop opens both via pushSecondary into
        DesktopSecondaryHost instead (see openProfile/openMessage above). */}
    <PublicProfileSheet
      userId={profileUserId}
      visible={profileUserId !== null}
      onClose={() => setProfileUserId(null)}
    />
    <Modal
      visible={messageUserId !== null}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => setMessageUserId(null)}
    >
      <MessagesInbox onBack={() => setMessageUserId(null)} openWithUserId={messageUserId} />
    </Modal>
    </>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safe:    { flex: 1, backgroundColor: c.bg },
    center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Header
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    headerLeft:     { width: 44, justifyContent: 'center' },
    headerRight:    { minWidth: 44, alignItems: 'flex-end' },
    headerTitle:    { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    newBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 2,
      backgroundColor: c.primary, borderRadius: 16,
      paddingHorizontal: 12, paddingVertical: 6,
    },
    newBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

    // Desktop: feed column + contextual rail, asymmetric and centered as a
    // pair rather than one column stretched or pinned to the far left.
    desktopSplitRow: { flex: 1, flexDirection: 'row', gap: 28, justifyContent: 'center', paddingTop: 20 },
    mobileFeedWrap: { flex: 1 },
    feedScrollContent: { paddingHorizontal: 16, paddingBottom: 8 },

    // Board header — a real page heading, not the small nav strip above it.
    boardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16, marginTop: 4 },
    boardTitle: { ...typography.sectionTitle, fontSize: 20, color: c.textPrimary, marginBottom: 3 },
    boardSubtitle: { fontSize: 13.5, color: c.textMuted, lineHeight: 19 },
    openBadge: {
      alignItems: 'center', backgroundColor: c.cardSage, borderRadius: 14,
      paddingHorizontal: 12, paddingVertical: 6, flexShrink: 0,
    },
    openBadgeNum: { fontSize: 15, fontWeight: '800', color: c.sage, lineHeight: 18 },
    openBadgeText: { fontSize: 10.5, fontWeight: '700', color: c.sage, textTransform: 'uppercase', letterSpacing: 0.3 },

    activeFilterRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 14, marginBottom: 4,
    },
    activeFilterText: { fontSize: 12.5, fontWeight: '600', color: c.textMuted },
    activeFilterClear: { fontSize: 12.5, fontWeight: '700', color: c.primary },

    // Contextual rail — mirrors Home's right-rail card language (bordered
    // neutral cards, small section titles) so this reads as the same
    // desktop product, not a bespoke widget.
    rail: { width: 280, gap: 16, paddingTop: 20 },
    railCard: {
      backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.separator,
      padding: 16,
    },
    railTitle: { ...typography.sectionTitle, fontSize: 15, color: c.textPrimary, marginBottom: 10 },
    railRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      minHeight: 40, borderRadius: 10, paddingHorizontal: 6, marginHorizontal: -6,
    },
    railRowActive: { backgroundColor: c.cardLavender },
    railEmojiBubble: {
      width: 28, height: 28, borderRadius: 14, backgroundColor: c.card,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    railEmoji: { fontSize: 14 },
    railRowText: { flex: 1, fontSize: 13.5, fontWeight: '600', color: c.textSecondary },
    railRowTextActive: { color: c.primary, fontWeight: '700' },
    railEmptyText: { fontSize: 12.5, color: c.textMuted, lineHeight: 18 },
    railHint: { fontSize: 12.5, color: c.textMuted, lineHeight: 18, marginBottom: 12 },
    railCta: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: c.primary, borderRadius: 20, paddingVertical: 10,
    },
    railCtaText: { fontSize: 13.5, fontWeight: '700', color: '#fff' },

    // Task card
    // Neutral by default — the community identity and the request itself
    // carry the card, not a full-tile category color. Category keeps a
    // slim left accent + its own small chip below, never a full-fill bg.
    taskCard: {
      backgroundColor: c.card, borderRadius: 16, padding: 16, marginBottom: 12,
      borderWidth: 1, borderColor: c.separator,
      borderLeftWidth: 4,
    },
    taskTopRow:        { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
    categoryChip:      { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, marginBottom: 8 },
    categoryChipText:  { fontSize: 11, fontWeight: '700' },
    urgencyBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
    urgencyBadgeText:  { fontSize: 11, fontWeight: '700', color: '#fff' },
    taskTitle:         { fontSize: 16, fontWeight: '800', color: c.textPrimary, marginBottom: 5, lineHeight: 22 },
    taskDesc:          { fontSize: 13.5, color: c.textSecondary, lineHeight: 20, marginBottom: 10 },
    authorRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', flexShrink: 1 },
    taskAuthor:        { ...typography.postAuthor, color: c.textPrimary },
    taskMeta:           { fontSize: 12, color: c.textMuted, marginTop: 1, fontWeight: '500' },
    taskFooter:        { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.separator },
    volunteerCountRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    volunteerCount:    { fontSize: 12, color: c.textMuted },

    // Action buttons
    helpBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    },
    helpBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
    helpingBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
      backgroundColor: c.cardHoney, borderWidth: 1.5, borderColor: c.honey,
    },
    helpingBtnText: { fontSize: 13, fontWeight: '700', color: c.honey },
    messageBtn: {
      width: 32, height: 32, borderRadius: 16,
      justifyContent: 'center', alignItems: 'center',
      backgroundColor: c.card, borderWidth: 1, borderColor: c.separator,
    },
    markDoneLink: { fontSize: 12.5, fontWeight: '700', color: c.textMuted },
    completedBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: c.cardSage, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5,
    },
    completedBadgeText: { fontSize: 12, fontWeight: '700', color: c.sage },

    // Empty state
    emptyState: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 56 },
    emptyTitle: { fontSize: 20, fontWeight: '800', color: c.textPrimary, marginBottom: 6 },
    emptySub:   { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
    emptyBtn: {
      backgroundColor: c.primary, borderRadius: 24,
      paddingHorizontal: 28, paddingVertical: 13,
    },
    emptyBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

    // Create form — a composer, not a settings form: soft borderless
    // fields, color reserved for the selected category/urgency only.
    createContent: { padding: 20, paddingBottom: 60 },
    composerTitle: { ...typography.screenTitle, fontSize: 22, color: c.textPrimary, marginBottom: 3 },
    composerSubtitle: { fontSize: 14, color: c.textMuted, marginBottom: 8 },
    formLabel:    { fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 10, marginTop: 20 },
    formLabelOpt: { fontSize: 13, fontWeight: '400', color: c.textMuted },

    categoryGrid: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    },
    categoryBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
      borderWidth: 1.5, borderColor: 'transparent',
      backgroundColor: c.card,
    },
    categoryBtnLabel: { fontSize: 13, color: c.textMuted },

    titleInput: {
      backgroundColor: c.card, borderRadius: 14,
      padding: 14, fontSize: 16, fontWeight: '600', color: c.textPrimary,
      marginBottom: 10,
    },
    descInput: {
      backgroundColor: c.card, borderRadius: 14,
      padding: 14, fontSize: 14, color: c.textPrimary,
      minHeight: 90,
    },
    childcareNudge: {
      flexDirection: 'row', gap: 8,
      backgroundColor: c.cardBlue, borderWidth: 1, borderColor: c.blue,
      borderRadius: 12, padding: 12, marginTop: 10,
    },
    childcareNudgeText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: c.textSecondary },

    // One bordered container split into equal segments instead of three
    // separate boxes — less visual noise, still fully functional.
    urgencyRow: {
      flexDirection: 'row', borderRadius: 12, borderWidth: 1.5, borderColor: c.separator,
      overflow: 'hidden',
    },
    urgencySeg: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11,
      backgroundColor: c.card,
    },
    urgencyBtnText: { fontSize: 13, color: c.textMuted },

    submitBtn: {
      backgroundColor: c.primary, borderRadius: 18,
      paddingVertical: 17, alignItems: 'center', marginTop: 22,
      shadowColor: c.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 3,
    },
    submitBtnText: { fontSize: 16.5, fontWeight: '800', color: '#fff' },

    // Feed filter pills
    filterScroll: { maxHeight: 44, borderBottomWidth: 1, borderBottomColor: c.separator },
    filterScrollContent: { paddingHorizontal: 14, paddingVertical: 8, gap: 8 },
    filterPill: {
      paddingHorizontal: 14, paddingVertical: 5,
      borderRadius: 20, borderWidth: 1.5, borderColor: c.separator,
      backgroundColor: c.card,
    },
    filterPillActive: { backgroundColor: c.primary + '18', borderColor: c.primary },
    filterPillText:   { fontSize: 13, color: c.textMuted, fontWeight: '500' },
    filterPillTextActive: { color: c.primary, fontWeight: '700' },

    // Create form patch pills
    patchPill: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 14, paddingVertical: 7,
      borderRadius: 20, borderWidth: 1.5, borderColor: c.separator,
      backgroundColor: c.card,
    },
    patchPillActive:     { backgroundColor: c.primary + '18', borderColor: c.primary },
    patchPillText:       { fontSize: 13, color: c.textMuted, fontWeight: '500' },
    patchPillTextActive: { color: c.primary, fontWeight: '700' },
    patchPillHint:       { fontSize: 12, color: c.textMuted, marginBottom: 4, marginTop: 4 },
  })
}
