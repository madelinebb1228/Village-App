import { AccessibilityProvider, useAccessibility } from './AccessibilityContext';

/**
 * One-handed mode now lives inside AccessibilityContext. This module is kept as a
 * thin compatibility shim so existing consumers (App.tsx, OneHandedTray.tsx) don't
 * need to change their imports.
 */
export { AccessibilityProvider as OneHandedProvider };

export function useOneHanded(): { isOneHanded: boolean; toggleOneHanded: () => void } {
  const { isOneHanded, toggleOneHanded } = useAccessibility();
  return { isOneHanded, toggleOneHanded };
}
