import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  Alert, ActivityIndicator, Switch, Share, Platform, Animated, PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';
import { ensureNotificationPermission, rescheduleEventReminders, cancelEventReminder } from '../lib/notifications';
import { autoFormatDate, parseDisplayDate, toDisplayDate } from '../lib/dateUtils';
import { recomputeWindDown } from '../lib/napSchedule';
import { generateDaySchedule } from '../lib/daySchedule';
import ConfirmModal from '../components/ConfirmModal';
import DayTimeline, { DayTimelineHandle, DEFAULT_PX_PER_MINUTE } from '../components/DayTimeline';

// ─── Types ────────────────────────────────────────────────────────────────────

type CalendarKind = 'personal' | 'shared';

interface Calendar {
  id: string;
  owner_id: string;
  name: string;
  invite_code: string;
  calendar_type: CalendarKind;
}

interface Member {
  id: string;
  calendar_id: string;
  user_id: string;
  role: string;
}

export interface CalEvent {
  id: string;
  calendar_id: string;
  created_by: string | null;
  title: string;
  notes: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  reminder_minutes: number | null;
  assigned_to: string | null;
  source_type: string | null;
  source_id: string | null;
  is_flexible: boolean;
  is_scheduled: boolean;
  estimated_minutes: number | null;
  nap_ok: boolean;
  recurrence_id: string | null;
  manually_scheduled: boolean;
}

const RECURRENCE_DAYS = 90; // how far ahead a "repeat daily" series is materialized

const DURATION_OPTIONS: { label: string; value: number }[] = [
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '45m', value: 45 },
  { label: '1h',  value: 60 },
  { label: '1.5h', value: 90 },
  { label: '2h',  value: 120 },
];

// Common daily anchors — quick-add pre-fills the event form (title + a
// sensible default time, as a Fixed event) so the user just confirms or
// nudges the time instead of typing everything from scratch.
const QUICK_ADD_PRESETS: { emoji: string; title: string; time: string }[] = [
  { emoji: '🌅', title: 'Wake up',   time: '07:00' },
  { emoji: '☕', title: 'Breakfast', time: '08:00' },
  { emoji: '🥪', title: 'Lunch',     time: '12:00' },
  { emoji: '🍴', title: 'Dinner',    time: '18:00' },
  { emoji: '🌙', title: 'Bedtime',   time: '19:30' },
];

// Where a "jump to source" tap on a synced event should land.
const SOURCE_NAV: Record<string, { screen: string; params: Record<string, any> }> = {
  appointment: { screen: 'Track', params: { initialCategory: 'Health', activeView: 'baby' } },
  vaccine:     { screen: 'Track', params: { initialCategory: 'Health', activeView: 'baby' } },
  medication:  { screen: 'Track', params: { initialCategory: 'Daily Care', activeView: 'you' } },
};

const SOURCE_LABEL: Record<string, string> = {
  appointment: '📋 From Appointments',
  vaccine:     '💉 From Vaccines',
  medication:  '💊 From Medications',
};

interface MiniProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

// ─── Constants / helpers ────────────────────────────────────────────────────────

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const REMINDER_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'None',     value: null },
  { label: 'At start', value: 0 },
  { label: '10 min',   value: 10 },
  { label: '30 min',   value: 30 },
  { label: '1 hour',   value: 60 },
  { label: '1 day',    value: 1440 },
];

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayKey(): string { return localDateKey(new Date()); }

