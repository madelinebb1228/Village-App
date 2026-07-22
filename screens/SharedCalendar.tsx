import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  Alert, ActivityIndicator, Switch, Share, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';
import { ensureNotificationPermission, rescheduleEventReminders } from '../lib/notifications';
import { autoFormatDate, parseDisplayDate, toDisplayDate } from '../lib/dateUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Calendar {
  id: string;
  owner_id: string;
  name: string;
  invite_code: string;
}

interface Member {
  id: string;
  calendar_id: string;
  user_id: string;
  role: string;
}

interface CalEvent {
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
}

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

function eventTimeLabel(e: CalEvent): string {
  if (e.all_day) return 'All day';
  const start = new Date(e.starts_at);
  const startStr = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (e.ends_at) {
    const end = new Date(e.ends_at);
    return `${startStr} – ${end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }
  return startStr;
}

function reminderLabel(min: number | null): string {
  if (min == null) return '';
  if (min === 0) return '⏰ At start';
  if (min < 60) return `⏰ ${min} min before`;
  if (min === 60) return '⏰ 1 hour before';
  if (min < 1440) return `⏰ ${min / 60} hours before`;
  if (min === 1440) return '⏰ 1 day before';
  return `⏰ ${min / 1440} days before`;
}

function selectedDateLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SharedCalendar({ userId }: { userId: string | null }) {
  const c = useColors();
  const db: any = supabase;

  const now = new Date();
  const [calendars, setCalendars] = useState<Calendar[]>([]);
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
  const [saving, setSaving] = useState(false);

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
      if (list.length === 0) {
        const { data: created, error: cErr } = await db
          .from('calendars')
          .insert({ owner_id: userId, name: 'Our Calendar' })
          .select('*')
          .single();
        if (cErr) throw cErr;
        list = created ? [created] : [];
      }
      setCalendars(list);
      setActiveId(prev => (prev && list.some(c2 => c2.id === prev) ? prev : list[0]?.id ?? null));
    } catch (err: any) {
      setLoadError(err?.message ?? 'Could not load your calendar.');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [userId]);

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

  // ─── Derived ──────────────────────────────────────────────────────────────────

  const activeCalendar = calendars.find(c2 => c2.id === activeId) ?? null;
  const isOwner = !!activeCalendar && activeCalendar.owner_id === userId;

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
    const list = (eventsByDay[selectedDate] ?? []).slice();
    list.sort((a, b) =>
      (a.all_day ? 0 : 1) - (b.all_day ? 0 : 1) || a.starts_at.localeCompare(b.starts_at)
    );
    return list;
  }, [eventsByDay, selectedDate]);

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
    if (!cell.inMonth) {
      const [yy, mm] = cell.dateKey.split('-').map(Number);
      setViewYear(yy);
      setViewMonth(mm - 1);
    }
  }

  // ─── Event create / edit ──────────────────────────────────────────────────────

  function openCreate() {
    setEditingId(null);
    setTitle('');
    setDateStr(toDisplayDate(selectedDate));
    setAllDay(false);
    setStartTime('09:00');
    setEndTime('');
    setLocation('');
    setNotes('');
    setReminderMinutes(null);
    setShowEventModal(true);
  }

  function openEdit(e: CalEvent) {
    setEditingId(e.id);
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
    if (allDay) {
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

    if (reminderMinutes != null) {
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
        all_day: allDay,
        reminder_minutes: reminderMinutes,
      };

      let newList: CalEvent[];
      if (editingId) {
        const { data, error } = await db.from('calendar_events').update(payload).eq('id', editingId).select('*').single();
        if (error) throw error;
        newList = events.map(e => (e.id === editingId ? (data as CalEvent) : e));
      } else {
        const { data, error } = await db.from('calendar_events').insert(payload).select('*').single();
        if (error) throw error;
        newList = [...events, data as CalEvent];
      }
      setEvents(newList);
      rescheduleEventReminders(newList);
      setShowEventModal(false);
    } catch (err: any) {
      Alert.alert('Could not save', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteEvent(e: CalEvent) {
    Alert.alert('Delete event', `Delete "${e.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const newList = events.filter(ev => ev.id !== e.id);
          const { error } = await db.from('calendar_events').delete().eq('id', e.id);
          if (error) { Alert.alert('Could not delete', error.message); return; }
          setEvents(newList);
          rescheduleEventReminders(newList);
        },
      },
    ]);
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
      {/* Header: calendar name + actions */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: c.textPrimary }} numberOfLines={1}>
            {activeCalendar?.name ?? 'Calendar'}
          </Text>
          <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 1 }}>
            {members.length} {members.length === 1 ? 'person' : 'people'}
            {!isOwner ? ' · shared with you' : ''}
          </Text>
        </View>
        <TouchableOpacity
          onPress={openShare}
          style={{ borderWidth: 1.5, borderColor: c.primary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8 }}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: c.primary }}>👥 Share</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={openCreate}
          style={{ backgroundColor: c.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>+ Event</Text>
        </TouchableOpacity>
      </View>

      {/* Calendar switcher (only when in more than one) */}
      {calendars.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
          {calendars.map(cal => {
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

      {/* Selected day's events */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: c.textPrimary }}>{selectedDateLabel(selectedDate)}</Text>
        {eventsLoading ? <ActivityIndicator size="small" color={c.primary} /> : null}
      </View>

      {selectedDayEvents.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 28 }}>
          <Text style={{ fontSize: 34, marginBottom: 8 }}>📅</Text>
          <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'center' }}>
            Nothing scheduled. Tap “+ Event” to add something.
          </Text>
        </View>
      ) : (
        selectedDayEvents.map(e => (
          <TouchableOpacity
            key={e.id}
            onPress={() => openEdit(e)}
            activeOpacity={0.85}
            style={{
              backgroundColor: c.card, borderRadius: 14, padding: 14, marginBottom: 10,
              borderWidth: 1.5, borderColor: c.separator, borderLeftWidth: 4, borderLeftColor: c.primary,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: c.textPrimary, paddingRight: 8 }}>{e.title}</Text>
              <TouchableOpacity onPress={() => confirmDeleteEvent(e)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 14, color: c.textMuted }}>🗑</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: c.textSecondary, fontWeight: '600', marginTop: 3 }}>🕐 {eventTimeLabel(e)}</Text>
            {e.location ? <Text style={{ fontSize: 13, color: c.textSecondary, marginTop: 3 }}>📍 {e.location}</Text> : null}
            {e.notes ? <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 3, lineHeight: 18 }}>{e.notes}</Text> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
              {e.reminder_minutes != null ? (
                <Text style={{ fontSize: 11, color: c.primary, fontWeight: '700' }}>{reminderLabel(e.reminder_minutes)}</Text>
              ) : <View />}
              <Text style={{ fontSize: 11, color: c.textMuted }}>added by {memberName(e.created_by)}</Text>
            </View>
          </TouchableOpacity>
        ))
      )}

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

            <Text style={lbl(c)}>Date</Text>
            <TextInput style={inp(c)} placeholder="MM/DD/YYYY" placeholderTextColor={c.textMuted} value={dateStr} onChangeText={v => setDateStr(autoFormatDate(v, dateStr))} keyboardType="numeric" maxLength={10} />

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

            <Text style={lbl(c)}>Location (optional)</Text>
            <TextInput style={inp(c)} placeholder="Where?" placeholderTextColor={c.textMuted} value={location} onChangeText={setLocation} />

            <Text style={lbl(c)}>Notes (optional)</Text>
            <TextInput
              style={[inp(c), { minHeight: 80, textAlignVertical: 'top' }]}
              placeholder="Any details…" placeholderTextColor={c.textMuted}
              value={notes} onChangeText={setNotes} multiline
            />

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
