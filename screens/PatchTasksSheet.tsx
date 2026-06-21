import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, Modal,
  ActivityIndicator, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';
import { Village, VILLAGES } from '../lib/villageData';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'meal_train',     label: 'Meal Train',     emoji: '🍲' },
  { value: 'errand',         label: 'Errand Run',     emoji: '🛒' },
  { value: 'recommendation', label: 'Recommend',      emoji: '📋' },
  { value: 'playdate',       label: 'Playdate',       emoji: '🛝' },
  { value: 'emergency',      label: 'Emergency',      emoji: '🚨' },
  { value: 'general',        label: 'General Help',   emoji: '💬' },
]

const URGENCY = [
  { value: 'normal',    label: 'Normal' },
  { value: 'urgent',    label: '⚡ Urgent' },
  { value: 'emergency', label: '🚨 ASAP' },
]

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
  task, myId, volunteered, volunteerCount, onVolunteer, onWithdraw, onComplete, s, c,
}: {
  task: PatchTask
  myId: string
  volunteered: boolean
  volunteerCount: number
  onVolunteer: (id: string) => void
  onWithdraw:  (id: string) => void
  onComplete:  (id: string) => void
  s: ReturnType<typeof makeStyles>
  c: Colors
}) {
  const meta        = getCategoryMeta(task.category)
  const colors      = getCategoryColors(task.category, c)
  const isOwn       = task.creator_id === myId
  const name        = task.profiles?.display_name || task.profiles?.username || 'A parent'
  const patchInfo   = task.village_id ? VILLAGES.find(v => v.id === task.village_id) : null

  return (
    <View style={[s.taskCard, { backgroundColor: colors.bg, borderLeftColor: colors.border }]}>
      {/* Category + urgency row */}
      <View style={s.taskTopRow}>
        <View style={[s.categoryChip, { backgroundColor: colors.border + '22', borderColor: colors.border }]}>
          <Text style={[s.categoryChipText, { color: colors.border }]}>
            {meta.emoji} {meta.label}
          </Text>
        </View>
        {task.urgency !== 'normal' && (
          <View style={[s.urgencyBadge, { backgroundColor: getUrgencyColor(task.urgency) }]}>
            <Text style={s.urgencyBadgeText}>
              {task.urgency === 'emergency' ? '🚨 ASAP' : '⚡ Urgent'}
            </Text>
          </View>
        )}
        <Text style={s.timeAgo}>{timeAgo(task.created_at)}</Text>
      </View>

      {/* Title */}
      <Text style={s.taskTitle}>{task.title}</Text>

      {/* Description */}
      {task.description ? (
        <Text style={s.taskDesc} numberOfLines={3}>{task.description}</Text>
      ) : null}

      {/* Footer */}
      <View style={s.taskFooter}>
        <View style={{ flex: 1 }}>
          <Text style={s.taskAuthor}>
            from {name}{patchInfo ? ` · ${patchInfo.emoji} ${patchInfo.name}` : ''}
          </Text>
          {volunteerCount > 0 && (
            <Text style={s.volunteerCount}>
              💛 {volunteerCount} {volunteerCount === 1 ? 'parent' : 'parents'} helping
            </Text>
          )}
        </View>

        {task.status === 'completed' ? (
          <View style={s.completedBadge}>
            <Text style={s.completedBadgeText}>✓ Done</Text>
          </View>
        ) : isOwn ? (
          <TouchableOpacity style={[s.markDoneBtn, { borderColor: colors.border }]} onPress={() => onComplete(task.id)}>
            <Text style={[s.markDoneBtnText, { color: colors.border }]}>Mark Done</Text>
          </TouchableOpacity>
        ) : volunteered ? (
          <TouchableOpacity style={s.helpingBtn} onPress={() => onWithdraw(task.id)}>
            <Text style={s.helpingBtnText}>💛 Helping</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.helpBtn, { backgroundColor: colors.border }]}
            onPress={() => onVolunteer(task.id)}
          >
            <Text style={s.helpBtnText}>🙋 I Can Help!</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

// ─── Main Sheet ───────────────────────────────────────────────────────────────

interface Props {
  visible: boolean
  onClose: () => void
  myVillages?: Village[]
}

export default function PatchTasksSheet({ visible, onClose, myVillages = [] }: Props) {
  const c = useColors()
  const s = useMemo(() => makeStyles(c), [c])

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
  const [formVillageId,   setFormVillageId]   = useState<string | null>(null)

  // Feed filter
  const [filterVillageId, setFilterVillageId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setMyId(data.user.id)
    })
  }, [])

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
    setFormVillageId(null)
  }

  async function handleCreate() {
    if (!formTitle.trim() || !myId) return
    setSubmitting('create')
    const { error } = await (supabase.from('patch_tasks') as any).insert({
      creator_id:  myId,
      village_id:  formVillageId,
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

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.safe}>
        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity onPress={view === 'create' ? () => setView('feed') : onClose} style={s.headerLeft}>
            <Text style={s.headerBackText}>{view === 'create' ? '← Back' : '✕'}</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>
            {view === 'create' ? '📝 New Request' : '🤝 Patch Requests'}
          </Text>
          {view === 'feed' ? (
            <TouchableOpacity style={s.newBtn} onPress={() => setView('create')}>
              <Text style={s.newBtnText}>+ New</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 56 }} />
          )}
        </View>

        {/* ── Feed ── */}
        {view === 'feed' && (
          <>
            {/* Intro blurb */}
            <View style={s.introBanner}>
              <Text style={s.introText}>
                Neighbors helping neighbors — ask for anything, offer when you can 💛
              </Text>
              {openCount > 0 && (
                <View style={s.openBadge}>
                  <Text style={s.openBadgeText}>{openCount} open</Text>
                </View>
              )}
            </View>

            {/* Patch filter pills */}
            {myVillages.length > 0 && (
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

            {loading ? (
              <View style={s.center}>
                <ActivityIndicator color={c.primary} size="large" />
              </View>
            ) : sortedTasks.length === 0 ? (
              <View style={s.emptyState}>
                <Text style={s.emptyEmoji}>🏘️</Text>
                <Text style={s.emptyTitle}>No requests yet</Text>
                <Text style={s.emptySub}>
                  Be the first to ask for help or offer your neighbors something.
                </Text>
                <TouchableOpacity style={s.emptyBtn} onPress={() => setView('create')}>
                  <Text style={s.emptyBtnText}>Post a Request</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView contentContainerStyle={s.feedContent} showsVerticalScrollIndicator={false}>
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
                    s={s}
                    c={c}
                  />
                ))}
                <View style={{ height: 40 }} />
              </ScrollView>
            )}
          </>
        )}

        {/* ── Create Form ── */}
        {view === 'create' && (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView contentContainerStyle={s.createContent} showsVerticalScrollIndicator={false}>

              {/* Post to (patch selector) */}
              {myVillages.length > 0 && (
                <>
                  <Text style={s.formLabel}>Post to</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 4 }}
                    contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                  >
                    <TouchableOpacity
                      style={[s.patchPill, formVillageId === null && s.patchPillActive]}
                      onPress={() => setFormVillageId(null)}
                    >
                      <Text style={[s.patchPillText, formVillageId === null && s.patchPillTextActive]}>
                        🏘️ All Patches
                      </Text>
                    </TouchableOpacity>
                    {myVillages.map(v => (
                      <TouchableOpacity
                        key={v.id}
                        style={[s.patchPill, formVillageId === v.id && s.patchPillActive]}
                        onPress={() => setFormVillageId(v.id)}
                      >
                        <Text style={[s.patchPillText, formVillageId === v.id && s.patchPillTextActive]}>
                          {v.emoji} {v.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  {formVillageId !== null && (
                    <Text style={s.patchPillHint}>
                      Only members of this patch will see your request
                    </Text>
                  )}
                  {formVillageId === null && (
                    <Text style={s.patchPillHint}>
                      Visible to everyone in your patches
                    </Text>
                  )}
                </>
              )}

              {/* Category */}
              <Text style={s.formLabel}>What kind of help?</Text>
              <View style={s.categoryGrid}>
                {CATEGORIES.map(cat => {
                  const active = formCategory === cat.value
                  const colors = getCategoryColors(cat.value, c)
                  return (
                    <TouchableOpacity
                      key={cat.value}
                      style={[
                        s.categoryBtn,
                        { borderColor: active ? colors.border : c.separator },
                        active && { backgroundColor: colors.bg },
                      ]}
                      onPress={() => setFormCategory(cat.value)}
                      activeOpacity={0.75}
                    >
                      <Text style={s.categoryBtnEmoji}>{cat.emoji}</Text>
                      <Text style={[s.categoryBtnLabel, active && { color: colors.border, fontWeight: '700' }]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {/* Title */}
              <Text style={s.formLabel}>What do you need?</Text>
              <TextInput
                style={s.titleInput}
                placeholder={
                  formCategory === 'meal_train'      ? 'e.g. "Meal train for our new arrival 🍼"' :
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

              {/* Description */}
              <Text style={s.formLabel}>Details <Text style={s.formLabelOpt}>(optional)</Text></Text>
              <TextInput
                style={s.descInput}
                placeholder="Any extra info that would help people who want to help you..."
                placeholderTextColor={c.textMuted}
                value={formDescription}
                onChangeText={setFormDescription}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
              />

              {/* Urgency */}
              <Text style={s.formLabel}>How urgent?</Text>
              <View style={s.urgencyRow}>
                {URGENCY.map(u => (
                  <TouchableOpacity
                    key={u.value}
                    style={[
                      s.urgencyBtn,
                      formUrgency === u.value && { backgroundColor: getUrgencyColor(u.value) || c.primary },
                    ]}
                    onPress={() => setFormUrgency(u.value)}
                    activeOpacity={0.8}
                  >
                    <Text style={[
                      s.urgencyBtnText,
                      formUrgency === u.value && { color: '#fff', fontWeight: '700' },
                    ]}>
                      {u.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Submit */}
              <TouchableOpacity
                style={[s.submitBtn, (!formTitle.trim() || submitting === 'create') && { opacity: 0.45 }]}
                onPress={handleCreate}
                disabled={!formTitle.trim() || submitting === 'create'}
                activeOpacity={0.85}
              >
                {submitting === 'create'
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.submitBtnText}>Share with Your Patch →</Text>
                }
              </TouchableOpacity>

              <View style={{ height: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </Modal>
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
    headerLeft:     { width: 60 },
    headerBackText: { fontSize: 15, color: c.primary, fontWeight: '600' },
    headerTitle:    { fontSize: 17, fontWeight: '800', color: c.textPrimary },
    newBtn: {
      backgroundColor: c.primary, borderRadius: 16,
      paddingHorizontal: 14, paddingVertical: 6,
    },
    newBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

    // Intro banner
    introBanner: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 10,
      backgroundColor: c.card,
      borderBottomWidth: 1, borderBottomColor: c.separator,
      gap: 8,
    },
    introText:     { flex: 1, fontSize: 13, color: c.textMuted, lineHeight: 18 },
    openBadge:     { backgroundColor: c.cardSage, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
    openBadgeText: { fontSize: 12, fontWeight: '700', color: c.sage },

    // Feed
    feedContent: { padding: 14, gap: 0 },

    // Task card
    taskCard: {
      borderRadius: 14, padding: 14, marginBottom: 12,
      borderLeftWidth: 5, borderLeftColor: c.lavender,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    },
    taskTopRow:        { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
    categoryChip:      { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
    categoryChipText:  { fontSize: 11, fontWeight: '700' },
    urgencyBadge:      { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
    urgencyBadgeText:  { fontSize: 11, fontWeight: '700', color: '#fff' },
    timeAgo:           { fontSize: 11, color: c.textMuted, marginLeft: 'auto' },
    taskTitle:         { fontSize: 15, fontWeight: '800', color: c.textPrimary, marginBottom: 5, lineHeight: 21 },
    taskDesc:          { fontSize: 13, color: c.textSecondary, lineHeight: 19, marginBottom: 10 },
    taskFooter:        { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
    taskAuthor:        { fontSize: 12, color: c.textMuted },
    volunteerCount:    { fontSize: 12, color: c.textMuted, marginTop: 2 },

    // Action buttons
    helpBtn: {
      borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    },
    helpBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
    helpingBtn: {
      borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
      backgroundColor: c.cardHoney, borderWidth: 1.5, borderColor: c.honey,
    },
    helpingBtnText: { fontSize: 13, fontWeight: '700', color: c.honey },
    markDoneBtn: {
      borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
      borderWidth: 1.5,
    },
    markDoneBtnText: { fontSize: 12, fontWeight: '700' },
    completedBadge: {
      backgroundColor: c.cardSage, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5,
    },
    completedBadgeText: { fontSize: 12, fontWeight: '700', color: c.sage },

    // Empty state
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    emptyEmoji: { fontSize: 52, marginBottom: 12 },
    emptyTitle: { fontSize: 20, fontWeight: '800', color: c.textPrimary, marginBottom: 6 },
    emptySub:   { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
    emptyBtn: {
      backgroundColor: c.primary, borderRadius: 24,
      paddingHorizontal: 28, paddingVertical: 13,
    },
    emptyBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

    // Create form
    createContent: { padding: 20, paddingBottom: 60 },
    formLabel:    { fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 10, marginTop: 20 },
    formLabelOpt: { fontSize: 13, fontWeight: '400', color: c.textMuted },

    categoryGrid: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    },
    categoryBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
      borderWidth: 1.5, borderColor: c.separator,
      backgroundColor: c.card,
    },
    categoryBtnEmoji: { fontSize: 16 },
    categoryBtnLabel: { fontSize: 13, color: c.textMuted },

    titleInput: {
      backgroundColor: c.card, borderRadius: 12,
      borderWidth: 1.5, borderColor: c.separator,
      padding: 14, fontSize: 15, color: c.textPrimary,
    },
    descInput: {
      backgroundColor: c.card, borderRadius: 12,
      borderWidth: 1.5, borderColor: c.separator,
      padding: 14, fontSize: 14, color: c.textPrimary,
      minHeight: 100,
    },

    urgencyRow: { flexDirection: 'row', gap: 8 },
    urgencyBtn: {
      flex: 1, alignItems: 'center', paddingVertical: 10,
      borderRadius: 10, borderWidth: 1.5, borderColor: c.separator,
      backgroundColor: c.card,
    },
    urgencyBtnText: { fontSize: 13, color: c.textMuted },

    submitBtn: {
      backgroundColor: c.primary, borderRadius: 16,
      paddingVertical: 15, alignItems: 'center', marginTop: 28,
    },
    submitBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },

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
