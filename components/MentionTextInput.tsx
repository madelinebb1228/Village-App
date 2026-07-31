import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useColors } from '../lib/theme';
import UserAvatar from './UserAvatar';

interface MentionUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface Props extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  value: string;
  onChangeText: (text: string) => void;
  suggestionsAbove?: boolean;
}

function findActiveMention(text: string, cursor: number): { query: string; start: number } | null {
  const before = text.substring(0, cursor);
  const lastAt = before.lastIndexOf('@');
  if (lastAt === -1) return null;
  const fragment = before.substring(lastAt + 1);
  if (/[\s\n]/.test(fragment)) return null;
  return { query: fragment, start: lastAt };
}

export default function MentionTextInput({
  value,
  onChangeText,
  suggestionsAbove = false,
  style,
  ...rest
}: Props) {
  const c = useColors();
  const [suggestions, setSuggestions] = useState<MentionUser[]>([]);
  const [loading, setLoading] = useState(false);
  const activeMentionRef = useRef<{ query: string; start: number } | null>(null);
  const cursorRef = useRef(value.length);
  const prevTextRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelectionChange = useCallback((e: any) => {
    cursorRef.current = e.nativeEvent.selection.start;
  }, []);

  const handleChangeText = useCallback((newText: string) => {
    const delta = newText.length - prevTextRef.current.length;
    cursorRef.current = Math.max(0, Math.min(newText.length, cursorRef.current + delta));
    prevTextRef.current = newText;
    onChangeText(newText);

    const mention = findActiveMention(newText, cursorRef.current);
    activeMentionRef.current = mention;

    if (timerRef.current) clearTimeout(timerRef.current);

    if (!mention || mention.query.length === 0) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const q = mention.query;
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .or(`username.ilike.${q}%,display_name.ilike.${q}%`)
        .limit(5);
      setSuggestions((data as MentionUser[]) ?? []);
      setLoading(false);
    }, 220);
  }, [onChangeText]);

  const selectUser = useCallback((user: MentionUser) => {
    const mention = activeMentionRef.current;
    if (!mention) return;
    const handle = user.username ?? (user.display_name?.replace(/\s+/g, '') ?? 'user');
    const before = value.substring(0, mention.start);
    const after = value.substring(cursorRef.current);
    onChangeText(`${before}@${handle} ${after}`);
    setSuggestions([]);
    activeMentionRef.current = null;
  }, [value, onChangeText]);

  const hasSuggestions = suggestions.length > 0 || loading;

  const suggestionsList = hasSuggestions ? (
    <View style={{
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.separator ?? '#E8E3DC',
      overflow: 'hidden',
      marginBottom: suggestionsAbove ? 4 : 0,
      marginTop: suggestionsAbove ? 0 : 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.10,
      shadowRadius: 8,
      elevation: 4,
    }}>
      {loading && suggestions.length === 0 ? (
        <View style={{ padding: 12, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={c.primary} />
        </View>
      ) : (
        suggestions.map((user, idx) => (
          <TouchableOpacity
            key={user.id}
            onPress={() => selectUser(user)}
            activeOpacity={0.75}
            accessibilityRole="button" accessibilityLabel={`Mention ${user.display_name || user.username}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderBottomWidth: idx < suggestions.length - 1 ? 1 : 0,
              borderBottomColor: c.separator ?? '#E8E3DC',
            }}
          >
            <UserAvatar
              userId={user.id}
              name={user.display_name || user.username || '?'}
              size={32}
            />
            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }}>
                {user.display_name || user.username}
              </Text>
              {user.username ? (
                <Text style={{ fontSize: 12, color: c.textMuted }}>@{user.username}</Text>
              ) : null}
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  ) : null;

  return (
    <View>
      {suggestionsAbove && suggestionsList}
      <TextInput
        value={value}
        onChangeText={handleChangeText}
        onSelectionChange={handleSelectionChange}
        style={style}
        {...rest}
      />
      {!suggestionsAbove && suggestionsList}
    </View>
  );
}
