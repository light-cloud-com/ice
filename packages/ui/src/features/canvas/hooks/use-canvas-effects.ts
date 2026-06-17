/**
 * useCanvasEffects
 *
 * Bundles the two `useEffect` blocks the canvas orchestrator
 * (`svg-canvas.tsx`) installs alongside its render-shape memos:
 *
 *  - Pipeline socket subscription — on `card?.id` change, dynamically
 *    imports the API adapter, subscribes to card-level pipeline events
 *    (`subscribeCardPipeline`), and registers a per-event dispatcher for
 *    `receiveCardPipelineUpdate`. Cleanup unsubscribes both. Per the
 *    original eslint-disable on the dep-array, only `card?.id` and
 *    `dispatch` are deps — *not* the full `card` object — to avoid
 *    re-subscribing on every card mutation.
 *  - Non-passive wheel zoom — installs a `'wheel'` event listener on
 *    `svgRef.current` with `{ passive: false }` so `preventDefault()` can
 *    actually suppress browser scroll. The handler dismisses any
 *    lingering connection tooltip and forwards to `bindCanvas.onWheel`.
 *    React's onWheel synthetic is passive by default, hence this
 *    workaround. Cleanup removes the listener.
 *
 * Behavior preserved verbatim from the inline blocks previously in
 * `svg-canvas.tsx` L487 + L554 (rf-canv2-4).
 *
 * The two effects share no state; they're bundled here to keep the
 * orchestrator's outline lean. Per-effect fingerprint by deps-array
 * shape (rf-pdpl-21 pattern):
 *
 *   - effect 0: `[card?.id, dispatch]`           — length 2
 *   - effect 1: `[bindCanvas, setConnTooltip]`   — length 2
 *
 * The two share a length but the content of dep[0] disambiguates
 * (string-or-undefined vs object). Tests can fingerprint by checking
 * `typeof effects[i].deps[0]`.
 *
 * rf-canv2-4.
 */

import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { receiveCardPipelineUpdate } from '../../../store/slices/pipeline-slice';
import type { AppDispatch } from '../../../store';
import type { ConnectionTooltipInfo } from '../components/svg-connection-path';

export interface UseCanvasEffectsArgs {
  /** Active card id — re-subscribes on change. */
  cardId: string | undefined;
  /** SVG element ref — wheel listener target. */
  svgRef: React.RefObject<SVGSVGElement | null>;
  /**
   * Bound canvas-interactions wheel handler. The hook calls
   * `bindCanvas.onWheel(e as any)` after `preventDefault()` runs — the
   * underlying handler is typed against `React.WheelEvent` (synthetic)
   * rather than the native `WheelEvent` we receive from
   * `addEventListener('wheel', ...)`. The verbatim cast was preserved
   * from the pre-rf-canv2-4 inline form to keep behavior identical.
   */
  bindCanvas: { onWheel: (e: React.WheelEvent) => void };
  /**
   * Connection-tooltip setter. Called with `null` on every wheel event
   * so the tooltip dismisses on user zoom interaction.
   */
  setConnTooltip: React.Dispatch<React.SetStateAction<ConnectionTooltipInfo | null>>;
}

export function useCanvasEffects(args: UseCanvasEffectsArgs): void {
  const { cardId, svgRef, bindCanvas, setConnTooltip } = args;
  const dispatch = useDispatch<AppDispatch>();

  // Subscribe to card-level pipeline Socket.IO events
  useEffect(() => {
    if (!cardId) return;
    let unsubCard: (() => void) | undefined;
    let cleanupCard: (() => void) | undefined;

    import('../../../shared/api/api-adapter')
      .then(({ getApi }) => {
        const api = getApi();
        unsubCard = api.subscribeCardPipeline?.(cardId);

        cleanupCard = api.onCardPipelineUpdate?.((event: any) => {
          dispatch(receiveCardPipelineUpdate(event));
        });
      })
      .catch(() => {});

    return () => {
      unsubCard?.();
      cleanupCard?.();
    };
  }, [cardId, dispatch]);

  // Non-passive wheel listener for zoom (React onWheel is passive, preventDefault fails)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      // OL1 — let a log node own wheel events over itself so scrolling its
      // buffer doesn't zoom the whole canvas. The node's own onWheel handler
      // does the virtual scroll; the canvas just stays out of the way. (React's
      // stopPropagation on the node can't stop this native ancestor listener,
      // so the guard has to live here.)
      const target = e.target as Element | null;
      if (target?.closest?.('.svg-log-node')) {
        return;
      }
      e.preventDefault();
      setConnTooltip(null);

      bindCanvas.onWheel(e as any);
    };
    svg.addEventListener('wheel', handler, { passive: false });
    return () => svg.removeEventListener('wheel', handler);
    // svgRef and setConnTooltip are stable (refs / React setState setters);
    // bindCanvas re-creates when interactions inputs change, which is the
    // signal the listener should be re-installed. Verbatim from the
    // pre-rf-canv2-4 inline form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindCanvas]);
}
