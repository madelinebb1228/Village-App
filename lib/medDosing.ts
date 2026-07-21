// Weight-based dosing for infant Tylenol and Motrin.
// All calculations use published 10-15 mg/kg (acetaminophen) and 5-10 mg/kg (ibuprofen) guidelines.

export const TYLENOL_NAMES = ['acetaminophen', 'tylenol'];
export const MOTRIN_NAMES  = ['ibuprofen', 'motrin', 'advil'];

export function isWeightBased(name: string): boolean {
  const n = name.toLowerCase();
  return TYLENOL_NAMES.some(k => n.includes(k)) || MOTRIN_NAMES.some(k => n.includes(k));
}

export function isTylenol(name: string): boolean {
  const n = name.toLowerCase();
  return TYLENOL_NAMES.some(k => n.includes(k));
}

export function isMotrin(name: string): boolean {
  const n = name.toLowerCase();
  return MOTRIN_NAMES.some(k => n.includes(k));
}

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

export interface DoseInfo {
  mlMin: number;
  mlMax: number;
  mgMin: number;
  mgMax: number;
  concentration: string;
  frequencyHours: number;
  maxDosesPerDay: number;
  note?: string;
}

// Infant acetaminophen drops: 160 mg / 5 mL
export function calcAcetaminophenDose(weightLbs: number): DoseInfo | null {
  if (weightLbs < 6) return null; // too small to dose
  const kg    = weightLbs * 0.453592;
  const mgMin = Math.round(kg * 10);
  const mgMax = Math.round(kg * 15);
  const mlMin = roundHalf(mgMin / 32); // 160mg/5mL = 32mg/mL
  const mlMax = roundHalf(mgMax / 32);
  return { mlMin, mlMax, mgMin, mgMax, concentration: '160 mg/5 mL', frequencyHours: 4, maxDosesPerDay: 5 };
}

// Children's ibuprofen: 100 mg / 5 mL  (do NOT use before 6 months)
export function calcIbuprofenDose(weightLbs: number): DoseInfo | null {
  if (weightLbs < 12) return null; // rough 6-month minimum
  const kg    = weightLbs * 0.453592;
  const mgMin = Math.round(kg * 5);
  const mgMax = Math.round(kg * 10);
  const mlMin = roundHalf(mgMin / 20); // 100mg/5mL = 20mg/mL
  const mlMax = roundHalf(mgMax / 20);
  return {
    mlMin, mlMax, mgMin, mgMax,
    concentration: '100 mg/5 mL', frequencyHours: 6, maxDosesPerDay: 4,
    note: 'Not for babies under 6 months',
  };
}

export function getDoseInfo(name: string, weightLbs: number | null | undefined): DoseInfo | null {
  if (!weightLbs) return null;
  if (isTylenol(name)) return calcAcetaminophenDose(weightLbs);
  if (isMotrin(name))  return calcIbuprofenDose(weightLbs);
  return null;
}
