import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors, Colors } from '../../lib/theme';
import PaywallGate from '../PaywallGate';

interface SuppliesSnapshot {
  formula: number | null; formulaLow: boolean;
  diapers: number | null; diapersLow: boolean;
  milkOz: number;
}

interface SuppliesSnapshotCardProps {
  snapshot: SuppliesSnapshot | null;
}

function SuppliesSnapshotCard({ snapshot }: SuppliesSnapshotCardProps) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  if (!snapshot) return null;

  return (
    <PaywallGate feature="supplies" title="Supplies Overview" description="Track formula, diapers, and milk stash with low-stock alerts." emoji="🧴">
      <View style={styles.suppliesCard}>
        <Text style={styles.sectionTitle}>Supplies</Text>
        <View style={styles.suppliesGrid}>
          <View
            style={[styles.supplyChip, { backgroundColor: snapshot.formulaLow ? c.supplyLowBg : c.cardHoney }]}
            accessible
            accessibilityLabel={`Formula: ${snapshot.formula !== null ? `${snapshot.formula.toFixed(1)} ounces` : 'no data'}${snapshot.formulaLow ? ', low' : ''}`}
          >
            <Text style={styles.supplyChipEmoji}>🍼</Text>
            <Text style={[styles.supplyChipValue, snapshot.formulaLow && styles.supplyChipValueLow]}>
              {snapshot.formula !== null ? `${snapshot.formula.toFixed(1)} oz` : '–'}
            </Text>
            <Text style={styles.supplyChipLabel}>Formula</Text>
          </View>
          <View
            style={[styles.supplyChip, { backgroundColor: snapshot.diapersLow ? c.supplyLowBg : c.cardSage }]}
            accessible
            accessibilityLabel={`Diapers: ${snapshot.diapers !== null ? Math.round(snapshot.diapers) : 'no data'}${snapshot.diapersLow ? ', low' : ''}`}
          >
            <Text style={styles.supplyChipEmoji}>👶</Text>
            <Text style={[styles.supplyChipValue, snapshot.diapersLow && styles.supplyChipValueLow]}>
              {snapshot.diapers !== null ? String(Math.round(snapshot.diapers)) : '–'}
            </Text>
            <Text style={styles.supplyChipLabel}>Diapers</Text>
          </View>
          <View
            style={[styles.supplyChip, { backgroundColor: c.cardBlush }]}
            accessible
            accessibilityLabel={`Milk Stash: ${snapshot.milkOz > 0 ? `${snapshot.milkOz.toFixed(1)} ounces` : 'no data'}`}
          >
            <Text style={styles.supplyChipEmoji}>🤱</Text>
            <Text style={styles.supplyChipValue}>
              {snapshot.milkOz > 0 ? `${snapshot.milkOz.toFixed(1)} oz` : '–'}
            </Text>
            <Text style={styles.supplyChipLabel}>Milk Stash</Text>
          </View>
        </View>
        {snapshot.formula === null && snapshot.diapers === null && snapshot.milkOz === 0 && (
          <Text style={styles.suppliesEmptyHint}>Track formula, diapers & milk in the Supplies tab</Text>
        )}
      </View>
    </PaywallGate>
  );
}

export default React.memo(SuppliesSnapshotCard);

function makeStyles(c: Colors) {
  return StyleSheet.create({
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.textSecondary,
      marginBottom: 14,
    },
    suppliesCard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 28,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    suppliesGrid: {
      flexDirection: 'row',
      gap: 10,
    },
    supplyChip: {
      flex: 1,
      backgroundColor: c.bgAlt,
      borderRadius: 12,
      padding: 12,
      alignItems: 'center',
    },
    supplyChipEmoji: {
      fontSize: 22,
      marginBottom: 6,
    },
    supplyChipValue: {
      fontSize: 15,
      fontWeight: '800',
      color: c.textSecondary,
      marginBottom: 3,
    },
    supplyChipValueLow: {
      color: c.supplyLowText,
    },
    supplyChipLabel: {
      fontSize: 9,
      fontWeight: '600',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      textAlign: 'center',
    },
    suppliesEmptyHint: {
      fontSize: 12,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: 10,
      fontStyle: 'italic',
    },
  });
}
