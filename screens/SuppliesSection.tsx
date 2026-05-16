import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  TextInput, Alert, Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';

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

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function SuppliesSection({ userId, refreshKey }: { userId: string | null; refreshKey?: number }) {
  const [supplies, setSupplies]             = useState<SupplyItem[]>([]);
  const [pumpParts, setPumpParts]           = useState<PumpPart[]>([]);
  const [purchaseModal, setPurchaseModal]   = useState<{ type: 'formula' | 'diapers'; unit: string } | null>(null);
  const [purchaseQty, setPurchaseQty]       = useState('');
  const [purchaseAlert, setPurchaseAlert]   = useState('');

  const loadData = useCallback(async () => {
    if (!userId) return;
    const [supplyRes, partsRes] = await Promise.all([
      supabase.from('supply_items').select('supply_type,quantity_remaining,unit,low_threshold').eq('user_id', userId),
      supabase.from('pump_parts').select('id,part_name,last_replaced,sessions_since_replaced').eq('user_id', userId),
    ]);
    if (supplyRes.data) setSupplies(supplyRes.data);
    if (partsRes.data) setPumpParts(partsRes.data);
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
      type === 'breastmilk'
        ? `${(item.quantity_remaining / 29.5735).toFixed(1)} oz`
        : type === 'formula'
        ? `${item.quantity_remaining.toFixed(1)} oz`
        : `${Math.round(item.quantity_remaining)}`;
    return { display, low, item };
  }

  const formula  = supplyOf('formula');
  const diapers  = supplyOf('diapers');
  const stash    = supplyOf('breastmilk');

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

      {/* Milk stash */}
      <View style={[s.supplyRow, stash.low && s.rowLow]}>
        <Text style={s.emoji}>🤱</Text>
        <View style={s.supplyInfo}>
          <Text style={s.supplyLabel}>Milk Stash</Text>
          <Text style={[s.supplyQty, stash.low && s.qtyLow]}>
            {stash.display === '–' ? 'Not tracked yet' : stash.display}
          </Text>
          {stash.low && <Text style={s.lowAlert}>⚠️ Stash running low!</Text>}
          {!stash.item && <Text style={s.hint}>Auto-updated when you log pumping</Text>}
        </View>
      </View>

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
    </View>
  );
}

// ─── Exported helpers (called from Track.tsx save handlers) ───────────────────

export async function addToMilkStash(userId: string, ml: number) {
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
});
