/*
  Google OAuth code exchange — Deployed as a Supabase Edge Function.

  Required secrets (Supabase project secrets, shared across all functions —
  set once via `supabase secrets set KEY=value`, or the dashboard's Edge
  Functions -> Manage secrets page):
    GOOGLE_CLIENT_ID              — the "Web application" OAuth client's id
    GOOGLE_CLIENT_SECRET          — that client's secret, never sent to the app
    INTEGRATIONS_ENCRYPTION_KEY   — 32-byte key, base64 (openssl rand -base64 32)
  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-provided.

  See docs/google-calendar-setup.md for how to create the Google Cloud
  project, OAuth consent screen, and this client.

  The app sends only the short-lived authorization `code` it got from
  Google's consent screen (plus the PKCE code_verifier). This function trades
  that for tokens using GOOGLE_CLIENT_SECRET, encrypts them, and stores them
  with the service-role key — user_integrations grants no direct client
  access at all, see supabase/integrations.sql.
*/
import { corsHeaders } from '../_shared/cors.ts';
import { getUserId } from '../_shared/auth.ts';
import { encryptSecret } from '../_shared/crypto.ts';
import { serviceRoleHeaders, supabaseRestUrl, jsonResponse } from '../_shared/rest.ts';

const CALENDAR_NAME = 'Parent Patch';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const userId = getUserId(req);
  if (!userId) return jsonResponse({ error: 'Not authenticated' }, 401, corsHeaders);

  const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
  const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return jsonResponse({ error: 'Google Calendar is not configured on the server yet' }, 503, corsHeaders);
  }

  let code = '';
  let redirectUri = '';
  let codeVerifier = '';
  try {
    const body = await req.json();
    code = body.code ?? '';
    redirectUri = body.redirectUri ?? '';
    codeVerifier = body.codeVerifier ?? '';
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }
  if (!code || !redirectUri || !codeVerifier) {
    return jsonResponse({ error: 'code, redirectUri, and codeVerifier are required' }, 400, corsHeaders);
  }

  try {
    // 1. Exchange the authorization code for tokens.
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok) {
      return jsonResponse({ error: tokens.error_description ?? 'Google token exchange failed' }, 400, corsHeaders);
    }

    const accessToken: string = tokens.access_token;
    const refreshToken: string | undefined = tokens.refresh_token;
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
    const grantedScopes: string[] = (tokens.scope ?? '').split(' ').filter(Boolean);

    // 2. Who is this? (cosmetic — shown in the connected-account UI)
    let email: string | null = null;
    try {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userInfoRes.ok) email = (await userInfoRes.json()).email ?? null;
    } catch {
      // non-fatal
    }

    // 3. Reuse the "Parent Patch" calendar from a previous connect if we
    // still have a record of one and it still exists; otherwise create it.
    const existingRes = await fetch(
      supabaseRestUrl(
        `user_integrations?user_id=eq.${userId}&service_name=eq.google_calendar&select=external_calendar_id,refresh_token_encrypted`,
      ),
      { headers: serviceRoleHeaders() },
    );
    const existingRows = await existingRes.json();
    let calendarId: string | null = existingRows?.[0]?.external_calendar_id ?? null;

    if (calendarId) {
      const check = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!check.ok) calendarId = null; // user deleted it in Google since we last connected
    }

    if (!calendarId) {
      const createRes = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: CALENDAR_NAME, description: 'Managed by the Parent Patch app' }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        return jsonResponse({ error: created.error?.message ?? 'Could not create the Parent Patch calendar' }, 502, corsHeaders);
      }
      calendarId = created.id;
    }

    // 4. Encrypt and store.
    const accessTokenEncrypted = await encryptSecret(accessToken);
    const refreshTokenEncrypted = refreshToken ? await encryptSecret(refreshToken) : null;
    const hadRefreshOnFile = existingRows?.[0]?.refresh_token_encrypted != null;

    if (!refreshTokenEncrypted && !hadRefreshOnFile) {
      // Google only grants a refresh_token on first consent (or with
      // prompt=consent, which the client always sends) — if we somehow got
      // neither a new one nor have one on file, this account can't sync
      // once the short-lived access token expires.
      return jsonResponse(
        { error: "Google didn't grant offline access — try disconnecting and reconnecting." },
        400,
        corsHeaders,
      );
    }

    const upsertBody: Record<string, unknown> = {
      user_id: userId,
      service_name: 'google_calendar',
      status: 'connected',
      access_token_encrypted: accessTokenEncrypted,
      token_expires_at: expiresAt,
      scopes: grantedScopes,
      external_account_id: email,
      external_calendar_id: calendarId,
      is_active: true,
      last_error: null,
      updated_at: new Date().toISOString(),
    };
    if (refreshTokenEncrypted) upsertBody.refresh_token_encrypted = refreshTokenEncrypted;

    const upsertRes = await fetch(supabaseRestUrl('user_integrations?on_conflict=user_id,service_name'), {
      method: 'POST',
      headers: { ...serviceRoleHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(upsertBody),
    });
    if (!upsertRes.ok) {
      return jsonResponse({ error: `Could not save integration: ${await upsertRes.text()}` }, 500, corsHeaders);
    }

    return jsonResponse({ ok: true, externalAccountId: email, externalCalendarId: calendarId }, 200, corsHeaders);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500, corsHeaders);
  }
});
