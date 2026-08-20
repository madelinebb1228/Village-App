import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Collapse state for a tracker widget, persisted across app restarts so a
 * tracker a parent collapsed stays collapsed next time they open the app.
 * The third return value force-sets collapse state directly (e.g. a tracker
 * auto-expanding itself when the user starts an active session). */
export function useCollapsed(storageKey: string, defaultCollapsed = false): [boolean, () => void, (next: boolean) => void] {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    AsyncStorage.getItem(storageKey).then(v => { if (v != null) setCollapsed(v === '1'); });
  }, [storageKey]);

  function set(next: boolean) {
    setCollapsed(next);
    AsyncStorage.setItem(storageKey, next ? '1' : '0').catch(() => {});
  }

  function toggle() {
    setCollapsed(v => {
      const next = !v;
      AsyncStorage.setItem(storageKey, next ? '1' : '0').catch(() => {});
      return next;
    });
  }

  return [collapsed, toggle, set];
}
