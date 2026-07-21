import * as Notifications from 'expo-notifications';
import { ensureNotificationPermission } from './notifications';

function notifId(babyId: string, flavor: string) {
  return `food-retry-${babyId}-${flavor.toLowerCase().replace(/\s+/g, '_').slice(0, 30)}`;
}

export async function scheduleTryAgainReminder(
  babyId: string,
  babyName: string,
  brand: string,
  flavor: string,
  daysLater: number,
): Promise<void> {
  const ok = await ensureNotificationPermission();
  if (!ok) return;

  const fireAt = new Date(Date.now() + daysLater * 86_400_000);

  const variants = [
    {
      title: `Time to try ${flavor} again!`,
      body: `${babyName} might be ready to give ${brand} another shot. Babies often need 10–15 tries!`,
    },
    {
      title: `${babyName}'s food retry 🍽️`,
      body: `Remember that ${flavor} from ${daysLater === 1 ? 'yesterday' : `${daysLater} days ago`}? Worth trying again!`,
    },
    {
      title: `Patchy says: try again! 🐻`,
      body: `${flavor} didn't win ${babyName} over yet — but tastes can change. Give it another go?`,
    },
  ];
  const { title, body } = variants[Math.floor(Math.random() * variants.length)];

  await Notifications.scheduleNotificationAsync({
    identifier: notifId(babyId, flavor),
    content: { title, body, sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
    },
  });
}

export async function cancelTryAgainReminder(babyId: string, flavor: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notifId(babyId, flavor)).catch(() => {});
}
