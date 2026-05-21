import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { VILLAGE_MAP } from '../lib/villageData';
import { useColors, Colors } from '../lib/theme';

interface PublicProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  parent_role: string | null;
  show_villages: boolean | null;
}

interface Props {
  userId: string | null;
  visible: boolean;
  onClose: () => void;
}

function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: c.bg },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.separator,
    },
    closeBtn: { paddingHorizontal: 8, paddingVertical: 4 },
    closeText: { fontSize: 16, fontWeight: '700', color: c.primary },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    ownProfileText: { fontSize: 15, color: c.textMuted, textAlign: 'center', lineHeight: 22 },

    content: { padding: 20 },

    hero: {
      backgroundColor: c.heroBg,
      borderRadius: 20,
      padding: 24,
      alignItems: 'center',
      marginBottom: 20,
      shadowColor: c.heroShadow,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.18,
      shadowRadius: 10,
      elevation: 4,
    },
    avatarWrap: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: c.avatarBg,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 14,
      overflow: 'hidden',
    },
    avatarImage: { width: 80, height: 80, borderRadius: 40 },
    avatarInitial: { fontSize: 30, fontWeight: '800', color: c.primary },

    heroName: {
      fontSize: 20,
      fontWeight: '800',
      color: c.textPrimary,
      marginBottom: 4,
      textAlign: 'center',
    },
    heroUsername: {
      fontSize: 14,
      color: c.textMuted,
      fontWeight: '600',
      marginBottom: 8,
    },
    roleBadge: {
      backgroundColor: c.roleBadge,
      paddingHorizontal: 14,
      paddingVertical: 5,
      borderRadius: 12,
      marginBottom: 10,
    },
    roleBadgeText: { fontSize: 12, fontWeight: '700', color: c.textOnColored },
    heroBio: {
      fontSize: 14,
      color: c.textMuted,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 16,
      paddingHorizontal: 8,
    },

    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: c.sage,
      paddingTop: 14,
      width: '100%',
      marginTop: 4,
    },
    statItem: { flex: 1, alignItems: 'center' },
    statNum: { fontSize: 15, fontWeight: '800', color: c.textSecondary, marginBottom: 2 },
    statLbl: { fontSize: 11, color: c.textMuted, fontWeight: '500' },
    statDivider: { width: 1, height: 32, backgroundColor: c.cardSage },

    section: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: c.textSecondary,
    },
    commonBadge: {
      backgroundColor: c.cardSage,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    commonBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textSecondary,
    },

    villageChipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    villageChip: {
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: 1,
    },
    villageChipText: {
      fontSize: 12,
      color: c.textSecondary,
      fontWeight: '600',
    },

    privateNote: {
      fontSize: 13,
      color: c.textMuted,
      textAlign: 'center',
      fontStyle: 'italic',
      marginTop: 4,
    },
  });
}

