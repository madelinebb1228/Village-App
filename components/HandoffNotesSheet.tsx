import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useBaby } from '../lib/babyContext';
import { useColors, Colors } from '../lib/theme';
import { getParentTerm } from '../lib/inclusiveLanguage';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface HandoffNote {
  id: string;
  note: string;
  created_at: string;
  author_id: string;
  authorName: string;
  authorTerm: string;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function HandoffNotesSheet({ visible, onClose }: Props) {
  const c = useColors();
  const s = makeStyles(c);
  const { activeBaby } = useBaby();

  const [userId, setUserId] = useState<string | null>(null);
  const [notes, setNotes] = useState<HandoffNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null));
  }, [visible]);

  const loadNotes = useCallback(async () => {
    if (!activeBaby?.id) { setNotes([]); return; }
    setLoading(true);
    try {
      const { data: rows, error } = await (supabase as any)
        .from('handoff_notes')
        .select('id, note, created_at, author_id')
        .eq('baby_id', activeBaby.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const ids = [...new Set((rows ?? []).map((r: any) => r.author_id))];
      const { data: profiles } = ids.length
        ? await supabase.from('profiles').select('id, display_name, username, preferred_term').in('id', ids)
        : { data: [] as any[] };
      const infoById = new Map((profiles ?? []).map((p: any) => [
        p.id,
        { name: p.display_name || (p.username ? `@${p.username}` : 'Caregiver'), term: getParentTerm(p) },
      ]));
      setNotes((rows ?? []).map((r: any) => {
        const info = infoById.get(r.author_id);
        return { ...r, authorName: info?.name ?? 'Caregiver', authorTerm: info?.term ?? 'Parent' };
      }));
    } catch (err: any) {
      console.warn('[HandoffNotesSheet] loadNotes error:', err?.message);
    } finally {
      setLoading(false);
    }
  }, [activeBaby?.id]);

  useEffect(() => { if (visible) loadNotes(); }, [visible, loadNotes]);

  async function handleAdd() {
    const trimmed = draft.trim();
    if (!trimmed || !activeBaby?.id || !userId) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from('handoff_notes').insert({
        baby_id: activeBaby.id,
        author_id: userId,
        note: trimmed,
      });
      if (error) throw error;
      setDraft('');
      await loadNotes();
    } catch (err: any) {
      Alert.alert('Could not save note', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <View style={{ width: 50 }} />
          <Text style={s.headerTitle}>Handoff Notes</Text>
          <TouchableOpacity onPress={onClose} style={{ width: 50, alignItems: 'flex-end' }} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={s.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={s.composer}>
          <TextInput
            style={s.notesInput}
            placeholder="Leave a note for your co-parent — left bottle in fridge, wakes around 2am..."
            placeholderTextColor={c.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
            accessibilityLabel="New handoff note"
          />
          <TouchableOpacity
            onPress={handleAdd}
            disabled={saving || !draft.trim()}
            style={[s.addBtn, { opacity: !draft.trim() ? 0.45 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Add note"
          >
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.addBtnText}>Add note</Text>}
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={s.center}><ActivityIndicator color={c.primary} size="large" /></View>
        ) : (
          <ScrollView contentContainerStyle={s.body}>
            {notes.length === 0 ? (
              <Text style={s.emptyText}>No notes yet — leave one for your co-parent.</Text>
            ) : (
              notes.map(n => (
                <View key={n.id} style={s.noteRow}>
                  <Text style={s.noteText}>{n.note}</Text>
                  <Text style={s.noteAttribution}>
                    — {n.author_id === userId ? 'You' : `${n.authorName} · ${n.authorTerm}`} · {relativeTime(n.created_at)}
                  </Text>
                </View>
              ))
            )}
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
    composer: { padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.separator },
    notesInput: {
      backgroundColor: c.inputBg, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator,
      padding: 12, fontSize: 13, color: c.textPrimary, marginBottom: 10, minHeight: 60,
    },
    addBtn: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
    addBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    body: { padding: 20, paddingBottom: 48 },
    emptyText: { fontSize: 14, color: c.textMuted, textAlign: 'center', marginTop: 20 },
    noteRow: {
      backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5, borderColor: c.separator,
      paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10,
    },
    noteText: { fontSize: 14, color: c.textPrimary, lineHeight: 20 },
    noteAttribution: { fontSize: 12, color: c.textMuted, marginTop: 6, fontStyle: 'italic' },
  });
}
