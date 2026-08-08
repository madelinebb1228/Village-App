import { BaseIntegration } from './BaseIntegration';
import { GoogleCalendarIntegration } from './googleCalendar';
import { IntegrationMeta, ServiceName } from './types';

// Drives the marketplace UI — every service Parent Patch plans to support,
// whether or not it's implemented yet. `available: false` renders as
// "Coming soon" in IntegrationsScreen.
export const INTEGRATION_CATALOG: IntegrationMeta[] = [
  {
    serviceName: 'google_calendar',
    label: 'Google Calendar',
    icon: '📅',
    description: 'Sync appointments, vaccines, and reminders with a dedicated "Parent Patch" calendar.',
    permissions: [
      'Create and manage a calendar created by this app',
      'Read and write events on that calendar only — not your personal calendars',
    ],
    available: true,
  },
  {
    serviceName: 'apple_health',
    label: 'Apple Health',
    icon: '❤️',
    description: 'Pull your sleep, steps, heart rate, and cycle data. Once connected, workouts and steps fill in your Movement tracker on the You tab automatically.',
    permissions: [
      'Read sleep, steps, heart rate, and menstrual cycle data',
      'Write baby weight and breastfeeding minutes (optional, off by default)',
    ],
    available: false,
  },
  {
    serviceName: 'google_fit',
    label: 'Google Fit',
    icon: '❤️',
    description: 'Pull your sleep, steps, and heart rate. Once connected, workouts and steps fill in your Movement tracker on the You tab automatically.',
    permissions: ['Read sleep, steps, and heart rate data'],
    available: false,
  },
  {
    serviceName: 'google_photos',
    label: 'Google Photos',
    icon: '🖼️',
    description: 'Find recent photos of baby to suggest for journal entries.',
    permissions: ['Read photos you choose to share', 'Face detection runs on-device where possible'],
    available: false,
  },
  {
    serviceName: 'icloud_photos',
    label: 'iCloud Photos',
    icon: '🖼️',
    description: 'Find recent photos of baby to suggest for journal entries.',
    permissions: ['Read photos you choose to share'],
    available: false,
  },
  {
    serviceName: 'hatch',
    label: 'Hatch',
    icon: '🌙',
    description: "Start a wind-down routine when baby's wake window is ending.",
    permissions: ['Read sound machine / sleep program state'],
    available: false,
  },
  {
    serviceName: 'nanit',
    label: 'Nanit',
    icon: '📷',
    description: "Bring sleep session data into Parent Patch's sleep tracker.",
    permissions: ['Read sleep session data'],
    available: false,
  },
];

const instances: Partial<Record<ServiceName, BaseIntegration>> = {
  google_calendar: new GoogleCalendarIntegration(),
};

export function getIntegration(serviceName: ServiceName): BaseIntegration | null {
  return instances[serviceName] ?? null;
}
