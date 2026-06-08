import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Event {
  id: string;
  user_id: string;
  author: string;
  title: string;
  description: string | null;
  location: string | null;
  is_online: boolean;
  event_date: string;
  end_date: string | null;
  image_url: string | null;
  created_at: string;
}

interface Props {
  onBack: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEventDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  );
}

function formatMonthDay(iso: string): { month: string; day: string } {
  const d = new Date(iso);
  return {
    month: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
    day: String(d.getDate()),
  };
}

function parseEventDate(date: string, time: string): string | null {
  try {
    const d = new Date(`${date} ${time}`);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

function showSourcePicker(): Promise<'camera' | 'library' | null> {
  return new Promise(resolve => {
    Alert.alert('Add Photo', '', [
      { text: 'Take Photo', onPress: () => resolve('camera') },
      { text: 'Choose from Library', onPress: () => resolve('library') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EventsScreen({ onBack }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [events, setEvents] = useState<Event[]>([]);
  const [myRsvps, setMyRsvps] = useState<Map<string, 'going' | 'interested'>>(new Map());
  const [rsvpCounts, setRsvpCounts] = useState<Map<string, { going: number; interested: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'going' | 'interested' | 'mine'>('all');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [location, setLocation] = useState('');
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const { data: eventsData } = await supabase
      .from('events')
      .select('*')
      .gte('event_date', now)
      .order('event_date', { ascending: true });
    if (eventsData) {
      setEvents(eventsData as Event[]);
      await loadRsvps(eventsData as Event[], user?.id ?? null);
    }
    setLoading(false);
  }

  async function loadRsvps(eventsData: Event[], userId: string | null) {
    if (eventsData.length === 0) return;
    const ids = eventsData.map(e => e.id);
    const [allRes, myRes] = await Promise.all([
      supabase.from('event_rsvps').select('event_id, status').in('event_id', ids),
      userId
        ? supabase.from('event_rsvps').select('event_id, status').eq('user_id', userId).in('event_id', ids)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const counts = new Map<string, { going: number; interested: number }>();
    (allRes.data ?? []).forEach((r: any) => {
      if (!counts.has(r.event_id)) counts.set(r.event_id, { going: 0, interested: 0 });
      const entry = counts.get(r.event_id)!;
      if (r.status === 'going') entry.going++;
      else if (r.status === 'interested') entry.interested++;
    });
    setRsvpCounts(counts);

    const mine = new Map<string, 'going' | 'interested'>();
    (myRes.data ?? []).forEach((r: any) => mine.set(r.event_id, r.status));
    setMyRsvps(mine);
  }

  async function toggleRsvp(eventId: string, status: 'going' | 'interested') {
    if (!currentUserId) return;
    const current = myRsvps.get(eventId);

    if (current === status) {
      await supabase.from('event_rsvps').delete().eq('event_id', eventId).eq('user_id', currentUserId);
      setMyRsvps(prev => { const n = new Map(prev); n.delete(eventId); return n; });
      setRsvpCounts(prev => {
        const n = new Map(prev);
        const entry = { ...(n.get(eventId) ?? { going: 0, interested: 0 }) };
        if (status === 'going') entry.going = Math.max(0, entry.going - 1);
        else entry.interested = Math.max(0, entry.interested - 1);
        n.set(eventId, entry);
        return n;
      });
    } else {
      await supabase.from('event_rsvps').upsert(
        { event_id: eventId, user_id: currentUserId, status } as any,
        { onConflict: 'event_id,user_id' }
      );
      setMyRsvps(prev => new Map(prev).set(eventId, status));
      setRsvpCounts(prev => {
        const n = new Map(prev);
        const entry = { ...(n.get(eventId) ?? { going: 0, interested: 0 }) };
        if (current === 'going') entry.going = Math.max(0, entry.going - 1);
        else if (current === 'interested') entry.interested = Math.max(0, entry.interested - 1);
        if (status === 'going') entry.going++;
        else entry.interested++;
        n.set(eventId, entry);
        return n;
      });
    }
  }

  async function pickImage() {
    const source = await showSourcePicker();
    if (!source) return;
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') return;
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (!result.canceled && result.assets[0]) setPendingImageUri(result.assets[0].uri);
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.8 });
      if (!result.canceled && result.assets[0]) setPendingImageUri(result.assets[0].uri);
    }
  }

  async function createEvent() {
    if (!title.trim()) { Alert.alert('Title required'); return; }
    if (!eventDate.trim() || !eventTime.trim()) { Alert.alert('Please enter a date and time'); return; }
    const isoDate = parseEventDate(eventDate.trim(), eventTime.trim());
    if (!isoDate) { Alert.alert('Invalid date/time', 'Use MM/DD/YYYY and 2:00 PM format'); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileData } = await supabase
      .from('profiles').select('username,display_name').eq('id', user.id).maybeSingle();
    const author = (profileData as any)?.username ?? (profileData as any)?.display_name ?? user.email?.split('@')[0] ?? 'Someone';

    setCreating(true);
    let imageUrl: string | null = null;
    if (pendingImageUri) {
      try {
        const response = await fetch(pendingImageUri);
        const blob = await response.blob();
        const ext = pendingImageUri.split('.').pop()?.toLowerCase() ?? 'jpg';
        const path = `${user.id}/event-${Date.now()}.${ext}`;
        const { error } = await supabase.storage
          .from('baby-photos')
          .upload(path, blob, { contentType: `image/${ext}`, upsert: true });
        if (!error) {
          const { data } = supabase.storage.from('baby-photos').getPublicUrl(path);
          imageUrl = data.publicUrl;
        }
      } catch {}
    }

    const { error } = await supabase.from('events').insert({
      user_id: user.id,
      author,
      title: title.trim(),
      description: description.trim() || null,
      location: !isOnline && location.trim() ? location.trim() : null,
      is_online: isOnline,
      event_date: isoDate,
      image_url: imageUrl,
    } as any);

    setCreating(false);
    if (error) { Alert.alert('Could not create event', error.message); return; }

    setShowCreate(false);
    setTitle(''); setDescription(''); setEventDate(''); setEventTime('');
    setIsOnline(false); setLocation(''); setPendingImageUri(null);
    load();
  }

  async function deleteEvent(eventId: string) {
    Alert.alert('Delete Event', 'Delete this event? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('events').delete().eq('id', eventId);
        setEvents(prev => prev.filter(e => e.id !== eventId));
        if (selectedEvent?.id === eventId) setSelectedEvent(null);
      }},
    ]);
  }

  const filteredEvents = useMemo(() => {
    if (filter === 'going') return events.filter(e => myRsvps.get(e.id) === 'going');
    if (filter === 'interested') return events.filter(e => myRsvps.get(e.id) === 'interested');
    if (filter === 'mine') return events.filter(e => e.user_id === currentUserId);
    return events;
  }, [events, filter, myRsvps, currentUserId]);

  // ── Sub-component: event card ──────────────────────────────────────────────

  function EventCard({ event }: { event: Event }) {
    const { month, day } = formatMonthDay(event.event_date);
    const counts = rsvpCounts.get(event.id) ?? { going: 0, interested: 0 };
    const myRsvp = myRsvps.get(event.id);
    const isOwn = event.user_id === currentUserId;

    return (
      <TouchableOpacity style={s.eventCard} onPress={() => setSelectedEvent(event)} activeOpacity={0.85}>
        {event.image_url && (
          <Image source={{ uri: event.image_url }} style={s.eventCardImage} resizeMode="cover" />
        )}
        <View style={s.eventCardBody}>
          <View style={s.dateBadge}>
            <Text style={s.dateBadgeMonth}>{month}</Text>
            <Text style={s.dateBadgeDay}>{day}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.eventTitle} numberOfLines={2}>{event.title}</Text>
            <Text style={s.eventMeta}>
              {event.is_online ? '🌐 Online' : event.location ? `📍 ${event.location}` : '📍 Location TBD'}
            </Text>
            <Text style={s.eventMeta}>Hosted by {event.author}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <Text style={s.rsvpCount}>✓ {counts.going} going</Text>
              <Text style={s.rsvpCount}>·</Text>
              <Text style={s.rsvpCount}>★ {counts.interested} interested</Text>
            </View>
          </View>
          {isOwn && (
            <TouchableOpacity onPress={() => deleteEvent(event.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 14 }}>🗑</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={s.rsvpRow}>
          <TouchableOpacity
            style={[s.rsvpBtn, myRsvp === 'going' && s.rsvpBtnGoing]}
            onPress={() => toggleRsvp(event.id, 'going')}
          >
            <Text style={[s.rsvpBtnText, myRsvp === 'going' && { color: '#fff' }]}>
              {myRsvp === 'going' ? '✓ Going' : 'Going'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.rsvpBtn, myRsvp === 'interested' && s.rsvpBtnInterested]}
            onPress={() => toggleRsvp(event.id, 'interested')}
          >
            <Text style={[s.rsvpBtnText, myRsvp === 'interested' && { color: '#fff' }]}>
              {myRsvp === 'interested' ? '★ Interested' : '☆ Interested'}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.safeArea}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={s.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Events & Meetups</Text>
        <TouchableOpacity style={s.createBtn} onPress={() => setShowCreate(true)}>
          <Text style={s.createBtnText}>+ Create</Text>
        </TouchableOpacity>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterBar}
        contentContainerStyle={s.filterBarContent}
      >
        {([['all', 'All'], ['going', '✓ Going'], ['interested', '★ Interested'], ['mine', 'My Events']] as const).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[s.filterChip, filter === key && s.filterChipActive]}
            onPress={() => setFilter(key)}
          >
            <Text style={[s.filterChipText, filter === key && s.filterChipTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={c.primary} size="large" />
        </View>
      ) : filteredEvents.length === 0 ? (
        <View style={s.center}>
          <Text style={{ fontSize: 48, marginBottom: 14 }}>📅</Text>
          <Text style={s.emptyText}>
            {filter === 'all'
              ? 'No upcoming events yet.\nBe the first to create one!'
              : filter === 'going'
              ? "You haven't RSVP'd Going to any events."
              : filter === 'interested'
              ? "You haven't marked interest in any events."
              : "You haven't created any events yet."}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
          {filteredEvents.map(event => <EventCard key={event.id} event={event} />)}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* ── Event detail modal ────────────────────────────────────────────── */}
      <Modal
        visible={!!selectedEvent}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedEvent(null)}
      >
        {selectedEvent ? (() => {
          const counts = rsvpCounts.get(selectedEvent.id) ?? { going: 0, interested: 0 };
          const myRsvp = myRsvps.get(selectedEvent.id);
          const { month, day } = formatMonthDay(selectedEvent.event_date);
          const isOwn = selectedEvent.user_id === currentUserId;
          return (
            <SafeAreaView style={s.safeArea}>
              <View style={s.detailHeader}>
                <TouchableOpacity onPress={() => setSelectedEvent(null)}>
                  <Text style={s.backText}>Done</Text>
                </TouchableOpacity>
                {isOwn && (
                  <TouchableOpacity onPress={() => deleteEvent(selectedEvent.id)}>
                    <Text style={{ fontSize: 18 }}>🗑</Text>
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView contentContainerStyle={s.detailContent} showsVerticalScrollIndicator={false}>
                {selectedEvent.image_url && (
                  <Image source={{ uri: selectedEvent.image_url }} style={s.detailImage} resizeMode="cover" />
                )}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
                  <View style={[s.dateBadge, { width: 56, height: 56, borderRadius: 14 }]}>
                    <Text style={s.dateBadgeMonth}>{month}</Text>
                    <Text style={[s.dateBadgeDay, { fontSize: 22 }]}>{day}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.detailTitle}>{selectedEvent.title}</Text>
                    <Text style={[s.eventMeta, { color: c.primary, fontWeight: '600' }]}>
                      {formatEventDate(selectedEvent.event_date)}
                    </Text>
                  </View>
                </View>

                <View style={s.detailInfoCard}>
                  <Text style={s.detailInfoText}>
                    {selectedEvent.is_online ? '🌐 Online event' : `📍 ${selectedEvent.location ?? 'Location TBD'}`}
                  </Text>
                </View>
                <View style={s.detailInfoCard}>
                  <Text style={s.detailInfoText}>👤 Hosted by {selectedEvent.author}</Text>
                </View>

                {selectedEvent.description ? (
                  <Text style={s.detailDescription}>{selectedEvent.description}</Text>
                ) : null}

                <View style={{ flexDirection: 'row', gap: 28, paddingVertical: 4 }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 24, fontWeight: '800', color: c.textPrimary }}>{counts.going}</Text>
                    <Text style={{ fontSize: 12, color: c.textMuted }}>Going</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 24, fontWeight: '800', color: c.textPrimary }}>{counts.interested}</Text>
                    <Text style={{ fontSize: 12, color: c.textMuted }}>Interested</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={[s.detailRsvpBtn, myRsvp === 'going' && s.detailRsvpBtnGoing]}
                    onPress={() => toggleRsvp(selectedEvent.id, 'going')}
                  >
                    <Text style={[s.detailRsvpBtnText, myRsvp === 'going' && { color: '#fff' }]}>
                      {myRsvp === 'going' ? '✓ Going' : 'Going'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.detailRsvpBtn, myRsvp === 'interested' && s.detailRsvpBtnInterested]}
                    onPress={() => toggleRsvp(selectedEvent.id, 'interested')}
                  >
                    <Text style={[s.detailRsvpBtnText, myRsvp === 'interested' && { color: '#fff' }]}>
                      {myRsvp === 'interested' ? '★ Interested' : '☆ Interested'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </SafeAreaView>
          );
        })() : null}
      </Modal>

      {/* ── Create event modal ────────────────────────────────────────────── */}
      <Modal
        visible={showCreate}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreate(false)}
      >
        <SafeAreaView style={s.safeArea}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Text style={s.backText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>New Event</Text>
            <TouchableOpacity
              style={[s.createBtn, (!title.trim() || !eventDate.trim() || !eventTime.trim() || creating) && { opacity: 0.4 }]}
              onPress={createEvent}
              disabled={!title.trim() || !eventDate.trim() || !eventTime.trim() || creating}
            >
              {creating
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.createBtnText}>Create</Text>
              }
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={s.createForm} keyboardShouldPersistTaps="handled">
              <TextInput
                style={s.input}
                placeholder="Event title *"
                placeholderTextColor={c.textMuted}
                value={title}
                onChangeText={setTitle}
                maxLength={80}
              />
              <TextInput
                style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
                placeholder="Description (optional)"
                placeholderTextColor={c.textMuted}
                value={description}
                onChangeText={setDescription}
                multiline
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="Date (MM/DD/YYYY) *"
                  placeholderTextColor={c.textMuted}
                  value={eventDate}
                  onChangeText={setEventDate}
                  keyboardType="numeric"
                />
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="Time (e.g. 2:00 PM) *"
                  placeholderTextColor={c.textMuted}
                  value={eventTime}
                  onChangeText={setEventTime}
                />
              </View>
              <View style={s.toggleRow}>
                <Text style={s.toggleLabel}>Online event</Text>
                <Switch
                  value={isOnline}
                  onValueChange={setIsOnline}
                  trackColor={{ false: c.separator, true: c.primary }}
                  thumbColor="#fff"
                />
              </View>
              {!isOnline && (
                <TextInput
                  style={s.input}
                  placeholder="Location"
                  placeholderTextColor={c.textMuted}
                  value={location}
                  onChangeText={setLocation}
                />
              )}
              {pendingImageUri ? (
                <View>
                  <Image source={{ uri: pendingImageUri }} style={s.imagePreview} resizeMode="cover" />
                  <TouchableOpacity style={s.removeImageBtn} onPress={() => setPendingImageUri(null)}>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={s.addPhotoBtn} onPress={pickImage}>
                  <Text style={s.addPhotoBtnText}>📷  Add Event Photo</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    emptyText: { fontSize: 15, color: c.textMuted, textAlign: 'center', lineHeight: 22 },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    backText: { fontSize: 16, fontWeight: '600', color: c.primary, minWidth: 60 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: c.textPrimary },
    createBtn: {
      backgroundColor: c.primary, borderRadius: 18,
      paddingHorizontal: 14, paddingVertical: 7, minWidth: 60, alignItems: 'center',
    },
    createBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

    filterBar: { maxHeight: 50, borderBottomWidth: 1, borderBottomColor: c.separator },
    filterBarContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexDirection: 'row' },
    filterChip: {
      paddingHorizontal: 14, paddingVertical: 6,
      borderRadius: 16, backgroundColor: c.cardBlush,
    },
    filterChipActive: { backgroundColor: c.primary },
    filterChipText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    filterChipTextActive: { color: '#fff' },

    list: { padding: 16, gap: 14 },

    // Event card
    eventCard: {
      backgroundColor: c.card, borderRadius: 16, overflow: 'hidden',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
    },
    eventCardImage: { width: '100%', height: 150 },
    eventCardBody: {
      flexDirection: 'row', alignItems: 'flex-start',
      padding: 14, gap: 12,
    },
    dateBadge: {
      width: 48, height: 48, borderRadius: 12,
      backgroundColor: c.primary,
      justifyContent: 'center', alignItems: 'center', flexShrink: 0,
    },
    dateBadgeMonth: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
    dateBadgeDay: { fontSize: 18, fontWeight: '800', color: '#fff', lineHeight: 22 },
    eventTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary, marginBottom: 4 },
    eventMeta: { fontSize: 12, color: c.textMuted, marginBottom: 2 },
    rsvpCount: { fontSize: 12, color: c.textMuted, fontWeight: '600' },
    rsvpRow: {
      flexDirection: 'row', gap: 8,
      paddingHorizontal: 14, paddingBottom: 12, paddingTop: 10,
      borderTopWidth: 1, borderTopColor: c.separator,
    },
    rsvpBtn: {
      flex: 1, paddingVertical: 9, borderRadius: 10,
      backgroundColor: c.inputBg, alignItems: 'center',
      borderWidth: 1.5, borderColor: c.separator,
    },
    rsvpBtnGoing: { backgroundColor: c.primary, borderColor: c.primary },
    rsvpBtnInterested: { backgroundColor: c.honey, borderColor: c.honey },
    rsvpBtnText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },

    // Detail modal
    detailHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    detailContent: { padding: 20, gap: 14 },
    detailImage: { width: '100%', height: 200, borderRadius: 16 },
    detailTitle: { fontSize: 20, fontWeight: '800', color: c.textPrimary, marginBottom: 4 },
    detailInfoCard: {
      backgroundColor: c.cardBlush, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 10,
    },
    detailInfoText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
    detailDescription: { fontSize: 14, lineHeight: 22, color: c.textSecondary },
    detailRsvpBtn: {
      flex: 1, paddingVertical: 13, borderRadius: 12,
      backgroundColor: c.inputBg, alignItems: 'center',
      borderWidth: 1.5, borderColor: c.separator,
    },
    detailRsvpBtnGoing: { backgroundColor: c.primary, borderColor: c.primary },
    detailRsvpBtnInterested: { backgroundColor: c.honey, borderColor: c.honey },
    detailRsvpBtnText: { fontSize: 15, fontWeight: '700', color: c.textSecondary },

    // Create form
    createForm: { padding: 20, gap: 12 },
    input: {
      backgroundColor: c.inputBg, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 14, color: c.textPrimary,
    },
    toggleRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.inputBg, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12,
    },
    toggleLabel: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
    imagePreview: { width: '100%', height: 160, borderRadius: 12 },
    removeImageBtn: {
      position: 'absolute', top: 8, right: 8,
      backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 14,
      width: 28, height: 28, justifyContent: 'center', alignItems: 'center',
    },
    addPhotoBtn: {
      paddingVertical: 14, borderRadius: 12,
      backgroundColor: c.cardBlush, alignItems: 'center',
    },
    addPhotoBtnText: { fontSize: 14, fontWeight: '600', color: c.primary },
  });
}
