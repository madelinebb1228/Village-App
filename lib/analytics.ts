import AsyncStorage from '@react-native-async-storage/async-storage';
import PostHog from 'posthog-react-native';

export const ANALYTICS_ENABLED_KEY = 'analytics_enabled';

// Project: Parent Patch, US Cloud. Session Replay must also be toggled on in
// PostHog → Project Settings → Session Replay for recordings to be stored.
export const posthog = new PostHog(
  'phc_By5NMMMTykaJTNZRxLRBKrS35DxF9g52aUuJVkeGh6QN',
  {
    host: 'https://us.i.posthog.com',
    captureAppLifecycleEvents: true,
    enableSessionReplay: true,
  }
);

type AnalyticsEvent =
  | 'sign_up'
  | 'sign_in'
  | 'onboarding_step_completed'
  | 'onboarding_step_skipped'
  | 'onboarding_completed'
  | 'partner_invite_sent'
  | 'feeding_logged'
  | 'sleep_logged'
  | 'diaper_logged'
  | 'milestone_logged'
  | 'post_created'
  | 'comment_created'
  | 'patch_joined'
  | 'patch_left'
  | 'paywall_viewed'
  | 'subscription_started'
  | 'profile_updated'
  | 'baby_profile_created'
  | 'data_exported'
  | 'app_review_prompted';

export function track(event: AnalyticsEvent, properties?: Record<string, any>) {
  if (__DEV__) console.log('[Analytics]', event, properties ?? {});
  posthog?.capture(event, properties);
}

export function identifyUser(userId: string, traits?: Record<string, any>) {
  posthog?.identify(userId, traits);
}

export function setUserProperties(properties: Record<string, any>) {
  posthog?.register(properties);
}

export function resetAnalytics() {
  posthog?.reset();
}

export function screenView(screenName: string) {
  posthog?.screen(screenName);
}

// Beta default is opt-in with a visible opt-out (Settings → Privacy & Safety).
// Called once at startup so a previous session's opt-out survives app relaunch.
export async function restoreAnalyticsOptOut() {
  const stored = await AsyncStorage.getItem(ANALYTICS_ENABLED_KEY);
  if (stored === 'false') posthog?.optOut();
}

export async function setAnalyticsEnabled(enabled: boolean) {
  if (enabled) posthog?.optIn();
  else posthog?.optOut();
  await AsyncStorage.setItem(ANALYTICS_ENABLED_KEY, String(enabled));
}
