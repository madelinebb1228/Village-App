import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Share, Alert, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';
import { notifyCoupleLinked } from '../lib/relationshipUtil';

interface Props {
  userId: string;
  title: string;
  onLinked: () => void;
  /** Pass the user's own couple's invite code if a couple already exists
   * (they're just waiting on their partner to join) so this doesn't create
   * a second, orphaned couple row. */
  existingInviteCode?: string | null;
}

/**
 * Empty-state shown by both KudosTracker and UsTimeTracker when the current
 * user isn't linked to a partner yet. Mirrors ManageBabiesSheet's invite/join
 * code flow so it needs no new mental model.
 */
export default function CoupleLinkPrompt({ userId, title, onLinked, existingInviteCode }: Props) {
  const c = useColors();
  const s = makeStyles(c);
  const [creating, setCreating] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [myCode, setMyCode] = useState<string | null>(existingInviteCode ?? null);

  async function handleShareCode() {
    setCreating(true);
    try {
      let code = myCode;
      if (!code) {
        const { data, error } = await supabase
          .from('couples')
          .insert({ user_id: userId })
          .select('invite_code')
          .single();
        if (error) throw error;
        code = data.invite_code;
        setMyCode(code);
        notifyCoupleLinked();
      }
      await Share.share({
        message: `Let's connect on Parent Patch — in the app go to Track → Relationship → Enter a code, and use: ${code}`,
      });
    } catch (err: any) {
      Alert.alert("Couldn't create invite", err?.message ?? 'Please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin() {
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const { error } = await supabase.rpc('join_couple_by_code', { p_code: joinCode.trim() });
      if (error) throw error;
      setJoinCode('');
      notifyCoupleLinked();
      onLinked();
    } catch (err: any) {
      Alert.alert('Could not connect', err?.message ?? 'Please check the code and try again.');
    } finally {
      setJoining(false);
    }
  }

  return (
    <View style={s.card}>
      <Text style={s.emoji}>💞</Text>
      <Text style={s.title}>{title}</Text>
      <Text style={s.subtitle}>Connect with your partner or co-parent to start sharing this with them. Nothing here is shared until you both link up.</Text>

      {myCode && (
        <View style={s.codeBox}>
          <Text style={s.codeLabel}>Your invite code</Text>
          <Text style={s.codeText}>{myCode}</Text>
        </View>
      )}

      <TouchableOpacity onPress={handleShareCode} disabled={creating} style={s.primaryBtn} accessibilityRole="button" accessibilityLabel="Share invite code">
        {creating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.primaryBtnText}>Share an invite code</Text>}
      </TouchableOpacity>

      <Text style={s.orText}>or</Text>

      <View style={s.joinRow}>
        <TextInput
          style={s.input}
          placeholder="Enter a code"
          placeholderTextColor={c.textMuted}
          value={joinCode}
          onChangeText={t => setJoinCode(t.toUpperCase())}
          autoCapitalize="characters"
          maxLength={6}
        />
        <TouchableOpacity
          onPress={handleJoin}
          disabled={joining || !joinCode.trim()}
          style={[s.secondaryBtn, { opacity: !joinCode.trim() ? 0.45 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Join with code"
        >
          {joining ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.secondaryBtnText}>Connect</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.card, borderRadius: 16, borderWidth: 1.5, borderColor: c.separator,
      padding: 20, alignItems: 'center', gap: 6,
    },
    emoji: { fontSize: 32, marginBottom: 4 },
    title: { fontSize: 17, fontWeight: '800', color: c.textPrimary, textAlign: 'center' },
    subtitle: { fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 19, marginBottom: 10 },
    codeBox: {
      backgroundColor: c.cardBlush, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16,
      alignItems: 'center', marginBottom: 10, width: '100%',
    },
    codeLabel: { fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    codeText: { fontSize: 20, fontWeight: '800', letterSpacing: 3, color: c.textPrimary, marginTop: 2 },
    primaryBtn: {
      backgroundColor: c.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 13,
      width: '100%', alignItems: 'center',
    },
    primaryBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    orText: { fontSize: 12, color: c.textMuted, marginVertical: 8 },
    joinRow: { flexDirection: 'row', gap: 10, width: '100%' },
    input: {
      flex: 1, backgroundColor: c.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 15, color: c.textPrimary, letterSpacing: 2,
    },
    secondaryBtn: {
      backgroundColor: c.editBtn, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
      justifyContent: 'center', alignItems: 'center',
    },
    secondaryBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  });
