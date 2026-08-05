import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Modal, Alert, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useColors, Colors } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { safeInsert, safeUpdate } from '../lib/syncService';
import { moderateImage } from '../lib/contentModeration';
import ContentBlockedModal, { ContentType } from '../components/ContentBlockedModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'ongoing' | 'resolved';
type Unit = 'F' | 'C';
type Severity = 'mild' | 'moderate' | 'severe';
type Method = 'oral' | 'rectal' | 'ear' | 'forehead' | 'armpit';

interface Episode {
  id: string;
  title: string | null;
  start_date: string;
  end_date: string | null;
  status: Status;
  notes: string | null;
}

interface TempLog {
  id: string;
  value: number;
  unit: Unit;
  method: Method | null;
  logged_at: string;
  notes: string | null;
}

interface SymptomLog {
  id: string;
  symptom: string;
  severity: Severity;
  photo_url: string | null;
  logged_at: string;
  notes: string | null;
}

interface MedDoseLog {
  id: string;
  medication_id: string;
  dose_given: string | null;
  taken_at: string;
}

interface Medication {
  id: string;
  name: string;
}

interface Props {
  userId?: string | null;
  babyId?: string | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TITLE_SUGGESTIONS = ['Cold', 'Flu', 'Ear Infection', 'Stomach Bug', 'Teething'];

const SYMPTOM_OPTIONS = [
  { key: 'cough',              label: 'Cough',             emoji: '😷' },
  { key: 'vomiting',           label: 'Vomiting',          emoji: '🤢' },
  { key: 'rash',               label: 'Rash',              emoji: '🟠' },
  { key: 'congestion',         label: 'Congestion',        emoji: '🤧' },
  { key: 'diarrhea',           label: 'Diarrhea',          emoji: '💧' },
  { key: 'fatigue',            label: 'Fatigue',           emoji: '😴' },
  { key: 'loss_of_appetite',   label: 'Loss of Appetite',  emoji: '🍽️' },
  { key: 'other',              label: 'Other',             emoji: '❓' },
];

const SEVERITY: Record<Severity, { label: string; color: string }> = {
  mild:     { label: 'Mild',     color: '#D97706' },
  moderate: { label: 'Moderate', color: '#EA580C' },
  severe:   { label: 'Severe',   color: '#EF4444' },
};

const METHOD_OPTIONS: { key: Method; label: string }[] = [
  { key: 'oral',     label: 'Oral' },
  { key: 'rectal',   label: 'Rectal' },
  { key: 'ear',      label: 'Ear' },
  { key: 'forehead', label: 'Forehead' },
  { key: 'armpit',   label: 'Armpit' },
];

function isFever(value: number, unit: Unit): boolean {
  return unit === 'F' ? value >= 100.4 : value >= 38.0;
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

async function uploadSymptomPhoto(uri: string, userId: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${userId}/symptom-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('baby-photos')
      .upload(path, blob, { contentType: `image/${ext}`, upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('baby-photos').getPublicUrl(path);
    return data.publicUrl;
  } catch (err: any) {
    console.warn('Symptom photo upload failed:', err.message);
    return null;
  }
}

// ─── Episode detail modal ─────────────────────────────────────────────────────

function EpisodeDetailModal({
  episode, userId, babyId, onClose, onChanged,
}: {
  episode: Episode;
  userId: string;
  babyId: string;
  onClose: () => void;
  onChanged: (updated: Episode) => void;
}) {
  const c = useColors();
  const s = modalStyles(c);

  const [title, setTitle] = useState(episode.title ?? '');
  const [notes, setNotes] = useState(episode.notes ?? '');
  const [status, setStatus] = useState<Status>(episode.status);
  const [saving, setSaving] = useState(false);

  const [temps, setTemps] = useState<TempLog[]>([]);
  const [symptoms, setSymptoms] = useState<SymptomLog[]>([]);
  const [medLogs, setMedLogs] = useState<MedDoseLog[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);

  const [showTempForm, setShowTempForm] = useState(false);
  const [showSymptomForm, setShowSymptomForm] = useState(false);
  const [showMedForm, setShowMedForm] = useState(false);

  // Temp form state
  const [tempValue, setTempValue] = useState('');
  const [tempUnit, setTempUnit] = useState<Unit>('F');
  const [tempMethod, setTempMethod] = useState<Method | null>(null);

  // Symptom form state
  const [symptomKey, setSymptomKey] = useState<string | null>(null);
  const [symptomSeverity, setSymptomSeverity] = useState<Severity>('mild');
  const [symptomPhotoUri, setSymptomPhotoUri] = useState<string | null>(null);
  const [moderating, setModerating] = useState(false);
  const [blockedContent, setBlockedContent] = useState<{ severity: 'high' | 'extreme'; reason: string } | null>(null);

  // Med form state
  const [selectedMedId, setSelectedMedId] = useState<string | null>(null);
  const [doseGiven, setDoseGiven] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [tempsRes, symptomsRes, medLogsRes, medsRes] = await Promise.all([
      (supabase.from('temperature_logs') as any).select('id, value, unit, method, logged_at, notes')
        .eq('episode_id', episode.id).order('logged_at', { ascending: false }),
      (supabase.from('symptom_logs') as any).select('id, symptom, severity, photo_url, logged_at, notes')
        .eq('episode_id', episode.id).order('logged_at', { ascending: false }),
      (supabase.from('medication_logs') as any).select('id, medication_id, dose_given, taken_at')
        .eq('episode_id', episode.id).order('taken_at', { ascending: false }),
      supabase.from('medications').select('id, name').eq('baby_id', babyId).eq('category', 'baby').eq('active', true),
    ]);
    setTemps(tempsRes.data ?? []);
    setSymptoms(symptomsRes.data ?? []);
    setMedLogs(medLogsRes.data ?? []);
    setMedications((medsRes.data ?? []) as Medication[]);
    setLoading(false);
  }, [episode.id, babyId]);

  useEffect(() => { load(); }, [load]);

  async function saveEpisode() {
    setSaving(true);
    const updated: Episode = {
      ...episode,
      title: title.trim() || null,
      notes: notes.trim() || null,
      status,
      end_date: status === 'resolved' ? (episode.end_date ?? todayISO()) : null,
    };
    try {
      await safeUpdate('illness_episodes', episode.id, {
        title: updated.title,
        notes: updated.notes,
        status: updated.status,
        end_date: updated.end_date,
      });
      onChanged(updated);
    } catch (err: any) {
      Alert.alert('Could not save', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function addTemp() {
    const value = parseFloat(tempValue);
    if (isNaN(value)) { Alert.alert('Enter a temperature', 'Please enter a numeric value.'); return; }
    try {
      await safeInsert('temperature_logs', {
        baby_id: babyId, episode_id: episode.id, value, unit: tempUnit, method: tempMethod,
      });
      setTempValue(''); setTempMethod(null); setShowTempForm(false);
      load();
    } catch (err: any) {
      Alert.alert('Could not save reading', err?.message ?? 'Please try again.');
    }
  }

  async function addSymptom() {
    if (!symptomKey) { Alert.alert('Pick a symptom', 'Select what you observed.'); return; }
    try {
      let photoUrl: string | null = null;
      if (symptomPhotoUri) photoUrl = await uploadSymptomPhoto(symptomPhotoUri, userId);
      await safeInsert('symptom_logs', {
        baby_id: babyId, episode_id: episode.id, symptom: symptomKey, severity: symptomSeverity, photo_url: photoUrl,
      });
      setSymptomKey(null); setSymptomSeverity('mild'); setSymptomPhotoUri(null); setShowSymptomForm(false);
      load();
    } catch (err: any) {
      Alert.alert('Could not save symptom', err?.message ?? 'Please try again.');
    }
  }

  async function pickSymptomPhoto() {
    const { status: permStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permStatus !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access to add a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    setModerating(true);
    const modResult = await moderateImage(result.assets[0].uri);
    setModerating(false);
    if (modResult.blocked) {
      setBlockedContent({ severity: modResult.severity, reason: modResult.reason });
      return;
    }
    setSymptomPhotoUri(result.assets[0].uri);
  }

  async function addMedDose() {
    if (!selectedMedId) { Alert.alert('Pick a medication', 'Select which medication was given.'); return; }
    try {
      await safeInsert('medication_logs', {
        medication_id: selectedMedId, dose_given: doseGiven.trim() || null, taken_at: new Date().toISOString(), episode_id: episode.id,
      });
      setSelectedMedId(null); setDoseGiven(''); setShowMedForm(false);
      load();
    } catch (err: any) {
      Alert.alert('Could not log dose', err?.message ?? 'Please try again.');
    }
  }

  const medNameById = new Map(medications.map(m => [m.id, m.name]));

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button" accessibilityLabel="Close">
            <Text style={s.cancel}>Close</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Illness Episode</Text>
          <TouchableOpacity onPress={saveEpisode} disabled={saving} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button" accessibilityLabel="Save">
            {saving ? <ActivityIndicator size="small" color={c.primary} /> : <Text style={s.saveBtn}>Save</Text>}
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>Title</Text>
            <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="e.g. Cold" placeholderTextColor={c.textMuted} />
            <View style={s.suggestionRow}>
              {TITLE_SUGGESTIONS.map(sug => (
                <TouchableOpacity key={sug} style={s.suggestionChip} onPress={() => setTitle(sug)} activeOpacity={0.75}>
                  <Text style={s.suggestionChipText}>{sug}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Status</Text>
            <View style={s.statusRow}>
              {(['ongoing', 'resolved'] as Status[]).map(st => (
                <TouchableOpacity
                  key={st}
                  style={[s.statusChip, status === st && s.statusChipActive]}
                  onPress={() => setStatus(st)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.statusChipText, status === st && s.statusChipTextActive]}>
                    {st === 'ongoing' ? 'Ongoing' : 'Resolved'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Notes</Text>
            <TextInput
              style={[s.input, s.multiInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any observations, context, or reminders…"
              placeholderTextColor={c.textMuted}
              multiline
              textAlignVertical="top"
            />

            {loading ? (
              <ActivityIndicator size="small" color={c.primary} style={{ marginTop: 20 }} />
            ) : (
              <>
                {/* ── Temperatures ── */}
                <View style={s.sectionRow}>
                  <Text style={s.sectionTitle}>🌡️ Temperatures</Text>
                  <TouchableOpacity onPress={() => setShowTempForm(v => !v)} accessibilityRole="button" accessibilityLabel="Add temperature reading">
                    <Text style={s.addLink}>{showTempForm ? 'Cancel' : '+ Add'}</Text>
                  </TouchableOpacity>
                </View>
                {temps.map(t => (
                  <View key={t.id} style={s.logRow}>
                    <Text style={s.logRowText}>
                      {t.value}°{t.unit}{isFever(t.value, t.unit) ? ' 🔥 Fever' : ''}{t.method ? ` · ${t.method}` : ''}
                    </Text>
                    <Text style={s.logRowTime}>{formatDateTime(t.logged_at)}</Text>
                  </View>
                ))}
                {temps.length === 0 && !showTempForm && <Text style={s.emptyText}>No readings yet.</Text>}
                {showTempForm && (
                  <View style={s.formBox}>
                    <View style={s.tempRow}>
                      <TextInput
                        style={[s.input, { flex: 1 }]}
                        value={tempValue}
                        onChangeText={setTempValue}
                        placeholder="e.g. 101.2"
                        placeholderTextColor={c.textMuted}
                        keyboardType="decimal-pad"
                      />
                      <View style={s.unitRow}>
                        {(['F', 'C'] as Unit[]).map(u => (
                          <TouchableOpacity key={u} style={[s.unitChip, tempUnit === u && s.unitChipActive]} onPress={() => setTempUnit(u)}>
                            <Text style={[s.unitChipText, tempUnit === u && s.unitChipTextActive]}>°{u}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={s.chipWrap}>
                      {METHOD_OPTIONS.map(m => (
                        <TouchableOpacity
                          key={m.key}
                          style={[s.methodChip, tempMethod === m.key && s.methodChipActive]}
                          onPress={() => setTempMethod(prev => prev === m.key ? null : m.key)}
                        >
                          <Text style={[s.methodChipText, tempMethod === m.key && s.methodChipTextActive]}>{m.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity style={s.formSaveBtn} onPress={addTemp} accessibilityRole="button" accessibilityLabel="Save temperature">
                      <Text style={s.formSaveBtnText}>Add reading</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* ── Symptoms ── */}
                <View style={s.sectionRow}>
                  <Text style={s.sectionTitle}>🤒 Symptoms</Text>
                  <TouchableOpacity onPress={() => setShowSymptomForm(v => !v)} accessibilityRole="button" accessibilityLabel="Add symptom">
                    <Text style={s.addLink}>{showSymptomForm ? 'Cancel' : '+ Add'}</Text>
                  </TouchableOpacity>
                </View>
                {symptoms.map(sy => {
                  const opt = SYMPTOM_OPTIONS.find(o => o.key === sy.symptom);
                  return (
                    <View key={sy.id} style={s.logRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.logRowText}>
                          {opt?.emoji ?? '❓'} {opt?.label ?? sy.symptom} · <Text style={{ color: SEVERITY[sy.severity].color }}>{SEVERITY[sy.severity].label}</Text>
                        </Text>
                        {sy.photo_url && <Image source={{ uri: sy.photo_url }} style={s.symptomPhoto} />}
                      </View>
                      <Text style={s.logRowTime}>{formatDateTime(sy.logged_at)}</Text>
                    </View>
                  );
                })}
                {symptoms.length === 0 && !showSymptomForm && <Text style={s.emptyText}>No symptoms logged yet.</Text>}
                {showSymptomForm && (
                  <View style={s.formBox}>
                    <View style={s.chipWrap}>
                      {SYMPTOM_OPTIONS.map(opt => (
                        <TouchableOpacity
                          key={opt.key}
                          style={[s.methodChip, symptomKey === opt.key && s.methodChipActive]}
                          onPress={() => setSymptomKey(opt.key)}
                        >
                          <Text style={[s.methodChipText, symptomKey === opt.key && s.methodChipTextActive]}>{opt.emoji} {opt.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={s.severityRow}>
                      {(['mild', 'moderate', 'severe'] as Severity[]).map(sev => {
                        const cfg = SEVERITY[sev];
                        const active = symptomSeverity === sev;
                        return (
                          <TouchableOpacity
                            key={sev}
                            style={[s.sevChip, { borderColor: cfg.color, backgroundColor: active ? cfg.color : 'transparent' }]}
                            onPress={() => setSymptomSeverity(sev)}
                          >
                            <Text style={[s.sevChipText, { color: active ? '#fff' : cfg.color }]}>{cfg.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <TouchableOpacity style={s.photoBtn} onPress={pickSymptomPhoto} disabled={moderating} accessibilityRole="button" accessibilityLabel="Add photo">
                      {moderating ? <ActivityIndicator size="small" color={c.primary} /> : (
                        <Text style={s.photoBtnText}>{symptomPhotoUri ? '✓ Photo attached' : '📷 Add photo (optional)'}</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity style={s.formSaveBtn} onPress={addSymptom} accessibilityRole="button" accessibilityLabel="Save symptom">
                      <Text style={s.formSaveBtnText}>Add symptom</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* ── Medication given ── */}
                <View style={s.sectionRow}>
                  <Text style={s.sectionTitle}>💊 Medication Given</Text>
                  <TouchableOpacity onPress={() => setShowMedForm(v => !v)} accessibilityRole="button" accessibilityLabel="Log medication dose">
                    <Text style={s.addLink}>{showMedForm ? 'Cancel' : '+ Add'}</Text>
                  </TouchableOpacity>
                </View>
                {medLogs.map(m => (
                  <View key={m.id} style={s.logRow}>
                    <Text style={s.logRowText}>{medNameById.get(m.medication_id) ?? 'Medication'}{m.dose_given ? ` · ${m.dose_given}` : ''}</Text>
                    <Text style={s.logRowTime}>{formatDateTime(m.taken_at)}</Text>
                  </View>
                ))}
                {medLogs.length === 0 && !showMedForm && <Text style={s.emptyText}>No doses logged yet.</Text>}
                {showMedForm && (
                  medications.length === 0 ? (
                    <Text style={s.emptyText}>No medications set up yet — add one under Baby Medications first.</Text>
                  ) : (
                    <View style={s.formBox}>
                      <View style={s.chipWrap}>
                        {medications.map(med => (
                          <TouchableOpacity
                            key={med.id}
                            style={[s.methodChip, selectedMedId === med.id && s.methodChipActive]}
                            onPress={() => setSelectedMedId(med.id)}
                          >
                            <Text style={[s.methodChipText, selectedMedId === med.id && s.methodChipTextActive]}>{med.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TextInput
                        style={s.input}
                        value={doseGiven}
                        onChangeText={setDoseGiven}
                        placeholder="Dose given (optional)"
                        placeholderTextColor={c.textMuted}
                      />
                      <TouchableOpacity style={s.formSaveBtn} onPress={addMedDose} accessibilityRole="button" accessibilityLabel="Save dose">
                        <Text style={s.formSaveBtnText}>Log dose</Text>
                      </TouchableOpacity>
                    </View>
                  )
                )}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {blockedContent && (
        <ContentBlockedModal
          visible
          severity={blockedContent.severity}
          reason={blockedContent.reason}
          contentType={'baby_photo' as ContentType}
          userId={userId}
          onClose={() => setBlockedContent(null)}
        />
      )}
    </Modal>
  );
}

// ─── New episode modal ─────────────────────────────────────────────────────────

function NewEpisodeModal({ onCreate, onClose }: { onCreate: (title: string, notes: string) => void; onClose: () => void }) {
  const c = useColors();
  const s = modalStyles(c);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={s.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>New Episode</Text>
          <TouchableOpacity onPress={() => onCreate(title, notes)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button" accessibilityLabel="Create">
            <Text style={s.saveBtn}>Start</Text>
          </TouchableOpacity>
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>What's going on?</Text>
            <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="e.g. Cold" placeholderTextColor={c.textMuted} autoFocus />
            <View style={s.suggestionRow}>
              {TITLE_SUGGESTIONS.map(sug => (
                <TouchableOpacity key={sug} style={s.suggestionChip} onPress={() => setTitle(sug)} activeOpacity={0.75}>
                  <Text style={s.suggestionChipText}>{sug}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.label}>Notes (optional)</Text>
            <TextInput
              style={[s.input, s.multiInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything you want to remember about how this started…"
              placeholderTextColor={c.textMuted}
              multiline
              textAlignVertical="top"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Episode row ────────────────────────────────────────────────────────────────

function EpisodeRow({ episode, onPress }: { episode: Episode; onPress: () => void }) {
  const c = useColors();
  const s = rowStyles(c);
  const dateRange = episode.end_date
    ? `${formatDate(episode.start_date)} – ${formatDate(episode.end_date)}`
    : `${formatDate(episode.start_date)} · Ongoing`;

  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.75}
      accessibilityRole="button" accessibilityLabel={`${episode.title ?? 'Illness'} episode details`}>
      <View style={{ flex: 1 }}>
        <Text style={s.name}>{episode.title || 'Illness'}</Text>
        <Text style={s.date}>{dateRange}</Text>
      </View>
      <View style={[
        s.badge,
        episode.status === 'resolved' ? s.badgeResolved : s.badgeOngoing,
      ]}>
        <Text style={[s.badgeText, episode.status === 'resolved' ? s.badgeTextResolved : s.badgeTextOngoing]}>
          {episode.status === 'resolved' ? 'Resolved' : 'Ongoing'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HealthTracker({ userId, babyId }: Props) {
  const c = useColors();
  const s = styles(c);

  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);

  const load = useCallback(async () => {
    if (!babyId) { setLoaded(true); return; }
    const { data } = await (supabase.from('illness_episodes') as any)
      .select('id, title, start_date, end_date, status, notes')
      .eq('baby_id', babyId)
      .order('start_date', { ascending: false });
    setEpisodes(data ?? []);
    setLoaded(true);
  }, [babyId]);

  useEffect(() => { load(); }, [load]);

  async function createEpisode(title: string, notes: string) {
    if (!babyId || !userId) return;
    try {
      await safeInsert('illness_episodes', {
        baby_id: babyId,
        created_by: userId,
        title: title.trim() || null,
        start_date: todayISO(),
        status: 'ongoing',
        notes: notes.trim() || null,
      });
      setShowNew(false);
      load();
    } catch (err: any) {
      Alert.alert('Could not start episode', err?.message ?? 'Please try again.');
    }
  }

  if (!loaded) {
    return (
      <View style={{ paddingVertical: 24, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={c.primary} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>🩺 Health Tracker</Text>
      </View>

      {episodes.length === 0 ? (
        <Text style={s.emptyText}>No illness episodes logged yet.</Text>
      ) : (
        episodes.map(ep => (
          <EpisodeRow key={ep.id} episode={ep} onPress={() => setSelectedEpisode(ep)} />
        ))
      )}

      <TouchableOpacity style={s.addBtn} onPress={() => setShowNew(true)} activeOpacity={0.75}
        accessibilityRole="button" accessibilityLabel="Log a new illness episode">
        <Text style={s.addBtnText}>+ Log an illness</Text>
      </TouchableOpacity>

      {showNew && (
        <NewEpisodeModal onCreate={createEpisode} onClose={() => setShowNew(false)} />
      )}

      {selectedEpisode && userId && babyId && (
        <EpisodeDetailModal
          episode={selectedEpisode}
          userId={userId}
          babyId={babyId}
          onClose={() => { setSelectedEpisode(null); load(); }}
          onChanged={updated => {
            setSelectedEpisode(updated);
            setEpisodes(prev => prev.map(e => e.id === updated.id ? updated : e));
          }}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (c: Colors) =>
  StyleSheet.create({
    container: { marginBottom: 16 },
    sectionHeader: { marginBottom: 14 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
    emptyText: { fontSize: 13, color: c.textMuted, fontWeight: '500', marginBottom: 10 },
    addBtn: { borderWidth: 1.5, borderColor: c.primary, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
    addBtnText: { fontSize: 14, fontWeight: '700', color: c.primary },
  });

const rowStyles = (c: Colors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.card, borderRadius: 12, padding: 12,
      marginBottom: 7, gap: 10, borderWidth: 1, borderColor: c.separator,
    },
    name: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    date: { fontSize: 12, color: c.textMuted, fontWeight: '500', marginTop: 2 },
    badge: { borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 8, paddingVertical: 4 },
    badgeOngoing:  { backgroundColor: '#FEF3C7', borderColor: '#D97706' },
    badgeResolved: { backgroundColor: '#D1FAE5', borderColor: '#059669' },
    badgeText: { fontSize: 10, fontWeight: '800' },
    badgeTextOngoing:  { color: '#92400E' },
    badgeTextResolved: { color: '#065F46' },
  });

const modalStyles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    cancel: { fontSize: 16, color: c.textMuted, fontWeight: '600' },
    saveBtn: { fontSize: 16, color: c.primary, fontWeight: '800' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    body: { padding: 20, gap: 10, paddingBottom: 48 },
    label: { fontSize: 13, fontWeight: '800', color: c.textMuted, marginTop: 8 },

    input: {
      backgroundColor: c.inputBg, borderRadius: 12, borderWidth: 1, borderColor: c.inputBorder,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.textPrimary, fontWeight: '500',
    },
    multiInput: { minHeight: 80, paddingTop: 12 },

    suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
    suggestionChip: { backgroundColor: c.bgAlt, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
    suggestionChipText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },

    statusRow: { flexDirection: 'row', gap: 8 },
    statusChip: { flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator, paddingVertical: 10, alignItems: 'center' },
    statusChipActive: { backgroundColor: c.cardBlush, borderColor: c.blush ?? c.primary },
    statusChipText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    statusChipTextActive: { color: c.textPrimary, fontWeight: '800' },

    sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 6 },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    addLink: { fontSize: 13, fontWeight: '700', color: c.primary },

    logRow: {
      flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
      backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.separator,
      paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6, gap: 8,
    },
    logRowText: { fontSize: 13, fontWeight: '600', color: c.textPrimary, flexShrink: 1 },
    logRowTime: { fontSize: 11, color: c.textMuted, fontWeight: '500' },
    symptomPhoto: { width: 60, height: 60, borderRadius: 8, marginTop: 6 },
    emptyText: { fontSize: 12, color: c.textMuted, fontWeight: '500', marginBottom: 6 },

    formBox: { backgroundColor: c.bgAlt, borderRadius: 12, padding: 12, marginBottom: 10, gap: 8 },
    tempRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    unitRow: { flexDirection: 'row', gap: 6 },
    unitChip: { borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, paddingHorizontal: 12, paddingVertical: 11 },
    unitChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    unitChipText: { fontSize: 14, fontWeight: '700', color: c.textSecondary },
    unitChipTextActive: { color: '#fff' },

    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    methodChip: { backgroundColor: c.card, borderRadius: 20, borderWidth: 1.5, borderColor: c.separator, paddingHorizontal: 12, paddingVertical: 7 },
    methodChipActive: { backgroundColor: c.cardLavender, borderColor: c.lavender ?? c.primary },
    methodChipText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
    methodChipTextActive: { color: c.textPrimary, fontWeight: '800' },

    severityRow: { flexDirection: 'row', gap: 8 },
    sevChip: { flex: 1, borderRadius: 10, borderWidth: 2, paddingVertical: 9, alignItems: 'center' },
    sevChipText: { fontSize: 12, fontWeight: '800' },

    photoBtn: { paddingVertical: 8, alignItems: 'flex-start' },
    photoBtnText: { fontSize: 13, fontWeight: '700', color: c.primary },

    formSaveBtn: { backgroundColor: c.primary, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 4 },
    formSaveBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  });
