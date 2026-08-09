# PostHog Analytics Dashboard — Parent Patch

## Setup (Madeline)

- [x] Signed up at https://posthog.com, project "Parent Patch" on US Cloud
- [x] Project API key wired into `App.tsx` (`new PostHog(...)` call near the top of the file)
- [x] `host` set to `https://us.i.posthog.com` to match the US Cloud project
- [ ] Enable Session Replay: Project Settings → Session Replay → toggle on
      (the app already sets `enableSessionReplay: true` in `App.tsx`, but PostHog also
      needs it enabled project-side to actually store recordings)

## What's already wired up

- **lib/analytics.ts** — `track()`, `identifyUser()`, `setUserProperties()`,
  `resetAnalytics()`, `screenView()` helpers. All screens import from here rather
  than calling `posthog` directly.
- **Opt-out toggle** — Settings → Privacy & Safety → "Share Analytics". Defaults to
  ON for beta testers; flipping it off calls `posthog.optOut()` and persists the
  choice in AsyncStorage (`analytics_enabled`) so it survives relaunch.
- **User identification** — on sign-in/sign-up and on every session restore,
  `identifyUser()` ties events to the Supabase user id, and `setUserProperties()`
  attaches the user's `role` (preferred term) as a person property.
- **Screen views** — HomeTab, Track, Calendar, Resources, Patch (VillageTab), and
  Profile each call `screenView()` on mount.

## Events being sent

| Event | Fired from | Key properties |
|---|---|---|
| `sign_up` / `sign_in` | Auth.tsx | `method` |
| `onboarding_step_completed` / `onboarding_step_skipped` | Onboarding.tsx | `step`, `step_name` |
| `onboarding_completed` | Onboarding.tsx | `role`, `feeding_methods`, `topics`, `patches_joined` |
| `partner_invite_sent` | Onboarding.tsx | `method` |
| `feeding_logged` | Track.tsx | `feeding_type`, `amount_oz`, `time_of_day` |
| `diaper_logged` | Track.tsx | `type` |
| `sleep_logged` | SleepTracker.tsx | `duration_minutes`, `sleep_type` |
| `post_created` | HomeTab.tsx, VillageFeedSheet.tsx | `patch_id` (patch posts only), `has_image` |
| `patch_joined` / `patch_left` | VillageTab.tsx | `patch_id` |
| `paywall_viewed` | PaywallModal.tsx | `trigger` (e.g. `village_limit`, `tracker_limit`, `calendar`, `settings`) |
| `subscription_started` | subscriptionContext.tsx | `plan`, `price`, `trigger` |
| `profile_updated` | Profile.tsx | `has_avatar`, `has_header` |
| `data_exported` | SettingsScreen.tsx | `type` (`tracker_summary` or `full_account`) |

## Building dashboards

Good starting points once events start flowing:

- **Activation funnel**: `sign_up` → `onboarding_completed` → first `feeding_logged`
  or `diaper_logged` within 24h.
- **Retention**: weekly retention on any of `feeding_logged`, `diaper_logged`,
  `sleep_logged` as the "return" event.
- **Paywall performance**: `paywall_viewed` (broken down by `trigger`) →
  `subscription_started` conversion rate per trigger, to see which upgrade prompt
  actually converts.
- **Community engagement**: `post_created` and `patch_joined` trended over time.

All of the above can be built as PostHog Insights (Trends/Funnels) without any
further code changes — the properties above already carry what you need to segment.
