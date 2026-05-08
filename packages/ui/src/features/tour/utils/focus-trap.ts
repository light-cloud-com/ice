/**
 * tour-5 — Soft focus trap for the tour popover.
 *
 * Listens for `Tab` / `Shift+Tab` keydown on a container and cycles
 * focus among the focusable descendants. Mouse clicks outside the
 * container are NOT intercepted — this is a "soft" trap, not a modal.
 * Tabbing back into the popover after a deliberate click-out keeps the
 * page interactive (per blueprint §3.7: tutorials sometimes want users
 * to type into the highlighted field).
 *
 * The keydown listener is bound on the container itself rather than on
 * `window` so multiple traps can coexist (a future "nested popover" or
 * a settings sheet inside a tour step). Locality also keeps the trap
 * out of the way of any unrelated keyboard handler the page already
 * installs at window scope.
 *
 * Focusables are re-queried on every keydown (not cached at install).
 * The popover's Back/Next buttons can flip between `disabled` true /
 * false as the user moves through steps — caching at install would
 * make the wrap target stale.
 *
 * Sources for selector list: WHATWG sequential focus navigation +
 * Radix UI's `useFocusGuards` reference list. We also exclude
 * `aria-hidden="true"` and `hidden` to match the spec definition of
 * "tabbable" rather than just "focusable".
 */

/** CSS selector for elements that can receive sequential focus. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export interface FocusTrapOptions {
  /** Element to focus on install. If absent, the first focusable inside container. */
  initialFocus?: HTMLElement;
  /** Element to focus on uninstall. If absent, no focus restoration. */
  returnFocus?: HTMLElement;
}

/**
 * Pure helper — exported for testability. Queries the container for
 * focusable descendants and filters out elements that the user agent
 * would skip in tab order (aria-hidden, [hidden]).
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  const out: HTMLElement[] = [];
  for (const el of Array.from(nodes)) {
    if (el.getAttribute('aria-hidden') === 'true') continue;
    if (el.hasAttribute('hidden')) continue;
    out.push(el);
  }
  return out;
}

/**
 * Installs a soft focus trap on `container`. Returns an uninstall
 * function. Idempotent — calling the returned function more than once
 * is safe (subsequent calls are no-ops).
 */
export function installFocusTrap(
  container: HTMLElement,
  options: FocusTrapOptions = {},
): () => void {
  const { initialFocus, returnFocus } = options;

  // Initial focus: explicit override > first focusable. If neither
  // exists, do nothing (the popover may have only static content).
  const initialFocusables = getFocusableElements(container);
  const target = initialFocus ?? initialFocusables[0];
  if (target) target.focus();

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;

    // Re-query on every keydown — disabled state can flip as the user
    // navigates the tour (e.g. "Back" disabled on step 0).
    const focusables = getFocusableElements(container);
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;

    const active = (container.ownerDocument ?? document).activeElement;

    if (event.shiftKey) {
      // Shift+Tab on the first focusable wraps to the last.
      if (active === first) {
        event.preventDefault();
        last.focus();
      }
      // Else: let the browser handle backward tab normally.
    } else {
      // Tab on the last focusable wraps to the first.
      if (active === last) {
        event.preventDefault();
        first.focus();
      }
      // Else: let the browser handle forward tab normally.
    }
  };

  container.addEventListener('keydown', onKeyDown);

  let uninstalled = false;
  return function uninstall(): void {
    if (uninstalled) return;
    uninstalled = true;
    container.removeEventListener('keydown', onKeyDown);

    // Restore focus only if returnFocus is still in the DOM. A common
    // bug source: the trigger element was unmounted while the popover
    // was open, and focusing a detached node throws in some browsers.
    if (returnFocus && returnFocus.isConnected) {
      returnFocus.focus();
    }
  };
}
