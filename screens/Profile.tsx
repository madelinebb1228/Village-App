import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type Baby = {
  id: string;
  name: string;
  birth_date: string | null;
  is_expecting: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDisplayDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00'); // force local timezone
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function ageLabel(iso: string): string {
  const birth = new Date(iso + 'T00:00:00');
  const now = new Date();
  const days = Math.floor((now.getTime() - birth.getTime()) / 86400000);
  if (days < 0) return 'Not born yet';
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} old`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks} week${weeks !== 1 ? 's' : ''} old`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} month${months !== 1 ? 's' : ''} old`;
  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? 's' : ''} old`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Profile() {
  const insets = useSafeAreaInsets();

  const [baby, setBaby] = useState<Baby | null>(null);
  const [loadingBaby, setLoadingBaby] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const [isExpecting, setIsExpecting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Refs for date tab-through
  const dayRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  useEffect(() => {
    loadBaby();
  }, []);

  async function loadBaby() {
    setLoadingBaby(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('babies')
        .select('id, name, birth_date, is_expecting')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (error) console.warn('loadBaby error:', error.message);
      setBaby(data ?? null);
    } catch (err: any) {
      console.warn('loadBaby threw:', err.message);
    } finally {
      setLoadingBaby(false);
    }
  }

  function openForm() {
    if (baby) {
      setName(baby.name);
      setIsExpecting(baby.is_expecting);
      if (baby.birth_date) {
        const [y, m, d] = baby.birth_date.split('-');
        setMonth(m ?? '');
        setDay(d ?? '');
        setYear(y ?? '');
      } else {
        setMonth(''); setDay(''); setYear('');
      }
    } else {
      setName(''); setMonth(''); setDay(''); setYear('');
      setIsExpecting(false);
    }
    setShowForm(true);
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Name required', "Please enter your baby's name.");
      return;
    }

    let birth_date: string | null = null;
    if (!isExpecting) {
      const mm = month.padStart(2, '0');
      const dd = day.padStart(2, '0');
      const yyyy = year;
      if (!mm || !dd || yyyy.length < 4) {
        Alert.alert('Date required', 'Enter a full birth date, or turn on "Currently Expecting".');
        return;
      }
      birth_date = `${yyyy}-${mm}-${dd}`;
      if (isNaN(Date.parse(birth_date))) {
        Alert.alert('Invalid date', 'Please check the birth date and try again.');
        return;
      }
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in.');

      const payload = {
        name: name.trim(),
        birth_date,
        is_expecting: isExpecting,
      };

      if (baby) {
        const { error } = await supabase
          .from('babies')
          .update(payload)
          .eq('id', baby.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('babies')
          .insert({ ...payload, user_id: user.id });
        if (error) throw error;
      }

      setShowForm(false);
      await loadBaby();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.auth.signOut();
              if (error) throw error;
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to sign out. Please try again.');
            }
          },
        },
      ]
    );
  }

  // ─── Sub-renders ────────────────────────────────────────────────────────────

  function renderBabyCard() {
    if (!baby) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>👶</Text>
          <Text style={styles.emptyTitle}>No baby profile yet</Text>
          <Text style={styles.emptySubtitle}>
            Add your baby's details so Village can personalize your tracking.
          </Text>
          <TouchableOpacity style={styles.addButton} onPress={openForm} activeOpacity={0.8}>
            <Text style={styles.addButtonText}>+ Create Baby Profile</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const emoji = baby.is_expecting ? '🤰' : '🍼';
    const dateLabel = baby.is_expecting
      ? 'Due soon!'
      : baby.birth_date
      ? `${formatDisplayDate(baby.birth_date)} · ${ageLabel(baby.birth_date)}`
      : '';

    return (
      <View style={styles.babyCard}>
        <View style={styles.babyCardAccent} />
        <View style={styles.babyCardBody}>
          <Text style={styles.babyEmoji}>{emoji}</Text>
          <View style={styles.babyInfo}>
            <Text style={styles.babyName}>{baby.name}</Text>
            {dateLabel ? <Text style={styles.babyDate}>{dateLabel}</Text> : null}
          </View>
          <TouchableOpacity style={styles.editButton} onPress={openForm} activeOpacity={0.8}>
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderForm() {
    return (
      <Modal
        visible={showForm}
        animationType="slide"
        transparent
        onRequestClose={() => setShowForm(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowForm(false)}
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            {/* Handle */}
            <View style={styles.sheetHandle} />

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.sheetTitle}>
                {baby ? 'Edit Baby Profile' : 'Create Baby Profile'}
              </Text>

              {/* Name */}
              <Text style={styles.fieldLabel}>Baby's name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Olivia"
                placeholderTextColor="#C4BAB2"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                returnKeyType="next"
              />

              {/* Expecting toggle */}
              <View style={styles.toggleRow}>
                <View style={styles.toggleText}>
                  <Text style={styles.toggleLabel}>Currently expecting</Text>
                  <Text style={styles.toggleSub}>Turn on if your baby hasn't arrived yet</Text>
                </View>
                <Switch
                  value={isExpecting}
                  onValueChange={setIsExpecting}
                  trackColor={{ false: '#E8E3DC', true: '#B8A9C9' }}
                  thumbColor="#ffffff"
                />
              </View>

              {/* Date of birth */}
              {!isExpecting && (
                <View style={styles.dateSection}>
                  <Text style={styles.fieldLabel}>Date of birth</Text>
                  <View style={styles.dateRow}>
                    <View style={styles.dateField}>
                      <Text style={styles.dateFieldLabel}>MM</Text>
                      <TextInput
                        style={styles.dateInput}
                        placeholder="06"
                        placeholderTextColor="#C4BAB2"
                        value={month}
                        onChangeText={(v) => {
                          const clean = v.replace(/\D/g, '').slice(0, 2);
                          setMonth(clean);
                          if (clean.length === 2) dayRef.current?.focus();
                        }}
                        keyboardType="number-pad"
                        maxLength={2}
                        returnKeyType="next"
                      />
                    </View>
                    <Text style={styles.dateSep}>/</Text>
                    <View style={styles.dateField}>
                      <Text style={styles.dateFieldLabel}>DD</Text>
                      <TextInput
                        ref={dayRef}
                        style={styles.dateInput}
                        placeholder="15"
                        placeholderTextColor="#C4BAB2"
                        value={day}
                        onChangeText={(v) => {
                          const clean = v.replace(/\D/g, '').slice(0, 2);
                          setDay(clean);
                          if (clean.length === 2) yearRef.current?.focus();
                        }}
                        keyboardType="number-pad"
                        maxLength={2}
                        returnKeyType="next"
                      />
                    </View>
                    <Text style={styles.dateSep}>/</Text>
                    <View style={[styles.dateField, styles.dateFieldYear]}>
                      <Text style={styles.dateFieldLabel}>YYYY</Text>
                      <TextInput
                        ref={yearRef}
                        style={styles.dateInput}
                        placeholder="2024"
                        placeholderTextColor="#C4BAB2"
                        value={year}
                        onChangeText={(v) => setYear(v.replace(/\D/g, '').slice(0, 4))}
                        keyboardType="number-pad"
                        maxLength={4}
                        returnKeyType="done"
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* Save */}
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {baby ? 'Save Changes' : 'Create Profile'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowForm(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  // ─── Main render ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.heading}>Profile</Text>

        <View style={styles.cardWrap}>
          {loadingBaby ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#B8A9C9" />
            </View>
          ) : (
            renderBabyCard()
          )}
        </View>

        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {renderForm()}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FEFCF8',
  },
  container: {
    flex: 1,
    padding: 24,
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: '#5A544E',
    marginBottom: 28,
  },
  cardWrap: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signOutButton: {
    backgroundColor: '#E8A0A0',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#E8A0A0',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  signOutButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Empty state
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#5A544E',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#B0A89E',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  addButton: {
    backgroundColor: '#B8A9C9',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    shadowColor: '#B8A9C9',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // ── Baby card
  babyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  babyCardAccent: {
    width: 6,
    backgroundColor: '#B8A9C9',
  },
  babyCardBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 14,
  },
  babyEmoji: {
    fontSize: 40,
  },
  babyInfo: {
    flex: 1,
  },
  babyName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#5A544E',
    marginBottom: 4,
  },
  babyDate: {
    fontSize: 13,
    color: '#B0A89E',
    lineHeight: 18,
  },
  editButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#B8A9C9',
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B8A9C9',
  },

  // ── Modal / sheet
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(60,50,45,0.35)',
  },
  sheet: {
    backgroundColor: '#FEFCF8',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 24,
    maxHeight: '90%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D8D0C8',
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#5A544E',
    marginBottom: 28,
  },

  // ── Form fields
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5A544E',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#E8E3DC',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#5A544E',
    marginBottom: 24,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#E8E3DC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  toggleText: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#5A544E',
    marginBottom: 2,
  },
  toggleSub: {
    fontSize: 12,
    color: '#B0A89E',
  },
  dateSection: {
    marginBottom: 24,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  dateField: {
    flex: 1,
  },
  dateFieldYear: {
    flex: 1.6,
  },
  dateFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B0A89E',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  dateInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#E8E3DC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '700',
    color: '#5A544E',
    textAlign: 'center',
  },
  dateSep: {
    fontSize: 22,
    color: '#C4BAB2',
    paddingBottom: 12,
  },

  // ── Buttons
  saveButton: {
    backgroundColor: '#B8A9C9',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
    shadowColor: '#B8A9C9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  saveButtonDisabled: {
    opacity: 0.65,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 4,
  },
  cancelButtonText: {
    fontSize: 15,
    color: '#B0A89E',
    fontWeight: '600',
  },
});
