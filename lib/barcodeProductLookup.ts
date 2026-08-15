// Product lookup via Open Food Facts (free, no API key required).
// Docs: https://world.openfoodfacts.org/data

export interface ProductInfo {
  found: boolean;
  brand: string | null;
  productName: string | null;
  isOrganic: boolean;
  isBabyFood: boolean;
  nutriscoreGrade: string | null;  // 'a' | 'b' | 'c' | 'd' | 'e'
  novaGroup: number | null;        // 1 (least processed) – 4 (ultra-processed)
  allergens: string[];
  ingredients: string | null;
  imageUrl: string | null;
  rawCategories: string[];
  code: string | null;             // barcode — lets search results reuse the scan-apply flow
  pregnancyRisk: { risky: boolean; reasons: string[] };
  // Nutrition (used by the adult Nutrition Tracker's barcode scanner & food search)
  servingSize: string | null;          // raw label text, e.g. "30 g (1 ONZ)"
  caloriesPerServing: number | null;
  proteinPerServingG: number | null;
  carbsPerServingG: number | null;
  fatPerServingG: number | null;
  sugarPerServingG: number | null;
  fiberPerServingG: number | null;
  sodiumPerServingMg: number | null;
  cholesterolPerServingMg: number | null;
  folatePerServingMcg: number | null;
  ironPerServingMg: number | null;
  caffeinePerServingMg: number | null;
  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  sugarPer100g: number | null;
  fiberPer100g: number | null;
  sodiumPer100gMg: number | null;
  cholesterolPer100gMg: number | null;
  folatePer100gMcg: number | null;
  ironPer100gMg: number | null;
  caffeinePer100gMg: number | null;
}

const EMPTY: ProductInfo = {
  found: false, brand: null, productName: null,
  isOrganic: false, isBabyFood: false,
  nutriscoreGrade: null, novaGroup: null,
  allergens: [], ingredients: null, imageUrl: null, rawCategories: [], code: null,
  pregnancyRisk: { risky: false, reasons: [] },
  servingSize: null,
  caloriesPerServing: null, proteinPerServingG: null, carbsPerServingG: null, fatPerServingG: null,
  sugarPerServingG: null, fiberPerServingG: null, sodiumPerServingMg: null, cholesterolPerServingMg: null,
  folatePerServingMcg: null, ironPerServingMg: null, caffeinePerServingMg: null,
  caloriesPer100g: null, proteinPer100g: null, carbsPer100g: null, fatPer100g: null,
  sugarPer100g: null, fiberPer100g: null, sodiumPer100gMg: null, cholesterolPer100gMg: null,
  folatePer100gMcg: null, ironPer100gMg: null, caffeinePer100gMg: null,
};

// Normalise a brand field to the first brand name. The barcode endpoint
// returns a comma/semicolon-delimited string; the search endpoint returns
// an array of strings — handle both.
function parseBrand(raw: string | string[] | null | undefined): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0]?.trim() || null;
  return raw.split(/,|;/)[0].trim() || null;
}

// Extract plain English allergen names from the OFF hierarchy (e.g. "en:milk" → "Milk").
function parseAllergens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(a => a.trim().replace(/^en:/, '').replace(/-/g, ' '))
    .filter(Boolean)
    .map(a => a.charAt(0).toUpperCase() + a.slice(1));
}

// Check whether any label/category string indicates organic.
function detectOrganic(labels: string, categories: string): boolean {
  const haystack = (labels + ' ' + categories).toLowerCase();
  return (
    haystack.includes('organic') ||
    haystack.includes('usda-organic') ||
    haystack.includes('en:organic')
  );
}

// Check whether the product is categorised as baby food.
function detectBabyFood(categories: string): boolean {
  const c = categories.toLowerCase();
  return (
    c.includes('baby') || c.includes('infant') || c.includes('toddler') ||
    c.includes('stage-1') || c.includes('stage-2') || c.includes('first-food')
  );
}

// Flag foods commonly considered unsafe or risky during pregnancy (CDC/ACOG
// guidance): raw fish, unpasteurized dairy, deli meat, high-mercury fish, and
// alcohol. This is a best-effort keyword scan against OFF's category/label
// strings, not a substitute for medical advice.
//
// Alcohol is checked via the alcohol_100g ABV nutriment (authoritative when
// present) rather than only the 'alcoholic-beverages' category tag — OFF
// still tags 0.0%-ABV "non-alcoholic beer" with that category, so a tag-only
// check would falsely flag it.
function detectPregnancyRisk(categories: string, labels: string, n: any): { risky: boolean; reasons: string[] } {
  const haystack = (categories + ' ' + labels).toLowerCase();
  const reasons: string[] = [];

  if (/sushi|sashimi|raw fish|steak tartare|carpaccio/.test(haystack)) {
    reasons.push('May contain raw fish');
  }
  if (/unpasteurized|unpasteurised|raw milk|raw-milk/.test(haystack)) {
    reasons.push('May be unpasteurized');
  }
  if (/deli meat|lunch meat|cold cuts|charcuterie/.test(haystack)) {
    reasons.push('Deli/lunch meat — heat before eating');
  }
  if (/swordfish|shark|king mackerel|tilefish|marlin/.test(haystack)) {
    reasons.push('High-mercury fish');
  }

  // OFF's plain `categories`/`labels` strings use display text ("Alcoholic
  // beverages", space-separated) not the hyphenated tag-slug form
  // ("en:alcoholic-beverages") — match on the display text here, same as
  // detectOrganic/detectBabyFood do for their own keywords. "Non-alcoholic
  // beverages" contains "alcoholic beverages" as a substring, so it must be
  // excluded explicitly rather than relying on a regex lookbehind (avoids
  // any risk of the RN/Hermes JS engine not supporting that syntax).
  const abv = typeof n?.alcohol_100g === 'number' ? n.alcohol_100g : parseFloat(n?.alcohol_100g);
  if (!isNaN(abv)) {
    if (abv > 0.5) reasons.push('Contains alcohol');
  } else if (
    (haystack.includes('alcoholic beverage') || haystack.includes('alcoholic drink')) &&
    !/non-alcoholic|non alcoholic|0\.0%|alcohol-free/.test(haystack)
  ) {
    reasons.push('Contains alcohol');
  }

  return { risky: reasons.length > 0, reasons };
}

