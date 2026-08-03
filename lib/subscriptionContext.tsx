import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { Purchases, LOG_LEVEL } from './purchases';
import PaywallModal from '../components/PaywallModal';

const RC_API_KEY = 'test_aKoxsimzJRFcHMqvzVjlVzGjkZX';
const ENTITLEMENT = 'premium';
const FREE_PICK_KEY = 'village_free_tracker_picks';
export const MAX_FREE_TRACKER_PICKS = 3;

function entitlementCacheKey(userId: string) {
  return `subscription_cache_${userId}`;
}

// Developer accounts always have premium
const DEV_EMAILS = ['madelinebb1228@gmail.com', 'test@parentpatch.dev'];

type SubscriptionContextType = {
  isSubscribed: boolean;
  isLoading: boolean;
  freeTrackerPicks: string[];
  setFreeTrackerPicks: (trackers: string[]) => Promise<void>;
  purchaseSubscription: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  openPaywall: () => void;
  closePaywall: () => void;
};

const SubscriptionContext = createContext<SubscriptionContextType>({
  isSubscribed: false,
  isLoading: true,
  freeTrackerPicks: [],
  setFreeTrackerPicks: async () => {},
  purchaseSubscription: async () => false,
  restorePurchases: async () => false,
  openPaywall: () => {},
  closePaywall: () => {},
});

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [freeTrackerPicks, setFreeTrackerPicksState] = useState<string[]>([]);
  const [paywallVisible, setPaywallVisible] = useState(false);

  useEffect(() => {
    const init = async () => {
      let user: { id: string; email?: string | null } | null = null;
      try {
        if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
        const { data } = await supabase.auth.getUser();
        user = data.user;
        if (user?.email && DEV_EMAILS.includes(user.email)) {
          setIsSubscribed(true);
          setIsLoading(false);
          return;
        }
        Purchases.configure({ apiKey: RC_API_KEY, appUserID: user?.id ?? null });
        Purchases.addCustomerInfoUpdateListener((info: any) => {
          const subscribed = !!info.entitlements.active[ENTITLEMENT];
          setIsSubscribed(subscribed);
          if (user?.id) AsyncStorage.setItem(entitlementCacheKey(user.id), JSON.stringify(subscribed)).catch(() => {});
        });
      } catch (e) {
        console.warn('[Subscription] init error:', e);
      }

      // A subscribed user shouldn't lose premium access just because a
      // transient network error hit the entitlement check at launch — fall
      // back to the last-known status instead of defaulting to unsubscribed.
      if (user?.id) {
        try {
          const cached = await AsyncStorage.getItem(entitlementCacheKey(user.id));
          if (cached !== null) setIsSubscribed(JSON.parse(cached));
        } catch {}
      }

      try {
        const info = await Purchases.getCustomerInfo();
        const subscribed = !!info.entitlements.active[ENTITLEMENT];
        setIsSubscribed(subscribed);
        if (user?.id) await AsyncStorage.setItem(entitlementCacheKey(user.id), JSON.stringify(subscribed));
      } catch (e) {
        console.warn('[Subscription] initial check error, using cached entitlement:', e);
      } finally {
        setIsLoading(false);
      }

      const stored = await AsyncStorage.getItem(FREE_PICK_KEY);
      if (stored) {
        try {
          setFreeTrackerPicksState(JSON.parse(stored));
        } catch {}
      }
    };
    init();
  }, []);

  const setFreeTrackerPicks = useCallback(async (trackers: string[]) => {
    const capped = trackers.slice(0, MAX_FREE_TRACKER_PICKS);
    await AsyncStorage.setItem(FREE_PICK_KEY, JSON.stringify(capped));
    setFreeTrackerPicksState(capped);
  }, []);

  const purchaseSubscription = useCallback(async (): Promise<boolean> => {
    try {
      const offerings = await Purchases.getOfferings();
      const pkg = offerings.current?.monthly ?? offerings.current?.availablePackages?.[0];
      if (!pkg) {
        Alert.alert('Not Available', 'Subscription products aren\'t set up yet in the store. Check back soon!');
        return false;
      }
      const { customerInfo } = await (Purchases.purchasePackage(pkg) as any);
      const subscribed = !!customerInfo.entitlements.active[ENTITLEMENT];
      setIsSubscribed(subscribed);
      if (subscribed) setPaywallVisible(false);
      return subscribed;
    } catch (e: any) {
      if (e?.userCancelled) return false;
      Alert.alert('Purchase Failed', e?.message || 'Something went wrong. Please try again.');
      return false;
    }
  }, []);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    try {
      const info = await (Purchases.restorePurchases() as any);
      const subscribed = !!info.entitlements.active[ENTITLEMENT];
      setIsSubscribed(subscribed);
      if (subscribed) {
        setPaywallVisible(false);
        Alert.alert('Restored!', 'Your subscription has been restored.');
      } else {
        Alert.alert('Nothing to Restore', 'No active subscription was found for this account.');
      }
      return subscribed;
    } catch (e: any) {
      Alert.alert('Restore Failed', e?.message || 'Something went wrong. Please try again.');
      return false;
    }
  }, []);

  return (
    <SubscriptionContext.Provider value={{
      isSubscribed,
      isLoading,
      freeTrackerPicks,
      setFreeTrackerPicks,
      purchaseSubscription,
      restorePurchases,
      openPaywall: () => setPaywallVisible(true),
      closePaywall: () => setPaywallVisible(false),
    }}>
      {children}
      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        onSubscribe={purchaseSubscription}
        onRestore={restorePurchases}
      />
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
