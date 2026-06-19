import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { Purchases, LOG_LEVEL } from './purchases';
import PaywallModal from '../components/PaywallModal';

const RC_API_KEY = 'test_aKoxsimzJRFcHMqvzVjlVzGjkZX';
const ENTITLEMENT = 'premium';
const FREE_PICK_KEY = 'village_free_tracker_pick';

type SubscriptionContextType = {
  isSubscribed: boolean;
  isLoading: boolean;
  freeTrackerPick: string | null;
  setFreeTrackerPick: (tracker: string) => Promise<void>;
  purchaseSubscription: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  openPaywall: () => void;
  closePaywall: () => void;
};

const SubscriptionContext = createContext<SubscriptionContextType>({
  isSubscribed: false,
  isLoading: true,
  freeTrackerPick: null,
  setFreeTrackerPick: async () => {},
  purchaseSubscription: async () => false,
  restorePurchases: async () => false,
  openPaywall: () => {},
  closePaywall: () => {},
});

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [freeTrackerPick, setFreeTrackerPickState] = useState<string | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
        const { data: { user } } = await supabase.auth.getUser();
        Purchases.configure({ apiKey: RC_API_KEY, appUserID: user?.id ?? null });
        Purchases.addCustomerInfoUpdateListener((info: any) => {
          setIsSubscribed(!!info.entitlements.active[ENTITLEMENT]);
        });
      } catch (e) {
        console.warn('[Subscription] init error:', e);
      }

      try {
        const info = await Purchases.getCustomerInfo();
        setIsSubscribed(!!info.entitlements.active[ENTITLEMENT]);
      } catch (e) {
        console.warn('[Subscription] initial check error:', e);
      } finally {
        setIsLoading(false);
      }

      const pick = await AsyncStorage.getItem(FREE_PICK_KEY);
      setFreeTrackerPickState(pick);
    };
    init();
  }, []);

  const setFreeTrackerPick = useCallback(async (tracker: string) => {
    await AsyncStorage.setItem(FREE_PICK_KEY, tracker);
    setFreeTrackerPickState(tracker);
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
      freeTrackerPick,
      setFreeTrackerPick,
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
