// Thin PostgREST helpers for talking to user_integrations and calendar_events
// with the service-role key — the same auto-provided-secrets pattern used in
// provider-share-view/index.ts, factored out since two functions need it now.

export function serviceRoleHeaders(): Record<string, string> {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

export function supabaseRestUrl(pathAndQuery: string): string {
  const base = Deno.env.get('SUPABASE_URL') ?? '';
  return `${base}/rest/v1/${pathAndQuery}`;
}

export function jsonResponse(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
