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
  // Nutrition (used by the adult Nutrition Tracker's barcode scanner)
  servingSize: string | null;          // raw label text, e.g. "30 g (1 ONZ)"
  caloriesPerServing: number | null;
  proteinPerServingG: number | null;
  carbsPerServingG: number | null;
  fatPerServingG: number | null;
  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
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
    servingSize: null,
    caloriesPerServing: null, proteinPerServingG: null, carbsPerServingG: null, fatPerServingG: null,
    caloriesPer100g: null, proteinPer100g: null, carbsPer100g: null, fatPer100g: null,
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
    const n = p.nutriments ?? {};
    const num = (v: any): number | null => {
      if (typeof v === 'number' && !isNaN(v)) return v;
      const f = parseFloat(v);
      return isNaN(f) ? null : f;
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
      servingSize:         (p.serving_size ?? null) as string | null,
      caloriesPerServing:  num(n['energy-kcal_serving']),
      proteinPerServingG:  num(n['proteins_serving']),
      carbsPerServingG:    num(n['carbohydrates_serving']),
      fatPerServingG:      num(n['fat_serving']),
      caloriesPer100g:     num(n['energy-kcal_100g']),
      proteinPer100g:      num(n['proteins_100g']),
      carbsPer100g:        num(n['carbohydrates_100g']),
      fatPer100g:          num(n['fat_100g']),
    };
  } catch {
    return EMPTY;
  }
}
