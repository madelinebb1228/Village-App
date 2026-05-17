import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  TextInput, Alert, Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';
import SupplyInsights from './SupplyInsights';

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
  await supabase.from('supply_items').upsert({
    user_id:            userId,
    supply_type:        'breastmilk',
    quantity_remaining: Math.max(0, (existing?.quantity_remaining ?? 0) + deltaMl),
    unit:               'ml',
    low_threshold:      existing?.low_threshold ?? 0,
    updated_at:         new Date().toISOString(),
  }, { onConflict: 'user_id,supply_type' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SuppliesSection({ userId, refreshKey }: { userId: string | null; refreshKey?: number }) {
  const [supplies, setSupplies]           = useState<SupplyItem[]>([]);
  const [pumpParts, setPumpParts]         = useState<PumpPart[]>([]);
  const [milkBatches, setMilkBatches]     = useState<MilkBatch[]>([]);
  const [purchaseModal, setPurchaseModal] = useState<{ type: 'formula' | 'diapers'; unit: string } | null>(null);
  const [purchaseQty, setPurchaseQty]     = useState('');
  const [purchaseAlert, setPurchaseAlert] = useState('');
  const [milkModal, setMilkModal]         = useState(false);
  const [milkAmount, setMilkAmount]       = useState('');
  const [milkLocation, setMilkLocation]   = useState<'fridge' | 'freezer'>('fridge');
  const [milkNotes, setMilkNotes]         = useState('');

  const loadData = useCallback(async () => {
    if (!userId) return;
    const [supplyRes, partsRes, milkRes] = await Promise.all([
      supabase.from('supply_items').select('supply_type,quantity_remaining,unit,low_threshold').eq('user_id', userId),
      supabase.from('pump_parts').select('id,part_name,last_replaced,sessions_since_replaced').eq('user_id', userId),
      supabase.from('milk_stash').select('id,amount_ml,stored_date,location,notes').eq('user_id', userId).order('stored_date', { ascending: true }),
    ]);
    if (supplyRes.data) setSupplies(supplyRes.data);
    if (partsRes.data) setPumpParts(partsRes.data);
    if (milkRes.data)  setMilkBatches(milkRes.data as MilkBatch[]);
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData, refreshKey]);

  // ── Purchase modal save ────────────────────────────────────────────────────

  async function logPurchase() {
    if (!purchaseModal || !userId) return;
    const qty = parseFloat(purchaseQty);
    if (!qty || qty <= 0) { Alert.alert('Enter a valid quantity'); return; }
    const existing = supplies.find(s => s.supply_type === purchaseModal.type);
    const threshold = parseFloat(purchaseAlert) || existing?.low_threshold || 0;
    const { error } = await supabase.from('supply_items').upsert({
      user_id:            userId,
      supply_type:        purchaseModal.type,
      quantity_remaining: (existing?.quantity_remaining ?? 0) + qty,
      unit:               purchaseModal.unit,
      low_threshold:      threshold,
      updated_at:         new Date().toISOString(),
    }, { onConflict: 'user_id,supply_type' });
    if (error) { Alert.alert('Error', error.message); return; }
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
    const { error } = await supabase.from('milk_stash').insert({
      user_id:     userId,
      amount_ml:   ml,
      stored_date: new Date().toISOString(),
      location:    milkLocation,
      notes:       milkNotes.trim() || null,
    });
    if (error) { Alert.alert('Error', error.message); return; }
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
    await supabase.from('milk_stash').delete().eq('id', batch.id);
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
    await supabase.from('milk_stash').update({
      location:    'freezer',
      stored_date: new Date().toISOString(),
    }).eq('id', batch.id);
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
    await supabase.from('pump_parts').upsert({
      user_id:                  userId,
      part_name:                partName,
      last_replaced:            new Date().toISOString(),
      sessions_since_replaced:  0,
    }, { onConflict: 'user_id,part_name' });
    loadData();
  }

  // ── Display helpers ────────────────────────────────────────────────────────

  function partDue(part: PumpPart): boolean {
    const limits = PART_LIMITS[part.part_name];
    if (!limits) return false;
    const days = (Date.now() - new Date(part.last_replaced).getTime()) / 86400000;
    return part.sessions_since_replaced >= limits.sessions || days >= limits.days;
  }

  function partStatusLabel(partName: string): { label: string; due: boolean } {
    const part = pumpParts.find(p => p.part_name === partName);
    if (!part) return { label: 'Tap "Replaced" to start tracking', due: false };
    const days = Math.floor((Date.now() - new Date(part.last_replaced).getTime()) / 86400000);
    const due  = partDue(part);
    return {
      due,
      label: due
        ? `⚠️ Replace soon — ${part.sessions_since_replaced} sessions, ${days}d ago`
        : `${part.sessions_since_replaced} sessions · ${days}d since replaced`,
    };
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

  const formula = supplyOf('formula');
  const diapers = supplyOf('diapers');

  // Milk stash computed values
  const fridgeBatches  = milkBatches.filter(b => b.location === 'fridge');
  const freezerBatches = milkBatches.filter(b => b.location === 'freezer');
  const fridgeOz  = fridgeBatches.reduce((sum, b) => sum + b.amount_ml, 0) / 29.5735;
  const freezerOz = freezerBatches.reduce((sum, b) => sum + b.amount_ml, 0) / 29.5735;

  // Sort: fridge first (oldest first), then freezer (oldest first)
  const sortedBatches = [...milkBatches].sort((a, b) => {
    if (a.location !== b.location) return a.location === 'fridge' ? -1 : 1;
    return new Date(a.stored_date).getTime() - new Date(b.stored_date).getTime();
  });

  const hasUrgentMilk = sortedBatches.some(b => daysUntilExpiry(b) <= 2);

  return (
    <View style={s.container}>
      <Text style={s.heading}>Smart Supplies</Text>

      {/* Formula */}
      <View style={[s.supplyRow, formula.low && s.rowLow]}>
        <Text style={s.emoji}>🍼</Text>
        <View style={s.supplyInfo}>
          <Text style={s.supplyLabel}>Formula</Text>
          <Text style={[s.supplyQty, formula.low && s.qtyLow]}>
            {formula.display === '–' ? 'Not tracked' : formula.display}
          </Text>
          {formula.low && <Text style={s.lowAlert}>⚠️ Running low — time to restock!</Text>}
        </View>
        <TouchableOpacity
          style={s.actionBtn}
          onPress={() => { setPurchaseModal({ type: 'formula', unit: 'oz' }); setPurchaseAlert(String(formula.item?.low_threshold || '')); }}>
          <Text style={s.actionBtnText}>+ Restock</Text>
        </TouchableOpacity>
      </View>

      {/* Diapers */}
      <View style={[s.supplyRow, diapers.low && s.rowLow]}>
        <Text style={s.emoji}>👶</Text>
        <View style={s.supplyInfo}>
          <Text style={s.supplyLabel}>Diapers</Text>
          <Text style={[s.supplyQty, diapers.low && s.qtyLow]}>
            {diapers.display === '–' ? 'Not tracked' : `${diapers.display} left`}
          </Text>
          {diapers.low && <Text style={s.lowAlert}>⚠️ Running low — time to restock!</Text>}
        </View>
        <TouchableOpacity
          style={s.actionBtn}
          onPress={() => { setPurchaseModal({ type: 'diapers', unit: 'count' }); setPurchaseAlert(String(diapers.item?.low_threshold || '')); }}>
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

        {sortedBatches.map(batch => {
          const daysLeft = daysUntilExpiry(batch);
          const urgency  = batchUrgency(daysLeft);
          return (
            <View
              key={batch.id}
              style={[
                s.batchRow,
                urgency === 'alert'   && s.batchAlert,
                urgency === 'warning' && s.batchWarning,
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
        const { label, due } = partStatusLabel(partName);
        return (
          <View key={partName} style={[s.partRow, due && s.partRowDue]}>
            <View style={s.partInfo}>
              <Text style={s.partLabel}>{PART_LABELS[partName]}</Text>
              <Text style={[s.partStatus, due && s.partStatusDue]}>{label}</Text>
            </View>
            <TouchableOpacity
              style={[s.replaceBtn, due && s.replaceBtnDue]}
              onPress={() => confirmMarkReplaced(partName)}>
              <Text style={s.replaceBtnText}>✓ Replaced</Text>
            </TouchableOpacity>
          </View>
        );
      })}

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
              Restock {purchaseModal?.type === 'formula' ? 'Formula' : 'Diapers'}
            </Text>

            <Text style={s.modalLabel}>
              {purchaseModal?.type === 'formula' ? 'Total ounces added' : 'Number of diapers added'}
            </Text>
            <TextInput
              style={s.modalInput}
              placeholder={purchaseModal?.type === 'formula' ? 'e.g. 48  (6 × 8 oz bottles)' : 'e.g. 100'}
              value={purchaseQty}
              onChangeText={setPurchaseQty}
              keyboardType="decimal-pad"
              autoFocus
            />

            <Text style={s.modalLabel}>
              Alert me when below ({purchaseModal?.unit === 'oz' ? 'oz' : 'diapers'})
            </Text>
            <TextInput
              style={s.modalInput}
              placeholder={purchaseModal?.type === 'formula' ? 'e.g. 16' : 'e.g. 20'}
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
  const defaultUnit = type === 'diapers' ? 'count' : type === 'breastmilk' ? 'ml' : 'oz';
  await supabase.from('supply_items').upsert({
    user_id:            userId,
    supply_type:        type,
    quantity_remaining: (existing?.quantity_remaining ?? 0) + qty,
    unit:               existing?.unit ?? defaultUnit,
    low_threshold:      existing?.low_threshold ?? 0,
    updated_at:         new Date().toISOString(),
  }, { onConflict: 'user_id,supply_type' });
}

export async function addToMilkStash(userId: string, ml: number, location: 'fridge' | 'freezer' = 'fridge') {
  // Insert an individual batch so it can be tracked with expiry
  await supabase.from('milk_stash').insert({
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
  await supabase.from('supply_items').upsert({
    user_id:            userId,
    supply_type:        'breastmilk',
    quantity_remaining: Math.max(0, (existing?.quantity_remaining ?? 0) + ml),
    unit:               'ml',
    low_threshold:      existing?.low_threshold ?? 0,
    updated_at:         new Date().toISOString(),
  }, { onConflict: 'user_id,supply_type' });
}

export async function deductFromSupply(userId: string, type: string, qty: number) {
  const { data: existing } = await supabase
    .from('supply_items')
    .select('quantity_remaining, unit, low_threshold')
    .eq('user_id', userId)
    .eq('supply_type', type)
    .maybeSingle();
  const unit = type === 'diapers' ? 'count' : type === 'breastmilk' ? 'ml' : 'oz';
  await supabase.from('supply_items').upsert({
    user_id:            userId,
    supply_type:        type,
    quantity_remaining: Math.max(0, (existing?.quantity_remaining ?? 0) - qty),
    unit:               existing?.unit ?? unit,
    low_threshold:      existing?.low_threshold ?? 0,
    updated_at:         new Date().toISOString(),
  }, { onConflict: 'user_id,supply_type' });
}

export async function incrementPumpPartSessions(userId: string) {
  const { data: parts } = await supabase
    .from('pump_parts')
    .select('id, sessions_since_replaced')
    .eq('user_id', userId);
  if (!parts?.length) return;
  await Promise.all(
    parts.map(p =>
      supabase.from('pump_parts')
        .update({ sessions_since_replaced: p.sessions_since_replaced + 1 })
        .eq('id', p.id)
    )
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:      { paddingHorizontal: 16, paddingBottom: 8 },
  heading:        { fontSize: 18, fontWeight: '700', color: '#3D3530', marginBottom: 14 },
  subHeading:     { fontSize: 12, fontWeight: '700', color: '#8A7E78', textTransform: 'uppercase',
                    letterSpacing: 0.6, marginTop: 18, marginBottom: 10 },

  supplyRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14,
                    padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: '#E0D8D0',
                    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  rowLow:         { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' },
  emoji:          { fontSize: 26, marginRight: 12 },
  supplyInfo:     { flex: 1 },
  supplyLabel:    { fontSize: 11, fontWeight: '700', color: '#8A7E78', textTransform: 'uppercase',
                    letterSpacing: 0.5, marginBottom: 2 },
  supplyQty:      { fontSize: 22, fontWeight: '800', color: '#3D3530' },
  qtyLow:         { color: '#D97706' },
  lowAlert:       { fontSize: 11, color: '#D97706', fontWeight: '700', marginTop: 3 },
  hint:           { fontSize: 11, color: '#B0A89E', marginTop: 2 },
  actionBtn:      { backgroundColor: '#B8A9C9', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  actionBtnText:  { color: '#fff', fontWeight: '700', fontSize: 12 },

  // Milk stash section
  milkSection:         { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
                         borderWidth: 1.5, borderColor: '#E0D8D0',
                         shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                         shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  milkSectionUrgent:   { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  milkHeader:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  milkHeaderLeft:      { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  milkTotals:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 3 },
  milkTotalChip:       { fontSize: 12, fontWeight: '700', color: '#5A544E' },
  milkEmpty:           { fontSize: 12, color: '#B0A89E', textAlign: 'center', paddingVertical: 6 },

  batchRow:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                         backgroundColor: '#F8F6F2', borderRadius: 10, padding: 10, marginBottom: 6 },
  batchAlert:          { backgroundColor: '#FEF2F2' },
  batchWarning:        { backgroundColor: '#FFFBEB' },
  batchInfo:           { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 8 },
  batchLocation:       { fontSize: 18 },
  batchAmount:         { fontSize: 15, fontWeight: '800', color: '#3D3530' },
  batchDate:           { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  batchDaysLeft:       { fontSize: 12, fontWeight: '700', color: '#6B7280', marginLeft: 'auto' },
  batchDaysAlert:      { color: '#DC2626' },
  batchDaysWarning:    { color: '#D97706' },
  batchActions:        { flexDirection: 'row', gap: 6, flexShrink: 0 },
  freezeBtn:           { backgroundColor: '#DBEAFE', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6 },
  freezeBtnText:       { fontSize: 11, fontWeight: '700', color: '#1D4ED8' },
  useBtn:              { backgroundColor: '#A8B8A0', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6 },
  useBtnText:          { fontSize: 11, fontWeight: '700', color: '#fff' },

  partRow:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12,
                    padding: 12, marginBottom: 8, borderWidth: 1.5, borderColor: '#E0D8D0' },
  partRowDue:     { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  partInfo:       { flex: 1 },
  partLabel:      { fontSize: 13, fontWeight: '700', color: '#5A544E' },
  partStatus:     { fontSize: 11, color: '#B0A89E', marginTop: 2 },
  partStatusDue:  { color: '#DC2626', fontWeight: '600' },
  replaceBtn:     { backgroundColor: '#A8B8A0', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  replaceBtnDue:  { backgroundColor: '#EF4444' },
  replaceBtnText: { color: '#fff', fontWeight: '700', fontSize: 11 },

  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: '#FEFCF8', borderTopLeftRadius: 28, borderTopRightRadius: 28,
                    padding: 24, paddingBottom: 44 },
  modalTitle:     { fontSize: 20, fontWeight: '800', color: '#3D3530', marginBottom: 20 },
  modalLabel:     { fontSize: 12, fontWeight: '700', color: '#8A7E78', textTransform: 'uppercase',
                    letterSpacing: 0.5, marginBottom: 8 },
  modalInput:     { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E0D8D0', borderRadius: 12,
                    paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, fontWeight: '700',
                    color: '#3D3530', marginBottom: 16 },
  saveBtn:        { backgroundColor: '#B8A9C9', borderRadius: 14, paddingVertical: 16,
                    alignItems: 'center', marginBottom: 10 },
  saveBtnText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelBtn:      { alignItems: 'center', paddingVertical: 12 },
  cancelBtnText:  { color: '#B0A89E', fontWeight: '600', fontSize: 15 },

  locationPicker:           { flexDirection: 'row', gap: 10, marginBottom: 16 },
  locationOption:           { flex: 1, borderWidth: 2, borderColor: '#E0D8D0', borderRadius: 12,
                              padding: 14, alignItems: 'center' },
  locationOptionActive:     { borderColor: '#B8A9C9', backgroundColor: '#F5F0FF' },
  locationEmoji:            { fontSize: 24, marginBottom: 4 },
  locationOptionText:       { fontSize: 14, fontWeight: '700', color: '#8A7E78' },
  locationOptionTextActive: { color: '#6B21A8' },
  locationSub:              { fontSize: 10, color: '#B0A89E', marginTop: 3 },
});
