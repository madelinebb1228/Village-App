// Shared notification-category identifiers for interactive action buttons.
// Split out from notificationActions.ts (which registers the actions and
// handles taps) so napSchedule.ts and feedNotifications.ts can tag their
// scheduled notifications with the right category without creating an
// import cycle (notificationActions.ts itself imports napSchedule.ts to
// perform the "Start timer" action).

export const FEED_REMINDER_CATEGORY = 'feed-reminder';
export const NAP_WINDOW_CATEGORY = 'nap-window';
