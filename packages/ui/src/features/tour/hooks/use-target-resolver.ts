/**
 * tour-3 — Target resolver hook.
 *
 * Resolves a `target` (CSS selector OR thunk returning the live element)
 * into `{ status, element, rect }`. Lazy-mounted panels (AI chat,
 * properties) may not be in the DOM when a step activates — the hook
 * spends up to `budget` rAF frames retrying, then attaches a
 * `MutationObserver` on `document.body` to react to any subtree change
 * within the remaining budget.
 *
 * Behavior summary (full spec in blueprint §3.2 + §6/tour-3):
 *   - `target === null` OR `enabled === false` → `'idle'`, no observers
 *     attached.
 *   - rAF loop tries the resolver every frame up to `budget` (default 30,
 *     ≈500ms at 60Hz). On the first match → `'placed'` with rect.
 *   - After 6 failed frames (`OBSERVER_ATTACH_FRAME`), wires a
 *     `MutationObserver` on `document.body { childList, subtree }`. Each
 *     batch retriggers ONE rAF check (debounced — multiple batches
 *     within a single frame collapse to one tick).
 *   - On budget exhaustion → `'missing'`. No further work.
 *   - Target prop change → tear down the in-flight resolver, restart
 *     fresh (status flickers `'resolving'` → next).
 *   - Unmount → tear down rAF + observer.
 *   - Rect is read via `getBoundingClientRect()` ONCE per successful
 *     resolution, never on the missing path.
 *
 * Implementation notes:
 *   - `useState` for the public triple; `useRef` for the in-flight
 *     resolver state (cancelled flag, frame counter, observer ref) so
 *     React strictness double-invokes don't leak observers.
 *   - The rAF callback is named `tick` — the test harness drives the
 *     captured callback queue manually, mirroring the existing
 *     `useCanvasInteractions` test pattern.
 */
import { useEffect, useRef, useState } from 'react';
import type { SerializableRect } from '../utils/target-rect';

/** Public resolver phases. `'idle'` is also the disabled state. */
export type ResolverStatus = 'idle' | 'resolving' | 'placed' | 'missing';

export interface ResolverResult {
  status: ResolverStatus;
  element: Element | null;
  /**
   * `getBoundingClientRect()` snapshot taken at resolution time. The
   * shape is the live `DOMRect` returned by the browser — consumers
   * that need a serializable copy should run it through
   * `expandRect`/`clampRectToViewport` from `utils/target-rect`.
   */
  rect: DOMRect | SerializableRect | null;
}

export interface ResolverOptions {
  /** Frames to spend resolving. Default 30 (~500 ms at 60 Hz). */
  budget?: number;
  /**
   * When `false` the hook returns `'idle'` and skips ALL side effects
   * (no rAF, no MutationObserver). Default `true`.
   */
  enabled?: boolean;
}

const DEFAULT_BUDGET = 30;
/** Frames to wait before falling back to the MutationObserver path. */
const OBSERVER_ATTACH_FRAME = 6;

const idleResult: ResolverResult = { status: 'idle', element: null, rect: null };

const resolvingResult: ResolverResult = { status: 'resolving', element: null, rect: null };

interface ResolverHandles {
  /** rAF id we own; cleared on tear-down. */
  rafId: number | null;
  /** MutationObserver instance attached after frame `OBSERVER_ATTACH_FRAME`. */
  observer: MutationObserver | null;
  /** Frame counter; advanced once per rAF tick. */
  frame: number;
  /**
   * Set when we fold a mutation batch into the next rAF — keeps multiple
   * back-to-back mutation batches from queuing parallel rAFs.
   */
  rafPending: boolean;
  /** Cancellation flag. Flipped on tear-down or target change. */
  cancelled: boolean;
}

function makeHandles(): ResolverHandles {
  return {
    rafId: null,
    observer: null,
    frame: 0,
    rafPending: false,
    cancelled: false,
  };
}

