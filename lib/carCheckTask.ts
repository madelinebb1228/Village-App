import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { reduceCarCheck, DEFAULT_THRESHOLDS } from './carCheckStateMachine';
import { getActiveProfile, getCarCheckSettings, loadMachineState, saveMachineState } from './carCheckSettings';
import { fireCarCheckNotification } from './carCheckNotifications';

export const CAR_CHECK_TASK = 'car-check-location-task';

const MPS_TO_MPH = 2.23694;

// Must be called at module scope (not inside a component/hook) so the OS can find
// this task when it relaunches the app headlessly in the background. This module
// is imported for its side effect at the very top of App.tsx.
TaskManager.defineTask(CAR_CHECK_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[carCheckTask] error:', error);
    return;
  }
  if (!data) return;

  const profile = await getActiveProfile();
  if (!profile) return;

  const settings = await getCarCheckSettings(profile.userId, profile.babyId);
  if (!settings.enabled) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  let state = await loadMachineState();

  for (const loc of locations) {
    const speedMph = loc.coords.speed != null && loc.coords.speed >= 0 ? loc.coords.speed * MPS_TO_MPH : null;
    const { next, event } = reduceCarCheck(
      state,
      { speedMph, timestampMs: loc.timestamp },
      DEFAULT_THRESHOLDS,
    );
    state = next;
    if (event.type === 'fire_notification') {
      await fireCarCheckNotification(profile.babyName ?? 'Baby', settings);
    }
  }

  await saveMachineState(state);
});

export async function startCarCheckTracking(): Promise<void> {
  if (Platform.OS === 'web') return;
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(CAR_CHECK_TASK).catch(() => false);
  if (alreadyStarted) return;

  await Location.startLocationUpdatesAsync(CAR_CHECK_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15_000,
    distanceInterval: 0,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: 'Parent Patch',
      notificationBody: 'Watching for stops so it can remind you to check the back seat.',
    },
  });
}

export async function stopCarCheckTracking(): Promise<void> {
  if (Platform.OS === 'web') return;
  const started = await Location.hasStartedLocationUpdatesAsync(CAR_CHECK_TASK).catch(() => false);
  if (!started) return;
  await Location.stopLocationUpdatesAsync(CAR_CHECK_TASK);
}

export async function isCarCheckTrackingActive(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return Location.hasStartedLocationUpdatesAsync(CAR_CHECK_TASK).catch(() => false);
}
