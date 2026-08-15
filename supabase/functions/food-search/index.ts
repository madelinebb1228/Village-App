/*
  Open Food Facts text search — proxied through a Supabase Edge Function.

  Open Food Facts's Search-a-licious API (search.openfoodfacts.org) does not
  send CORS headers for browser cross-origin requests (unlike the legacy
  world.openfoodfacts.org product-lookup API, which does), so it can't be
  called directly from the web build. This function makes the request
  server-side, where CORS doesn't apply, and returns the raw hits to the
  client — lib/foodSearch.ts parses them with the same logic used for
  barcode lookups.
*/

import { corsHeaders } from '../_shared/cors.ts';

const FIELDS = [
  'code', 'product_name', 'brands', 'nutriments', 'serving_size',
  'image_small_url', 'image_front_small_url', 'labels', 'categories',
  'nutriscore_grade', 'nova_group', 'allergens_hierarchy', 'ingredients_text',
].join(',');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let query = '';
  try {
    const body = await req.json();
    query = (body.query ?? '').trim();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (query.length < 2) {
    return new Response(
      JSON.stringify({ products: [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const res = await fetch(
      `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=20&fields=${FIELDS}`,
      { headers: { 'User-Agent': 'ParentPatchApp/1.0 (contact@parentpatch.app)' } },
    );

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Open Food Facts search unavailable (${res.status})` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const data = await res.json();
    return new Response(
      JSON.stringify({ products: data.hits ?? [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
