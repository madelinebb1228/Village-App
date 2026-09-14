import { Platform } from 'react-native';

// Web only: react-native-web's root/body don't scroll (each screen owns its
// own ScrollView instead), so the browser's native arrow-key/PageUp/PageDown
// scrolling only works while keyboard focus sits inside that screen's
// ScrollView. Anything that can leave focus on <body> — initial load, a tab
// switch, closing a modal — silently breaks keyboard scrolling until the
// user manually clicks back into the feed. `data-scroll-root` marks each
// screen's scrollable node so focus can be restored to whichever one is
// currently visible (other tabs stay mounted-but-hidden by React Navigation).
export const SCROLL_ROOT_ATTR = 'data-scroll-root';

// React Navigation marks an inactive tab screen's container with
// aria-hidden="true" for accessibility, but leaves it fully laid out —
// so offsetParent stays non-null and it still passes as "visible" by that
// check alone. When more than one tab has been visited, one of these
// inactive-but-laid-out screens can end up ahead of the real one in
// document order, so `.find()` picks the wrong root and scrolling silently
// no-ops on the screen actually on screen.
function isAriaHidden(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node) {
    if (node.getAttribute('aria-hidden') === 'true') return true;
    node = node.parentElement;
  }
  return false;
}

function visibleScrollRoot(): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[${SCROLL_ROOT_ATTR}]`));
  return all.find(el => el.offsetParent !== null && !isAriaHidden(el)) ?? null;
}

// react-native-web's <Modal> always appends a portal <div> straight to
// document.body (see .../Modal/ModalPortal.js) — one per <Modal> in the
// tree, present whether that modal is open or not, and never inside #root.
// role="dialog" looked like the obvious open/closed signal (ModalContent
// only sets it once RN Web's own onShow fires) but that only fires from a
// CSS animationend event, which this project's own test harness sometimes
// never sees — too fragile to gate a keyboard handler on. The reliable
// signal is geometry instead: ModalAnimation (.../Modal/ModalAnimation.js)
// renders nothing at all while fully closed, and a position:fixed,
// viewport-covering div while open or mid-close-animation — real layout,
// not dependent on any callback firing.
function isModalOpen(): boolean {
  return Array.from(document.body.children).some(portal => {
    if (portal.id === 'root') return false; // the app itself, not a modal portal
    const inner = portal.firstElementChild as HTMLElement | null;
    if (!inner) return false; // ModalAnimation rendered null — this modal is closed
    const r = inner.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

// Only takes focus when nothing more specific already holds it, so it never
// steals focus from a text input, an open modal's own controls, etc.
//
// Called right after the setState that closes a modal — at that instant the
// modal (and whatever inside it triggered the close) is still mounted and
// still focused, so the check below would see that, not <body>, and bail.
// Deferring one tick lets React actually unmount the modal first; the
// browser auto-blurs a focused element when it's removed from the DOM, so
// by the time this runs, focus has already fallen back to <body>.
export function restoreScrollFocus() {
  if (Platform.OS !== 'web') return;
  if (typeof document === 'undefined') return;
  setTimeout(() => {
    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement) return;
    visibleScrollRoot()?.focus();
  }, 0);
}

// ─── Keyboard-scroll fallback ───────────────────────────────────────────────
//
// Focus-based scrolling (tabIndex + restoreScrollFocus above) turned out not
// to be reliable on real hardware: any ordinary click on a real button moves
// real browser focus onto that button (unlike this project's own automated
// testing, where synthetic clicks often didn't), and plenty of everyday
// actions — clicking a sidebar tab, liking a post — leave focus on an
// element that either isn't a descendant of the scroll root at all (the
// sidebar lives in a separate part of the tree) or whose scroll-on-arrow-key
// behavior can't be verified to bubble up reliably across browsers. Rather
// than keep chasing focus placement, this handles the keys directly: one
// listener, installed once at the app root, that scrolls whichever screen's
// ScrollView is currently visible — independent of what has focus.
const SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End']);
const ARROW_STEP = 40;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function handleKeydown(e: KeyboardEvent) {
  if (!SCROLL_KEYS.has(e.key)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return; // leave OS/browser shortcuts alone
  if (isTypingTarget(e.target)) return; // let inputs/textareas move their own caret
  if (isModalOpen()) return; // a full-screen sheet is up — don't scroll the hidden screen behind it

  const root = visibleScrollRoot();
  if (!root) return;
  if (root.scrollHeight <= root.clientHeight) return; // nothing to scroll

  const max = root.scrollHeight - root.clientHeight;
  let next = root.scrollTop;
  switch (e.key) {
    case 'ArrowDown': next += ARROW_STEP; break;
    case 'ArrowUp':   next -= ARROW_STEP; break;
    case 'PageDown':  next += root.clientHeight * 0.85; break;
    case 'PageUp':    next -= root.clientHeight * 0.85; break;
    case 'Home':      next = 0; break;
    case 'End':       next = max; break;
  }
  next = Math.max(0, Math.min(max, next));
  if (next === root.scrollTop) return; // already at the edge — let the browser do whatever it wants

  root.scrollTop = next;
  e.preventDefault();
}

let installed = false;

// Call once, at the app root. Safe to call more than once — it's a no-op
// after the first call, so remounts (e.g. Fast Refresh) can't stack up
// duplicate listeners. Not tied to any single screen's mount/unmount, so
// switching tabs neither loses it nor duplicates it, and it only ever
// touches the currently-visible scroll root, never a hidden tab's.
export function installWebKeyboardScrollFallback() {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined') return;
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', handleKeydown, true);
}
