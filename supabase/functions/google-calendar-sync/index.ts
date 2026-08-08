/*
  Google Calendar two-way sync — Deployed as a Supabase Edge Function.

  Required secrets (same ones google-oauth-exchange uses — Supabase project
  secrets are shared across all functions, set once via
  `supabase secrets set`):
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, INTEGRATIONS_ENCRYPTION_KEY
  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-provided.

  Push: calendar_events rows created in-app (google_event_id is null,
  external_source is null) get created on the user's "Parent Patch" Google
  calendar, then linked back via google_event_id.

  Pull: events on that Google calendar (created there directly, or through
  another Google Calendar client) get mirrored into calendar_events with
  external_source='google_calendar', using Google's incremental sync tokens
  so repeat syncs are cheap. Cancelled events delete their local mirror.

  Called on-demand (pull-to-refresh in the app) and can also be put on a
  pg_cron / Supabase Scheduled Function schedule for background sync.
*/
import { corsHeaders } from '../_shared/cors.ts';
import { getUserId } from '../_shared/auth.ts';
import { encryptSecret, decryptSecret } from '../_shared/crypto.ts';
import { serviceRoleHeaders, supabaseRestUrl, jsonResponse } from '../_shared/rest.ts';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const userId = getUserId(req);
  if (!userId) return jsonResponse({ error: 'Not authenticated' }, 401, corsHeaders);

  try {
    const integration = await fetchIntegration(userId);
    if (!integration || !integration.is_active || integration.status === 'disconnected') {
      return jsonResponse({ ok: false, error: 'Google Calendar is not connected' }, 400, corsHeaders);
    }

    const accessToken = await getFreshAccessToken(userId, integration);
    const calendarId: string = integration.external_calendar_id;
    const personalCalendarId = await ensurePersonalCalendarId(userId);

    const pushed = await pushLocalEvents(personalCalendarId, calendarId, accessToken);
    const { pulled, syncToken } = await pullGoogleEvents(
      personalCalendarId,
      calendarId,
      accessToken,
      integration.sync_settings?.syncToken,
    );

    await patchIntegration(userId, {
      status: 'connected',
      last_sync_at: new Date().toISOString(),
      last_error: null,
      sync_settings: { ...(integration.sync_settings ?? {}), syncToken },
    });

    return jsonResponse({ ok: true, pushed, pulled }, 200, corsHeaders);
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err);
    await patchIntegration(userId, { status: 'error', last_error: message }).catch(() => {});
    return jsonResponse({ ok: false, error: message }, 500, corsHeaders);
  }
});

// ── Integration row helpers ───────────────────────────────────────────────────

async function fetchIntegration(userId: string): Promise<any | null> {
  const res = await fetch(
    supabaseRestUrl(`user_integrations?user_id=eq.${userId}&service_name=eq.google_calendar&select=*`),
    { headers: serviceRoleHeaders() },
  );
  const rows = await res.json();
  return rows?.[0] ?? null;
}

async function patchIntegration(userId: string, fields: Record<string, unknown>): Promise<void> {
  await fetch(supabaseRestUrl(`user_integrations?user_id=eq.${userId}&service_name=eq.google_calendar`), {
    method: 'PATCH',
    headers: { ...serviceRoleHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
}

async function getFreshAccessToken(userId: string, integration: any): Promise<string> {
  const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60_000) {
    return decryptSecret(integration.access_token_encrypted);
  }

  if (!integration.refresh_token_encrypted) {
    throw new Error('Google Calendar needs to be reconnected (no refresh token on file)');
  }
  const refreshToken = await decryptSecret(integration.refresh_token_encrypted);

  const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
  const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description ?? 'Google Calendar needs to be reconnected');
  }

  const accessToken: string = data.access_token;
  const expiresAtIso = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
  await patchIntegration(userId, {
    access_token_encrypted: await encryptSecret(accessToken),
    token_expires_at: expiresAtIso,
  });
  return accessToken;
}

// ── Local (app-side) calendar helpers ─────────────────────────────────────────

