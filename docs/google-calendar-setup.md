# Google Calendar integration — setup

One-time setup in Google Cloud, then a few Supabase secrets. This gets the
**web** flow working end-to-end (the app currently targets `expo start
--web` for this integration — see the note at the bottom for what changes
when native iOS/Android support is added later).

## 1. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project (or reuse an existing one) — e.g. "Parent Patch".
2. In **APIs & Services → Library**, search for **Google Calendar API** and click **Enable**.

## 2. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External** (unless you have a Google Workspace organization).
3. Fill in app name ("Parent Patch"), support email, and developer contact email.
4. **Scopes** → add: `https://www.googleapis.com/auth/calendar.app.created`. This restricted scope only lets the app create and manage calendars *it* creates — it can never see or touch your personal calendars. (Google may ask you to justify this scope with a short description and a screenshot of the connect flow before verifying the app for production use — expected for any app requesting Calendar access.)
5. **Test users** (while the app is in "Testing" publish status): add your own Google account so you can use the integration immediately, before going through Google's verification review.

## 3. Create the OAuth client

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Name: "Parent Patch Web".
4. **Authorized redirect URIs**: add the exact URL the app runs at, e.g.:
   - `http://localhost:8081` (local dev — `expo start --web` default port)
   - your production web URL, once deployed
   `expo-auth-session`'s `makeRedirectUri()` returns the page's own origin on web, so whatever origin the app is served from must be listed here exactly.
5. Save — you'll get a **Client ID** and **Client Secret**.

## 4. Configure the app

**Client ID** (public, safe to bundle) — add to a `.env` file at the project root (create it if it doesn't exist; it's already covered by `.gitignore` conventions for secrets — double check it's not committed):

```
EXPO_PUBLIC_GOOGLE_CLIENT_ID=<your client id>.apps.googleusercontent.com
```

**Client Secret** (never goes in the app) — set as a Supabase Edge Function secret:

```bash
supabase secrets set GOOGLE_CLIENT_ID=<your client id>.apps.googleusercontent.com
supabase secrets set GOOGLE_CLIENT_SECRET=<your client secret>
supabase secrets set INTEGRATIONS_ENCRYPTION_KEY=$(openssl rand -base64 32)
```

(`GOOGLE_CLIENT_ID` is set on both sides — the app needs it to start the auth request, the edge function needs it again to complete the token exchange.)

## 5. Run the database migration and deploy the functions

```bash
# In the Supabase SQL editor, run:
supabase/integrations.sql

# Deploy the two edge functions (JWT verification stays on — the default):
supabase functions deploy google-oauth-exchange
supabase functions deploy google-calendar-sync
```

## 6. Test it

```bash
npm run web
```

Go to **Settings → Integrations → Google Calendar → Connect**, sign in with the Google account you added as a test user, and grant access. You should see it appear under "Connected" with a "Parent Patch" calendar created in your Google Calendar.

## Later: native (iOS/Android)

The redirect URI on native needs a custom URL scheme (e.g. `parentpatch://`) instead of an `http://` origin, which requires:
- Adding a `scheme` to `app.json` and switching from Expo Go to a development build (`expo-dev-client` + EAS Build).
- A separate **iOS** and/or **Android** OAuth client ID in the same Google Cloud project (these client types have no secret — the redirect URI itself is the security boundary), used instead of the Web client ID for the native `AuthRequest`.
- iOS installs on a physical device require an Apple Developer Program account ($99/year) for the provisioning profile, even when building via EAS Build in the cloud instead of a local Mac/Xcode.

None of this blocks the web flow above — it's additive when you're ready for it.
