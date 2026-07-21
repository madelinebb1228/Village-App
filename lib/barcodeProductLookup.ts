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
}

// Normalise a comma/ampersand-delimited brand string to the first brand name.
function parseBrand(raw: string | null | undefined): string | null {
  if (!raw) return null;
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

export async function lookupBarcode(barcode: string): Promise<ProductInfo> {
  const EMPTY: ProductInfo = {
    found: false, brand: null, productName: null,
    isOrganic: false, isBabyFood: false,
    nutriscoreGrade: null, novaGroup: null,
    allergens: [], ingredients: null, imageUrl: null, rawCategories: [],
  };

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
      { headers: { 'User-Agent': 'VillageApp/1.0 (contact@village-app.com)' } },
    );

    if (!res.ok) return EMPTY;

    const json = await res.json();
    if (json.status !== 1 || !json.product) return EMPTY;

    const p = json.product;
    const labels     = (p.labels ?? '') as string;
    const categories = (p.categories ?? '') as string;

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
    };
  } catch {
    return EMPTY;
  }
}
