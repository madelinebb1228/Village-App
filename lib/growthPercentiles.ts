// Shared WHO growth-percentile reference data and math (0–24 months).
// Used by GrowthTracker.tsx (display) and insightsEngine.ts (trend detection)
// so there's one source of truth for the reference tables and percentile formula.

export type GenderKey = 'boy' | 'girl';

export const WHO_WEIGHT: Record<GenderKey, { m: number[]; sd: number[] }> = {
  boy: {
    m:  [3.3,4.5,5.6,6.4,7.0,7.5,7.9,8.3,8.6,8.9,9.2,9.4,9.6,9.9,10.1,10.3,10.5,10.7,10.9,11.1,11.3,11.5,11.8,12.0,12.2],
    sd: [0.45,0.55,0.62,0.66,0.70,0.72,0.73,0.74,0.75,0.76,0.77,0.78,0.79,0.80,0.82,0.83,0.84,0.85,0.87,0.88,0.89,0.91,0.93,0.94,0.95],
  },
  girl: {
    m:  [3.2,4.2,5.1,5.8,6.4,6.9,7.3,7.6,7.9,8.2,8.5,8.7,8.9,9.2,9.4,9.6,9.8,10.0,10.2,10.4,10.6,10.9,11.1,11.3,11.5],
    sd: [0.40,0.52,0.58,0.62,0.65,0.67,0.69,0.70,0.72,0.73,0.74,0.75,0.76,0.78,0.79,0.80,0.81,0.82,0.83,0.85,0.86,0.88,0.89,0.90,0.91],
  },
};

export const WHO_HEIGHT: Record<GenderKey, { m: number[]; sd: number[] }> = {
  boy: {
    m:  [49.9,54.7,58.4,61.4,63.9,65.9,67.6,69.2,70.6,72.0,73.3,74.5,75.7,76.9,78.0,79.1,80.2,81.2,82.3,83.2,84.2,85.1,86.0,86.9,87.8],
    sd: [1.9,2.0,2.1,2.1,2.2,2.2,2.2,2.3,2.3,2.3,2.4,2.4,2.4,2.5,2.5,2.5,2.6,2.6,2.6,2.7,2.7,2.7,2.8,2.8,2.8],
  },
  girl: {
    m:  [49.1,53.7,57.1,59.8,62.1,64.0,65.7,67.3,68.7,70.1,71.5,72.8,74.0,75.2,76.4,77.5,78.6,79.7,80.7,81.7,82.7,83.7,84.6,85.5,86.4],
    sd: [1.9,2.0,2.0,2.1,2.1,2.2,2.2,2.2,2.3,2.3,2.3,2.4,2.4,2.4,2.5,2.5,2.5,2.6,2.6,2.6,2.7,2.7,2.7,2.7,2.8],
  },
};

export const WHO_HEAD: Record<GenderKey, { m: number[]; sd: number[] }> = {
  boy: {
    m:  [34.5,37.3,39.1,40.5,41.6,42.6,43.3,44.0,44.5,45.0,45.5,45.9,46.3,46.6,46.9,47.2,47.4,47.7,47.9,48.1,48.3,48.5,48.7,48.9,49.1],
    sd: [1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2],
  },
  girl: {
    m:  [33.9,36.5,38.3,39.5,40.6,41.5,42.2,42.8,43.4,43.8,44.2,44.6,44.9,45.2,45.5,45.8,46.1,46.3,46.5,46.7,46.9,47.1,47.3,47.5,47.7],
    sd: [1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2,1.2],
  },
};

function normalCDF(z: number): number {
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return 0.5 * (1 + sign * y);
}

export function calcPercentile(value: number, ageMonths: number, data: { m: number[]; sd: number[] }): number {
  const idx = Math.min(Math.round(ageMonths), data.m.length - 1);
  const z = (value - data.m[idx]) / data.sd[idx];
  return Math.round(normalCDF(z) * 100);
}

export function ageInMonthsAt(birthDate: string, atDate: string): number {
  const b = new Date(birthDate), d = new Date(atDate);
  return Math.max(0, (d.getFullYear() - b.getFullYear()) * 12 + (d.getMonth() - b.getMonth()));
}

export const lbsToKg = (v: number) => v * 0.453592;
export const inToCm  = (v: number) => v * 2.54;
export const kgToLbs = (v: number) => v / 0.453592;
export const cmToIn  = (v: number) => v / 2.54;

export function percentileContext(p: number): { label: string; color: string } {
  if (p <= 3)  return { label: '⚠️ Below 3rd — discuss with doctor', color: '#dc2626' };
  if (p <= 10) return { label: 'Low — mention at next visit',        color: '#f59e0b' };
  if (p >= 97) return { label: '⚠️ Above 97th — discuss with doctor', color: '#dc2626' };
  if (p >= 90) return { label: 'High — mention at next visit',       color: '#f59e0b' };
  return { label: 'Healthy range ✓', color: '#16a34a' };
}
