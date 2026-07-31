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
  /** true when the weight is outside what any OTC children's dosing chart
   * covers — mlMin/mlMax/mgMin/mgMax are all 0 and must not be shown as a
   * dose. Caller must direct the parent to a doctor/pharmacist instead. */
  needsDoctorConsult?: boolean;
}

// Standard OTC children's dosing charts stop around 95 lbs and say "ask a
// doctor" beyond that — don't let weight-based scaling extrapolate past
// what any real dosing chart would ever print (guards against a typo'd
// weight entry, e.g. 80 lbs instead of 18, silently producing a dose).
const MAX_DOSING_WEIGHT_LBS = 95;

// Absolute per-dose ceilings, independent of weight scaling.
const ACETAMINOPHEN_MAX_SINGLE_DOSE_MG = 650;
const IBUPROFEN_MAX_SINGLE_DOSE_MG = 400;

const CONSULT_DOCTOR_NOTE =
  `Above ${MAX_DOSING_WEIGHT_LBS} lbs is outside standard children's dosing charts — ask a doctor or pharmacist for the right dose instead of using this calculator.`;

// Infant acetaminophen drops: 160 mg / 5 mL
export function calcAcetaminophenDose(weightLbs: number): DoseInfo | null {
  if (weightLbs < 6) return null; // too small to dose
  if (weightLbs > MAX_DOSING_WEIGHT_LBS) {
    return {
      mlMin: 0, mlMax: 0, mgMin: 0, mgMax: 0,
      concentration: '160 mg/5 mL', frequencyHours: 4, maxDosesPerDay: 5,
      needsDoctorConsult: true, note: CONSULT_DOCTOR_NOTE,
    };
  }
  const kg    = weightLbs * 0.453592;
  const mgMin = Math.min(Math.round(kg * 10), ACETAMINOPHEN_MAX_SINGLE_DOSE_MG);
  const mgMax = Math.min(Math.round(kg * 15), ACETAMINOPHEN_MAX_SINGLE_DOSE_MG);
  const mlMin = roundHalf(mgMin / 32); // 160mg/5mL = 32mg/mL
  const mlMax = roundHalf(mgMax / 32);
  return { mlMin, mlMax, mgMin, mgMax, concentration: '160 mg/5 mL', frequencyHours: 4, maxDosesPerDay: 5 };
}

// Children's ibuprofen: 100 mg / 5 mL  (do NOT use before 6 months)
export function calcIbuprofenDose(weightLbs: number): DoseInfo | null {
  if (weightLbs < 12) return null; // rough 6-month minimum
  if (weightLbs > MAX_DOSING_WEIGHT_LBS) {
    return {
      mlMin: 0, mlMax: 0, mgMin: 0, mgMax: 0,
      concentration: '100 mg/5 mL', frequencyHours: 6, maxDosesPerDay: 4,
      needsDoctorConsult: true, note: CONSULT_DOCTOR_NOTE,
    };
  }
  const kg    = weightLbs * 0.453592;
  const mgMin = Math.min(Math.round(kg * 5), IBUPROFEN_MAX_SINGLE_DOSE_MG);
  const mgMax = Math.min(Math.round(kg * 10), IBUPROFEN_MAX_SINGLE_DOSE_MG);
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