function resolveOnce(target: string | (() => Element | null)): Element | null {
  // The target can be a CSS selector or a thunk returning the element.
  // `document` may be undefined under SSR/test envs that don't stub it;
  // guard once here so consumers don't need to.
  if (typeof target === 'function') {
    return target();
  }
  if (typeof document === 'undefined') return null;
  return document.querySelector(target);
}

export function useTargetResolver(
  target: string | (() => Element | null) | null,
  options: ResolverOptions = {},
): ResolverResult {
  const { budget = DEFAULT_BUDGET, enabled = true } = options;
  const [result, setResult] = useState<ResolverResult>(() =>
    target == null || !enabled ? idleResult : resolvingResult,
  );
  const handlesRef = useRef<ResolverHandles | null>(null);

  useEffect(() => {
    // Disabled / null-target path: ensure the public state is `'idle'`
    // and that we DO NOT spin up any observers. Tear down anything that
    // a previous (enabled) effect run may have left behind.
    if (target == null || !enabled) {
      teardown(handlesRef.current);
      handlesRef.current = null;
      setResult((prev) => (prev.status === 'idle' ? prev : idleResult));
      return undefined;
    }

    // Fresh resolver: tear down any previous in-flight handles. This
    // covers the "target prop changed" branch — the previous effect's
    // cleanup runs before this one, but we still null the ref defensively.
    teardown(handlesRef.current);
    const handles = makeHandles();
    handlesRef.current = handles;
    setResult(resolvingResult);

    const tick = (): void => {
      if (handles.cancelled) return;
      // The rAF that called us has fired — clear its id so the
      // bottom of `tick` knows it's free to schedule the next one.
      handles.rafId = null;
      handles.rafPending = false;
      handles.frame += 1;

      const element = resolveOnce(target);
      if (element) {
        handles.cancelled = true;
        const rect = element.getBoundingClientRect();
        teardownInternal(handles);
        setResult({ status: 'placed', element, rect });
        return;
      }

      if (handles.frame >= budget) {
        handles.cancelled = true;
        teardownInternal(handles);
        setResult({ status: 'missing', element: null, rect: null });
        return;
      }

      // Attach the MutationObserver fallback once we've spent the rAF
      // budget below `OBSERVER_ATTACH_FRAME` without a hit. Cheaper
      // common case: target lands within the first 6 frames and we
      // never instantiate an observer.
      if (
        handles.frame >= OBSERVER_ATTACH_FRAME &&
        !handles.observer &&
        typeof MutationObserver !== 'undefined' &&
        typeof document !== 'undefined' &&
        document.body
      ) {
        handles.observer = new MutationObserver(() => {
          if (handles.cancelled) return;
          // Debounce: a single batch may fire many times back-to-back
          // (childList floods on bulk inserts). Schedule at most ONE
          // pending rAF per pass; the next `tick` clears the flag.
          if (handles.rafPending) return;
          if (handles.rafId !== null) return;
          handles.rafPending = true;
          handles.rafId = requestAnimationFrame(tick);
        });
        handles.observer.observe(document.body, { childList: true, subtree: true });
      }

      // Schedule the next frame — the observer-driven path also lands
      // here once a mutation batch nudges us, so the same code drives
      // both retry channels.
      if (handles.rafId === null) {
        handles.rafId = requestAnimationFrame(tick);
      }
    };

    handles.rafId = requestAnimationFrame(tick);

    return () => {
      teardown(handles);
    };
  }, [target, enabled, budget]);

  return result;
}

/** Cancel + free resources owned by `handles`. Idempotent. */
function teardown(handles: ResolverHandles | null): void {
  if (!handles) return;
  handles.cancelled = true;
  teardownInternal(handles);
}

function teardownInternal(handles: ResolverHandles): void {
  if (handles.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(handles.rafId);
  }
  handles.rafId = null;
  if (handles.observer) {
    handles.observer.disconnect();
    handles.observer = null;
  }
  handles.rafPending = false;
}
