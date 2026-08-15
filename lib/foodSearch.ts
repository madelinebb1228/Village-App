// Text search for foods via Open Food Facts, proxied through the
// `food-search` Supabase Edge Function (supabase/functions/food-search).
//
// Open Food Facts's Search-a-licious API (search.openfoodfacts.org) doesn't
// send CORS headers for browser cross-origin requests — unlike the legacy
// world.openfoodfacts.org product-lookup API used by lib/barcodeProductLookup.ts,
// which does — so it can't be called directly from the web build. The Edge
// Function makes the request server-side and returns the raw hits, which we
// parse here with the same logic used for barcode lookups. Note the hits
// come back in a slightly different shape than the barcode endpoint —
// notably `brands` is an array, not a comma-delimited string —
// parseOFFProduct() handles both.

import { supabase } from './supabase';
import { parseOFFProduct, ProductInfo } from './barcodeProductLookup';

export async function searchFoods(query: string): Promise<ProductInfo[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const { data, error } = await (supabase as any).functions.invoke('food-search', {
      body: { query: q },
    });
    if (error || !data || data.error) return [];
    const products = Array.isArray(data.products) ? data.products : [];
    return products.map(parseOFFProduct).filter((p: ProductInfo) => !!p.productName);
  } catch {
    return [];
  }
}
