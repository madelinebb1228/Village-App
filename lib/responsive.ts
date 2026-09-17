import { useCallback, useState } from 'react';
import { useWindowDimensions, LayoutChangeEvent } from 'react-native';

// Small, shared breakpoint/width system — not a layout framework. Screens use
// this instead of each inventing their own maxWidth number, so "does this
// count as phone/tablet/desktop" and "how wide should this surface's content
// column be" both have one answer across the app. Built on RN's own
// `useWindowDimensions` (no added dependency) and used identically on native
// and web — on native phones `width` is always well under `tablet`, so these
// never constrain a phone; they only kick in on tablets and wide web windows.

export const BREAKPOINTS = {
  tablet: 700,
  desktop: 1100,
} as const;

// Width of the persistent web sidebar (App.tsx's WebSidebar/sidebarAware).
// Shared here so anything that needs to lay out beside it — e.g.
// DesktopSecondaryHost — doesn't import it back out of App.tsx.
export const SIDEBAR_WIDTH = 230;

export type SizeClass = 'phone' | 'tablet' | 'desktop';

export interface Responsive {
  width: number;
  sizeClass: SizeClass;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** true on tablet or desktop — the common "not a phone" check. */
  isWide: boolean;
}

export function useResponsive(): Responsive {
  const { width } = useWindowDimensions();
  const sizeClass: SizeClass =
    width >= BREAKPOINTS.desktop ? 'desktop' : width >= BREAKPOINTS.tablet ? 'tablet' : 'phone';
  return {
    width,
    sizeClass,
    isPhone: sizeClass === 'phone',
    isTablet: sizeClass === 'tablet',
    isDesktop: sizeClass === 'desktop',
    isWide: sizeClass !== 'phone',
  };
}

// Per-surface reading-column widths. Different surfaces genuinely want
// different widths (a social feed reads better narrow; a discovery grid or a
// utility/timeline screen can use more of a wide window) — this is
// deliberately not one app-wide maxWidth.
export const CONTENT_MAX_WIDTH = {
  feed: 640,      // Home, PostDetail — a narrow, readable social column
  discover: 1000, // Discover — grids/carousels want more room
  track: 960,     // Track — utility/timeline surface
  profile: 760,   // Profile / PublicProfileSheet
  inbox: 820,     // Search, Messages, Notifications — list-style secondary surfaces
  form: 760,      // New Patch Request and other centered forms
} as const;

// `undefined` on phone (no artificial narrowing), the surface's column width
// otherwise. Spread onto a wrapping View's style along with `alignSelf: 'center', width: '100%'`.
export function maxWidthFor(width: number, surface: keyof typeof CONTENT_MAX_WIDTH): number | undefined {
  return width < BREAKPOINTS.tablet ? undefined : CONTENT_MAX_WIDTH[surface];
}

// A section's real rendered width (after the sidebar + centered maxWidth
// column math on web) can't be reliably derived from useWindowDimensions
// alone — it depends on where the current window width falls relative to
// the sidebar and the surface's own CONTENT_MAX_WIDTH. This measures the
// actual rendered width of whatever View it's attached to via onLayout, so
// a row of cards can size itself to what's really available. Width is 0
// until the first layout pass — callers should treat that as "not measured
// yet" and fall back to a sensible fixed-width layout.
export function useMeasuredWidth(): { width: number; onLayout: (e: LayoutChangeEvent) => void } {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(prev => (Math.abs(prev - w) > 1 ? w : prev));
  }, []);
  return { width, onLayout };
}

export interface FitCardsResult {
  /** How many same-size cards to actually render. */
  visibleCount: number;
  /** Width to give each visible card. */
  cardWidth: number;
}

// Sizes a row of same-width cards to the real available width instead of a
// brittle fixed width: grows cards (up to maxWidth) to fill the row when
// there are few items — so desktop doesn't show 3 narrow cards in a mostly
// empty row — and caps how many are shown (down to minWidth) when there are
// more items than comfortably fit, so a card is never partially clipped at
// the edge. `availableWidth <= 0` (not measured yet) returns every item at
// `targetWidth` for the caller's default/fallback render.
export function fitCardsToWidth(
  availableWidth: number,
  itemCount: number,
  opts: { gap: number; minWidth: number; maxWidth: number; targetWidth: number }
): FitCardsResult {
  const { gap, minWidth, maxWidth, targetWidth } = opts;
  if (availableWidth <= 0 || itemCount <= 0) return { visibleCount: itemCount, cardWidth: targetWidth };
  const maxFitAtMin = Math.max(1, Math.floor((availableWidth + gap) / (minWidth + gap)));
  const visibleCount = Math.min(itemCount, maxFitAtMin);
  const rawWidth = Math.floor((availableWidth - gap * (visibleCount - 1)) / visibleCount);
  const cardWidth = Math.min(maxWidth, Math.max(minWidth, rawWidth));
  return { visibleCount, cardWidth };
}
