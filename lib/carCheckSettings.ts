import AsyncStorage from '@react-native-async-storage/async-storage';
import { CarCheckState, INITIAL_STATE } from './carCheckStateMachine';

// ─── Feature settings (per user/baby, mirrors diaper reminder's storage shape) ────

export interface CarCheckSettings {
  enabled: boolean;
  quietStart: number | null;
  quietEnd: number | null;
}

const DEFAULT_SETTINGS: CarCheckSettings = {
  enabled: false,
  quietStart: null,
  quietEnd: null,
};

function settingsKey(userId: string, babyId: string) {
  return `car_check_${userId}_${babyId}`;
}

export async function getCarCheckSettings(
  userId: string,
  babyId: string,
): Promise<CarCheckSettings> {
  try {
    const raw = await AsyncStorage.getItem(settingsKey(userId, babyId));
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveCarCheckSettings(
  userId: string,
  babyId: string,
  settings: CarCheckSettings,
): Promise<void> {
  await AsyncStorage.setItem(settingsKey(userId, babyId), JSON.stringify(settings));
}

// ─── Background-task state-machine persistence ────────────────────────────────
// The task can run in a headless JS context with no memory shared with the
// foreground app, so the detector's running state has to live here between
// invocations. Not per-baby-scoped — there's only ever one baby and one active
// "am I driving" concept per device.

const MACHINE_STATE_KEY = 'car_check_machine_state';

export async function loadMachineState(): Promise<CarCheckState> {
  try {
    const raw = await AsyncStorage.getItem(MACHINE_STATE_KEY);
    if (!raw) return INITIAL_STATE;
    return { ...INITIAL_STATE, ...JSON.parse(raw) };
  } catch {
    return INITIAL_STATE;
  }
}

export async function saveMachineState(state: CarCheckState): Promise<void> {
  await AsyncStorage.setItem(MACHINE_STATE_KEY, JSON.stringify(state));
}

// ─── Active profile cache ──────────────────────────────────────────────────────
// The headless background task has no React context and can't call Supabase
// auth, so it needs a plain on-device cache of "who is the active baby right
// now." Written by the app (CarCheckReminderCard) whenever userId/babyId/
// babyName are available.

const ACTIVE_PROFILE_KEY = 'car_check_active_profile';

export interface CarCheckActiveProfile {
  userId: string;
  babyId: string;
  babyName: string | null;
}

export async function saveActiveProfile(
  userId: string,
  babyId: string,
  babyName: string | null,
): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify({ userId, babyId, babyName }));
}

export async function getActiveProfile(): Promise<CarCheckActiveProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.userId || !parsed?.babyId) return null;
    return parsed;
  } catch {
    return null;
  }
}
