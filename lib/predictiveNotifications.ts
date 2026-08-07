// Predictive notifications: simple pattern matching (recent usage rate vs.
// supply on hand) — not ML, per the original spec. Companion to
// tummyTimeUtil.ts's checkTummyTimeReminder, which is the same shape.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { deliverCategorizedNotification } from './notificationService';

const LOW_SUPPLY_DAYS_THRESHOLD = 2;
const USAGE_WINDOW_DAYS = 7;

function lastCheckedKey(babyId: string, supplyType: string) {
  return `supply_forecast_checked_${supplyType}_${babyId}`;
}

// Checks the given supply type's usage rate (from the matching log table)
// against quantity_remaining and, if it's about to run out, sends an
// 'insights' notification — at most once per day.
async function checkSupplyForecast(
  userId: string,
  babyId: string,
  supplyType: 'diapers',
  logTable: 'diaper_logs',
): Promise<void> {
  const today = new Date().toDateString();
  const key = lastCheckedKey(babyId, supplyType);
  const lastChecked = await AsyncStorage.getItem(key);
  if (lastChecked === today) return;
  await AsyncStorage.setItem(key, today);

  const since = new Date(Date.now() - USAGE_WINDOW_DAYS * 86_400_000).toISOString();
  const [{ data: logs }, { data: supply }] = await Promise.all([
    supabase.from(logTable).select('id').eq('baby_id', babyId).gte('logged_at', since),
    supabase.from('supply_items').select('quantity_remaining, low_threshold, unit')
      .eq('user_id', userId).eq('supply_type', supplyType).maybeSingle(),
  ]);

  if (!supply) return;
  const dailyRate = (logs ?? []).length / USAGE_WINDOW_DAYS;
  if (dailyRate <= 0) return;

  const remaining = (supply as any).quantity_remaining as number;
  const daysLeft = remaining / dailyRate;
  if (daysLeft > LOW_SUPPLY_DAYS_THRESHOLD) return;

  const rateLabel = dailyRate >= 1 ? `${Math.round(dailyRate)}/day` : `${dailyRate.toFixed(1)}/day`;
  const daysLabel = daysLeft < 1 ? 'less than a day' : `~${daysLeft.toFixed(1)} days`;

  await deliverCategorizedNotification({
    userId,
    category: 'insights',
    babyId,
    title: `Running low on ${supplyType}`,
    body: `Based on usage (${rateLabel}), ${remaining} left ≈ ${daysLabel}.`,
    identifier: `supply-forecast-${supplyType}-${babyId}`,
  });
}

export async function checkDiaperSupplyForecast(userId: string, babyId: string): Promise<void> {
  await checkSupplyForecast(userId, babyId, 'diapers', 'diaper_logs').catch(() => {});
}