/**
 * Parse a raw Open Food Facts `product` object (from either the single-barcode
 * endpoint or the text-search endpoint — both return the same shape) into our
 * normalized ProductInfo. Shared so barcode lookup and food search stay in sync.
 *
 * NOTE: OFF reports sodium, cholesterol, iron, and caffeine in GRAMS (per
 * 100g / per serving), not milligrams — converted here via numMg(). Folate
 * (vitamin B9) is conventionally displayed in MICROGRAMS, not milligrams —
 * converted via numMcg() (×1,000,000, not ×1000). Getting either wrong
 * silently misreports these by 1000x.
 */
export function parseOFFProduct(p: any): ProductInfo {
  const labels     = (p.labels ?? '') as string;
  const categories = (p.categories ?? '') as string;
  const n = p.nutriments ?? {};
  const num = (v: any): number | null => {
    if (typeof v === 'number' && !isNaN(v)) return v;
    const f = parseFloat(v);
    return isNaN(f) ? null : f;
  };
  const numMg = (v: any): number | null => {
    const g = num(v);
    return g == null ? null : g * 1000;
  };
  const numMcg = (v: any): number | null => {
    const g = num(v);
    return g == null ? null : g * 1_000_000;
  };

  return {
    found:           true,
    brand:           parseBrand(p.brands),
    productName:     (p.product_name_en || p.product_name || null) as string | null,
    isOrganic:       detectOrganic(labels, categories),
    isBabyFood:      detectBabyFood(categories),
    nutriscoreGrade: (p.nutriscore_grade ?? null) as string | null,
    novaGroup:       (p.nova_group ?? null) as number | null,
    allergens:       parseAllergens(p.allergens_hierarchy),
    ingredients:     (p.ingredients_text_en || p.ingredients_text || null) as string | null,
    imageUrl:        (p.image_front_small_url || p.image_small_url || p.image_url || null) as string | null,
    rawCategories:   categories.split(',').map((c: string) => c.trim()).filter(Boolean),
    code:            (p.code ?? p._id ?? null) as string | null,
    pregnancyRisk:   detectPregnancyRisk(categories, labels, n),
    servingSize:         (p.serving_size ?? null) as string | null,
    caloriesPerServing:  num(n['energy-kcal_serving']),
    proteinPerServingG:  num(n['proteins_serving']),
    carbsPerServingG:    num(n['carbohydrates_serving']),
    fatPerServingG:      num(n['fat_serving']),
    sugarPerServingG:    num(n['sugars_serving']),
    fiberPerServingG:    num(n['fiber_serving']),
    sodiumPerServingMg:      numMg(n['sodium_serving']),
    cholesterolPerServingMg: numMg(n['cholesterol_serving']),
    folatePerServingMcg:    numMcg(n['vitamin-b9_serving']),
    ironPerServingMg:       numMg(n['iron_serving']),
    caffeinePerServingMg:   numMg(n['caffeine_serving']),
    caloriesPer100g:     num(n['energy-kcal_100g']),
    proteinPer100g:      num(n['proteins_100g']),
    carbsPer100g:        num(n['carbohydrates_100g']),
    fatPer100g:          num(n['fat_100g']),
    sugarPer100g:        num(n['sugars_100g']),
    fiberPer100g:        num(n['fiber_100g']),
    sodiumPer100gMg:         numMg(n['sodium_100g']),
    cholesterolPer100gMg:    numMg(n['cholesterol_100g']),
    folatePer100gMcg:       numMcg(n['vitamin-b9_100g']),
    ironPer100gMg:          numMg(n['iron_100g']),
    caffeinePer100gMg:      numMg(n['caffeine_100g']),
  };
}

export async function lookupBarcode(barcode: string): Promise<ProductInfo> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
      { headers: { 'User-Agent': 'VillageApp/1.0 (contact@village-app.com)' } },
    );

    if (!res.ok) return EMPTY;

    const json = await res.json();
    if (json.status !== 1 || !json.product) return EMPTY;

    return parseOFFProduct(json.product);
  } catch {
    return EMPTY;
  }
}
