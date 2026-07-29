// Shared postpartum-period cycle detection, used by PeriodReturnTracker and the insights engine.
// Heuristic: a new period "starts" on the first flow day after a 4+ day gap since the last flow day.
// This tolerates a skipped logging day mid-period without splitting one period into two.

const GAP_DAYS_FOR_NEW_PERIOD = 4;
const MS_PER_DAY = 86_400_000;

export interface FlowLogLike {
  logged_date: string;
  flow_level: string | null;
}

export function isFlowDay(l: FlowLogLike): boolean {
  return !!l.flow_level && l.flow_level !== 'none';
}

/** Returns the logged_date of the first day of each detected period, ascending. */
export function detectPeriodStarts(logs: FlowLogLike[]): string[] {
  const flowDays = [...logs]
    .filter(isFlowDay)
    .map(l => l.logged_date)
    .sort();

  const starts: string[] = [];
  let prevMs: number | null = null;

  for (const dateStr of flowDays) {
    const ms = new Date(dateStr).getTime();
    if (prevMs === null || (ms - prevMs) / MS_PER_DAY > GAP_DAYS_FOR_NEW_PERIOD) {
      starts.push(dateStr);
    }
    prevMs = ms;
  }

  return starts;
}

export interface CycleStats {
  periodStarts: string[];
  cycleLengths: number[];
  avgCycleLength: number | null;
  lastPeriodStart: string | null;
  predictedNextStart: string | null;
  cycleDay: number | null;
}

export function computeCycleStats(logs: FlowLogLike[]): CycleStats {
  const periodStarts = detectPeriodStarts(logs);
  const cycleLengths: number[] = [];
  for (let i = 1; i < periodStarts.length; i++) {
    const days = Math.round((new Date(periodStarts[i]).getTime() - new Date(periodStarts[i - 1]).getTime()) / MS_PER_DAY);
    cycleLengths.push(days);
  }

  const avgCycleLength = cycleLengths.length > 0
    ? Math.round(cycleLengths.reduce((s, v) => s + v, 0) / cycleLengths.length)
    : null;

  const lastPeriodStart = periodStarts.length > 0 ? periodStarts[periodStarts.length - 1] : null;

  const predictedNextStart = lastPeriodStart && avgCycleLength
    ? new Date(new Date(lastPeriodStart).getTime() + avgCycleLength * MS_PER_DAY).toISOString().slice(0, 10)
    : null;

  const cycleDay = lastPeriodStart
    ? Math.round((Date.now() - new Date(lastPeriodStart).getTime()) / MS_PER_DAY) + 1
    : null;

  return { periodStarts, cycleLengths, avgCycleLength, lastPeriodStart, predictedNextStart, cycleDay };
}
