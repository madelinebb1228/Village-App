/*
  Amazon Product Advertising API v5 — SearchItems
  Deployed as a Supabase Edge Function.

  Required environment variables (set in Supabase dashboard → Functions → amazon-search → Secrets):
    AMAZON_ACCESS_KEY   — from your PAAPI credentials
    AMAZON_SECRET_KEY   — from your PAAPI credentials
    AMAZON_PARTNER_TAG  — your Associates tag, e.g. "village-20"

  How to get credentials:
    1. Sign up for Amazon Associates: https://affiliate-program.amazon.com
    2. Apply for Product Advertising API access: https://affiliate-program.amazon.com/help/node/topic/GR87VA6SXK2BKQM
    3. Once approved, credentials appear under Tools → Product Advertising API
*/

const REGION  = 'us-east-1';
const SERVICE = 'ProductAdvertisingAPI';
const HOST    = 'webservices.amazon.com';
const PATH    = '/paapi5/searchitems';
const TARGET  = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── AWS Sig V4 helpers ───────────────────────────────────────────────────────

const enc = new TextEncoder();

async function sha256hex(message: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(message));
  return toHex(buf);
}

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function deriveSigningKey(
  secretKey: string, datestamp: string, region: string, service: string,
): Promise<ArrayBuffer> {
  let key = await hmacSha256(enc.encode(`AWS4${secretKey}`), datestamp);
  key = await hmacSha256(key, region);
  key = await hmacSha256(key, service);
  key = await hmacSha256(key, 'aws4_request');
  return key;
}

async function buildAuthHeaders(
  payload: string,
  accessKey: string,
  secretKey: string,
  partnerTag: string,
): Promise<Record<string, string>> {
  const now = new Date();
  // Format: 20240115T123456Z
  const amzdate  = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const datestamp = amzdate.slice(0, 8);

  const contentType = 'application/json; charset=utf-8';
  const payloadHash = await sha256hex(payload);

  // Headers must be sorted alphabetically by header name
  const canonicalHeaders =
    `content-encoding:amz-1.0\n` +
    `content-type:${contentType}\n` +
    `host:${HOST}\n` +
    `x-amz-date:${amzdate}\n` +
    `x-amz-target:${TARGET}\n`;

  const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target';

  const canonicalRequest = [
    'POST',
    PATH,
    '',          // no query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${datestamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzdate,
    credentialScope,
    await sha256hex(canonicalRequest),
  ].join('\n');

  const signingKey = await deriveSigningKey(secretKey, datestamp, REGION, SERVICE);
  const signature  = toHex(await hmacSha256(signingKey, stringToSign));

  return {
    'Authorization':    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'Content-Encoding': 'amz-1.0',
    'Content-Type':     contentType,
    'host':             HOST,
    'x-amz-date':       amzdate,
    'x-amz-target':     TARGET,
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const ACCESS_KEY  = Deno.env.get('AMAZON_ACCESS_KEY')  ?? '';
  const SECRET_KEY  = Deno.env.get('AMAZON_SECRET_KEY')  ?? '';
  const PARTNER_TAG = Deno.env.get('AMAZON_PARTNER_TAG') ?? '';

  if (!ACCESS_KEY || !SECRET_KEY || !PARTNER_TAG) {
    return new Response(
      JSON.stringify({ error: 'Amazon API credentials not configured' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
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

  if (!query) {
    return new Response(
      JSON.stringify({ error: 'query is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const payload = JSON.stringify({
    PartnerType:   'Associates',
    PartnerTag:    PARTNER_TAG,
    Marketplace:   'www.amazon.com',
    Keywords:      query,
    SearchIndex:   'All',
    ItemCount:     8,
    Resources: [
      'ItemInfo.Title',
      'ItemInfo.ByLineInfo',
      'Offers.Listings.Price',
      'Images.Primary.Medium',
    ],
  });

  try {
    const authHeaders = await buildAuthHeaders(payload, ACCESS_KEY, SECRET_KEY, PARTNER_TAG);

    const res = await fetch(`https://${HOST}${PATH}`, {
      method:  'POST',
      headers: authHeaders,
      body:    payload,
    });

    const data = await res.json();

    if (!res.ok) {
      const message = data?.Errors?.[0]?.Message ?? 'Amazon API error';
      return new Response(
        JSON.stringify({ error: message }),
        { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const items = (data.SearchResult?.Items ?? []).map((item: any) => ({
      asin:         item.ASIN ?? '',
      title:        item.ItemInfo?.Title?.DisplayValue ?? '',
      brand:        item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue ?? '',
      price:        item.Offers?.Listings?.[0]?.Price?.DisplayAmount ?? '',
      imageUrl:     item.Images?.Primary?.Medium?.URL ?? '',
      affiliateUrl: `https://www.amazon.com/dp/${item.ASIN}?tag=${PARTNER_TAG}`,
    }));

    return new Response(
      JSON.stringify({ items }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
