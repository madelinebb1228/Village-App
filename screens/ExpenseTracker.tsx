import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  Image, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { PieChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import { safeInsert, safeDelete, generateId } from '../lib/syncService';
import { useColors } from '../lib/theme';
import { moderateImage } from '../lib/contentModeration';
import ContentBlockedModal from '../components/ContentBlockedModal';

const SW = Dimensions.get('window').width;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExpenseCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface Expense {
  id: string;
  category_id: string | null;
  subcategory: string | null;
  amount: number;
  currency: string;
  description: string | null;
  date: string;
  receipt_photo_url: string | null;
  is_recurring: boolean;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateToISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function formatPickerDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function formatDisplayDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = '/baby-photos/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

async function uploadReceiptPhoto(uri: string, userId: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${userId}/receipt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from('baby-photos')
      .upload(path, blob, { contentType: `image/${ext}`, upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('baby-photos').getPublicUrl(path);
    return data.publicUrl;
  } catch (err: any) {
    console.warn('Receipt photo upload failed:', err.message);
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExpenseTracker({
  userId,
  babyId,
  babyName,
}: {
  userId: string | null;
  babyId: string | null;
  babyName: string | null;
}) {
  const c = useColors();

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses]     = useState<Expense[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loaded, setLoaded]         = useState(false);

  // Quick-add modal
  const [showModal, setShowModal]   = useState(false);
  const [amount, setAmount]         = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [entryDate, setEntryDate]   = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptUploadedUrl, setReceiptUploadedUrl] = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);

  // Content moderation
  const [moderating, setModerating]         = useState(false);
  const [blockedContent, setBlockedContent] = useState<{ severity: 'high' | 'extreme'; reason: string } | null>(null);

  // Receipt lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // ─── Data ─────────────────────────────────────────────────────────────────

  const loadCategories = useCallback(async () => {
    const { data } = await supabase
      .from('expense_categories')
      .select('id, name, icon, color')
      .order('name', { ascending: true });
    setCategories(data ?? []);
    if (data?.length && !categoryId) setCategoryId(data[0].id);
  }, [categoryId]);

  const loadExpenses = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('expenses')
        .select('id, category_id, subcategory, amount, currency, description, date, receipt_photo_url, is_recurring, created_at')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      query = babyId ? query.eq('baby_id', babyId) : query.eq('user_id', userId).is('baby_id', null);
      const { data, error } = await query;
      if (error) throw error;
      setExpenses(data ?? []);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [userId, babyId]);

  useEffect(() => { loadCategories(); }, []);
  useEffect(() => { if (!loaded) loadExpenses(); }, [loaded, loadExpenses]);
  useEffect(() => { setLoaded(false); }, [babyId]);

  const categoryById = useMemo(() => {
    const map = new Map<string, ExpenseCategory>();
    categories.forEach(cat => map.set(cat.id, cat));
    return map;
  }, [categories]);

  // ─── Insights ─────────────────────────────────────────────────────────────

  const now = new Date();
  const thisMonthKey = dateToISO(now).slice(0, 7);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = dateToISO(lastMonthDate).slice(0, 7);

  const thisMonthExpenses = useMemo(
    () => expenses.filter(e => monthKey(e.date) === thisMonthKey),
    [expenses, thisMonthKey],
  );
  const lastMonthExpenses = useMemo(
    () => expenses.filter(e => monthKey(e.date) === lastMonthKey),
    [expenses, lastMonthKey],
  );

  const thisMonthTotal = thisMonthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  const monthsSpanned = useMemo(() => {
    if (!expenses.length) return 1;
    const keys = new Set(expenses.map(e => monthKey(e.date)));
    return Math.max(keys.size, 1);
  }, [expenses]);
  const allTimeTotal = useMemo(() => expenses.reduce((sum, e) => sum + Number(e.amount), 0), [expenses]);
  const averagePerMonth = allTimeTotal / monthsSpanned;
  const projectedAnnual = averagePerMonth * 12;

  const categoryBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    thisMonthExpenses.forEach(e => {
      const key = e.category_id ?? 'uncategorized';
      totals.set(key, (totals.get(key) ?? 0) + Number(e.amount));
    });
    return Array.from(totals.entries())
      .map(([id, total]) => ({
        id, total,
        name: categoryById.get(id)?.name ?? 'Other',
        color: categoryById.get(id)?.color ?? c.textMuted,
      }))
      .sort((a, b) => b.total - a.total);
  }, [thisMonthExpenses, categoryById, c.textMuted]);

  const pieData = categoryBreakdown.map(cat => ({
    name: cat.name,
    population: cat.total,
    color: cat.color,
    legendFontColor: c.textSecondary,
    legendFontSize: 12,
  }));

  const trends = useMemo(() => {
    if (!lastMonthExpenses.length) return [];
    const lastTotals = new Map<string, number>();
    lastMonthExpenses.forEach(e => {
      const key = e.category_id ?? 'uncategorized';
      lastTotals.set(key, (lastTotals.get(key) ?? 0) + Number(e.amount));
    });
    return categoryBreakdown
      .map(cat => {
        const prev = lastTotals.get(cat.id) ?? 0;
        if (prev <= 0) return null;
        const pct = ((cat.total - prev) / prev) * 100;
        if (Math.abs(pct) < 10) return null;
        return { name: cat.name, pct };
      })
      .filter((t): t is { name: string; pct: number } => !!t)
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
      .slice(0, 3);
  }, [categoryBreakdown, lastMonthExpenses]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  function openModal() {
    setAmount('');
    setDescription('');
    setEntryDate(new Date());
    setReceiptUri(null);
    setReceiptUploadedUrl(null);
    if (categories.length && !categoryId) setCategoryId(categories[0].id);
    setShowModal(true);
  }

  async function pickReceipt() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    setModerating(true);
    const modResult = await moderateImage(asset.uri);
    setModerating(false);
    if (modResult.blocked) {
      setBlockedContent({ severity: modResult.severity, reason: modResult.reason });
      return;
    }
    setReceiptUri(asset.uri);
    setReceiptUploadedUrl(null);
  }

  function removeReceipt() {
    setReceiptUri(null);
    setReceiptUploadedUrl(null);
  }

  async function saveExpense() {
    if (!userId) return;
    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0) {
      Alert.alert('Enter an amount', 'Please enter how much you spent.');
      return;
    }
    setSaving(true);
    try {
      let receiptUrl: string | null = receiptUploadedUrl;
      if (receiptUri && !receiptUploadedUrl) {
        receiptUrl = await uploadReceiptPhoto(receiptUri, userId);
      }

      const expenseId = generateId();
      const newExpense: Expense = {
        id: expenseId,
        category_id: categoryId,
        subcategory: null,
        amount: numericAmount,
        currency: 'USD',
        description: description.trim() || null,
        date: dateToISO(entryDate),
        receipt_photo_url: receiptUrl,
        is_recurring: false,
        created_at: new Date().toISOString(),
      };
      await safeInsert('expenses', {
        ...newExpense,
        user_id: userId,
        baby_id: babyId,
      });

      setExpenses(prev => [newExpense, ...prev]);
      setShowModal(false);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save expense.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(expense: Expense) {
    Alert.alert('Delete expense?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await safeDelete('expenses', expense.id);
          if (expense.receipt_photo_url) {
            const path = storagePathFromUrl(expense.receipt_photo_url);
            if (path) supabase.storage.from('baby-photos').remove([path]).catch(() => {});
          }
          setExpenses(prev => prev.filter(e => e.id !== expense.id));
        },
      },
    ]);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View>
      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Text style={{ fontSize: 14, color: c.textMuted }}>
          {babyName ? `${babyName}'s expenses` : 'Baby expenses'}
        </Text>
        <TouchableOpacity
          onPress={openModal}
          style={{ backgroundColor: c.sage, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 }}
          activeOpacity={0.8}
          accessibilityRole="button" accessibilityLabel="Log an expense"
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>+ Log Expense</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ paddingVertical: 32 }} color={c.sage} />
      ) : (
        <>
          {/* Insights */}
          <View style={{
            backgroundColor: c.card, borderRadius: 16, padding: 16, marginBottom: 16,
            borderWidth: 1.5, borderColor: c.separator,
          }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: c.textPrimary, marginBottom: 4 }}>
              You've spent {fmtMoney(thisMonthTotal)} this month
            </Text>
            <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 12 }}>
              Average per month: {fmtMoney(averagePerMonth)} · Projected annual: {fmtMoney(projectedAnnual)}
            </Text>

            {pieData.length > 0 ? (
              <>
                <View style={{ alignItems: 'center' }}>
                  <PieChart
                    data={pieData}
                    width={Math.min(SW, 420) - 64}
                    height={160}
                    chartConfig={{ color: () => c.textSecondary }}
                    accessor="population"
                    backgroundColor="transparent"
                    paddingLeft="0"
                    hasLegend={false}
                    absolute
                  />
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10, justifyContent: 'center' }}>
                  {categoryBreakdown.map(cat => (
                    <View key={cat.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cat.color }} />
                      <Text style={{ fontSize: 12, color: c.textSecondary }}>{cat.name} · {fmtMoney(cat.total)}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'center', paddingVertical: 12 }}>
                No expenses logged this month yet.
              </Text>
            )}

            {trends.map(t => (
              <Text key={t.name} style={{ fontSize: 12, color: c.textSecondary, marginTop: 6 }}>
                {t.pct > 0 ? '📈' : '📉'} {t.name} costs are {t.pct > 0 ? 'up' : 'down'} {Math.abs(Math.round(t.pct))}% vs last month
              </Text>
            ))}
          </View>

          {/* Recent expenses */}
          {expenses.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Text style={{ fontSize: 32, marginBottom: 10 }}>💸</Text>
              <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'center' }}>
                Log your first expense to start tracking baby costs.
              </Text>
            </View>
          ) : (
            expenses.slice(0, 20).map(exp => {
              const cat = exp.category_id ? categoryById.get(exp.category_id) : null;
              return (
                <View key={exp.id} style={{
                  flexDirection: 'row', alignItems: 'center', backgroundColor: c.card,
                  borderRadius: 14, padding: 12, marginBottom: 8,
                  borderWidth: 1.5, borderColor: c.separator,
                }}>
                  <Text style={{ fontSize: 20, marginRight: 10 }}>{cat?.icon ?? '📦'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: c.textPrimary }} numberOfLines={1}>
                      {exp.description || cat?.name || 'Expense'}
                    </Text>
                    <Text style={{ fontSize: 12, color: c.textMuted }}>
                      {cat?.name ?? 'Other'} · {formatDisplayDate(exp.date)}
                    </Text>
                  </View>
                  {exp.receipt_photo_url ? (
                    <TouchableOpacity onPress={() => setLightboxUrl(exp.receipt_photo_url)} style={{ marginRight: 10 }}
                      accessibilityRole="button" accessibilityLabel="View receipt photo">
                      <Image source={{ uri: exp.receipt_photo_url }} style={{ width: 32, height: 32, borderRadius: 6 }} />
                    </TouchableOpacity>
                  ) : null}
                  <Text style={{ fontSize: 15, fontWeight: '800', color: c.textPrimary, marginRight: 10 }}>
                    {fmtMoney(Number(exp.amount))}
                  </Text>
                  <TouchableOpacity onPress={() => deleteExpense(exp)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button" accessibilityLabel="Delete expense">
                    <Text style={{ fontSize: 14, color: c.textMuted }}>🗑</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </>
      )}

      {/* ── Quick-add modal ── */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingVertical: 16,
            borderBottomWidth: 1, borderBottomColor: c.separator,
          }}>
            <TouchableOpacity onPress={() => setShowModal(false)} style={{ width: 40 }}>
              <Text style={{ fontSize: 18, color: c.textMuted }}>✕</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary }}>Log Expense</Text>
            <TouchableOpacity onPress={saveExpense} disabled={saving || !amount.trim()} style={{ opacity: !amount.trim() ? 0.4 : 1 }}>
              {saving ? <ActivityIndicator size="small" color={c.sage} /> : <Text style={{ fontSize: 16, fontWeight: '700', color: c.sage }}>Save</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
            {/* Amount */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 6 }}>Amount</Text>
            <TextInput
              style={{
                backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5,
                borderColor: c.separator, padding: 13, fontSize: 20, fontWeight: '700',
                color: c.textPrimary, marginBottom: 16,
              }}
              placeholder="$0.00"
              placeholderTextColor={c.textMuted}
              value={amount}
              onChangeText={t => setAmount(t.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              autoFocus
            />

            {/* Category */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 10 }}>Category</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setCategoryId(cat.id)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                    backgroundColor: categoryId === cat.id ? cat.color : c.card,
                    borderWidth: 1.5,
                    borderColor: categoryId === cat.id ? cat.color : c.separator,
                  }}
                >
                  <Text style={{ fontSize: 14 }}>{cat.icon}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: categoryId === cat.id ? '#fff' : c.textMuted }}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Description */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 6 }}>Description (optional)</Text>
            <TextInput
              style={{
                backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5,
                borderColor: c.separator, padding: 13, fontSize: 15,
                color: c.textPrimary, marginBottom: 16,
              }}
              placeholder="e.g. Pampers size 3, 2 packs"
              placeholderTextColor={c.textMuted}
              value={description}
              onChangeText={setDescription}
            />

            {/* Date */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 6 }}>Date</Text>
            {Platform.OS === 'web' ? (
              // @ts-ignore — raw DOM input, web-only branch
              <input
                type="date"
                value={dateToISO(entryDate)}
                max={dateToISO(new Date())}
                onChange={(e: any) => { if (e.target.value) setEntryDate(new Date(e.target.value + 'T12:00:00')); }}
                style={{
                  backgroundColor: c.card, borderRadius: 12,
                  border: `1.5px solid ${c.separator}`,
                  padding: 13, fontSize: 15, color: c.textPrimary,
                  marginBottom: 20, width: '100%', boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            ) : (
              <>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  style={{
                    backgroundColor: c.card, borderRadius: 12, borderWidth: 1.5,
                    borderColor: c.separator, padding: 13, marginBottom: showDatePicker ? 8 : 20,
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 15, color: c.textPrimary }}>{formatPickerDate(entryDate)}</Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={entryDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    maximumDate={new Date()}
                    onChange={(event: any, selectedDate?: Date) => {
                      if (Platform.OS === 'android') setShowDatePicker(false);
                      if (event?.type === 'dismissed') return;
                      if (selectedDate) setEntryDate(selectedDate);
                    }}
                  />
                )}
                {Platform.OS === 'ios' && showDatePicker && (
                  <TouchableOpacity onPress={() => setShowDatePicker(false)} style={{ alignSelf: 'flex-end', marginBottom: 20 }}>
                    <Text style={{ color: c.sage, fontWeight: '700', fontSize: 14 }}>Done</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Receipt photo */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 6 }}>Receipt (optional)</Text>
            {receiptUri ? (
              <View style={{ width: 100, height: 100, borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
                <Image source={{ uri: receiptUri }} style={{ width: 100, height: 100 }} resizeMode="cover" />
                <TouchableOpacity
                  onPress={removeReceipt}
                  style={{
                    position: 'absolute', top: 4, right: 4,
                    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10,
                    width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={pickReceipt}
                style={{
                  width: 100, height: 100, borderRadius: 12, marginBottom: 24,
                  backgroundColor: c.card, borderWidth: 1.5,
                  borderColor: c.separator, borderStyle: 'dashed' as any,
                  alignItems: 'center', justifyContent: 'center',
                }}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 22, marginBottom: 2 }}>📷</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, fontWeight: '600' }}>Add</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={saveExpense}
              disabled={saving || !amount.trim()}
              style={{
                backgroundColor: c.sage, borderRadius: 14, paddingVertical: 14,
                alignItems: 'center', opacity: !amount.trim() ? 0.45 : 1,
              }}
              activeOpacity={0.8}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Save Expense</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Receipt lightbox ── */}
      <Modal visible={!!lightboxUrl} animationType="fade" transparent onRequestClose={() => setLightboxUrl(null)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' }}
          activeOpacity={1}
          onPress={() => setLightboxUrl(null)}
        >
          {lightboxUrl ? <Image source={{ uri: lightboxUrl }} style={{ width: '92%', height: '80%' }} resizeMode="contain" /> : null}
          <TouchableOpacity
            onPress={() => setLightboxUrl(null)}
            style={{
              position: 'absolute', top: 50, right: 24,
              backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 18,
              width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Content moderation blocked modal ── */}
      {blockedContent && userId && (
        <ContentBlockedModal
          visible={!!blockedContent}
          severity={blockedContent.severity}
          reason={blockedContent.reason}
          contentType="receipt_photo"
          userId={userId}
          onClose={() => setBlockedContent(null)}
        />
      )}

      {/* ── Moderation loading overlay ── */}
      {moderating && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', gap: 12,
        }}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Checking photo…</Text>
        </View>
      )}
    </View>
  );
}
