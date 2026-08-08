/**
 * Shared constants/helpers for accessibility work (touch targets, font scaling).
 * Kept dependency-free so it can be imported from plain style-factory functions.
 */

export const MIN_TOUCH_TARGET = 44;
export const MAX_FONT_SCALE = 1.6;

export interface HitSlop {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** hitSlop that pads a control of `size`px up to MIN_TOUCH_TARGET on each axis. */
export function hitSlopFor(size: number): HitSlop {
  const pad = Math.max(0, Math.ceil((MIN_TOUCH_TARGET - size) / 2));
  return { top: pad, bottom: pad, left: pad, right: pad };
}
