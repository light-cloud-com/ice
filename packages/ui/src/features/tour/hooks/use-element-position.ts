/**
 * tour-4 — Live element position hook.
 *
 * Given an `Element | null`, returns the live `DOMRect | null` for that
 * element. The rect is refreshed by:
 *
 *   1. `ResizeObserver(element)` — element box changes (e.g. content
 *      reflow, transitions, font swap).
 *   2. `ResizeObserver(document.documentElement)` — viewport resize.
 *      Disabled when `options.observeViewport === false`.
 *   3. `window.addEventListener('scroll', _, { capture: true,
 *      passive: true })` — scroll inside ANY ancestor scroll container.
 *      Capture-phase is required because most scroll containers don't
 *      bubble their scroll event past themselves.
 *   4. `IntersectionObserver(element, { threshold: [0, 0.5, 1] })` — when
 *      the visible ratio drops below 0.5 AND `scrollIntoViewOnHide` is
 *      true, calls `element.scrollIntoView({ behavior, block: 'center' })`
 *      once. Debounced 250 ms (classic trailing-edge debounce — each new
 *      under-0.5 event resets the timer).
 *
 * `behavior` is `'auto'` when `useReducedMotion()` returns true, otherwise
 * `'smooth'`. The reduced-motion value is read on every IO callback (via
 * a ref) so a media-query change after mount is honored without
 * re-installing observers.
 *
 * When `element` is null → no observers attached and the hook returns
 * null. When `element` flips from non-null to null (or vice versa, or
 * swaps to a different element), the previous listeners are torn down
 * and fresh ones installed. On unmount, every listener is detached.
 *
 * The blueprint (§3.3, §6/tour-4) calls out listener leak on element
 * change as the highest-risk bug — see test "swap then unmount → 0
 * leaked listeners".
 */

import { useEffect, useRef, useState } from 'react';

import { useReducedMotion } from '../../../shared/hooks/use-reduced-motion';

export interface UseElementPositionOptions {
  /** Also watch `document.documentElement` for size changes. Default `true`. */
  observeViewport?: boolean;
  /** Call `element.scrollIntoView` when the IO ratio drops below 0.5. Default `true`. */
  scrollIntoViewOnHide?: boolean;
}

const HIDE_DEBOUNCE_MS = 250;

export function useElementPosition(
  element: Element | null,
  options: UseElementPositionOptions = {},
): DOMRect | null {
  const { observeViewport = true, scrollIntoViewOnHide = true } = options;
  const [rect, setRect] = useState<DOMRect | null>(() =>
    element ? element.getBoundingClientRect() : null,
  );

  // Reduced-motion changes can fire AFTER mount (user toggles the
  // system setting); keep the IO closure reading the freshest value via
  // a ref so we don't have to tear down + reinstall observers.
  const reducedMotion = useReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  useEffect(() => {
    if (!element) {
      // Nothing to observe — make sure stale rect from a previous element
      // doesn't linger.
      setRect(null);
      return;
    }

    // Initial read on (re)attach so consumers don't wait a frame for the
    // first observer fire.
    const readRect = (): void => {
      setRect(element.getBoundingClientRect());
    };
    readRect();

    // ── ResizeObserver(element) ──────────────────────────────────────────
    const elementRO = new ResizeObserver(() => {
      readRect();
    });
    elementRO.observe(element);

    // ── ResizeObserver(documentElement) ──────────────────────────────────
    let viewportRO: ResizeObserver | null = null;
    if (observeViewport && typeof document !== 'undefined' && document.documentElement) {
      viewportRO = new ResizeObserver(() => {
        readRect();
      });
      viewportRO.observe(document.documentElement);
    }

    // ── Scroll listener (capture, passive) ───────────────────────────────
    const scrollHandler = (): void => {
      readRect();
    };
    window.addEventListener('scroll', scrollHandler, { capture: true, passive: true });

    // ── IntersectionObserver + debounced scrollIntoView ──────────────────
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio < 0.5) {
            if (!scrollIntoViewOnHide) continue;
            // Classic trailing-edge debounce: each new under-0.5 event
            // resets the pending timer. The blueprint calls this out
            // specifically — multiple firings within 250ms collapse to
            // one scrollIntoView call.
            if (hideTimer !== null) clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
              hideTimer = null;
              // Guard against scrollIntoView absent — `Element.prototype`
              // has it in lib.dom.d.ts, but test fixtures often pass a
              // bare-object stub that doesn't, and pseudo-elements (e.g.
              // ::before) wouldn't either if they could be observed.
              const scrollIntoViewFn = (element as Element & { scrollIntoView?: (arg?: ScrollIntoViewOptions | boolean) => void }).scrollIntoView;
              if (typeof scrollIntoViewFn === 'function') {
                scrollIntoViewFn.call(element, {
                  behavior: reducedMotionRef.current ? 'auto' : 'smooth',
                  block: 'center',
                });
              }
            }, HIDE_DEBOUNCE_MS);
          }
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    intersectionObserver.observe(element);

    return () => {
      elementRO.disconnect();
      viewportRO?.disconnect();
      window.removeEventListener('scroll', scrollHandler, { capture: true } as EventListenerOptions);
      intersectionObserver.disconnect();
      if (hideTimer !== null) clearTimeout(hideTimer);
    };
  }, [element, observeViewport, scrollIntoViewOnHide]);

  return rect;
}
