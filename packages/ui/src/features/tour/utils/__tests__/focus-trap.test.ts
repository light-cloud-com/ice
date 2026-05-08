/**
 * tour-5 — Focus trap tests.
 *
 * Runs in node-only vitest (no jsdom). The test harness builds a
 * tiny mock DOM that satisfies exactly the surface area the source
 * touches — `querySelectorAll`, `getAttribute`, `hasAttribute`,
 * `addEventListener` / `removeEventListener`, `focus()`, `isConnected`,
 * `ownerDocument.activeElement`. This is roughly 60 lines of harness;
 * jsdom would add 100ms+ per file plus a polyfill that we do not need
 * (see learning `stubbing-window-and-keyboardevent-for-node-env-keydown-listener-tests`).
 *
 * Coverage goals (blueprint §6/tour-5):
 *   1. Tab on last focusable → wraps to first.
 *   2. Shift+Tab on first → wraps to last.
 *   3. Initial focus respects `initialFocus`.
 *   4. Initial focus falls back to first focusable when not provided.
 *   5. Uninstall restores focus to `returnFocus`.
 *   6. Empty container → no-op, no throw.
 *   7. Reinstall on changed container is safe.
 *   8. `aria-hidden="true"` and `hidden` excluded from focusables.
 *   9. `tabindex="-1"` excluded.
 *   10. "Soft" semantics — trap does not intercept clicks.
 *   11. Tab in middle of focusable list → no preventDefault.
 *   12. Uninstall is idempotent.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getFocusableElements, installFocusTrap } from '../focus-trap';

// ─── Mock DOM harness ──────────────────────────────────────────────

interface FakeElement {
  // The source reads these; tests configure them per fixture.
  tagName: string;
  attrs: Record<string, string>;
  isConnected: boolean;
  ownerDocument: FakeDocument;
  // querySelectorAll matches by tag/attribute hints (string parser is
  // overkill for our selector list — we just use the fixture's tag +
  // disabled / tabindex props directly).
  matchableSelectors: string[];
  // addEventListener / removeEventListener / dispatchEvent.
  listeners: Map<string, Set<(e: KeyboardEvent) => void>>;
  // Spy: how many times .focus() was called on this element.
  focusCount: number;
  // Identifier for assertions.
  label: string;
}

interface FakeDocument {
  activeElement: FakeElement | null;
}

function makeDoc(): FakeDocument {
  return { activeElement: null };
}

interface MakeElOpts {
  selectors?: string[]; // e.g. ['button:not([disabled])']
  attrs?: Record<string, string>;
  disabled?: boolean;
  tabIndex?: number;
  ariaHidden?: boolean;
  hidden?: boolean;
  isConnected?: boolean;
}

function makeEl(label: string, doc: FakeDocument, opts: MakeElOpts = {}): FakeElement {
  const attrs: Record<string, string> = { ...(opts.attrs ?? {}) };
  if (opts.disabled) attrs.disabled = '';
  if (opts.tabIndex !== undefined) attrs.tabindex = String(opts.tabIndex);
  if (opts.ariaHidden) attrs['aria-hidden'] = 'true';
  if (opts.hidden) attrs.hidden = '';

  // Default selectors: every focusable starts as a button (matches
  // 'button:not([disabled])'). Caller can override.
  const matchableSelectors = opts.selectors ?? ['button:not([disabled])'];

  const el: FakeElement = {
    tagName: 'BUTTON',
    attrs,
    isConnected: opts.isConnected !== false,
    ownerDocument: doc,
    matchableSelectors,
    listeners: new Map(),
    focusCount: 0,
    label,
  };

  // Attach DOM-like methods directly so every FakeElement coming back
  // out of querySelectorAll already satisfies the HTMLElement surface
  // the source touches. Bound to `el` via closure — `this` inside the
  // method bodies is the FakeElement object even after a wrap-cast.
  Object.assign(el, {
    getAttribute(name: string): string | null {
      return el.attrs[name] ?? null;
    },
    hasAttribute(name: string): boolean {
      return name in el.attrs;
    },
    focus(): void {
      el.focusCount += 1;
      el.ownerDocument.activeElement = el;
    },
    addEventListener(type: string, listener: (e: KeyboardEvent) => void): void {
      let set = el.listeners.get(type);
      if (!set) {
        set = new Set();
        el.listeners.set(type, set);
      }
      set.add(listener);
    },
    removeEventListener(type: string, listener: (e: KeyboardEvent) => void): void {
      const set = el.listeners.get(type);
      if (set) set.delete(listener);
    },
  });

  return el;
}

/** Sugar — every FakeElement already carries the HTMLElement surface. */
function asHTMLElement(el: FakeElement): HTMLElement {
  return el as unknown as HTMLElement;
}

