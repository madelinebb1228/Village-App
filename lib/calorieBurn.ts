// Rough MET (Metabolic Equivalent of Task) based calorie-burn estimates for
// activities logged in the Movement tracker (mom_movement_logs table), plus
// the static breastfeeding calorie bonus used by the Nutrition tracker's
// goal calculation. MET values are approximate (Compendium of Physical
// Activities) — treat these as ballpark estimates, not precise measurements,
// and keep them in sync with the activity_type/intensity options in
// screens/MovementTracker.tsx.

const MET_TABLE: Record<string, Record<string, number>> = {
  walk:         { gentle: 2.8, moderate: 3.5, vigorous: 4.8 },
  yoga:         { gentle: 2.0, moderate: 3.0, vigorous: 4.0 },
  pelvic_floor: { gentle: 1.8, moderate: 2.0, vigorous: 2.3 },
  stretching:   { gentle: 2.3, moderate: 2.5, vigorous: 3.0 },
  swimming:     { gentle: 4.5, moderate: 6.0, vigorous: 9.8 },
  strength:     { gentle: 3.0, moderate: 5.0, vigorous: 6.0 },
  other:        { gentle: 2.5, moderate: 4.0, vigorous: 6.0 },
};

export function estimateCaloriesBurned(
  activityType: string,
  intensity: string | null,
  durationMinutes: number,
  weightLbs: number,
): number {
  if (!durationMinutes || !weightLbs) return 0;
  const mets = MET_TABLE[activityType] ?? MET_TABLE.other;
  const met = mets[intensity ?? 'moderate'] ?? mets.moderate;
  const weightKg = weightLbs * 0.453592;
  return met * weightKg * (durationMinutes / 60);
}

// Extra calories burned per day from milk production (ACOG/USDA guidance).
// Folded into the Nutrition tracker's calorie_goal at profile setup, and
// surfaced again as a visible line item on the calorie card.
export function bfCalorieBonus(bfType: string): number {
  if (bfType === 'exclusive') return 500;
  if (bfType === 'combo') return 300;
  return 0;
}
