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
  const { isSubscribed, freeTrackerPick } = useSubscription();

  const isUnlocked = isSubscribed || (isTracker && freeTrackerPick === feature);

  if (!isUnlocked) return null;
  return <>{children}</>;
}