/**
 * Container helper: holds children and dispatches keydown events to
 * registered listeners. `querySelectorAll` returns children whose
 * `matchableSelectors` array includes the requested selector AND
 * which match the attribute filters in the source (we only need the
 * full source selector to round-trip — children declare their own
 * selector list).
 */
interface FakeContainer extends FakeElement {
  children: FakeElement[];
}

function makeContainer(doc: FakeDocument, children: FakeElement[]): FakeContainer {
  const c = makeEl('container', doc) as FakeContainer;
  c.children = children;
  Object.assign(c, {
    querySelectorAll<T extends HTMLElement>(selector: string): NodeListOf<T> {
      // Match the full comma-joined selector by splitting on commas
      // and checking if any of the child's declared selectors falls
      // inside that union. Child declares its single best-fit selector
      // (e.g. 'button:not([disabled])'); a 'tabindex="-1"' element
      // declares no selectors so it's never returned (matches source
      // behavior — the selector itself excludes [tabindex="-1"]).
      const requested = selector.split(',').map((s) => s.trim());
      const matches = c.children.filter((child) =>
        child.matchableSelectors.some((sel) => requested.includes(sel)),
      );
      return Array.from(matches as unknown as T[]) as unknown as NodeListOf<T>;
    },
  });
  return c;
}

/** Sugar — FakeContainer already carries the HTMLElement+querySelectorAll surface. */
function asContainerEl(c: FakeContainer): HTMLElement {
  return c as unknown as HTMLElement;
}

/** Construct a `KeyboardEvent`-like object for `dispatch`. */
function fakeKeyEvent(key: string, shiftKey = false): KeyboardEvent {
  let prevented = false;
  return {
    key,
    shiftKey,
    preventDefault: () => {
      prevented = true;
    },
    get defaultPrevented(): boolean {
      return prevented;
    },
  } as unknown as KeyboardEvent;
}