async function ensurePersonalCalendarId(userId: string): Promise<string> {
  const existingRes = await fetch(
    supabaseRestUrl(`calendars?owner_id=eq.${userId}&calendar_type=eq.personal&select=id&limit=1`),
    { headers: serviceRoleHeaders() },
  );
  const existing = await existingRes.json();
  if (existing?.[0]?.id) return existing[0].id;

  const createRes = await fetch(supabaseRestUrl('calendars'), {
    method: 'POST',
    headers: { ...serviceRoleHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({ owner_id: userId, name: 'My Calendar', calendar_type: 'personal' }),
  });
  const created = await createRes.json();
  return created[0].id;
}

// ── Push: local -> Google ──────────────────────────────────────────────────────

async function pushLocalEvents(localCalendarId: string, googleCalendarId: string, accessToken: string): Promise<number> {
  const res = await fetch(
    supabaseRestUrl(
      `calendar_events?calendar_id=eq.${localCalendarId}&google_event_id=is.null&external_source=is.null` +
        `&select=id,title,notes,location,starts_at,ends_at,all_day`,
    ),
    { headers: serviceRoleHeaders() },
  );
  const rows = await res.json();

  let pushed = 0;
  for (const row of rows) {
    const body = toGoogleEvent(row);
    const insertRes = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(googleCalendarId)}/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!insertRes.ok) continue; // skip a bad event rather than fail the whole sync
    const created = await insertRes.json();

    await fetch(supabaseRestUrl(`calendar_events?id=eq.${row.id}`), {
      method: 'PATCH',
      headers: { ...serviceRoleHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ google_event_id: created.id, updated_at: new Date().toISOString() }),
    });
    pushed++;
  }
  return pushed;
}

function toGoogleEvent(row: any): Record<string, unknown> {
  if (row.all_day) {
    const date = row.starts_at.slice(0, 10);
    const endDate = row.ends_at ? row.ends_at.slice(0, 10) : date;
    return { summary: row.title, description: row.notes ?? undefined, location: row.location ?? undefined, start: { date }, end: { date: endDate } };
  }
  const start = row.starts_at;
  const end = row.ends_at ?? new Date(new Date(row.starts_at).getTime() + 30 * 60_000).toISOString();
  return {
    summary: row.title,
    description: row.notes ?? undefined,
    location: row.location ?? undefined,
    start: { dateTime: start },
    end: { dateTime: end },
  };
}

// ── Pull: Google -> local ──────────────────────────────────────────────────────

async function pullGoogleEvents(
  localCalendarId: string,
  googleCalendarId: string,
  accessToken: string,
  syncToken: string | undefined,
  isRetryAfterInvalidToken = false,
): Promise<{ pulled: number; syncToken: string | undefined }> {
  let pulled = 0;
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

  do {
    const params = new URLSearchParams({ maxResults: '250', showDeleted: 'true' });
    if (syncToken) {
      params.set('syncToken', syncToken);
    } else {
      params.set('singleEvents', 'true');
      params.set('timeMin', new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString());
    }
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(googleCalendarId)}/events?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 410 && syncToken && !isRetryAfterInvalidToken) {
      // Sync token expired/invalid — Google's documented recovery is a full
      // resync without one.
      return pullGoogleEvents(localCalendarId, googleCalendarId, accessToken, undefined, true);
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? 'Could not read Google Calendar events');

    for (const item of data.items ?? []) {
      await applyGoogleEvent(localCalendarId, item);
      pulled++;
    }

    pageToken = data.nextPageToken;
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
  } while (pageToken);

  return { pulled, syncToken: nextSyncToken ?? syncToken };
}

async function applyGoogleEvent(localCalendarId: string, item: any): Promise<void> {
  const existingRes = await fetch(
    supabaseRestUrl(`calendar_events?google_event_id=eq.${item.id}&select=id`),
    { headers: serviceRoleHeaders() },
  );
  const existing = await existingRes.json();
  const existingId: string | undefined = existing?.[0]?.id;

  if (item.status === 'cancelled') {
    if (existingId) {
      await fetch(supabaseRestUrl(`calendar_events?id=eq.${existingId}`), {
        method: 'DELETE',
        headers: serviceRoleHeaders(),
      });
    }
    return;
  }

  const startsAt = item.start?.dateTime ?? item.start?.date;
  const endsAt = item.end?.dateTime ?? item.end?.date ?? null;
  if (!startsAt) return; // malformed event, skip

  const fields = {
    calendar_id: localCalendarId,
    title: item.summary ?? '(untitled)',
    notes: item.description ?? null,
    location: item.location ?? null,
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: !item.start?.dateTime,
    external_source: 'google_calendar',
    google_event_id: item.id,
    updated_at: new Date().toISOString(),
  };

  if (existingId) {
    await fetch(supabaseRestUrl(`calendar_events?id=eq.${existingId}`), {
      method: 'PATCH',
      headers: { ...serviceRoleHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify(fields),
    });
  } else {
    await fetch(supabaseRestUrl('calendar_events'), {
      method: 'POST',
      headers: { ...serviceRoleHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify(fields),
    });
  }
}
