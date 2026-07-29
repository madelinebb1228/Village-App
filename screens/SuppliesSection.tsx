import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  TextInput, Alert, Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { safeInsert, safeUpdate, safeDelete, safeUpsert } from '../lib/syncService';
import SupplyInsights from './SupplyInsights';
import { useColors, Colors } from '../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SupplyItem {
  supply_type: string;
  quantity_remaining: number;
  unit: string;
  low_threshold: number;
}

interface PumpPart {
  id: string;
  part_name: string;
  last_replaced: string;
  sessions_since_replaced: number;
}

interface MilkBatch {
  id: string;
  amount_ml: number;
  stored_date: string;
  location: 'fridge' | 'freezer';
  notes?: string;
}

interface SimpleMed {
  id: string;
  name: string;
  color: string;
  frequency_hours: number | null;
  category: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FRIDGE_DAYS  = 4;
const FREEZER_DAYS = 365;

const PART_LIMITS: Record<string, { sessions: number; days: number }> = {
  membranes:      { sessions: 30,  days: 60  },
  valves:         { sessions: 15,  days: 28  },
  breast_shields: { sessions: 100, days: 180 },
  tubing:         { sessions: 100, days: 180 },
};

const PART_LABELS: Record<string, string> = {
  membranes:      'Membranes',
  valves:         'Valves',
  breast_shields: 'Breast Shields',
  tubing:         'Tubing',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntilExpiry(batch: MilkBatch): number {
  const limit = batch.location === 'fridge' ? FRIDGE_DAYS : FREEZER_DAYS;
  const expiresMs = new Date(batch.stored_date).getTime() + limit * 86400000;
  return Math.ceil((expiresMs - Date.now()) / 86400000);
}

function batchUrgency(daysLeft: number): 'ok' | 'warning' | 'alert' {
  if (daysLeft <= 1) return 'alert';
  if (daysLeft <= 2) return 'warning';
  return 'ok';
}

function mlToOz(ml: number): string {
  return (ml / 29.5735).toFixed(1);
}

function formatStoredDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Internal supply_items total helpers ──────────────────────────────────────

async function adjustMilkTotal(userId: string, deltaMl: number) {
  const { data: existing } = await supabase
    .from('supply_items')
    .select('quantity_remaining, low_threshold')
    .eq('user_id', userId)
    .eq('supply_type', 'breastmilk')
    .maybeSingle();
  await safeUpsert('supply_items', {
    user_id:            userId,
    supply_type:        'breastmilk',
    quantity_remaining: Math.max(0, (existing?.quantity_remaining ?? 0) + deltaMl),
    unit:               'ml',
    low_threshold:      existing?.low_threshold ?? 0,
    updated_at:         new Date().toISOString(),
  }, 'user_id,supply_type');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SuppliesSection({
  userId, babyId, refreshKey,
}: {
  userId: string | null;
  babyId?: string | null;
  refreshKey?: number;
}) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [supplies, setSupplies]             = useState<SupplyItem[]>([]);
  const [pumpParts, setPumpParts]           = useState<PumpPart[]>([]);
  const [milkBatches, setMilkBatches]       = useState<MilkBatch[]>([]);
  const [formulaDailyOz, setFormulaDailyOz] = useState<number | null>(null);
  const [diaperDailyCount, setDiaperDailyCount] = useState<number | null>(null);
  const [foodDailyCount, setFoodDailyCount] = useState<number | null>(null);
  const [meds, setMeds]                     = useState<SimpleMed[]>([]);
  const [purchaseModal, setPurchaseModal]   = useState<{ type: 'formula' | 'diapers' | 'wipes' | 'food_pouches' | 'baby_snacks'; unit: string } | null>(null);
  const [purchaseQty, setPurchaseQty]       = useState('');
  const [purchaseAlert, setPurchaseAlert]   = useState('');
  const [medRestockModal, setMedRestockModal] = useState<SimpleMed | null>(null);
  const [medRestockQty, setMedRestockQty]   = useState('');
  const [medRestockAlert, setMedRestockAlert] = useState('');
  const [milkModal, setMilkModal]           = useState(false);
  const [milkAmount, setMilkAmount]         = useState('');
  const [milkLocation, setMilkLocation]     = useState<'fridge' | 'freezer'>('fridge');
  const [milkNotes, setMilkNotes]           = useState('');

  const loadData = useCallback(async () => {
    if (!userId) return;
    const day14 = new Date(); day14.setDate(day14.getDate() - 14);

    const [supplyRes, partsRes, milkRes, medRes] = await Promise.all([
      supabase.from('supply_items').select('supply_type,quantity_remaining,unit,low_threshold').eq('user_id', userId),
      supabase.from('pump_parts').select('id,part_name,last_replaced,sessions_since_replaced').eq('user_id', userId),
      supabase.from('milk_stash').select('id,amount_ml,stored_date,location,notes').eq('user_id', userId).order('stored_date', { ascending: true }),
      (supabase.from('medications') as any).select('id,name,color,frequency_hours,category').eq('user_id', userId).eq('active', true).eq('category', 'baby').order('created_at'),
    ]);
    if (supplyRes.data) setSupplies(supplyRes.data);
    if (partsRes.data) setPumpParts(partsRes.data);
    if (milkRes.data)  setMilkBatches(milkRes.data as MilkBatch[]);
    if (medRes.data)   setMeds(medRes.data as SimpleMed[]);

    // Usage rates for days-remaining estimate
    if (babyId) {
      const [feedRes, diaperRes] = await Promise.all([
        supabase.from('feeds')
          .select('formula_oz, bottle_amount_oz, bottle_source')
          .eq('baby_id', babyId)
          .gte('logged_at', day14.toISOString()),
        supabase.from('diaper_logs')
          .select('id', { count: 'exact', head: true })
          .eq('baby_id', babyId)
          .gte('logged_at', day14.toISOString()),
      ]);

      if (feedRes.data) {
        const totalOz = feedRes.data.reduce((sum, f) => {
          if (f.formula_oz != null) return sum + f.formula_oz;
          if (f.bottle_source === 'formula' && f.bottle_amount_oz != null) return sum + f.bottle_amount_oz;
          return sum;
        }, 0);
        setFormulaDailyOz(totalOz > 0 ? totalOz / 14 : null);
      }

      if (diaperRes.count != null) {
        setDiaperDailyCount(diaperRes.count > 0 ? diaperRes.count / 14 : null);
      }

      const foodRes = await supabase.from('baby_food_logs' as any)
        .select('id', { count: 'exact', head: true })
        .eq('baby_id', babyId)
        .gte('tried_at', day14.toISOString());
      if ((foodRes as any).count != null) {
        setFoodDailyCount((foodRes as any).count > 0 ? (foodRes as any).count / 14 : null);
      }
    }
  }, [userId, babyId]);

  useEffect(() => { loadData(); }, [loadData, refreshKey]);

  // ── Purchase modal save ────────────────────────────────────────────────────

  async function logPurchase() {
    if (!purchaseModal || !userId) return;
    const qty = parseFloat(purchaseQty);
    if (!qty || qty <= 0) { Alert.alert('Enter a valid quantity'); return; }
    const existing = supplies.find(s => s.supply_type === purchaseModal.type);
    const threshold = parseFloat(purchaseAlert) || existing?.low_threshold || 0;
    try {
      await safeUpsert('supply_items', {
        user_id:            userId,
        supply_type:        purchaseModal.type,
        quantity_remaining: (existing?.quantity_remaining ?? 0) + qty,
        unit:               purchaseModal.unit,
        low_threshold:      threshold,
        updated_at:         new Date().toISOString(),
      }, 'user_id,supply_type');
    } catch (e: any) { Alert.alert('Error', e.message); return; }
    setPurchaseModal(null);
    setPurchaseQty('');
    setPurchaseAlert('');
    loadData();
  }

  // ── Add milk batch ─────────────────────────────────────────────────────────

  async function saveMilkBatch() {
    if (!userId) return;
    const oz = parseFloat(milkAmount);
    if (!oz || oz <= 0) { Alert.alert('Enter a valid amount'); return; }
    const ml = oz * 29.5735;
    try {
      await safeInsert('milk_stash', {
        user_id:     userId,
        amount_ml:   ml,
        stored_date: new Date().toISOString(),
        location:    milkLocation,
        notes:       milkNotes.trim() || null,
      });
    } catch (e: any) { Alert.alert('Error', e.message); return; }
    await adjustMilkTotal(userId, ml);
    setMilkModal(false);
    setMilkAmount('');
    setMilkNotes('');
    setMilkLocation('fridge');
    loadData();
  }

  // ── Use a milk batch ───────────────────────────────────────────────────────

  function confirmUseBatch(batch: MilkBatch) {
    const oz = mlToOz(batch.amount_ml);
    const msg = `Mark ${oz} oz as used?`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doUseBatch(batch);
      return;
    }
    Alert.alert('Use Milk', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Use', onPress: () => doUseBatch(batch) },
    ]);
  }

