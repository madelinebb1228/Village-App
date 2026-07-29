// Pure drive-then-stop detector for the Car Check reminder. No RN/Location imports —
// takes plain GPS speed samples in, returns the next state and whether to fire a
// notification. Kept separate from lib/carCheckTask.ts so the logic is easy to reason
// about (and unit-test) independent of expo-location/expo-task-manager.
//
// This can only ever infer "the phone stopped moving after apparently driving" — it has
// no way to know whether a child is actually in the car. It's a reminder, not a detector.

export type CarCheckPhase = 'idle' | 'driving' | 'cooldown';

export interface CarCheckState {
  phase: CarCheckPhase;
  drivingSince: number | null;   // epoch ms; set once speed first crosses the drive threshold
  stoppedSince: number | null;   // epoch ms; set once speed first drops below the stop threshold while driving
  cooldownUntil: number | null;  // epoch ms; set after a notification fires
  lastSpeedMph: number | null;
}

export const INITIAL_STATE: CarCheckState = {
  phase: 'idle',
  drivingSince: null,
  stoppedSince: null,
  cooldownUntil: null,
  lastSpeedMph: null,
};

export interface Thresholds {
  driveSpeedMph: number;   // sustained speed to confirm "driving started"
  driveConfirmMs: number;  // how long that speed must be sustained
  stopSpeedMph: number;    // speed below which we consider the car stopped
  stopConfirmMs: number;   // how long that low speed must be sustained before we call it a real stop
  cooldownMs: number;      // suppression window after a notification fires
}

// - 15 mph / 90s to confirm driving: filters out a single red light or parking-lot
//   maneuver. A shorter window would false-positive on GPS speed noise near roads.
// - 2 mph / 120s to confirm stopped: 2mph tolerates GPS jitter while parked; 120s
//   specifically guards against red lights and brief pre-parking stops, the main
//   false-positive case. Trade-off: a fast in-and-out errand under 2 minutes won't
//   have fired yet — the notification copy should say "always check anyway."
// - 5 minute cooldown: prevents an instant re-trigger from a GPS blip right after
//   the notification fires.
export const DEFAULT_THRESHOLDS: Thresholds = {
  driveSpeedMph: 15,
  driveConfirmMs: 90_000,
  stopSpeedMph: 2,
  stopConfirmMs: 120_000,
  cooldownMs: 300_000,
};

export interface CarCheckSample {
  speedMph: number | null; // null = no reading this sample (e.g. tunnel, parking garage)
  timestampMs: number;
}

export type CarCheckEvent = { type: 'no_action' } | { type: 'fire_notification' };

export function reduceCarCheck(
  state: CarCheckState,
  sample: CarCheckSample,
  thresholds: Thresholds,
): { next: CarCheckState; event: CarCheckEvent } {
  const { speedMph, timestampMs } = sample;
  const lastSpeedMph = speedMph ?? state.lastSpeedMph;

  // Cooldown: ignore everything until it expires, then fall through as if idle.
  if (state.phase === 'cooldown') {
    if (state.cooldownUntil != null && timestampMs < state.cooldownUntil) {
      return { next: { ...state, lastSpeedMph }, event: { type: 'no_action' } };
    }
    return reduceCarCheck(
      { ...state, phase: 'idle', drivingSince: null, stoppedSince: null, cooldownUntil: null },
      sample,
      thresholds,
    );
  }

  if (state.phase === 'idle') {
    if (speedMph == null) {
      return { next: { ...state, lastSpeedMph }, event: { type: 'no_action' } };
    }
    if (speedMph >= thresholds.driveSpeedMph) {
      const drivingSince = state.drivingSince ?? timestampMs;
      if (timestampMs - drivingSince >= thresholds.driveConfirmMs) {
        return {
          next: { phase: 'driving', drivingSince, stoppedSince: null, cooldownUntil: null, lastSpeedMph },
          event: { type: 'no_action' },
        };
      }
      return { next: { ...state, drivingSince, lastSpeedMph }, event: { type: 'no_action' } };
    }
    // Below drive threshold while idle — not building up a driving confirmation.
    return { next: { ...state, drivingSince: null, lastSpeedMph }, event: { type: 'no_action' } };
  }

  // phase === 'driving'
  if (speedMph == null) {
    // No reading — don't cancel an in-progress stop confirmation on a dropout.
    return { next: { ...state, lastSpeedMph }, event: { type: 'no_action' } };
  }
  if (speedMph < thresholds.stopSpeedMph) {
    const stoppedSince = state.stoppedSince ?? timestampMs;
    if (timestampMs - stoppedSince >= thresholds.stopConfirmMs) {
      return {
        next: {
          phase: 'cooldown',
          drivingSince: null,
          stoppedSince: null,
          cooldownUntil: timestampMs + thresholds.cooldownMs,
          lastSpeedMph,
        },
        event: { type: 'fire_notification' },
      };
    }
    return { next: { ...state, stoppedSince, lastSpeedMph }, event: { type: 'no_action' } };
  }
  // Still moving above the stop threshold — reset any in-progress stop confirmation.
  return { next: { ...state, stoppedSince: null, lastSpeedMph }, event: { type: 'no_action' } };
}
