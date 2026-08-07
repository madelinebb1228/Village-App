// Shared scheduling helpers for reminder features (diaper, car check, ...).

// True if `at` falls inside the [quietStart, quietEnd) window, in local device time.
export function isWithinQuietHours(
  at: Date,
  quietStart: number,
  quietEnd: number,
): boolean {
  const h = at.getHours();
  // quietStart > quietEnd means it spans midnight (e.g. 22 → 6)
  return quietStart > quietEnd
    ? h >= quietStart || h < quietEnd
    : h >= quietStart && h < quietEnd;
}

// Pushes a fire time past a quiet-hours window rather than letting it fire inside it.
export function adjustForQuietHours(
  fireAt: Date,
  quietStart: number,
  quietEnd: number,
): Date {
  if (!isWithinQuietHours(fireAt, quietStart, quietEnd)) return fireAt;

  const adjusted = new Date(fireAt);
  adjusted.setHours(quietEnd, 0, 0, 0);
  if (adjusted <= fireAt) adjusted.setDate(adjusted.getDate() + 1);
  return adjusted;
}
