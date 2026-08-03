import React from 'react';
import { useSubscription } from '../lib/subscriptionContext';

type Props = {
  feature: string;
  isTracker?: boolean;
  title: string;
  description: string;
  emoji?: string;
  children: React.ReactNode;
};

export default function PaywallGate({ feature, isTracker = false, children }: Props) {
  const { isSubscribed, freeTrackerPicks } = useSubscription();

  const isUnlocked = isSubscribed || (isTracker && freeTrackerPicks.includes(feature));

  if (!isUnlocked) return null;
  return <>{children}</>;
}
