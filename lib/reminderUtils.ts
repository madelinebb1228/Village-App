// Shared scheduling helpers for reminder features (diaper, car check, ...).

// Pushes a fire time past a quiet-hours window rather than letting it fire inside it.
export function adjustForQuietHours(
  fireAt: Date,
  quietStart: number,
  quietEnd: number,
): Date {
  const h = fireAt.getHours();
  // quietStart > quietEnd means it spans midnight (e.g. 22 → 6)
  const inQuiet =
    quietStart > quietEnd
      ? h >= quietStart || h < quietEnd
      : h >= quietStart && h < quietEnd;

  if (!inQuiet) return fireAt;

  const adjusted = new Date(fireAt);
  adjusted.setHours(quietEnd, 0, 0, 0);
  if (adjusted <= fireAt) adjusted.setDate(adjusted.getDate() + 1);
  return adjusted;
}
