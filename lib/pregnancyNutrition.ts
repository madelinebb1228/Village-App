// Pregnancy-specific nutrition targets for the Nutrition & Hydration tracker.
// Trimester is derived via getPregnancyProgress() in lib/pregnancyData.ts —
// not duplicated here. Values are ACOG/USDA guidance, applied as adjustments
// on top of the existing (breastfeeding-aware) baseline goals.

export const PREGNANCY_CALORIE_BONUS: Record<1 | 2 | 3, number> = { 1: 0, 2: 340, 3: 450 };
export const PREGNANCY_PROTEIN_BONUS_G = 25; // ACOG ~1.1g/kg vs ~0.8g/kg baseline RDA
export const PREGNANCY_WATER_BONUS_OZ = 8;
export const CAFFEINE_LIMIT_MG_PREGNANT = 200; // ACOG daily limit

export function folateGoalMcg(isPregnant: boolean, bfType: string): number {
  if (isPregnant) return 600;
  if (bfType !== 'none') return 500;
  return 400;
}

export function ironGoalMg(isPregnant: boolean, bfType: string): number {
  if (isPregnant) return 27;
  if (bfType !== 'none') return 9; // iron needs drop during lactational amenorrhea
  return 18;
}
