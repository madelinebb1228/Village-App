import { useWindowDimensions } from 'react-native';

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
} as const;

// `undefined` on phone (no artificial narrowing), the surface's column width
// otherwise. Spread onto a wrapping View's style along with `alignSelf: 'center', width: '100%'`.
export function maxWidthFor(width: number, surface: keyof typeof CONTENT_MAX_WIDTH): number | undefined {
  return width < BREAKPOINTS.tablet ? undefined : CONTENT_MAX_WIDTH[surface];
}