function monthLabel(y: number, m: number): string {
  return new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function buildMonthMatrix(y: number, m: number) {
  const startWeekday = new Date(y, m, 1).getDay();
  const weeks: { dateKey: string; day: number; inMonth: boolean }[][] = [];
  let cur = 1 - startWeekday;
  for (let w = 0; w < 6; w++) {
    const row: { dateKey: string; day: number; inMonth: boolean }[] = [];
    for (let d = 0; d < 7; d++, cur++) {
      const date = new Date(y, m, cur);
      row.push({ dateKey: localDateKey(date), day: date.getDate(), inMonth: date.getMonth() === m });
    }
    weeks.push(row);
  }
  return weeks;
}

function selectedDateLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

// ─── Draggable "to schedule" pending task card ─────────────────────────────────
//
// Same tap-vs-drag PanResponder pattern as DayTimeline's blocks, but the drop
// target lives in a different component (DayTimeline) — so instead of local
// pixel math, this reports the raw screen coordinates of the release and lets
// the parent decide whether that landed inside the timeline's measured bounds.

function PendingTaskCard({
  task, unfit, colors, onPress, onDelete, onDrop,
}: {
  task: CalEvent;
  unfit: boolean;
  colors: Colors;
  onPress: () => void;
  onDelete: () => void;
  onDrop: (task: CalEvent, pageX: number, pageY: number) => void;
}) {
  const pan = useRef(new Animated.ValueXY()).current;
  const [dragging, setDragging] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 4 || Math.abs(gesture.dx) > 4,
      onPanResponderGrant: () => setDragging(true),
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_evt, gesture) => {
        setDragging(false);
        pan.setValue({ x: 0, y: 0 });
        if (Math.abs(gesture.dx) < 6 && Math.abs(gesture.dy) < 6) {
          onPress();
          return;
        }
        onDrop(task, gesture.moveX, gesture.moveY);
      },
      onPanResponderTerminate: () => { setDragging(false); pan.setValue({ x: 0, y: 0 }); },
    })
  ).current;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={{
        transform: pan.getTranslateTransform(),
        zIndex: dragging ? 10 : 1,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: colors.card, borderRadius: 10, padding: 10, marginBottom: 8,
        borderWidth: 1.5, borderColor: unfit ? colors.blush : colors.separator,
        shadowColor: dragging ? '#000' : undefined, shadowOpacity: dragging ? 0.25 : 0, shadowRadius: 8, elevation: dragging ? 6 : 0,
      }}
    >
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{task.title}</Text>
        <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
          {task.estimated_minutes ?? 30} min · {task.nap_ok ? '💤 nap-friendly' : '☀️ awake time'} · ✋ drag onto the timeline
          {unfit ? '  ·  ⚠️ Couldn\'t fit' : ''}
        </Text>
      </View>
      <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={{ fontSize: 14, color: colors.textMuted }}>🗑</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SharedCalendar({ userId, onDragStateChange }: { userId: string | null; onDragStateChange?: (dragging: boolean) => void }) {
  const c = useColors();
  const db: any = supabase;
  const navigation = useNavigation<any>();
  const timelineRef = useRef<DayTimelineHandle>(null);

  const now = new Date();
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [activeKind, setActiveKind] = useState<CalendarKind>('shared');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, MiniProfile>>({});
  const [events, setEvents] = useState<CalEvent[]>([]);

  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayKey());

  // Event modal
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [dateStr, setDateStr] = useState(todayKey());
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(null);
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [isFlexible, setIsFlexible] = useState(false);
  const [estimatedMinutes, setEstimatedMinutes] = useState(30);
  const [showCustomDuration, setShowCustomDuration] = useState(false);
  const [napOk, setNapOk] = useState(true);
  const [editingOriginalStartsAt, setEditingOriginalStartsAt] = useState<string | null>(null);
  const [repeatDaily, setRepeatDaily] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete-recurring-event choice
  const [deleteTarget, setDeleteTarget] = useState<CalEvent | null>(null);
  const [deletingScope, setDeletingScope] = useState<'one' | 'future' | null>(null);

  // Edit-recurring-event choice
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);
  const [editScopePrompt, setEditScopePrompt] = useState<{ payload: any; starts: Date; ends: Date | null; original: CalEvent } | null>(null);
  const [savingScope, setSavingScope] = useState<'one' | 'future' | null>(null);

  // Day planner
  const [generating, setGenerating] = useState(false);
  const [unfitIds, setUnfitIds] = useState<Set<string>>(new Set());

  // Share modal
  const [showShare, setShowShare] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [addingUser, setAddingUser] = useState(false);
  const [follows, setFollows] = useState<MiniProfile[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  // ─── Data loading ───────────────────────────────────────────────────────────

  const loadCalendars = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError('');
    try {
      const { data: cals, error } = await db.from('calendars').select('*').order('created_at');
      if (error) throw error;
      let list: Calendar[] = cals ?? [];

      // Every user gets exactly one personal calendar and at least one shared one.
      const hasShared = list.some(c2 => c2.calendar_type === 'shared');
      const hasPersonal = list.some(c2 => c2.calendar_type === 'personal' && c2.owner_id === userId);
      const toCreate: { owner_id: string; name: string; calendar_type: CalendarKind }[] = [];
      if (!hasShared) toCreate.push({ owner_id: userId, name: 'Our Calendar', calendar_type: 'shared' });
      if (!hasPersonal) toCreate.push({ owner_id: userId, name: 'My Calendar', calendar_type: 'personal' });

      if (toCreate.length > 0) {
        const { data: created, error: cErr } = await db.from('calendars').insert(toCreate).select('*');
        if (cErr) throw cErr;
        list = [...list, ...(created ?? [])];
      }

      setCalendars(list);
      const inKind = list.filter(c2 => c2.calendar_type === activeKind);
      setActiveId(inKind[0]?.id ?? null);
    } catch (err: any) {
      setLoadError(err?.message ?? 'Could not load your calendar.');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [userId]);

  // Switch to a calendar of the newly-selected kind whenever the Personal/Shared
  // tab changes (after the initial load, which already picks one above).
  useEffect(() => {
    if (!loaded) return;
    const inKind = calendars.filter(c2 => c2.calendar_type === activeKind);
    setActiveId(prev => (prev && inKind.some(c2 => c2.id === prev) ? prev : inKind[0]?.id ?? null));
  }, [activeKind, calendars, loaded]);

  const loadActive = useCallback(async () => {
    if (!activeId) return;
    setEventsLoading(true);
    try {
      const [evRes, memRes] = await Promise.all([
        db.from('calendar_events').select('*').eq('calendar_id', activeId).order('starts_at'),
        db.from('calendar_members').select('*').eq('calendar_id', activeId),
      ]);
      const evs: CalEvent[] = evRes.data ?? [];
      setEvents(evs);

      const mems: Member[] = memRes.data ?? [];
      setMembers(mems);
      const ids = mems.map(m => m.user_id);
      if (ids.length) {
        const { data: profs } = await db
          .from('profiles')
          .select('id,username,display_name,avatar_url')
          .in('id', ids);
        const map: Record<string, MiniProfile> = {};
        (profs ?? []).forEach((p: MiniProfile) => { map[p.id] = p; });
        setMemberProfiles(map);
      } else {
        setMemberProfiles({});
      }

      rescheduleEventReminders(evs);
    } catch (err: any) {
      setLoadError(err?.message ?? 'Could not load events.');
    } finally {
      setEventsLoading(false);
    }
  }, [activeId]);

  useEffect(() => { if (!loaded) loadCalendars(); }, [loaded, loadCalendars]);
  useEffect(() => { if (activeId) loadActive(); }, [activeId, loadActive]);

  // Refetch on focus — events can change from elsewhere (a nap-driven shift,
  // an appointment synced from a tracker) while this screen isn't mounted.
  useFocusEffect(
    useCallback(() => {
      if (activeId) loadActive();
    }, [activeId, loadActive])
  );

  // ─── Derived ──────────────────────────────────────────────────────────────────

  const activeCalendar = calendars.find(c2 => c2.id === activeId) ?? null;
  const isOwner = !!activeCalendar && activeCalendar.owner_id === userId;
  const calendarsInKind = useMemo(() => calendars.filter(c2 => c2.calendar_type === activeKind), [calendars, activeKind]);

  // A flexible task with no placement yet — it needs a duration, not a
  // time, until "Generate Schedule" runs.
  const pendingFlexible = activeKind === 'personal' && isFlexible && editingOriginalStartsAt === null;
  // An already-placed flexible task being edited — its time is preserved;
  // only duration/nap-friendly (used next time it shifts) can change here.
  const editingScheduledFlexible = activeKind === 'personal' && isFlexible && editingOriginalStartsAt !== null;

  const weeks = useMemo(() => buildMonthMatrix(viewYear, viewMonth), [viewYear, viewMonth]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    for (const e of events) {
      const k = localDateKey(new Date(e.starts_at));
      (map[k] = map[k] ?? []).push(e);
    }
    return map;
  }, [events]);

  const selectedDayEvents = useMemo(() => {
    const list = (eventsByDay[selectedDate] ?? []).filter(e => e.is_scheduled !== false);
    list.sort((a, b) =>
      (a.all_day ? 0 : 1) - (b.all_day ? 0 : 1) || a.starts_at.localeCompare(b.starts_at)
    );
    return list;
  }, [eventsByDay, selectedDate]);

  // Flexible tasks entered with just a duration, waiting for "Generate
  // Schedule" to place them — only relevant on the Personal calendar.
  const selectedDayPending = useMemo(() => {
    return (eventsByDay[selectedDate] ?? []).filter(e => e.is_scheduled === false);
  }, [eventsByDay, selectedDate]);

  // The timeline's hour window — 6am-9pm by default (matching the
  // auto-scheduler's own day bounds), auto-expanding if an event on the
  // selected day falls outside that range so nothing gets clipped.
  const timelineHours = useMemo(() => {
    let minHour = 6, maxHour = 21;
    for (const e of selectedDayEvents) {
      if (e.all_day) continue;
      const start = new Date(e.starts_at);
      minHour = Math.min(minHour, start.getHours());
      const endRef = e.ends_at ? new Date(e.ends_at) : start;
      maxHour = Math.max(maxHour, endRef.getHours() + 1);
    }
    return { minHour, maxHour };
  }, [selectedDayEvents]);

  function memberName(uid: string | null): string {
    if (!uid) return 'Someone';
    const p = memberProfiles[uid];
    return p?.display_name || p?.username || 'Someone';
  }

  // ─── Month navigation ─────────────────────────────────────────────────────────

  function goPrevMonth() {
    setViewMonth(m => { if (m === 0) { setViewYear(y => y - 1); return 11; } return m - 1; });
  }
  function goNextMonth() {
    setViewMonth(m => { if (m === 11) { setViewYear(y => y + 1); return 0; } return m + 1; });
  }
  function onPressDay(cell: { dateKey: string; inMonth: boolean }) {
    setSelectedDate(cell.dateKey);
    setUnfitIds(new Set());
    if (!cell.inMonth) {
      const [yy, mm] = cell.dateKey.split('-').map(Number);
      setViewYear(yy);
      setViewMonth(mm - 1);
    }
  }

  // ─── Event create / edit ──────────────────────────────────────────────────────

  function openCreate() {
    setEditingId(null);
    setEditingEvent(null);
    setTitle('');
    setDateStr(toDisplayDate(selectedDate));
    setAllDay(false);
    setStartTime('09:00');
    setEndTime('');
    setLocation('');
    setNotes('');
    setReminderMinutes(null);
    setAssignedTo(null);
    setIsFlexible(false);
    setEstimatedMinutes(30);
    setNapOk(true);
    setEditingOriginalStartsAt(null);
    setShowCustomDuration(false);
    setRepeatDaily(false);
    setShowEventModal(true);
  }

  function openQuickAdd(preset: { emoji: string; title: string; time: string }) {
    setEditingId(null);
    setEditingEvent(null);
    setTitle(preset.title);
    setDateStr(toDisplayDate(selectedDate));
    setAllDay(false);
    setStartTime(preset.time);
    setEndTime('');
    setLocation('');
    setNotes('');
    setReminderMinutes(null);
    setAssignedTo(null);
    setIsFlexible(false);
    setEstimatedMinutes(30);
    setNapOk(true);
    setEditingOriginalStartsAt(null);
    setShowCustomDuration(false);
    setRepeatDaily(false);
    setShowEventModal(true);
  }

  function openEdit(e: CalEvent) {
    setEditingId(e.id);
    setEditingEvent(e);
    setTitle(e.title);
    const start = new Date(e.starts_at);
    setDateStr(toDisplayDate(localDateKey(start)));
    setAllDay(e.all_day);
    setStartTime(`${pad2(start.getHours())}:${pad2(start.getMinutes())}`);
    if (e.ends_at) {
      const end = new Date(e.ends_at);
      setEndTime(`${pad2(end.getHours())}:${pad2(end.getMinutes())}`);
    } else {
      setEndTime('');
    }
    setLocation(e.location ?? '');
    setNotes(e.notes ?? '');
    setReminderMinutes(e.reminder_minutes);
    setAssignedTo(e.assigned_to ?? null);
    setIsFlexible(e.is_flexible ?? false);
    const mins = e.estimated_minutes ?? 30;
    setEstimatedMinutes(mins);
    setShowCustomDuration(!DURATION_OPTIONS.some(o => o.value === mins));
    setNapOk(e.nap_ok ?? true);
    setEditingOriginalStartsAt(e.is_scheduled && e.is_flexible ? e.starts_at : null);
    setRepeatDaily(false);
    setShowEventModal(true);
  }

  async function saveEvent() {
    if (!userId || !activeId) return;
    const t = title.trim();
    if (!t) { Alert.alert('Add a title', 'Give your event a name.'); return; }

    const parsedDate = parseDisplayDate(dateStr.trim());
    if (!parsedDate) { Alert.alert('Invalid date', 'Use the format MM/DD/YYYY.'); return; }
    const [_y, _mo, _dd] = parsedDate.split('-').map(Number);
    const yy = _y, mo = _mo, dd = _dd;

    let starts: Date;
    let ends: Date | null = null;

    if (pendingFlexible) {
      if (!estimatedMinutes || estimatedMinutes <= 0) { Alert.alert('Add a duration', 'How long do you think this will take?'); return; }
      starts = new Date(yy, mo - 1, dd, 0, 0, 0, 0);
    } else if (editingScheduledFlexible) {
      if (!estimatedMinutes || estimatedMinutes <= 0) { Alert.alert('Add a duration', 'How long do you think this will take?'); return; }
      starts = new Date(editingOriginalStartsAt!);
      ends = new Date(starts.getTime() + estimatedMinutes * 60000);
    } else if (allDay) {
      starts = new Date(yy, mo - 1, dd, 0, 0, 0, 0);
    } else {
      const sm = startTime.trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!sm) { Alert.alert('Invalid start time', 'Use 24-hour time like 09:30.'); return; }
      starts = new Date(yy, mo - 1, dd, +sm[1], +sm[2], 0, 0);
      if (endTime.trim()) {
        const em = endTime.trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!em) { Alert.alert('Invalid end time', 'Use 24-hour time like 10:30.'); return; }
        ends = new Date(yy, mo - 1, dd, +em[1], +em[2], 0, 0);
      }
    }

    if (!pendingFlexible && reminderMinutes != null) {
      const granted = await ensureNotificationPermission();
      if (!granted && Platform.OS !== 'web') {
        Alert.alert(
          'Reminders are off',
          "Notification permission was not granted, so this reminder won’t alert you. You can enable notifications for Parent Patch in your device settings."
        );
      }
    }

    setSaving(true);
    try {
      const payload = {
        calendar_id: activeId,
        created_by: userId,
        title: t,
        notes: notes.trim() || null,
        location: location.trim() || null,
        starts_at: starts.toISOString(),
        ends_at: ends ? ends.toISOString() : null,
        all_day: pendingFlexible ? false : allDay,
        reminder_minutes: pendingFlexible ? null : reminderMinutes,
        assigned_to: assignedTo,
        is_flexible: activeKind === 'personal' ? isFlexible : false,
        is_scheduled: !pendingFlexible,
        estimated_minutes: (pendingFlexible || editingScheduledFlexible) ? estimatedMinutes : null,
        nap_ok: napOk,
      };

      let newList: CalEvent[];
      if (editingId) {
        // Recurring fixed events span many materialized rows — ask which
        // ones this change should apply to instead of silently only
        // touching today's row.
        if (editingEvent?.recurrence_id && !pendingFlexible && !editingScheduledFlexible) {
          setEditScopePrompt({ payload, starts, ends, original: editingEvent });
          return;
        }
        const { data, error } = await db.from('calendar_events').update(payload).eq('id', editingId).select('*').single();
        if (error) throw error;
        newList = events.map(e => (e.id === editingId ? (data as CalEvent) : e));
      } else {
        const { data, error } = await db.from('calendar_events').insert(payload).select('*').single();
        if (error) throw error;
        let created = data as CalEvent;

        // Repeat daily: only offered for new Fixed events (an anchor like
        // "Bedtime" repeating at the same time every day) — materialize
        // real rows ahead of time so every existing feature (shifting,
        // day generation) keeps treating each occurrence as a normal event.
        if (repeatDaily && !isFlexible) {
          const recurrenceId = created.id;
          await db.from('calendar_events').update({ recurrence_id: recurrenceId }).eq('id', created.id);
          created = { ...created, recurrence_id: recurrenceId };

          const extraRows = [];
          for (let i = 1; i < RECURRENCE_DAYS; i++) {
            const dayStarts = new Date(starts.getTime());
            dayStarts.setDate(dayStarts.getDate() + i);
            const dayEnds = ends ? new Date(ends.getTime()) : null;
            if (dayEnds) dayEnds.setDate(dayEnds.getDate() + i);
            extraRows.push({
              ...payload,
              starts_at: dayStarts.toISOString(),
              ends_at: dayEnds ? dayEnds.toISOString() : null,
              recurrence_id: recurrenceId,
            });
          }
          if (extraRows.length > 0) {
            const { error: recurErr } = await db.from('calendar_events').insert(extraRows);
            if (recurErr) throw recurErr;
          }
        }

        newList = [...events, created];
      }
      setEvents(newList);
      rescheduleEventReminders(newList);
      setShowEventModal(false);
      if (activeKind === 'personal') recomputeWindDown(userId);
    } catch (err: any) {
      Alert.alert('Could not save', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function doDeleteEvent(e: CalEvent, scope: 'one' | 'future' = 'one') {
    let removedIds = [e.id];
    if (scope === 'future' && e.recurrence_id) {
      const { data: matches, error: findErr } = await db
        .from('calendar_events')
        .select('id')
        .eq('recurrence_id', e.recurrence_id)
        .gte('starts_at', e.starts_at);
      if (findErr) { Alert.alert('Could not delete', findErr.message); return; }
      removedIds = (matches ?? []).map((m: any) => m.id as string);

      const { error } = await db
        .from('calendar_events')
        .delete()
        .eq('recurrence_id', e.recurrence_id)
        .gte('starts_at', e.starts_at);
      if (error) { Alert.alert('Could not delete', error.message); return; }
    } else {
      const { error } = await db.from('calendar_events').delete().eq('id', e.id);
      if (error) { Alert.alert('Could not delete', error.message); return; }
    }

    const removedSet = new Set(removedIds);
    const newList = events.filter(ev => !removedSet.has(ev.id));
    setEvents(newList);
    for (const id of removedIds) await cancelEventReminder(id);
    rescheduleEventReminders(newList);
    if (activeKind === 'personal') recomputeWindDown(userId);
  }

  function confirmDeleteEvent(e: CalEvent) {
    if (e.recurrence_id) {
      setDeleteTarget(e);
      return;
    }
    const message = `Delete "${e.title}"?`;
    // On web, RN's multi-button Alert doesn't fire onPress callbacks —
    // the browser confirm() dialog is the reliable alternative.
    if (Platform.OS === 'web') {
      if (window.confirm(message)) doDeleteEvent(e);
      return;
    }
    Alert.alert('Delete event', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => doDeleteEvent(e) },
    ]);
  }

  async function handleDeleteScopeChoice(scope: 'one' | 'future') {
    if (!deleteTarget) return;
    setDeletingScope(scope);
    await doDeleteEvent(deleteTarget, scope);
    setDeletingScope(null);
    setDeleteTarget(null);
  }

  async function handleEditScopeChoice(scope: 'one' | 'future') {
    if (!editScopePrompt) return;
    const { payload, starts, ends, original } = editScopePrompt;
    setSavingScope(scope);
    try {
      let newList: CalEvent[];
      if (scope === 'one') {
        const { data, error } = await db.from('calendar_events').update(payload).eq('id', original.id).select('*').single();
        if (error) throw error;
        newList = events.map(e => (e.id === original.id ? (data as CalEvent) : e));
      } else {
        // Apply the shared fields to this and every future occurrence, but
        // keep each row's own date — only the time-of-day (and duration)
        // changes, mirroring how the recurrence was originally materialized.
        const { data: rows, error: findErr } = await db
          .from('calendar_events')
          .select('id, starts_at')
          .eq('recurrence_id', original.recurrence_id)
          .gte('starts_at', original.starts_at);
        if (findErr) throw findErr;

        const { starts_at: _s, ends_at: _e, ...sharedFields } = payload;
        const newHours = starts.getHours();
        const newMinutes = starts.getMinutes();
        const durationMs = ends ? ends.getTime() - starts.getTime() : null;

        const updates = (rows ?? []).map((r: any) => {
          const rowStart = new Date(r.starts_at);
          rowStart.setHours(newHours, newMinutes, 0, 0);
          const rowEnd = durationMs != null ? new Date(rowStart.getTime() + durationMs) : null;
          return db.from('calendar_events').update({
            ...sharedFields,
            starts_at: rowStart.toISOString(),
            ends_at: rowEnd ? rowEnd.toISOString() : null,
          }).eq('id', r.id);
        });
        const results = await Promise.all(updates);
        const failed = results.find((r: any) => r.error);
        if (failed?.error) throw failed.error;

        const { data: refreshed } = await db.from('calendar_events').select('*').eq('calendar_id', activeId).order('starts_at');
        newList = (refreshed ?? []) as CalEvent[];
      }
      setEvents(newList);
      rescheduleEventReminders(newList);
      setShowEventModal(false);
      if (activeKind === 'personal') recomputeWindDown(userId);
      setEditScopePrompt(null);
    } catch (err: any) {
      Alert.alert('Could not save', err?.message ?? 'Please try again.');
    } finally {
      setSavingScope(null);
    }
  }

  // ─── Timeline drag-to-reschedule ───────────────────────────────────────────

  async function commitReschedule(e: CalEvent, newStart: Date, newEnd: Date | null) {
    setEvents(prev => prev.map(ev => (ev.id === e.id
      ? { ...ev, starts_at: newStart.toISOString(), ends_at: newEnd ? newEnd.toISOString() : null, manually_scheduled: true }
      : ev)));
    const { error } = await db.from('calendar_events').update({
      starts_at: newStart.toISOString(),
      ends_at: newEnd ? newEnd.toISOString() : null,
      manually_scheduled: true,
    }).eq('id', e.id);
    if (error) {
      Alert.alert('Could not reschedule', error.message);
      await loadActive();
      return;
    }
    rescheduleEventReminders(events);
    if (activeKind === 'personal') recomputeWindDown(userId);
  }

  function handleTimelineDragEnd(e: CalEvent, newStart: Date, newEnd: Date | null) {
    if (e.recurrence_id) {
      // Reuse the existing "Just this day / This and all future" prompt —
      // a minimal payload here means handleEditScopeChoice's partial update
      // only ever touches starts_at/ends_at/manually_scheduled, nothing else.
      setEditScopePrompt({
        payload: {
          starts_at: newStart.toISOString(),
          ends_at: newEnd ? newEnd.toISOString() : null,
          manually_scheduled: true,
        },
        starts: newStart,
        ends: newEnd,
        original: e,
      });
      return;
    }
    commitReschedule(e, newStart, newEnd);
  }

  async function commitPendingPlacement(task: CalEvent, newStart: Date, newEnd: Date) {
    setEvents(prev => prev.map(ev => (ev.id === task.id
      ? { ...ev, starts_at: newStart.toISOString(), ends_at: newEnd.toISOString(), is_scheduled: true, manually_scheduled: true }
      : ev)));
    const { error } = await db.from('calendar_events').update({
      starts_at: newStart.toISOString(),
      ends_at: newEnd.toISOString(),
      is_scheduled: true,
      manually_scheduled: true,
    }).eq('id', task.id);
    if (error) {
      Alert.alert('Could not place task', error.message);
      await loadActive();
      return;
    }
    setUnfitIds(prev => { const next = new Set(prev); next.delete(task.id); return next; });
    rescheduleEventReminders(events);
    if (activeKind === 'personal') recomputeWindDown(userId);
  }

  // Drop coordinate for dragging a pending task card onto the timeline —
  // measures the timeline's on-screen bounds and converts the drop's page Y
  // into a time, using the same minHour/pxPerMinute the timeline itself uses.
  function handlePendingDrop(task: CalEvent, pageX: number, pageY: number) {
    const handle = timelineRef.current;
    if (!handle) return;
    handle.measure((_x, _y, width, height, pageXOffset, pageYOffset) => {
      const inBounds = pageX >= pageXOffset && pageX <= pageXOffset + width && pageY >= pageYOffset && pageY <= pageYOffset + height;
      if (!inBounds) return;
      const pxPerMinute = DEFAULT_PX_PER_MINUTE;
      const minutesFromStart = (pageY - pageYOffset) / pxPerMinute;
      const duration = task.estimated_minutes ?? 30;
      const [yy, mo, dd] = selectedDate.split('-').map(Number);
      const newStart = new Date(yy, mo - 1, dd, timelineHours.minHour, 0, 0, 0);
      newStart.setMinutes(newStart.getMinutes() + Math.round(minutesFromStart / 15) * 15);
      const newEnd = new Date(newStart.getTime() + duration * 60000);
      commitPendingPlacement(task, newStart, newEnd);
    });
  }

  async function handleGenerateSchedule() {
    if (!userId) return;
    setGenerating(true);
    try {
      const [yy, mm, dd] = selectedDate.split('-').map(Number);
      const forDate = new Date(yy, mm - 1, dd);
      const result = await generateDaySchedule(userId, forDate);
      setUnfitIds(new Set(result.unplaced.map(u => u.id)));
      await loadActive();
      const msg = result.unplaced.length > 0
        ? `Scheduled ${result.placed} task${result.placed === 1 ? '' : 's'}. Couldn't fit: ${result.unplaced.map(u => u.title).join(', ')}.`
        : `Scheduled ${result.placed} task${result.placed === 1 ? '' : 's'}.`;
      Alert.alert('Schedule generated', msg);
    } catch (err: any) {
      Alert.alert('Could not generate schedule', err?.message ?? 'Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  // ─── Sharing ──────────────────────────────────────────────────────────────────

  async function openShare() {
    setShowShare(true);
    if (!userId) return;
    try {
      const { data: f } = await db.from('follows').select('following_id').eq('follower_id', userId);
      const ids = (f ?? []).map((r: any) => r.following_id);
      if (ids.length) {
        const { data: profs } = await db
          .from('profiles')
          .select('id,username,display_name,avatar_url')
          .in('id', ids);
        setFollows(profs ?? []);
      } else {
        setFollows([]);
      }
    } catch {
      setFollows([]);
    }
  }

  async function addMemberUser(targetId: string) {
    if (!activeId) return;
    if (members.some(m => m.user_id === targetId)) {
      Alert.alert('Already shared', 'That person is already on this calendar.');
      return;
    }
    const { error } = await db.from('calendar_members').insert({ calendar_id: activeId, user_id: targetId, role: 'member' });
    if (error) { Alert.alert('Could not add', error.message); return; }
    await loadActive();
  }

  async function addByUsername() {
    const uname = usernameInput.trim().toLowerCase().replace(/^@/, '');
    if (!uname) return;
    setAddingUser(true);
    try {
      const { data: prof } = await db.from('profiles').select('id,username').eq('username', uname).maybeSingle();
      if (!prof) { Alert.alert('Not found', `No user with username @${uname}.`); return; }
      await addMemberUser(prof.id);
      setUsernameInput('');
    } finally {
      setAddingUser(false);
    }
  }

  async function joinByCode() {
    const code = joinCode.trim();
    if (!code) return;
    setJoining(true);
    try {
      const { data, error } = await db.rpc('join_calendar_by_code', { p_code: code });
      if (error) { Alert.alert('Could not join', error.message); return; }
      setJoinCode('');
      setShowShare(false);
      await loadCalendars();
      if (data) setActiveId(data as string);
    } finally {
      setJoining(false);
    }
  }

  function confirmRemoveMember(m: Member) {
    const self = m.user_id === userId;
    const label = self ? 'Leave this calendar?' : `Remove ${memberName(m.user_id)}?`;
    Alert.alert(label, self ? 'You will stop seeing this shared calendar.' : '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: self ? 'Leave' : 'Remove', style: 'destructive', onPress: async () => {
          const { error } = await db.from('calendar_members').delete().eq('id', m.id);
          if (error) { Alert.alert('Could not update', error.message); return; }
          if (self) { setShowShare(false); await loadCalendars(); }
          else { await loadActive(); }
        },
      },
    ]);
  }

  async function shareInvite() {
    if (!activeCalendar) return;
    try {
      await Share.share({
        message: `Join "${activeCalendar.name}" on Parent Patch! In the app, go to Profile → Calendar → Join with a code and enter: ${activeCalendar.invite_code}`,
      });
    } catch { /* user dismissed */ }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (!userId) {
    return (
      <View style={{ paddingVertical: 32, alignItems: 'center' }}>
        <Text style={{ color: c.textMuted }}>Sign in to use your calendar.</Text>
      </View>
    );
  }

  if (loading) {
    return <ActivityIndicator style={{ paddingVertical: 40 }} color={c.primary} />;
  }

  return (
    <View>
      {/* Personal vs Shared toggle */}
      <View style={{ flexDirection: 'row', backgroundColor: c.inputBg, borderRadius: 14, padding: 4, marginBottom: 14 }}>
        {(['shared', 'personal'] as const).map(kind => {
          const active = activeKind === kind;
          return (
            <TouchableOpacity
              key={kind}
              onPress={() => setActiveKind(kind)}
              activeOpacity={0.8}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center',
                backgroundColor: active ? c.card : 'transparent',
                ...(active ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 } : {}),
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: active ? c.textPrimary : c.textMuted }}>
                {kind === 'shared' ? '👥 Shared' : '🔒 Personal'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Header: calendar name + actions */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: c.textPrimary }} numberOfLines={1}>
            {activeCalendar?.name ?? 'Calendar'}
          </Text>
          <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 1 }}>
            {activeKind === 'personal'
              ? 'Only visible to you'
              : `${members.length} ${members.length === 1 ? 'person' : 'people'}${!isOwner ? ' · shared with you' : ''}`}
          </Text>
        </View>
        {activeKind === 'shared' && (
          <TouchableOpacity
            onPress={openShare}
            style={{ borderWidth: 1.5, borderColor: c.primary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8 }}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: c.primary }}>👥 Share</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={openCreate}
          style={{ backgroundColor: c.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>+ Event</Text>
        </TouchableOpacity>
      </View>

      {/* Quick add — common daily anchors, pre-filled as Fixed with an
          editable default time so a tap plus a confirm is usually enough. */}
      {activeKind === 'personal' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 8 }}>
          {QUICK_ADD_PRESETS.map(preset => (
            <TouchableOpacity
              key={preset.title}
              onPress={() => openQuickAdd(preset)}
              activeOpacity={0.8}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                backgroundColor: c.card, borderWidth: 1.5, borderColor: c.separator,
              }}
            >
              <Text style={{ fontSize: 14 }}>{preset.emoji}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.textSecondary }}>{preset.title}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Calendar switcher (only when this kind has more than one) */}
      {calendarsInKind.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
          {calendarsInKind.map(cal => {
            const active = cal.id === activeId;
            return (
              <TouchableOpacity
                key={cal.id}
                onPress={() => setActiveId(cal.id)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18,
                  backgroundColor: active ? c.primary : c.card,
                  borderWidth: 1.5, borderColor: active ? c.primary : c.separator,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : c.textSecondary }}>
                  {cal.owner_id === userId ? '⭐ ' : ''}{cal.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {loadError ? (
        <View style={{ backgroundColor: c.cardHoney, borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <Text style={{ fontSize: 13, color: c.textPrimary, fontWeight: '600', marginBottom: 4 }}>Calendar not ready</Text>
          <Text style={{ fontSize: 12, color: c.textSecondary, lineHeight: 18 }}>
            {loadError}{'\n'}If this is the first run, make sure the shared_calendar.sql migration has been run in Supabase.
          </Text>
        </View>
      ) : null}

      {/* Month grid */}
      <View style={{ backgroundColor: c.card, borderRadius: 16, padding: 12, marginBottom: 16, borderWidth: 1.5, borderColor: c.separator }}>
        {/* Month nav */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 4 }}>
          <TouchableOpacity onPress={goPrevMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 20, color: c.primary, fontWeight: '800' }}>‹</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 15, fontWeight: '800', color: c.textPrimary }}>{monthLabel(viewYear, viewMonth)}</Text>
          <TouchableOpacity onPress={goNextMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 20, color: c.primary, fontWeight: '800' }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Weekday header */}
        <View style={{ flexDirection: 'row', marginBottom: 4 }}>
          {WEEKDAYS.map((w, i) => (
            <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: c.textMuted }}>{w}</Text>
          ))}
        </View>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <View key={wi} style={{ flexDirection: 'row' }}>
            {week.map(cell => {
              const isSelected = cell.dateKey === selectedDate;
              const isToday = cell.dateKey === todayKey();
              const hasEvents = (eventsByDay[cell.dateKey]?.length ?? 0) > 0;
              return (
                <TouchableOpacity
                  key={cell.dateKey}
                  style={{ flex: 1, height: 42, alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => onPressDay(cell)}
                  activeOpacity={0.7}
                >
                  <View style={{
                    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: isSelected ? c.primary : 'transparent',
                  }}>
                    <Text style={{
                      fontSize: 13,
                      fontWeight: isSelected || isToday ? '800' : '500',
                      color: isSelected ? '#fff'
                        : !cell.inMonth ? c.textMuted
                        : isToday ? c.primary
                        : c.textPrimary,
                      opacity: !cell.inMonth && !isSelected ? 0.4 : 1,
                    }}>
                      {cell.day}
                    </Text>
                  </View>
                  <View style={{
                    width: 5, height: 5, borderRadius: 3, marginTop: 2,
                    backgroundColor: hasEvents ? (isSelected ? c.primary : c.blush) : 'transparent',
                  }} />
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* To schedule — flexible tasks with a duration but no time yet */}
      {activeKind === 'personal' && selectedDayPending.length > 0 && (
        <View style={{
          backgroundColor: c.cardHoney, borderRadius: 14, padding: 14, marginBottom: 16,
          borderWidth: 1.5, borderColor: c.honey,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: c.textPrimary }}>📝 To schedule</Text>
            <TouchableOpacity
              onPress={handleGenerateSchedule}
              disabled={generating}
              style={{ backgroundColor: c.primary, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, opacity: generating ? 0.7 : 1 }}
              activeOpacity={0.8}
            >
              {generating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>✨ Generate Schedule</Text>}
            </TouchableOpacity>
          </View>
          {selectedDayPending.map(t => (
            <PendingTaskCard
              key={t.id}
              task={t}
              unfit={unfitIds.has(t.id)}
              colors={c}
              onPress={() => openEdit(t)}
              onDelete={() => confirmDeleteEvent(t)}
              onDrop={handlePendingDrop}
            />
          ))}
        </View>
      )}

      {/* Selected day's timeline */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: c.textPrimary }}>{selectedDateLabel(selectedDate)}</Text>
        {eventsLoading ? <ActivityIndicator size="small" color={c.primary} /> : null}
      </View>

      <DayTimeline
        ref={timelineRef}
        date={selectedDate}
        events={selectedDayEvents}
        colors={c}
        minHour={timelineHours.minHour}
        maxHour={timelineHours.maxHour}
        onPressEvent={openEdit}
        onDeleteEvent={confirmDeleteEvent}
        onDragEnd={handleTimelineDragEnd}
        onDragStateChange={onDragStateChange}
      />

      {/* ── Event modal ── */}
      <Modal visible={showEventModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEventModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.separator,
          }}>
            <TouchableOpacity onPress={() => setShowEventModal(false)} style={{ width: 50 }}>
              <Text style={{ fontSize: 18, color: c.textMuted }}>✕</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary }}>{editingId ? 'Edit Event' : 'New Event'}</Text>
            <TouchableOpacity onPress={saveEvent} disabled={saving || !title.trim()} style={{ opacity: !title.trim() ? 0.4 : 1, width: 50, alignItems: 'flex-end' }}>
              {saving ? <ActivityIndicator size="small" color={c.primary} /> : <Text style={{ fontSize: 16, fontWeight: '700', color: c.primary }}>Save</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
            <Text style={lbl(c)}>Title</Text>
            <TextInput style={inp(c)} placeholder="e.g. Pediatrician appointment" placeholderTextColor={c.textMuted} value={title} onChangeText={setTitle} />

            {editingEvent?.source_type && SOURCE_NAV[editingEvent.source_type] && (
              <TouchableOpacity
                onPress={() => { setShowEventModal(false); navigation.navigate(SOURCE_NAV[editingEvent.source_type!].screen, SOURCE_NAV[editingEvent.source_type!].params); }}
                style={{ marginTop: 8 }}
              >
                <Text style={{ fontSize: 12, color: c.textMuted, fontWeight: '600', textDecorationLine: 'underline' }}>
                  {SOURCE_LABEL[editingEvent.source_type] ?? 'Synced'} — tap to view
                </Text>
              </TouchableOpacity>
            )}

            {activeKind === 'personal' && !editingScheduledFlexible && (
              <>
                <Text style={lbl(c)}>Flexibility</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setIsFlexible(false)}
                    style={{
                      flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                      backgroundColor: !isFlexible ? c.primary : c.card,
                      borderWidth: 1.5, borderColor: !isFlexible ? c.primary : c.separator,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: !isFlexible ? '#fff' : c.textMuted }}>📌 Fixed time</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setIsFlexible(true); setAllDay(false); }}
                    style={{
                      flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                      backgroundColor: isFlexible ? c.primary : c.card,
                      borderWidth: 1.5, borderColor: isFlexible ? c.primary : c.separator,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: isFlexible ? '#fff' : c.textMuted }}>🔀 Flexible</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 6, lineHeight: 16 }}>
                  {isFlexible
                    ? "No fixed time — just an estimated duration. Can shift automatically if a nap runs early or long."
                    : "Never moves — protect this time and we'll remind you to wind the baby down beforehand."}
                </Text>
              </>
            )}

            {!editingScheduledFlexible && (
              <>
                <Text style={lbl(c)}>Date</Text>
                <TextInput style={inp(c)} placeholder="MM/DD/YYYY" placeholderTextColor={c.textMuted} value={dateStr} onChangeText={v => setDateStr(autoFormatDate(v, dateStr))} keyboardType="numeric" maxLength={10} />
              </>
            )}

            {!pendingFlexible && !editingScheduledFlexible && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary }}>All day</Text>
                  <Switch value={allDay} onValueChange={setAllDay} trackColor={{ false: c.cardSage, true: c.sage }} />
                </View>

                {!allDay && (
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={lbl(c)}>Start (24h)</Text>
                      <TextInput style={inp(c)} placeholder="09:00" placeholderTextColor={c.textMuted} value={startTime} onChangeText={setStartTime} keyboardType="numbers-and-punctuation" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={lbl(c)}>End (optional)</Text>
                      <TextInput style={inp(c)} placeholder="10:00" placeholderTextColor={c.textMuted} value={endTime} onChangeText={setEndTime} keyboardType="numbers-and-punctuation" />
                    </View>
                  </View>
                )}

                {!editingId && !isFlexible && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary }}>🔁 Repeat daily</Text>
                      <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>Adds this at the same time every day for the next ~3 months.</Text>
                    </View>
                    <Switch value={repeatDaily} onValueChange={setRepeatDaily} trackColor={{ false: c.cardSage, true: c.sage }} />
                  </View>
                )}
              </>
            )}

            {(pendingFlexible || editingScheduledFlexible) && (
              <>
                <Text style={lbl(c)}>Estimated duration</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {DURATION_OPTIONS.map(opt => {
                    const active = !showCustomDuration && estimatedMinutes === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => { setShowCustomDuration(false); setEstimatedMinutes(opt.value); }}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                          backgroundColor: active ? c.primary : c.card,
                          borderWidth: 1.5, borderColor: active ? c.primary : c.separator,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : c.textMuted }}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    onPress={() => setShowCustomDuration(true)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                      backgroundColor: showCustomDuration ? c.primary : c.card,
                      borderWidth: 1.5, borderColor: showCustomDuration ? c.primary : c.separator,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: showCustomDuration ? '#fff' : c.textMuted }}>Other…</Text>
                  </TouchableOpacity>
                </View>
                {showCustomDuration && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    <TextInput
                      style={[inp(c), { flex: 1 }]}
                      placeholder="Minutes"
                      placeholderTextColor={c.textMuted}
                      value={estimatedMinutes ? String(estimatedMinutes) : ''}
                      onChangeText={v => setEstimatedMinutes(parseInt(v.replace(/[^0-9]/g, ''), 10) || 0)}
                      keyboardType="number-pad"
                    />
                    <Text style={{ fontSize: 13, color: c.textMuted }}>minutes</Text>
                  </View>
                )}

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary }}>Nap-friendly?</Text>
                    <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>Can this be done while baby naps?</Text>
                  </View>
                  <Switch value={napOk} onValueChange={setNapOk} trackColor={{ false: c.cardSage, true: c.sage }} />
                </View>

                {editingScheduledFlexible ? (
                  <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 10, lineHeight: 16 }}>
                    Currently scheduled for {new Date(editingOriginalStartsAt!).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. Saving keeps this time.
                  </Text>
                ) : (
                  <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 10, lineHeight: 16 }}>
                    No time yet — this goes into "To schedule" until you tap Generate Schedule.
                  </Text>
                )}
              </>
            )}

            {activeKind === 'shared' && members.length > 1 && (
              <>
                <Text style={lbl(c)}>Assign to (optional)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setAssignedTo(null)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                      backgroundColor: assignedTo === null ? c.primary : c.card,
                      borderWidth: 1.5, borderColor: assignedTo === null ? c.primary : c.separator,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: assignedTo === null ? '#fff' : c.textMuted }}>Unassigned</Text>
                  </TouchableOpacity>
                  {members.map(m => {
                    const active = assignedTo === m.user_id;
                    return (
                      <TouchableOpacity
                        key={m.id}
                        onPress={() => setAssignedTo(m.user_id)}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                          backgroundColor: active ? c.primary : c.card,
                          borderWidth: 1.5, borderColor: active ? c.primary : c.separator,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : c.textMuted }}>
                          {m.user_id === userId ? 'You' : memberName(m.user_id)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={lbl(c)}>Location (optional)</Text>
            <TextInput style={inp(c)} placeholder="Where?" placeholderTextColor={c.textMuted} value={location} onChangeText={setLocation} />

            <Text style={lbl(c)}>Notes (optional)</Text>
            <TextInput
              style={[inp(c), { minHeight: 80, textAlignVertical: 'top' }]}
              placeholder="Any details…" placeholderTextColor={c.textMuted}
              value={notes} onChangeText={setNotes} multiline
            />

            {!pendingFlexible && (
              <>
                <Text style={lbl(c)}>Reminder</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {REMINDER_OPTIONS.map(opt => {
                    const active = reminderMinutes === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.label}
                        onPress={() => setReminderMinutes(opt.value)}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                          backgroundColor: active ? c.primary : c.card,
                          borderWidth: 1.5, borderColor: active ? c.primary : c.separator,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : c.textMuted }}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {Platform.OS === 'web' && reminderMinutes != null ? (
                  <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 8, lineHeight: 16 }}>
                    Note: reminders fire on the phone app, not the web/desktop version.
                  </Text>
                ) : null}
              </>
            )}

            <TouchableOpacity
              onPress={saveEvent}
              disabled={saving || !title.trim()}
              style={{ backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 26, opacity: !title.trim() ? 0.45 : 1 }}
              activeOpacity={0.85}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{editingId ? 'Save Changes' : 'Add Event'}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Share modal ── */}
      <Modal visible={showShare} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowShare(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.separator,
          }}>
            <View style={{ width: 50 }} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary }}>Share Calendar</Text>
            <TouchableOpacity onPress={() => setShowShare(false)} style={{ width: 50, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 18, color: c.textMuted }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
            {/* Invite code */}
            <Text style={lbl(c)}>Invite code</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator, paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: 4, color: c.textPrimary }}>{activeCalendar?.invite_code ?? '——'}</Text>
              </View>
              <TouchableOpacity onPress={shareInvite} style={{ backgroundColor: c.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Share</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 6, lineHeight: 17 }}>
              Anyone with this code can join using “Join with a code” below.
            </Text>

            {isOwner && (
              <>
                {/* Add by username */}
                <Text style={[lbl(c), { marginTop: 24 }]}>Add by username</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TextInput
                    style={[inp(c), { flex: 1, marginBottom: 0 }]}
                    placeholder="@username" placeholderTextColor={c.textMuted}
                    value={usernameInput} onChangeText={setUsernameInput}
                    autoCapitalize="none" autoCorrect={false}
                  />
                  <TouchableOpacity onPress={addByUsername} disabled={addingUser || !usernameInput.trim()} style={{ backgroundColor: c.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, opacity: !usernameInput.trim() ? 0.45 : 1 }}>
                    {addingUser ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Add</Text>}
                  </TouchableOpacity>
                </View>

                {/* From people you follow */}
                {follows.length > 0 && (
                  <>
                    <Text style={[lbl(c), { marginTop: 24 }]}>People you follow</Text>
                    {follows.map(p => {
                      const already = members.some(m => m.user_id === p.id);
                      return (
                        <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: c.textPrimary }}>
                            {p.display_name || (p.username ? `@${p.username}` : 'User')}
                          </Text>
                          <TouchableOpacity
                            onPress={() => addMemberUser(p.id)}
                            disabled={already}
                            style={{ backgroundColor: already ? c.cardSage : c.primary, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '700', color: already ? c.textMuted : '#fff' }}>{already ? 'Added' : 'Add'}</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </>
                )}
              </>
            )}

            {/* Join someone else's calendar */}
            <Text style={[lbl(c), { marginTop: 24 }]}>Join with a code</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TextInput
                style={[inp(c), { flex: 1, marginBottom: 0 }]}
                placeholder="Enter a code" placeholderTextColor={c.textMuted}
                value={joinCode} onChangeText={setJoinCode}
                autoCapitalize="characters" autoCorrect={false}
              />
              <TouchableOpacity onPress={joinByCode} disabled={joining || !joinCode.trim()} style={{ backgroundColor: c.editBtn, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, opacity: !joinCode.trim() ? 0.45 : 1 }}>
                {joining ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Join</Text>}
              </TouchableOpacity>
            </View>

            {/* Members */}
            <Text style={[lbl(c), { marginTop: 24 }]}>On this calendar</Text>
            {members.map(m => {
              const self = m.user_id === userId;
              const canRemove = (isOwner && m.role !== 'owner') || (self && m.role !== 'owner');
              return (
                <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: c.textPrimary }}>
                    {memberName(m.user_id)}{self ? ' (you)' : ''}{m.role === 'owner' ? ' · owner' : ''}
                  </Text>
                  {canRemove ? (
                    <TouchableOpacity onPress={() => confirmRemoveMember(m)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: c.signOut }}>{self ? 'Leave' : 'Remove'}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <ConfirmModal
        visible={deleteTarget !== null}
        title="Delete recurring event"
        message={deleteTarget ? `"${deleteTarget.title}" repeats daily. What would you like to delete?` : undefined}
        onRequestClose={() => { if (!deletingScope) setDeleteTarget(null); }}
        buttons={[
          { label: 'Delete just this day', onPress: () => handleDeleteScopeChoice('one'), loading: deletingScope === 'one' },
          { label: 'Delete this and all future', onPress: () => handleDeleteScopeChoice('future'), variant: 'destructive', loading: deletingScope === 'future' },
          { label: 'Cancel', onPress: () => setDeleteTarget(null), variant: 'default' },
        ]}
      />

      <ConfirmModal
        visible={editScopePrompt !== null}
        title="Save recurring event"
        message={editScopePrompt ? `"${editScopePrompt.original.title}" repeats daily. Apply this change to:` : undefined}
        onRequestClose={() => { if (!savingScope) setEditScopePrompt(null); }}
        buttons={[
          { label: 'Just this day', onPress: () => handleEditScopeChoice('one'), loading: savingScope === 'one' },
          { label: 'This and all future', onPress: () => handleEditScopeChoice('future'), variant: 'primary', loading: savingScope === 'future' },
          { label: 'Cancel', onPress: () => setEditScopePrompt(null), variant: 'default' },
        ]}
      />
    </View>
  );
}

// ─── Small style helpers ────────────────────────────────────────────────────────

function lbl(c: Colors) {
  return { fontSize: 13, fontWeight: '700' as const, color: c.textSecondary, marginBottom: 6, marginTop: 16 };
}
function inp(c: Colors) {
  return {
    backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator,
    padding: 13, fontSize: 15, color: c.textPrimary, marginBottom: 0,
  };
}
