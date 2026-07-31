import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Share, Alert, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useBaby } from '../lib/babyContext';
import { useColors, Colors } from '../lib/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface Caregiver {
  id: string;
  user_id: string;
  role: string;
  name: string;
}

export default function ManageBabiesSheet({ visible, onClose }: Props) {
  const c = useColors();
  const s = makeStyles(c);
  const { babies, activeBabyId, activeBaby, loading, setActiveBabyId, refreshBabies, joinBabyByCode } = useBaby();

  const [userId, setUserId] = useState<string | null>(null);
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [caregiversLoading, setCaregiversLoading] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [newChildName, setNewChildName] = useState('');
  const [savingChild, setSavingChild] = useState(false);

  useEffect(() => {
    if (!visible) return;
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null));
  }, [visible]);

  const loadCaregivers = useCallback(async () => {
    if (!activeBabyId) { setCaregivers([]); return; }
    setCaregiversLoading(true);
    try {
      const { data: rows, error } = await (supabase as any)
        .from('baby_caregivers')
        .select('id, user_id, role')
        .eq('baby_id', activeBabyId);
      if (error) throw error;
      const ids = (rows ?? []).map((r: any) => r.user_id);
      const { data: profiles } = ids.length
        ? await supabase.from('profiles').select('id, display_name, username').in('id', ids)
        : { data: [] as any[] };
      const nameById = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name || (p.username ? `@${p.username}` : 'Caregiver')]));
      setCaregivers((rows ?? []).map((r: any) => ({ ...r, name: nameById.get(r.user_id) ?? 'Caregiver' })));
    } catch (err: any) {
      console.warn('[ManageBabiesSheet] loadCaregivers error:', err?.message);
    } finally {
      setCaregiversLoading(false);
    }
  }, [activeBabyId]);

  useEffect(() => { if (visible) loadCaregivers(); }, [visible, loadCaregivers]);

  const isOwner = !!activeBaby && activeBaby.user_id === userId;

  async function shareInvite() {
    if (!activeBaby?.invite_code) return;
    try {
      await Share.share({
        message: `Join me caring for ${activeBaby.name} on Parent Patch! In the app, go to Settings → Manage Babies → Join with a code and enter: ${activeBaby.invite_code}`,
      });
    } catch { /* user dismissed */ }
  }

  async function handleJoin() {
    if (!joinCode.trim()) return;
    setJoining(true);
    const result = await joinBabyByCode(joinCode.trim());
    setJoining(false);
    if (!result.ok) {
      Alert.alert('Could not join', result.error ?? 'Please check the code and try again.');
      return;
    }
    setJoinCode('');
    Alert.alert('Joined!', "You're now a caregiver for this baby.");
  }

  async function handleAddChild() {
    const name = newChildName.trim();
    if (!name || !userId) return;
    setSavingChild(true);
    try {
      const { error } = await supabase.from('babies').insert({ user_id: userId, name });
      if (error) throw error;
      setNewChildName('');
      setAddingChild(false);
      await refreshBabies();
    } catch (err: any) {
      Alert.alert('Could not add child', err?.message ?? 'Please try again.');
    } finally {
      setSavingChild(false);
    }
  }

  function confirmRemoveCaregiver(cg: Caregiver) {
    const isSelf = cg.user_id === userId;
    Alert.alert(
      isSelf ? 'Leave this baby?' : `Remove ${cg.name}?`,
      isSelf ? "You'll lose access to this baby's tracker data." : undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isSelf ? 'Leave' : 'Remove', style: 'destructive', onPress: async () => {
            try {
              const { error } = await (supabase as any).from('baby_caregivers').delete().eq('id', cg.id);
              if (error) throw error;
              if (isSelf) { await refreshBabies(); onClose(); }
              else await loadCaregivers();
            } catch (err: any) {
              Alert.alert('Could not remove', err?.message ?? 'Please try again.');
            }
          },
        },
      ],
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <View style={{ width: 50 }} />
          <Text style={s.headerTitle}>Manage Babies</Text>
          <TouchableOpacity onPress={onClose} style={{ width: 50, alignItems: 'flex-end' }} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={s.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={s.center}><ActivityIndicator color={c.primary} size="large" /></View>
        ) : (
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>Your children</Text>
            {babies.map(b => (
              <TouchableOpacity
                key={b.id}
                style={[s.babyRow, b.id === activeBabyId && s.babyRowActive]}
                onPress={() => setActiveBabyId(b.id)}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${b.name}`}
              >
                <Text style={s.babyName}>{b.name}</Text>
                {b.id === activeBabyId ? <Text style={s.babyActiveBadge}>Active</Text> : null}
              </TouchableOpacity>
            ))}

            {addingChild ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <TextInput
                  style={s.input}
                  placeholder="Child's name"
                  placeholderTextColor={c.textMuted}
                  value={newChildName}
                  onChangeText={setNewChildName}
                  autoFocus
                />
                <TouchableOpacity
                  onPress={handleAddChild}
                  disabled={savingChild || !newChildName.trim()}
                  style={[s.primaryBtn, { opacity: !newChildName.trim() ? 0.45 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Save new child"
                >
                  {savingChild ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.primaryBtnText}>Save</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setAddingChild(true)} style={s.addChildBtn} accessibilityRole="button" accessibilityLabel="Add another child">
                <Text style={s.addChildBtnText}>+ Add another child</Text>
              </TouchableOpacity>
            )}

            {activeBaby && (
              <>
                <Text style={[s.label, { marginTop: 28 }]}>Invite a caregiver to {activeBaby.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={s.codeBox}>
                    <Text style={s.codeText}>{activeBaby.invite_code ?? '——'}</Text>
                  </View>
                  <TouchableOpacity onPress={shareInvite} style={s.primaryBtn} accessibilityRole="button" accessibilityLabel="Share invite code">
                    <Text style={s.primaryBtnText}>Share</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.hint}>
                  Anyone with this code can log feeds, diapers, sleep, and more for {activeBaby.name}.
                </Text>

                <Text style={[s.label, { marginTop: 24 }]}>Caregivers</Text>
                {caregiversLoading ? (
                  <ActivityIndicator color={c.primary} style={{ marginTop: 8 }} />
                ) : (
                  caregivers.map(cg => {
                    const self = cg.user_id === userId;
                    const canRemove = (isOwner && cg.role !== 'owner') || (self && cg.role !== 'owner');
                    return (
                      <View key={cg.id} style={s.caregiverRow}>
                        <Text style={s.caregiverName}>
                          {cg.name}{self ? ' (you)' : ''}{cg.role === 'owner' ? ' · owner' : ''}
                        </Text>
                        {canRemove ? (
                          <TouchableOpacity
                            onPress={() => confirmRemoveCaregiver(cg)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel={self ? 'Leave' : `Remove ${cg.name}`}
                          >
                            <Text style={s.removeText}>{self ? 'Leave' : 'Remove'}</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </>
            )}

            <Text style={[s.label, { marginTop: 28 }]}>Join with a code</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="Enter a code"
                placeholderTextColor={c.textMuted}
                value={joinCode}
                onChangeText={setJoinCode}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={handleJoin}
                disabled={joining || !joinCode.trim()}
                style={[s.secondaryBtn, { opacity: !joinCode.trim() ? 0.45 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Join baby with code"
              >
                {joining ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.primaryBtnText}>Join</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: c.textPrimary },
    closeText: { fontSize: 18, color: c.textMuted },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    body: { padding: 20, paddingBottom: 48 },
    label: { fontSize: 13, fontWeight: '700', color: c.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    babyRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator,
      paddingHorizontal: 14, paddingVertical: 14, marginBottom: 8,
    },
    babyRowActive: { borderColor: c.primary },
    babyName: { fontSize: 15, fontWeight: '600', color: c.textPrimary },
    babyActiveBadge: { fontSize: 12, fontWeight: '700', color: c.primary },
    addChildBtn: { paddingVertical: 10, marginTop: 4 },
    addChildBtnText: { fontSize: 14, fontWeight: '700', color: c.primary },
    input: {
      backgroundColor: c.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
      fontSize: 15, color: c.textPrimary, flex: 1,
    },
    codeBox: {
      flex: 1, backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator,
      paddingVertical: 14, alignItems: 'center',
    },
    codeText: { fontSize: 22, fontWeight: '800', letterSpacing: 4, color: c.textPrimary },
    hint: { fontSize: 12, color: c.textMuted, marginTop: 6, lineHeight: 17 },
    primaryBtn: { backgroundColor: c.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 },
    primaryBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    secondaryBtn: { backgroundColor: c.editBtn, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 },
    caregiverRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator,
      paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
    },
    caregiverName: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    removeText: { fontSize: 12, fontWeight: '700', color: c.signOut ?? '#DC2626' },
  });
}
