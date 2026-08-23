import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useColors, Colors } from '../../lib/theme';
import { getPregnancyProgress, getWeekInfo } from '../../lib/pregnancyData';
import { babyAgeLabel } from '../../lib/feedUtils.tsx';

interface Baby {
  name: string;
  birth_date: string | null;
  due_date: string | null;
  is_expecting: boolean | null;
  photo_url: string | null;
  gender: string | null;
}

interface BabyProfileCardProps {
  baby: Baby;
  onPress: () => void;
  containerRef?: React.RefObject<React.ElementRef<typeof TouchableOpacity>>;
}

function BabyProfileCard({ baby, onPress, containerRef }: BabyProfileCardProps) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  const genderKey = baby.gender?.toLowerCase();

  return (
    <TouchableOpacity
      ref={containerRef}
      style={[
        styles.babyCard,
        {
          backgroundColor: genderKey === 'girl' ? c.girlBg
            : genderKey === 'boy' ? c.boyBg
            : c.cardBlush,
          borderLeftColor: genderKey === 'girl' ? c.girlBorder
            : genderKey === 'boy' ? c.boyBorder
            : c.girlBorder,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button" accessibilityLabel="Open baby profile"
    >
      <View style={[
        styles.babyAvatar,
        {
          backgroundColor: genderKey === 'girl' ? c.girlBorder
            : genderKey === 'boy' ? c.boyBorder
            : c.girlBg,
        },
      ]}>
        {baby.photo_url ? (
          <Image source={{ uri: baby.photo_url }} style={styles.babyAvatarPhoto} />
        ) : (
          <Text style={styles.babyAvatarText}>
            {baby.is_expecting ? '🤰' : baby.name ? baby.name.charAt(0).toUpperCase() : '👶'}
          </Text>
        )}
      </View>
      <View style={styles.babyInfo}>
        <Text style={styles.babyName}>{baby.name || 'Your Baby'}</Text>
        {baby.is_expecting && baby.due_date ? (() => {
          const { weeksPregnant, daysUntilDue } = getPregnancyProgress(baby.due_date);
          const { size, emoji } = getWeekInfo(weeksPregnant);
          return (
            <Text style={styles.babyAge}>
              Week {weeksPregnant} · about the size of {emoji} {size}
              {daysUntilDue > 0 ? ` · ${daysUntilDue}d to go` : ''}
            </Text>
          );
        })() : baby.is_expecting ? (
          <Text style={styles.babyAge}>Expecting</Text>
        ) : baby.birth_date ? (
          <Text style={styles.babyAge}>{babyAgeLabel(baby.birth_date)}</Text>
        ) : null}
      </View>
      <Text style={styles.babyCardChevron}>›</Text>
    </TouchableOpacity>
  );
}

export default React.memo(BabyProfileCard);

function makeStyles(c: Colors) {
  return StyleSheet.create({
    babyCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.cardBlush,
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
      gap: 14,
      borderLeftWidth: 5,
      borderLeftColor: c.girlBorder,
    },
    babyAvatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.girlBg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    babyAvatarText: {
      fontSize: 22,
      fontWeight: '800',
      color: '#fff',
    },
    babyInfo: {
      flex: 1,
    },
    babyName: {
      fontSize: 20,
      fontWeight: '800',
      color: c.textPrimary,
    },
    babyAge: {
      fontSize: 13,
      color: '#fff',
      marginTop: 2,
      fontWeight: '600',
      textShadowColor: 'rgba(0,0,0,0.75)',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 5,
    },
    babyAvatarPhoto: {
      width: 52,
      height: 52,
      borderRadius: 26,
    },
    babyCardChevron: {
      fontSize: 22,
      color: '#AEBCB1',
      fontWeight: '300',
      marginLeft: 4,
    },
  });
}