export default function PublicProfileSheet({ userId, visible, onClose }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [postCount, setPostCount] = useState(0);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [theirVillageIds, setTheirVillageIds] = useState<string[]>([]);
  const [myVillageIds, setMyVillageIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  useEffect(() => {
    if (!visible || !userId) return;
    setProfile(null);
    setTheirVillageIds([]);
    setMyVillageIds([]);
    setPostCount(0);
    setFollowerCount(0);
    setFollowingCount(0);
    setIsOwnProfile(false);

    (async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        if (user.id === userId) {
          setIsOwnProfile(true);
          setLoading(false);
          return;
        }

        const [profileRes, postsRes, theirVillagesRes, myVillagesRes, followersRes, followingRes] = await Promise.all([
          supabase.from('profiles').select('id,username,display_name,bio,avatar_url,parent_role,show_villages').eq('id', userId).maybeSingle(),
          supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('user_villages').select('village_id').eq('user_id', userId),
          supabase.from('user_villages').select('village_id').eq('user_id', user.id),
          supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
          supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId),
        ]);

        setProfile(profileRes.data ?? null);
        setPostCount(postsRes.count ?? 0);
        setFollowerCount(followersRes.count ?? 0);
        setFollowingCount(followingRes.count ?? 0);
        setTheirVillageIds((theirVillagesRes.data ?? []).map((r: any) => r.village_id));
        setMyVillageIds((myVillagesRes.data ?? []).map((r: any) => r.village_id));
      } catch (err: any) {
        console.warn('PublicProfileSheet error:', err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, userId]);

  const commonIds = theirVillageIds.filter(id => myVillageIds.includes(id));
  const displayName = profile?.display_name || profile?.username || 'Villager';
  const initial = displayName.charAt(0).toUpperCase();
  const showVillages = profile?.show_villages !== false;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.safeArea}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
            <Text style={s.closeText}>Done</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color={c.primary} size="large" />
          </View>
        ) : isOwnProfile ? (
          <View style={s.center}>
            <Text style={s.ownProfileText}>That's you! Edit your profile from the Profile tab.</Text>
          </View>
        ) : !profile ? (
          <View style={s.center}>
            <Text style={s.ownProfileText}>Profile not found.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {/* Hero card */}
            <View style={s.hero}>
              {/* Avatar */}
              <View style={s.avatarWrap}>
                {profile.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={s.avatarImage} />
                ) : (
                  <Text style={s.avatarInitial}>{initial}</Text>
                )}
              </View>

              <Text style={s.heroName}>{displayName}</Text>
              {profile.username && (
                <Text style={s.heroUsername}>@{profile.username}</Text>
              )}
              {profile.parent_role && (
                <View style={s.roleBadge}>
                  <Text style={s.roleBadgeText}>{profile.parent_role}</Text>
                </View>
              )}
              {profile.bio ? (
                <Text style={s.heroBio}>{profile.bio}</Text>
              ) : null}

              {/* Stats */}
              <View style={s.statsRow}>
                <View style={s.statItem}>
                  <Text style={s.statNum}>{postCount}</Text>
                  <Text style={s.statLbl}>Posts</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Text style={s.statNum}>{followerCount}</Text>
                  <Text style={s.statLbl}>Followers</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Text style={s.statNum}>{followingCount}</Text>
                  <Text style={s.statLbl}>Following</Text>
                </View>
                {showVillages && (
                  <>
                    <View style={s.statDivider} />
                    <View style={s.statItem}>
                      <Text style={s.statNum}>{theirVillageIds.length}</Text>
                      <Text style={s.statLbl}>Villages</Text>
                    </View>
                  </>
                )}
              </View>
            </View>

            {/* Villages section */}
            {showVillages && theirVillageIds.length > 0 && (
              <View style={s.section}>
                <View style={s.sectionHeaderRow}>
                  <Text style={s.sectionTitle}>Villages</Text>
                  {commonIds.length > 0 && (
                    <View style={s.commonBadge}>
                      <Text style={s.commonBadgeText}>🏘️ {commonIds.length} in common</Text>
                    </View>
                  )}
                </View>

                <View style={s.villageChipsWrap}>
                  {theirVillageIds.map((id, i) => {
                    const v = VILLAGE_MAP[id];
                    if (!v) return null;
                    const chipColors = [
                      { bg: c.cardLavender, border: c.lavender },
                      { bg: c.cardBlue,     border: c.blue },
                      { bg: c.cardBlush,    border: c.blush },
                      { bg: c.cardHoney,    border: c.honey },
                      { bg: c.cardSage,     border: c.sage },
                    ];
                    const cc = chipColors[i % chipColors.length];
                    return (
                      <View key={id} style={[s.villageChip, { backgroundColor: cc.bg, borderColor: cc.border }]}>
                        <Text style={s.villageChipText}>
                          {v.emoji} {v.name.replace(' Village', '').replace(' Parents', '')}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {!showVillages && (
              <Text style={s.privateNote}>This user's villages are private.</Text>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}