/** Fire all listeners on a container for a given event type. */
function dispatchKey(c: FakeContainer, event: KeyboardEvent): void {
  const set = c.listeners.get('keydown');
  if (!set) return;
  for (const fn of set) fn(event);
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('focus-trap', () => {
  let doc: FakeDocument;
  let originalDocument: Document | undefined;

  beforeEach(() => {
    doc = makeDoc();
    // Source falls back to a global `document` when an element has no
    // ownerDocument. Stub it so the `??` branch resolves to the test
    // doc instead of the real (undefined in node) `document`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    originalDocument = (globalThis as any).document;
    vi.stubGlobal('document', doc);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).document = originalDocument;
  });

  // ─── getFocusableElements (pure) ─────────────────────────────────

  describe('getFocusableElements', () => {
    it('returns all matching focusable descendants', () => {
      const a = makeEl('a', doc);
      const b = makeEl('b', doc);
      const c = makeContainer(doc, [a, b]);
      const result = getFocusableElements(asContainerEl(c));
      expect(result).toHaveLength(2);
      expect((result[0] as unknown as FakeElement).label).toBe('a');
      expect((result[1] as unknown as FakeElement).label).toBe('b');
    });

    it('excludes elements with aria-hidden="true"', () => {
      const visible = makeEl('visible', doc);
      const hidden = makeEl('hidden', doc, { ariaHidden: true });
      const c = makeContainer(doc, [visible, hidden]);
      const result = getFocusableElements(asContainerEl(c));
      expect(result).toHaveLength(1);
      expect((result[0] as unknown as FakeElement).label).toBe('visible');
    });

    it('excludes elements with the hidden attribute', () => {
      const shown = makeEl('shown', doc);
      const inert = makeEl('inert', doc, { hidden: true });
      const c = makeContainer(doc, [shown, inert]);
      const result = getFocusableElements(asContainerEl(c));
      expect(result).toHaveLength(1);
      expect((result[0] as unknown as FakeElement).label).toBe('shown');
    });

    it('excludes tabindex="-1" elements (never matched by selector)', () => {
      const focusable = makeEl('focusable', doc);
      // A child whose only declared selector is the [tabindex] form
      // with -1 — by construction it carries no entry in the
      // matchableSelectors array, so querySelectorAll skips it.
      const skipped = makeEl('skipped', doc, { tabIndex: -1, selectors: [] });
      const c = makeContainer(doc, [focusable, skipped]);
      const result = getFocusableElements(asContainerEl(c));
      expect(result).toHaveLength(1);
      expect((result[0] as unknown as FakeElement).label).toBe('focusable');
    });

    it('returns an empty array when the container has no focusables', () => {
      const c = makeContainer(doc, []);
      const result = getFocusableElements(asContainerEl(c));
      expect(result).toEqual([]);
    });
  });

  // ─── installFocusTrap: initial focus ──────────────────────────────

  describe('initial focus', () => {
    it('focuses initialFocus on install when provided', () => {
      const a = makeEl('a', doc);
      const b = makeEl('b', doc);
      const c = makeContainer(doc, [a, b]);
      const initialEl = asHTMLElement(b);
      installFocusTrap(asContainerEl(c), { initialFocus: initialEl });
      expect(b.focusCount).toBe(1);
      expect(a.focusCount).toBe(0);
      expect(doc.activeElement).toBe(b);
    });

    it('falls back to the first focusable when initialFocus is not provided', () => {
      const a = makeEl('a', doc);
      const b = makeEl('b', doc);
      const c = makeContainer(doc, [a, b]);
      installFocusTrap(asContainerEl(c));
      expect(a.focusCount).toBe(1);
      expect(b.focusCount).toBe(0);
      expect(doc.activeElement).toBe(a);
    });

    it('is a no-op when the container has no focusables AND no initialFocus', () => {
      const c = makeContainer(doc, []);
      // Should not throw, should not mutate activeElement.
      expect(() => installFocusTrap(asContainerEl(c))).not.toThrow();
      expect(doc.activeElement).toBeNull();
    });
  });

  // ─── installFocusTrap: tab cycling ────────────────────────────────

  describe('tab cycling', () => {
    it('Tab on the last focusable wraps to the first', () => {
      const first = makeEl('first', doc);
      const middle = makeEl('middle', doc);
      const last = makeEl('last', doc);
      const c = makeContainer(doc, [first, middle, last]);
      installFocusTrap(asContainerEl(c));
      expect(doc.activeElement).toBe(first); // initial

      // Simulate the user reaching the last element.
      doc.activeElement = last;
      const event = fakeKeyEvent('Tab');
      dispatchKey(c, event);

      expect(event.defaultPrevented).toBe(true);
      expect(doc.activeElement).toBe(first);
      expect(first.focusCount).toBe(2); // initial + wrap
    });

    it('Shift+Tab on the first focusable wraps to the last', () => {
      const first = makeEl('first', doc);
      const middle = makeEl('middle', doc);
      const last = makeEl('last', doc);
      const c = makeContainer(doc, [first, middle, last]);
      installFocusTrap(asContainerEl(c));
      // Initial focus already on first — exactly the wrap-trigger state.
      expect(doc.activeElement).toBe(first);

      const event = fakeKeyEvent('Tab', /* shiftKey */ true);
      dispatchKey(c, event);

      expect(event.defaultPrevented).toBe(true);
      expect(doc.activeElement).toBe(last);
      expect(last.focusCount).toBe(1);
    });

    it('Tab in the middle of the list lets the browser handle it', () => {
      const first = makeEl('first', doc);
      const middle = makeEl('middle', doc);
      const last = makeEl('last', doc);
      const c = makeContainer(doc, [first, middle, last]);
      installFocusTrap(asContainerEl(c));
      doc.activeElement = middle;

      const event = fakeKeyEvent('Tab');
      dispatchKey(c, event);

      expect(event.defaultPrevented).toBe(false);
      // Source did not call .focus() — middle stayed where it was.
      expect(doc.activeElement).toBe(middle);
    });

    it('Shift+Tab in the middle of the list lets the browser handle it', () => {
      const first = makeEl('first', doc);
      const middle = makeEl('middle', doc);
      const last = makeEl('last', doc);
      const c = makeContainer(doc, [first, middle, last]);
      installFocusTrap(asContainerEl(c));
      doc.activeElement = middle;

      const event = fakeKeyEvent('Tab', true);
      dispatchKey(c, event);

      expect(event.defaultPrevented).toBe(false);
      expect(doc.activeElement).toBe(middle);
    });

    it('non-Tab keys are ignored entirely', () => {
      const a = makeEl('a', doc);
      const b = makeEl('b', doc);
      const c = makeContainer(doc, [a, b]);
      installFocusTrap(asContainerEl(c));
      doc.activeElement = b;

      const event = fakeKeyEvent('Enter');
      dispatchKey(c, event);

      expect(event.defaultPrevented).toBe(false);
      expect(doc.activeElement).toBe(b);
    });

    it('Tab with no focusables is a no-op (does not throw)', () => {
      // Build a container that *initially* has focusables (so install
      // runs the regular path), then drop them so the keydown path
      // hits the empty branch.
      const a = makeEl('a', doc);
      const c = makeContainer(doc, [a]);
      installFocusTrap(asContainerEl(c));
      // Remove the only focusable mid-flight (e.g. the popover content
      // re-rendered between keydown events).
      c.children = [];

      const event = fakeKeyEvent('Tab');
      expect(() => dispatchKey(c, event)).not.toThrow();
      expect(event.defaultPrevented).toBe(false);
    });
  });

  // ─── installFocusTrap: re-query semantics ─────────────────────────

  describe('re-query on every keydown', () => {
    it('picks up focusables added after install', () => {
      const a = makeEl('a', doc);
      const c = makeContainer(doc, [a]);
      installFocusTrap(asContainerEl(c));

      // New focusable added (e.g. previously-disabled button enabled).
      const b = makeEl('b', doc);
      c.children.push(b);

      // Now active is the new last; Tab should wrap to first.
      doc.activeElement = b;
      const event = fakeKeyEvent('Tab');
      dispatchKey(c, event);

      expect(event.defaultPrevented).toBe(true);
      expect(doc.activeElement).toBe(a);
    });
  });

  // ─── installFocusTrap: uninstall behavior ────────────────────────

  describe('uninstall', () => {
    it('removes the keydown listener so subsequent dispatches are no-ops', () => {
      const a = makeEl('a', doc);
      const b = makeEl('b', doc);
      const c = makeContainer(doc, [a, b]);
      const uninstall = installFocusTrap(asContainerEl(c));

      uninstall();

      // After uninstall, no listener should remain — dispatch hits an
      // empty Set and the wrap doesn't fire.
      doc.activeElement = b;
      const event = fakeKeyEvent('Tab');
      dispatchKey(c, event);

      expect(event.defaultPrevented).toBe(false);
      expect(doc.activeElement).toBe(b);
    });

    it('restores focus to returnFocus when provided and connected', () => {
      const trigger = makeEl('trigger', doc);
      const a = makeEl('a', doc);
      const c = makeContainer(doc, [a]);
      const uninstall = installFocusTrap(asContainerEl(c), {
        returnFocus: asHTMLElement(trigger),
      });

      uninstall();

      expect(trigger.focusCount).toBe(1);
      expect(doc.activeElement).toBe(trigger);
    });

    it('does NOT call focus() on a returnFocus that has been detached', () => {
      const trigger = makeEl('trigger', doc, { isConnected: false });
      const a = makeEl('a', doc);
      const c = makeContainer(doc, [a]);
      const uninstall = installFocusTrap(asContainerEl(c), {
        returnFocus: asHTMLElement(trigger),
      });

      uninstall();

      expect(trigger.focusCount).toBe(0);
      // active element stays on the last element focused inside the
      // popover (the initial-focus call from install).
      expect(doc.activeElement).toBe(a);
    });

    it('is idempotent — calling uninstall twice does nothing the second time', () => {
      const trigger = makeEl('trigger', doc);
      const a = makeEl('a', doc);
      const c = makeContainer(doc, [a]);
      const uninstall = installFocusTrap(asContainerEl(c), {
        returnFocus: asHTMLElement(trigger),
      });

      uninstall();
      const focusCountAfterFirst = trigger.focusCount;
      uninstall(); // second call

      expect(trigger.focusCount).toBe(focusCountAfterFirst);
    });

    it('returns a function regardless of focusable presence', () => {
      const c = makeContainer(doc, []);
      const result = installFocusTrap(asContainerEl(c));
      expect(typeof result).toBe('function');
      expect(() => result()).not.toThrow();
    });
  });

  // ─── installFocusTrap: reinstall on a changed container ──────────

  describe('reinstall on a changed container', () => {
    it('uninstalling the first then installing on a new container traps the new one', () => {
      const oldA = makeEl('oldA', doc);
      const oldB = makeEl('oldB', doc);
      const oldC = makeContainer(doc, [oldA, oldB]);
      const uninstall1 = installFocusTrap(asContainerEl(oldC));
      uninstall1();

      const newA = makeEl('newA', doc);
      const newB = makeEl('newB', doc);
      const newC = makeContainer(doc, [newA, newB]);
      installFocusTrap(asContainerEl(newC));
      expect(doc.activeElement).toBe(newA);

      // Old container's keydown does NOTHING — listener was removed.
      doc.activeElement = oldB;
      const oldEvent = fakeKeyEvent('Tab');
      dispatchKey(oldC, oldEvent);
      expect(oldEvent.defaultPrevented).toBe(false);
      expect(doc.activeElement).toBe(oldB);

      // New container's keydown wraps as expected.
      doc.activeElement = newB;
      const newEvent = fakeKeyEvent('Tab');
      dispatchKey(newC, newEvent);
      expect(newEvent.defaultPrevented).toBe(true);
      expect(doc.activeElement).toBe(newA);
    });
  });

  // ─── Soft semantics ──────────────────────────────────────────────

  describe('soft trap semantics', () => {
    it('does not attach any listener at window/document scope (clicks outside are not intercepted)', () => {
      // The source NEVER touches global addEventListener — only the
      // container's. Verify by spying on the global hook and asserting
      // it was never invoked during install.
      const globalAdd = vi.fn();
      const globalRemove = vi.fn();
      vi.stubGlobal('window', {
        addEventListener: globalAdd,
        removeEventListener: globalRemove,
      });

      const a = makeEl('a', doc);
      const c = makeContainer(doc, [a]);
      const uninstall = installFocusTrap(asContainerEl(c));
      uninstall();

      expect(globalAdd).not.toHaveBeenCalled();
      expect(globalRemove).not.toHaveBeenCalled();
    });
  });
});
