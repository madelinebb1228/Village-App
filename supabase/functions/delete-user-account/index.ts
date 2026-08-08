/*
  Delete User Account — Deployed as a Supabase Edge Function.
  App Store compliance (Guideline 5.1.1): lets a user permanently delete
  their own account and data from inside the app.

    supabase functions deploy delete-user-account

  The caller's id is read from their own verified JWT (see _shared/auth.ts)
  — never from the request body — so this can only ever delete the
  account making the call.

  Almost all user-owned tables have `ON DELETE CASCADE` back to
  auth.users/profiles (see supabase/account_deletion_cascade.sql for the
  handful that didn't and were fixed), so deleting the auth user is enough
  to cascade-delete the rest of the user's rows in one step. What FK
  cascades can't reach is Storage — those buckets are cleared explicitly
  below before the auth user (and its rows) are removed.
*/
import { corsHeaders } from '../_shared/cors.ts';
import { getUserId } from '../_shared/auth.ts';
import { serviceRoleHeaders, supabaseRestUrl, jsonResponse } from '../_shared/rest.ts';

// Every place in the app that uploads to these buckets writes flat under
// one of these prefixes (see components/ActivityCommunitySection.tsx,
// screens/BabyJournal.tsx, screens/SmartShoppingLists.tsx, etc.) — no
// nested subfolders today. If that ever changes, this needs to recurse.
function storagePrefixesFor(userId: string): { bucket: string; prefix: string }[] {
  return [
    { bucket: 'baby-photos', prefix: `${userId}/` },
    { bucket: 'baby-photos', prefix: `shopping-lists/${userId}/` },
    { bucket: 'marketplace-images', prefix: `${userId}/` },
  ];
}

async function clearStoragePrefix(bucket: string, prefix: string): Promise<void> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const listHeaders = serviceRoleHeaders();

  for (;;) {
    const listRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: listHeaders,
      body: JSON.stringify({ prefix, limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!listRes.ok) return; // bucket/prefix just doesn't exist for this user — nothing to clean up
    const entries: { name: string }[] = await listRes.json();
    if (!entries.length) return;

    const keys = entries.map(e => `${prefix}${e.name}`);
    await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: listHeaders,
      body: JSON.stringify({ prefixes: keys }),
    });

    if (entries.length < 1000) return;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const userId = getUserId(req);
  if (!userId) return jsonResponse({ error: 'Not authenticated' }, 401, corsHeaders);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Server misconfigured' }, 503, corsHeaders);
  }

  // Best-effort: storage isn't covered by the DB's FK cascades, but a
  // transient storage hiccup shouldn't leave the user stuck unable to
  // delete their account. Failures here are logged, not fatal.
  const storageWarnings: string[] = [];
  for (const { bucket, prefix } of storagePrefixesFor(userId)) {
    try {
      await clearStoragePrefix(bucket, prefix);
    } catch (err) {
      storageWarnings.push(`${bucket}/${prefix}: ${String(err instanceof Error ? err.message : err)}`);
    }
  }

  const deleteRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });

  if (!deleteRes.ok) {
    const body = await deleteRes.text().catch(() => '');
    return jsonResponse({ error: 'Failed to delete account', detail: body }, 500, corsHeaders);
  }

  return jsonResponse({ ok: true, storageWarnings }, 200, corsHeaders);
});