  async function doUseBatch(batch: MilkBatch) {
    if (!userId) return;
    await safeDelete('milk_stash', batch.id);
    await adjustMilkTotal(userId, -batch.amount_ml);
    loadData();
  }

  // ── Move fridge batch to freezer ───────────────────────────────────────────

  function confirmMoveToFreezer(batch: MilkBatch) {
    const oz = mlToOz(batch.amount_ml);
    const msg = `Move ${oz} oz to freezer? The 1-year timer will start from today.`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doMoveToFreezer(batch);
      return;
    }
    Alert.alert('Move to Freezer', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move', onPress: () => doMoveToFreezer(batch) },
    ]);
  }

  async function doMoveToFreezer(batch: MilkBatch) {
    await safeUpdate('milk_stash', batch.id, {
      location:    'freezer',
      stored_date: new Date().toISOString(),
    });
    loadData();
  }

  // ── Mark pump part replaced ────────────────────────────────────────────────

  function confirmMarkReplaced(partName: string) {
    const msg = `Mark ${PART_LABELS[partName]} as replaced today?`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doMarkReplaced(partName);
      return;
    }
    Alert.alert('Mark Replaced', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes', onPress: () => doMarkReplaced(partName) },
    ]);
  }

  async function doMarkReplaced(partName: string) {
    if (!userId) return;
    await safeUpsert('pump_parts', {
      user_id:                  userId,
      part_name:                partName,
      last_replaced:            new Date().toISOString(),
      sessions_since_replaced:  0,
    }, 'user_id,part_name');
    loadData();
  }

  // ── Med supply helpers ─────────────────────────────────────────────────────

  function medSupplyKey(medId: string) { return `med_${medId}`; }

  function medSupplyOf(medId: string) {
    return supplies.find(s => s.supply_type === medSupplyKey(medId));
  }

  async function logMedDose(med: SimpleMed) {
    if (!userId) return;
    const existing = medSupplyOf(med.id);
    if (!existing || existing.quantity_remaining <= 0) return;
    await safeUpsert('supply_items', {
      user_id:            userId,
      supply_type:        medSupplyKey(med.id),
      quantity_remaining: Math.max(0, existing.quantity_remaining - 1),
      unit:               'doses',
      low_threshold:      existing.low_threshold,
      updated_at:         new Date().toISOString(),
    }, 'user_id,supply_type');
    loadData();
  }

  async function saveMedRestock() {
    if (!medRestockModal || !userId) return;
    const qty = parseFloat(medRestockQty);
    if (!qty || qty <= 0) { Alert.alert('Enter a valid quantity'); return; }
    const existing = medSupplyOf(medRestockModal.id);
    const threshold = parseFloat(medRestockAlert) || existing?.low_threshold || 0;
    try {
      await safeUpsert('supply_items', {
        user_id:            userId,
        supply_type:        medSupplyKey(medRestockModal.id),
        quantity_remaining: (existing?.quantity_remaining ?? 0) + qty,
        unit:               'doses',
        low_threshold:      threshold,
        updated_at:         new Date().toISOString(),
      }, 'user_id,supply_type');
    } catch (e: any) { Alert.alert('Error', e.message); return; }
    setMedRestockModal(null);
    setMedRestockQty('');
    setMedRestockAlert('');
    loadData();
  }

  // ── Display helpers ────────────────────────────────────────────────────────

  function partDue(part: PumpPart): boolean {
    const limits = PART_LIMITS[part.part_name];
    if (!limits) return false;
    const days = (Date.now() - new Date(part.last_replaced).getTime()) / 86400000;
    return part.sessions_since_replaced >= limits.sessions || days >= limits.days;
  }

  function partProgress(partName: string) {
    const limits = PART_LIMITS[partName];
    if (!limits) return null;
    const part = pumpParts.find(p => p.part_name === partName);
    if (!part) return null;
    const days = Math.floor((Date.now() - new Date(part.last_replaced).getTime()) / 86400000);
    const sessionPct = Math.min(1, part.sessions_since_replaced / limits.sessions);
    const dayPct = Math.min(1, days / limits.days);
    const pct = Math.max(sessionPct, dayPct);
    return { pct, due: pct >= 1, sessions: part.sessions_since_replaced, days, maxSessions: limits.sessions, maxDays: limits.days };
  }

  function supplyOf(type: string): { display: string; low: boolean; item: SupplyItem | undefined } {
    const item = supplies.find(s => s.supply_type === type);
    if (!item) return { display: '–', low: false, item: undefined };
    const low = item.low_threshold > 0 && item.quantity_remaining <= item.low_threshold;
    const display =
      type === 'formula'
        ? `${item.quantity_remaining.toFixed(1)} oz`
        : `${Math.round(item.quantity_remaining)}`;
    return { display, low, item };
  }

  const formula     = supplyOf('formula');
  const diapers     = supplyOf('diapers');
  const wipes       = supplyOf('wipes');
  const foodPouches = supplyOf('food_pouches');
  const babySnacks  = supplyOf('baby_snacks');

  // Days remaining estimates
  const formulaDaysLeft = formulaDailyOz && formula.item && formula.item.quantity_remaining > 0
    ? Math.floor(formula.item.quantity_remaining / formulaDailyOz)
    : null;
  const diaperDaysLeft = diaperDailyCount && diapers.item && diapers.item.quantity_remaining > 0
    ? Math.floor(diapers.item.quantity_remaining / diaperDailyCount)
    : null;
  const pouchesDaysLeft = foodDailyCount && foodPouches.item && foodPouches.item.quantity_remaining > 0
    ? Math.floor(foodPouches.item.quantity_remaining / foodDailyCount)
    : null;

  // Milk stash computed values
  const fridgeBatches  = milkBatches.filter(b => b.location === 'fridge');
  const freezerBatches = milkBatches.filter(b => b.location === 'freezer');
  const fridgeOz  = fridgeBatches.reduce((sum, b) => sum + b.amount_ml, 0) / 29.5735;
  const freezerOz = freezerBatches.reduce((sum, b) => sum + b.amount_ml, 0) / 29.5735;

  const sortedBatches = [...milkBatches].sort((a, b) => {
    if (a.location !== b.location) return a.location === 'fridge' ? -1 : 1;
    return new Date(a.stored_date).getTime() - new Date(b.stored_date).getTime();
  });

  const hasUrgentMilk = sortedBatches.some(b => daysUntilExpiry(b) <= 2);

  function daysLeftChip(days: number | null, isDue: boolean) {
    if (days === null) return null;
    const color = isDue || days <= 3 ? c.supplyLowText : days <= 7 ? '#CA8A04' : c.textMuted;
    return (
      <Text style={[s.daysChip, { color }]}>
        {days <= 0 ? '⚠️ Out soon' : `~${days}d left`}
      </Text>
    );
  }

  return (
    <View style={s.container}>
      <Text style={s.heading}>Smart Supplies</Text>

      {/* Formula */}
      <View style={[s.supplyRow, { backgroundColor: c.cardHoney, borderColor: c.honey }, formula.low && s.rowLow]}>
        <Text style={s.emoji}>🍼</Text>
        <View style={s.supplyInfo}>
          <Text style={s.supplyLabel}>Formula</Text>
          <Text style={[s.supplyQty, formula.low && s.qtyLow]}>
            {formula.display === '–' ? 'Not tracked' : formula.display}
          </Text>
          {formula.display !== '–' && daysLeftChip(formulaDaysLeft, formula.low)}
          {formula.low && <Text style={s.lowAlert}>⚠️ Running low — time to restock!</Text>}
        </View>
        <TouchableOpacity
          style={s.actionBtn}
          onPress={() => { setPurchaseModal({ type: 'formula', unit: 'oz' }); setPurchaseAlert(String(formula.item?.low_threshold || '')); }}>
          <Text style={s.actionBtnText}>+ Restock</Text>
        </TouchableOpacity>
      </View>

      {/* Diapers */}
      <View style={[s.supplyRow, { backgroundColor: c.cardSage, borderColor: c.sage }, diapers.low && s.rowLow]}>
        <Text style={s.emoji}>👶</Text>
        <View style={s.supplyInfo}>
          <Text style={s.supplyLabel}>Diapers</Text>
          <Text style={[s.supplyQty, diapers.low && s.qtyLow]}>
            {diapers.display === '–' ? 'Not tracked' : `${diapers.display} left`}
          </Text>
          {diapers.display !== '–' && daysLeftChip(diaperDaysLeft, diapers.low)}
          {diapers.low && <Text style={s.lowAlert}>⚠️ Running low — time to restock!</Text>}
        </View>
        <TouchableOpacity
          style={s.actionBtn}
          onPress={() => { setPurchaseModal({ type: 'diapers', unit: 'count' }); setPurchaseAlert(String(diapers.item?.low_threshold || '')); }}>
          <Text style={s.actionBtnText}>+ Restock</Text>
        </TouchableOpacity>
      </View>

      {/* Wipes */}
      <View style={[s.supplyRow, { backgroundColor: c.cardBlue, borderColor: c.blue }, wipes.low && s.rowLow]}>
        <Text style={s.emoji}>🌿</Text>
        <View style={s.supplyInfo}>
          <Text style={s.supplyLabel}>Wipes</Text>
          <Text style={[s.supplyQty, wipes.low && s.qtyLow]}>
            {wipes.display === '–' ? 'Not tracked' : `${wipes.display} left`}
          </Text>
          {wipes.low && <Text style={s.lowAlert}>⚠️ Running low — time to restock!</Text>}
        </View>
        <TouchableOpacity
          style={s.actionBtn}
          onPress={() => { setPurchaseModal({ type: 'wipes', unit: 'count' }); setPurchaseAlert(String(wipes.item?.low_threshold || '')); }}>
          <Text style={s.actionBtnText}>+ Restock</Text>
        </TouchableOpacity>
      </View>

      {/* Baby Food */}
      <Text style={s.subHeading}>Baby Food & Snacks</Text>

      <View style={[s.supplyRow, { backgroundColor: c.cardHoney, borderColor: c.honey }, foodPouches.low && s.rowLow]}>
        <Text style={s.emoji}>🥣</Text>
        <View style={s.supplyInfo}>
          <Text style={s.supplyLabel}>Pouches & Jars</Text>
          <Text style={[s.supplyQty, foodPouches.low && s.qtyLow]}>
            {foodPouches.display === '–' ? 'Not tracked' : `${foodPouches.display} left`}
          </Text>
          {foodPouches.display !== '–' && daysLeftChip(pouchesDaysLeft, foodPouches.low)}
          {foodPouches.low && <Text style={s.lowAlert}>⚠️ Running low — time to restock!</Text>}
        </View>
        <TouchableOpacity
          style={s.actionBtn}
          onPress={() => { setPurchaseModal({ type: 'food_pouches', unit: 'count' }); setPurchaseAlert(String(foodPouches.item?.low_threshold || '')); }}>
          <Text style={s.actionBtnText}>+ Restock</Text>
        </TouchableOpacity>
      </View>

      <View style={[s.supplyRow, { backgroundColor: c.cardSage, borderColor: c.sage }, babySnacks.low && s.rowLow]}>
        <Text style={s.emoji}>🫐</Text>
        <View style={s.supplyInfo}>
          <Text style={s.supplyLabel}>Snacks</Text>
          <Text style={[s.supplyQty, babySnacks.low && s.qtyLow]}>
            {babySnacks.display === '–' ? 'Not tracked' : `${babySnacks.display} left`}
          </Text>
          {babySnacks.low && <Text style={s.lowAlert}>⚠️ Running low — time to restock!</Text>}
        </View>
        <TouchableOpacity
          style={s.actionBtn}
          onPress={() => { setPurchaseModal({ type: 'baby_snacks', unit: 'count' }); setPurchaseAlert(String(babySnacks.item?.low_threshold || '')); }}>
          <Text style={s.actionBtnText}>+ Restock</Text>
        </TouchableOpacity>
      </View>

      {/* Milk stash ─ detailed section */}
      <View style={[s.milkSection, hasUrgentMilk && s.milkSectionUrgent]}>
        <View style={s.milkHeader}>
          <View style={s.milkHeaderLeft}>
            <Text style={s.emoji}>🤱</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.supplyLabel}>Milk Stash</Text>
              {milkBatches.length > 0 ? (
                <View style={s.milkTotals}>
                  {fridgeBatches.length > 0 && (
                    <Text style={s.milkTotalChip}>🧊 {fridgeOz.toFixed(1)} oz fridge</Text>
                  )}
                  {freezerBatches.length > 0 && (
                    <Text style={s.milkTotalChip}>❄️ {freezerOz.toFixed(1)} oz freezer</Text>
                  )}
                </View>
              ) : (
                <Text style={s.hint}>Add batches to track storage & expiry</Text>
              )}
            </View>
          </View>
          <TouchableOpacity style={s.actionBtn} onPress={() => setMilkModal(true)}>
            <Text style={s.actionBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {sortedBatches.length > 1 && (
          <Text style={s.fifoHint}>Use oldest batches first ↑</Text>
        )}

        {sortedBatches.map(batch => {
          const daysLeft = daysUntilExpiry(batch);
          const urgency  = batchUrgency(daysLeft);
          return (
            <View
              key={batch.id}
              style={[
                s.batchRow,
                urgency === 'alert'   ? s.batchAlert :
                urgency === 'warning' ? s.batchWarning :
                batch.location === 'freezer' ? s.batchFreezer : s.batchFridge,
              ]}
            >
              <View style={s.batchInfo}>
                <Text style={s.batchLocation}>
                  {batch.location === 'fridge' ? '🧊' : '❄️'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.batchAmount}>{mlToOz(batch.amount_ml)} oz</Text>
                  <Text style={s.batchDate}>Stored {formatStoredDate(batch.stored_date)}</Text>
                </View>
                <Text style={[
                  s.batchDaysLeft,
                  urgency === 'alert'   && s.batchDaysAlert,
                  urgency === 'warning' && s.batchDaysWarning,
                ]}>
                  {daysLeft <= 0
                    ? '⚠️ Expired'
                    : daysLeft === 1
                    ? '⚠️ Use today!'
                    : `${daysLeft}d left`}
                </Text>
              </View>
              <View style={s.batchActions}>
                {batch.location === 'fridge' && (
                  <TouchableOpacity style={s.freezeBtn} onPress={() => confirmMoveToFreezer(batch)}>
                    <Text style={s.freezeBtnText}>→ Freeze</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={s.useBtn} onPress={() => confirmUseBatch(batch)}>
                  <Text style={s.useBtnText}>Use</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {milkBatches.length === 0 && (
          <Text style={s.milkEmpty}>No batches yet — tap + Add to log stored milk</Text>
        )}
      </View>

      {/* Supply trend insights */}
      <SupplyInsights userId={userId} />

      {/* Pump parts */}
      <Text style={s.subHeading}>Pump Parts</Text>
      {Object.keys(PART_LIMITS).map(partName => {
        const progress = partProgress(partName);
        const { label: statusLabel, due } = progress
          ? { label: '', due: progress.due }
          : { label: 'Tap "Replaced" to start tracking', due: false };
        return (
          <View key={partName} style={[s.partRow, due && s.partRowDue]}>
            <View style={s.partInfo}>
              <Text style={s.partLabel}>{PART_LABELS[partName]}</Text>
              {progress ? (
                <View style={s.partProgressWrapper}>
                  <View style={s.progressTrack}>
                    <View
                      style={[
                        s.progressFill,
                        { width: `${Math.round(progress.pct * 100)}%` as any },
                        progress.pct >= 1 ? s.progressFillDue :
                        progress.pct >= 0.75 ? s.progressFillWarn : s.progressFillOk,
                      ]}
                    />
                  </View>
                  <Text style={[s.partStatus, due && s.partStatusDue]}>
                    {due
                      ? `⚠️ Replace soon — ${progress.sessions}/${progress.maxSessions} sessions, ${progress.days}d`
                      : `${progress.sessions}/${progress.maxSessions} sessions · ${progress.days}/${progress.maxDays}d`}
                  </Text>
                </View>
              ) : (
                <Text style={s.partStatus}>{statusLabel}</Text>
              )}
            </View>
            <TouchableOpacity
              style={[s.replaceBtn, due && s.replaceBtnDue]}
              onPress={() => confirmMarkReplaced(partName)}>
              <Text style={s.replaceBtnText}>✓ Replaced</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      {/* Medications */}
      {meds.length > 0 && (
        <>
          <Text style={s.subHeading}>Medications</Text>
          {meds.map(med => {
            const supply = medSupplyOf(med.id);
            const dosesLeft = supply?.quantity_remaining ?? null;
            const dosesPerDay = med.frequency_hours ? 24 / med.frequency_hours : null;
            const daysLeft = dosesLeft !== null && dosesPerDay ? Math.floor(dosesLeft / dosesPerDay) : null;
            const low = supply ? supply.low_threshold > 0 && supply.quantity_remaining <= supply.low_threshold : false;
            return (
              <View key={med.id} style={[s.medRow, low && s.medRowLow]}>
                <View style={[s.medDot, { backgroundColor: med.color }]} />
                <View style={s.medInfo}>
                  <Text style={s.medName} numberOfLines={1}>{med.name}</Text>
                  {supply ? (
                    <>
                      <Text style={[s.medQty, low && s.medQtyLow]}>
                        {Math.round(dosesLeft!)} doses left
                      </Text>
                      {daysLeft !== null && daysLeftChip(daysLeft, low)}
                      {low && <Text style={s.lowAlert}>⚠️ Running low — time to refill!</Text>}
                    </>
                  ) : (
                    <Text style={s.hint}>Tap + Set qty to track supply</Text>
                  )}
                </View>
                <View style={s.medActions}>
                  {supply && supply.quantity_remaining > 0 && (
                    <TouchableOpacity
                      style={s.medUsedBtn}
                      onPress={() => logMedDose(med)}>
                      <Text style={s.medUsedBtnText}>− Dose</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={s.actionBtn}
                    onPress={() => {
                      setMedRestockModal(med);
                      setMedRestockAlert(String(supply?.low_threshold || ''));
                    }}>
                    <Text style={s.actionBtnText}>{supply ? '+ Restock' : '+ Set qty'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </>
      )}

      {/* Restock modal */}
      <Modal
        visible={!!purchaseModal}
        transparent
        animationType="slide"
        onRequestClose={() => setPurchaseModal(null)}
      >
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.modalTitle}>
              {purchaseModal?.type === 'formula'      ? 'Restock Formula'
               : purchaseModal?.type === 'diapers'    ? 'Restock Diapers'
               : purchaseModal?.type === 'wipes'      ? 'Restock Wipes'
               : purchaseModal?.type === 'food_pouches' ? 'Restock Pouches & Jars'
               : 'Restock Snacks'}
            </Text>

            <Text style={s.modalLabel}>
              {purchaseModal?.type === 'formula'        ? 'Total ounces added'
               : purchaseModal?.type === 'food_pouches' ? 'Number of pouches / jars added'
               : purchaseModal?.type === 'baby_snacks'  ? 'Number of snack packs added'
               : purchaseModal?.type === 'diapers'      ? 'Number of diapers added'
               : 'Number of wipes added'}
            </Text>
            <TextInput
              style={s.modalInput}
              placeholder={
                purchaseModal?.type === 'formula'         ? 'e.g. 48  (6 × 8 oz bottles)'
                : purchaseModal?.type === 'food_pouches'  ? 'e.g. 12  (one box)'
                : purchaseModal?.type === 'baby_snacks'   ? 'e.g. 6  (puffs, teethers, etc.)'
                : purchaseModal?.type === 'diapers'       ? 'e.g. 100'
                : 'e.g. 200  (2 packs of 100)'}
              value={purchaseQty}
              onChangeText={setPurchaseQty}
              keyboardType="decimal-pad"
              autoFocus
            />

            <Text style={s.modalLabel}>
              Alert me when below ({
                purchaseModal?.type === 'formula'        ? 'oz'
                : purchaseModal?.type === 'food_pouches' ? 'pouches'
                : purchaseModal?.type === 'baby_snacks'  ? 'packs'
                : purchaseModal?.type === 'diapers'      ? 'diapers'
                : 'wipes'})
            </Text>
            <TextInput
              style={s.modalInput}
              placeholder={
                purchaseModal?.type === 'formula'        ? 'e.g. 16'
                : purchaseModal?.type === 'food_pouches' ? 'e.g. 4'
                : purchaseModal?.type === 'baby_snacks'  ? 'e.g. 2'
                : purchaseModal?.type === 'diapers'      ? 'e.g. 20'
                : 'e.g. 50'}
              value={purchaseAlert}
              onChangeText={setPurchaseAlert}
              keyboardType="decimal-pad"
            />

            <TouchableOpacity style={s.saveBtn} onPress={logPurchase}>
              <Text style={s.saveBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setPurchaseModal(null)}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add milk batch modal */}
      <Modal
        visible={milkModal}
        transparent
        animationType="slide"
        onRequestClose={() => setMilkModal(false)}
      >
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.modalTitle}>Log Milk</Text>

            <Text style={s.modalLabel}>Amount (oz)</Text>
            <TextInput
              style={s.modalInput}
              placeholder="e.g. 4.5"
              value={milkAmount}
              onChangeText={setMilkAmount}
              keyboardType="decimal-pad"
              autoFocus
            />

            <Text style={s.modalLabel}>Storage Location</Text>
            <View style={s.locationPicker}>
              <TouchableOpacity
                style={[s.locationOption, milkLocation === 'fridge' && s.locationOptionActive]}
                onPress={() => setMilkLocation('fridge')}
              >
                <Text style={s.locationEmoji}>🧊</Text>
                <Text style={[s.locationOptionText, milkLocation === 'fridge' && s.locationOptionTextActive]}>Fridge</Text>
                <Text style={s.locationSub}>Up to 4 days</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.locationOption, milkLocation === 'freezer' && s.locationOptionActive]}
                onPress={() => setMilkLocation('freezer')}
              >
                <Text style={s.locationEmoji}>❄️</Text>
                <Text style={[s.locationOptionText, milkLocation === 'freezer' && s.locationOptionTextActive]}>Freezer</Text>
                <Text style={s.locationSub}>Up to 1 year</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.modalLabel}>Notes (optional)</Text>
            <TextInput
              style={s.modalInput}
              placeholder="e.g. back of freezer, labeled bag"
              value={milkNotes}
              onChangeText={setMilkNotes}
            />

            <TouchableOpacity style={s.saveBtn} onPress={saveMilkBatch}>
              <Text style={s.saveBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setMilkModal(false)}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Med restock modal */}
      <Modal
        visible={!!medRestockModal}
        transparent
        animationType="slide"
        onRequestClose={() => setMedRestockModal(null)}
      >
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.modalTitle}>{medRestockModal?.name}</Text>

            <Text style={s.modalLabel}>Doses / units to add</Text>
            <TextInput
              style={s.modalInput}
              placeholder="e.g. 30  (one month's supply)"
              value={medRestockQty}
              onChangeText={setMedRestockQty}
              keyboardType="decimal-pad"
              autoFocus
            />

            <Text style={s.modalLabel}>Alert me when below (doses)</Text>
            <TextInput
              style={s.modalInput}
              placeholder="e.g. 7  (one week)"
              value={medRestockAlert}
              onChangeText={setMedRestockAlert}
              keyboardType="decimal-pad"
            />

            <TouchableOpacity style={s.saveBtn} onPress={saveMedRestock}>
              <Text style={s.saveBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setMedRestockModal(null)}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Exported helpers (called from Track.tsx save handlers) ───────────────────

export async function addToSupply(userId: string, type: string, qty: number) {
  const { data: existing } = await supabase
    .from('supply_items')
    .select('quantity_remaining, unit, low_threshold')
    .eq('user_id', userId)
    .eq('supply_type', type)
    .maybeSingle();
  const defaultUnit = type === 'diapers' || type === 'wipes' || type === 'food_pouches' || type === 'baby_snacks' ? 'count' : type === 'breastmilk' ? 'ml' : type.startsWith('med_') ? 'doses' : 'oz';
  await safeUpsert('supply_items', {
    user_id:            userId,
    supply_type:        type,
    quantity_remaining: (existing?.quantity_remaining ?? 0) + qty,
    unit:               existing?.unit ?? defaultUnit,
    low_threshold:      existing?.low_threshold ?? 0,
    updated_at:         new Date().toISOString(),
  }, 'user_id,supply_type');
}

export async function addToMilkStash(userId: string, ml: number, location: 'fridge' | 'freezer' = 'fridge') {
  // Insert an individual batch so it can be tracked with expiry
  await safeInsert('milk_stash', {
    user_id:     userId,
    amount_ml:   ml,
    stored_date: new Date().toISOString(),
    location,
  });
  // Keep the supply_items rolling total in sync
  const { data: existing } = await supabase
    .from('supply_items')
    .select('quantity_remaining, low_threshold')
    .eq('user_id', userId)
    .eq('supply_type', 'breastmilk')
    .maybeSingle();
  await safeUpsert('supply_items', {
    user_id:            userId,
    supply_type:        'breastmilk',
    quantity_remaining: Math.max(0, (existing?.quantity_remaining ?? 0) + ml),
    unit:               'ml',
    low_threshold:      existing?.low_threshold ?? 0,
    updated_at:         new Date().toISOString(),
  }, 'user_id,supply_type');
}

export async function deductFromSupply(userId: string, type: string, qty: number) {
  const { data: existing } = await supabase
    .from('supply_items')
    .select('quantity_remaining, unit, low_threshold')
    .eq('user_id', userId)
    .eq('supply_type', type)
    .maybeSingle();
  const unit = type === 'diapers' || type === 'wipes' || type === 'food_pouches' || type === 'baby_snacks' ? 'count' : type === 'breastmilk' ? 'ml' : type.startsWith('med_') ? 'doses' : 'oz';
  await safeUpsert('supply_items', {
    user_id:            userId,
    supply_type:        type,
    quantity_remaining: Math.max(0, (existing?.quantity_remaining ?? 0) - qty),
    unit:               existing?.unit ?? unit,
    low_threshold:      existing?.low_threshold ?? 0,
    updated_at:         new Date().toISOString(),
  }, 'user_id,supply_type');
}

export async function incrementPumpPartSessions(userId: string) {
  const { data: parts } = await supabase
    .from('pump_parts')
    .select('id, sessions_since_replaced')
    .eq('user_id', userId);
  if (!parts?.length) return;
  await Promise.all(
    parts.map(p =>
      safeUpdate('pump_parts', p.id, { sessions_since_replaced: p.sessions_since_replaced + 1 })
    )
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container:      { paddingHorizontal: 16, paddingBottom: 8 },
    heading:        { fontSize: 18, fontWeight: '700', color: c.textPrimary, marginBottom: 14 },
    subHeading:     { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase',
                      letterSpacing: 0.6, marginTop: 18, marginBottom: 10 },

    supplyRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: 14,
                      padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: c.cardBorder },
    rowLow:         { borderColor: c.supplyLowBorder, backgroundColor: c.supplyLowBg },
    emoji:          { fontSize: 26, marginRight: 12 },
    supplyInfo:     { flex: 1 },
    supplyLabel:    { fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase',
                      letterSpacing: 0.5, marginBottom: 2 },
    supplyQty:      { fontSize: 22, fontWeight: '800', color: c.textPrimary },
    qtyLow:         { color: c.supplyLowText },
    lowAlert:       { fontSize: 11, color: c.supplyLowText, fontWeight: '700', marginTop: 3 },
    daysChip:       { fontSize: 11, fontWeight: '600', marginTop: 2 },
    hint:           { fontSize: 11, color: c.textMuted, marginTop: 2 },
    actionBtn:      { backgroundColor: c.cardLavender, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1.5, borderColor: c.lavender },
    actionBtnText:  { color: c.lavender, fontWeight: '700', fontSize: 12 },

    // Milk stash section
    milkSection:         { backgroundColor: c.card, borderRadius: 14, padding: 14, marginBottom: 10,
                           borderWidth: 1.5, borderColor: c.cardBorder },
    milkSectionUrgent:   { borderColor: c.blush, borderWidth: 2 },
    milkHeader:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    milkHeaderLeft:      { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
    milkTotals:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 3 },
    milkTotalChip:       { fontSize: 12, fontWeight: '700', color: c.textSecondary },
    milkEmpty:           { fontSize: 12, color: c.textMuted, textAlign: 'center', paddingVertical: 6 },
    fifoHint:            { fontSize: 11, color: c.textMuted, fontStyle: 'italic', marginBottom: 6, marginLeft: 2 },

    batchRow:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                           borderRadius: 10, padding: 10, marginBottom: 6 },
    batchFridge:         { backgroundColor: c.cardSage },
    batchFreezer:        { backgroundColor: c.cardBlue },
    batchAlert:          { backgroundColor: c.cardBlush },
    batchWarning:        { backgroundColor: c.cardHoney },
    batchInfo:           { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 8 },
    batchLocation:       { fontSize: 18 },
    batchAmount:         { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    batchDate:           { fontSize: 11, color: c.textMuted, marginTop: 1 },
    batchDaysLeft:       { fontSize: 12, fontWeight: '700', color: c.textMuted, marginLeft: 'auto' },
    batchDaysAlert:      { color: '#DC2626' },
    batchDaysWarning:    { color: c.supplyLowText },
    batchActions:        { flexDirection: 'row', gap: 6, flexShrink: 0 },
    freezeBtn:           { backgroundColor: c.cardLavender, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6 },
    freezeBtnText:       { fontSize: 11, fontWeight: '700', color: c.lavender },
    useBtn:              { backgroundColor: c.cardSage, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6 },
    useBtnText:          { fontSize: 11, fontWeight: '700', color: c.sage },

    // Pump parts
    partRow:             { flexDirection: 'row', alignItems: 'center', backgroundColor: c.cardBlush, borderRadius: 12,
                           padding: 12, marginBottom: 8, borderWidth: 1.5, borderColor: c.blush },
    partRowDue:          { backgroundColor: '#FEE2E2', borderColor: '#EF4444' },
    partInfo:            { flex: 1, marginRight: 8 },
    partLabel:           { fontSize: 13, fontWeight: '700', color: c.textPrimary, marginBottom: 4 },
    partProgressWrapper: { gap: 4 },
    progressTrack:       { height: 6, borderRadius: 3, backgroundColor: c.inputBorder, overflow: 'hidden' },
    progressFill:        { height: 6, borderRadius: 3 },
    progressFillOk:      { backgroundColor: c.sage },
    progressFillWarn:    { backgroundColor: '#EAB308' },
    progressFillDue:     { backgroundColor: '#EF4444' },
    partStatus:          { fontSize: 11, color: c.textMuted, marginTop: 2 },
    partStatusDue:       { color: '#DC2626', fontWeight: '600' },
    replaceBtn:          { backgroundColor: c.cardLavender, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
    replaceBtnDue:       { borderColor: '#EF4444', borderWidth: 1.5 },
    replaceBtnText:      { color: c.lavender, fontWeight: '700', fontSize: 11 },

    // Medication rows
    medRow:              { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card,
                           borderRadius: 12, padding: 12, marginBottom: 8,
                           borderWidth: 1.5, borderColor: c.cardBorder },
    medRowLow:           { borderColor: c.supplyLowBorder, backgroundColor: c.supplyLowBg },
    medDot:              { width: 10, height: 10, borderRadius: 5, marginRight: 10, flexShrink: 0 },
    medInfo:             { flex: 1, marginRight: 8 },
    medName:             { fontSize: 13, fontWeight: '700', color: c.textPrimary, marginBottom: 2 },
    medQty:              { fontSize: 18, fontWeight: '800', color: c.textPrimary },
    medQtyLow:           { color: c.supplyLowText },
    medActions:          { flexDirection: 'row', gap: 6, flexShrink: 0 },
    medUsedBtn:          { backgroundColor: c.card, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7,
                           borderWidth: 1.5, borderColor: c.inputBorder },
    medUsedBtnText:      { color: c.textSecondary, fontWeight: '700', fontSize: 11 },

    overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet:          { backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28,
                      padding: 24, paddingBottom: 44 },
    modalTitle:     { fontSize: 20, fontWeight: '800', color: c.textPrimary, marginBottom: 20 },
    modalLabel:     { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase',
                      letterSpacing: 0.5, marginBottom: 8 },
    modalInput:     { backgroundColor: c.card, borderWidth: 1.5, borderColor: c.inputBorder, borderRadius: 12,
                      paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, fontWeight: '700',
                      color: c.textPrimary, marginBottom: 16 },
    saveBtn:        { backgroundColor: c.primary, borderRadius: 14, paddingVertical: 16,
                      alignItems: 'center', marginBottom: 10 },
    saveBtnText:    { color: c.primaryText, fontWeight: '700', fontSize: 16 },
    cancelBtn:      { alignItems: 'center', paddingVertical: 12 },
    cancelBtnText:  { color: c.textMuted, fontWeight: '600', fontSize: 15 },

    locationPicker:           { flexDirection: 'row', gap: 10, marginBottom: 16 },
    locationOption:           { flex: 1, borderWidth: 2, borderColor: c.inputBorder, borderRadius: 12,
                                padding: 14, alignItems: 'center' },
    locationOptionActive:     { borderColor: c.primary, backgroundColor: c.cardBlue },
    locationEmoji:            { fontSize: 24, marginBottom: 4 },
    locationOptionText:       { fontSize: 14, fontWeight: '700', color: c.textMuted },
    locationOptionTextActive: { color: c.blue },
    locationSub:              { fontSize: 10, color: c.textMuted, marginTop: 3 },
  });
}
