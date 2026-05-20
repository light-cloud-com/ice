/**
 * tour-10 — Tour popover (coachmark card).
 *
 * Anchored Radix Popover that owns its own focus trap. Wraps the wrapped
 * primitive at `shared/components/ui/popover.tsx` (tour-2) and composes
 * `installFocusTrap` from `utils/focus-trap.ts` (tour-5).
 *
 * Positioning. Radix's `PopperAnchor` accepts a `virtualRef: { current:
 * Measurable }` (verified against `@radix-ui/react-popper@1.2.8`). We
 * hand it a stable ref whose `current.getBoundingClientRect()` reads
 * straight from the live anchor element. Radix re-measures on its own
 * cadence (resize/scroll), so the popover follows the anchor without
 * us mirroring the rect into React state.
 *
 * Auto-placement. `placement: 'auto'` (or unset) picks the side with
 * the most space, fall-back order top → bottom → right → left. Inlined
 * (~20 LOC) rather than extracted because the heuristic is short and
 * has exactly one caller; the blueprint explicitly allowed inlining
 * under ~30 LOC (§6/tour-10).
 *
 * Focus contract. Radix's `<PopoverContent onOpenAutoFocus|onCloseAutoFocus>`
 * are forced to `e.preventDefault()` so OUR `installFocusTrap` owns
 * initial and return focus. Without this Radix's FocusScope grabs
 * focus first and our trap's `initialFocus` becomes a no-op (the
 * "first focusable" was already focused by Radix), and on close
 * Radix tries to restore focus to the trigger which doesn't exist
 * here (we have a virtualRef anchor, not a button trigger).
 *
 * Reduced motion. The wrapped Popover's open/close animation classes
 * are `data-[state=open]:animate-in` / `data-[state=closed]:animate-out`.
 * When `useReducedMotion()` is true we set `data-reduced-motion="true"`
 * on the content for downstream consumers and merge in `motion-reduce:animate-none`
 * (Tailwind's built-in `motion-reduce` variant kicks in when the user's
 * OS prefers reduced motion regardless, but we defensively force it on
 * via the explicit attribute so tests can assert it).
 */

import { X } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from '../../../i18n';
import { Popover, PopoverAnchor, PopoverContent, PopoverPortal } from '../../../shared/components/ui/popover';
import { useReducedMotion } from '../../../shared/hooks/use-reduced-motion';
import { cn } from '../../../shared/utils/cn';
import { installFocusTrap } from '../utils/focus-trap';
import type { Placement, TourStep } from '../tour.types';

export interface TourPopoverProps {
  step: TourStep;
  stepIdx: number;
  totalSteps: number;
  /** Resolved live anchor — the popover renders nothing if null. */
  anchor: Element | null;
  /** Override step.placement (rare; runner usually passes step's value). */
  placement?: Placement;
  onAdvance: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  /** User clicked Close (X) — distinct from skip; does NOT mark tour completed. */
  onClose: () => void;
}

/** Radix's `Side` set, narrowed for our internal mapping. */
type RadixSide = 'top' | 'right' | 'bottom' | 'left';

interface ViewportRect {
  width: number;
  height: number;
}

/**
 * Pick the side with the most empty space around `rect` inside `viewport`.
 * Used only when the step's placement is `'auto'` (or unset). Tie-break
 * order: top → bottom → right → left. Inlined per blueprint guidance —
 * promote to `utils/auto-placement.ts` if it grows.
 */
export function pickAutoPlacement(rect: DOMRect, viewport: ViewportRect): RadixSide {
  const space: Record<RadixSide, number> = {
    top: rect.top,
    bottom: viewport.height - rect.bottom,
    right: viewport.width - rect.right,
    left: rect.left,
  };
  // Iterate in tie-break order so the first max wins.
  const order: RadixSide[] = ['top', 'bottom', 'right', 'left'];
  let best: RadixSide = 'top';
  let bestSpace = -Infinity;
  for (const side of order) {
    const s = space[side];
    if (s > bestSpace) {
      best = side;
      bestSpace = s;
    }
  }
  return best;
}

/** Map our `Placement` → Radix `Side`. `'auto'` resolves at render time. */
function resolveSide(placement: Placement | undefined, anchor: Element | null): RadixSide {
  if (placement && placement !== 'auto') return placement;
  if (!anchor) return 'bottom';
  // `getBoundingClientRect` is read at render time. Radix re-measures on
  // its own cadence; the side choice is sticky to the first render's
  // viewport, which is the desired UX (popover doesn't flip when the
  // user merely scrolls a few pixels).
  const rect = anchor.getBoundingClientRect();
  const viewport = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  };
  return pickAutoPlacement(rect, viewport);
}

/**
 * Shared button class. Avoids pulling in `<Button>` (and its `cva`
 * surface) so the popover's footer stays a plain layout — the buttons
 * here are functional, not stylistic showcase pieces.
 */
const FOOTER_BTN =
  'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-accent';

const NEXT_BTN_CLASS = cn(FOOTER_BTN, 'bg-ice-accent text-white hover:bg-ice-accent/90');
const SECONDARY_BTN_CLASS = cn(FOOTER_BTN, 'text-ice-text-2 hover:text-ice-text-1');

export function TourPopover(props: TourPopoverProps): JSX.Element | null {
  const { step, stepIdx, totalSteps, anchor, placement, onAdvance, onPrevious, onSkip, onClose } = props;
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();

  // Stable virtual-ref handed to Radix's PopperAnchor. Critical: both the
  // ref object AND its `.current` MUST be referentially stable across
  // renders. Radix's PopperAnchor runs an unguarded `useEffect` (no dep
  // array) that reads `virtualRef?.current` and calls `onAnchorChange`
  // when identity differs from the prior tick — see
  // `@radix-ui/react-popper@1.2.8` index.mjs L43-L48. If we hand it a
  // fresh measurable object each render, `onAnchorChange` fires every
  // render, the parent `Popper` setState rerenders, and we infinite-loop
  // → OOM. Pattern: keep one ref + one measurable; update the latest
  // anchor via `latestAnchorRef` so the closure on `getBoundingClientRect`
  // always reads from the live element without breaking identity.
  const latestAnchorRef = React.useRef<Element | null>(anchor);
  latestAnchorRef.current = anchor;
  const virtualRef = React.useRef<{ getBoundingClientRect: () => DOMRect }>({
    getBoundingClientRect: () => {
      const el = latestAnchorRef.current;
      // Defensive zero-rect when the anchor is gone; Radix can't crash
      // mid-unmount because of this — we early-return null below before
      // it's reached in practice.
      return el
        ? el.getBoundingClientRect()
        : ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect);
    },
  });

  // Container of focusable footer buttons — installFocusTrap runs against
  // this. We use a callback ref so we can fire effects when the content
  // mounts/unmounts and re-mounts (e.g. step change).
  const [contentEl, setContentEl] = React.useState<HTMLDivElement | null>(null);

  // Stash the previously-focused element on mount so the trap can return
  // focus to it on unmount. Read once per (anchor, step) tuple — re-reading
  // on every render would clobber the original target after the trap moves
  // focus into the popover.
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const active = document.activeElement;
    previouslyFocusedRef.current = active instanceof HTMLElement ? active : null;
    // Effect runs once per anchor+stepId. The runner re-mounts us when
    // step changes (tour-12), but if the same component instance gets a
    // new step prop we still want a fresh capture.
  }, [anchor, step.id]);

  // Install the focus trap when content is in the DOM. Returns the
  // uninstall fn directly — React calls it on unmount or when the dep
  // tuple changes (e.g. step change with same anchor).
  React.useEffect(() => {
    if (!contentEl) return;
    const uninstall = installFocusTrap(contentEl, {
      returnFocus: previouslyFocusedRef.current ?? undefined,
    });
    return uninstall;
  }, [contentEl, step.id]);

  if (!anchor) return null;

  const isFirst = stepIdx === 0;
  const isLast = stepIdx === totalSteps - 1;

  const titleText = typeof step.title === 'string' ? t(step.title) : step.title;

  const bodyContent: React.ReactNode = typeof step.body === 'string' ? t(step.body) : (step.body as React.ReactNode);

  const nextLabelKey = step.actions?.nextLabel
    ? step.actions.nextLabel
    : isLast
      ? 'tour.actions.finish'
      : 'tour.actions.next';
  const backLabelKey = step.actions?.backLabel ?? 'tour.actions.back';

  // Skip is hidden if (a) author opted out via actions.hideSkip OR
  // (b) we're on the last step (Skip is redundant with Finish there).
  const showSkip = !step.actions?.hideSkip && !isLast;

  const side = resolveSide(placement ?? step.placement, anchor);

  return (
    <Popover open>
      {/*
       * Anchor positioning. We pass `virtualRef` so Radix doesn't try to
       * render its own anchor div — it asks our ref for the rect.
       */}
      <PopoverAnchor virtualRef={virtualRef as unknown as React.RefObject<{ getBoundingClientRect: () => DOMRect }>} />
      <PopoverPortal>
        <PopoverContent
          ref={setContentEl}
          side={side}
          align="center"
          sideOffset={10}
          // Keep the popover at least 16px from any viewport edge, and
          // let Radix flip / shift the side as needed to stay in view.
          // `sticky="always"` means the popover follows the anchor even
          // when the anchor scrolls, but Radix will still shift away
          // from edges first.
          avoidCollisions
          collisionPadding={16}
          sticky="always"
          role="dialog"
          aria-modal={false}
          aria-labelledby="tour-popover-title"
          aria-describedby="tour-popover-body"
          data-tour-popover="content"
          data-reduced-motion={reducedMotion ? 'true' : undefined}
          // Hand initial/return focus to OUR installFocusTrap, not Radix.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className={cn(
            // z-[9999] sits above the overlay (`z-[9998]` for spotlight +
            // shield strips in tour-overlay.tsx). Without this, Radix's
            // default `z-50` puts the popover under the shields.
            'z-[9999] w-80 max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] overflow-auto',
            // Neutralize Radix's animation when reduced motion is on. The
            // wrapped `PopoverContent` declares animate-in/animate-out;
            // these utilities counter them under reduced-motion.
            reducedMotion &&
              'motion-reduce:animate-none data-[state=open]:animate-none data-[state=closed]:animate-none',
          )}
        >
          <button
            type="button"
            aria-label={t('tour.actions.close')}
            data-tour-popover="close"
            onClick={onClose}
            className="absolute right-2 top-2 rounded-sm p-1 text-ice-text-2 transition-colors hover:text-ice-text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-accent"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          <h2 id="tour-popover-title" className="pr-6 text-base font-semibold leading-tight text-ice-text-1">
            {titleText}
          </h2>
          <div id="tour-popover-body" className="mt-2 text-sm leading-relaxed text-ice-text-2">
            {bodyContent}
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <span data-tour-popover="counter" aria-live="polite" className="text-xs text-ice-text-2">
              {stepIdx + 1} / {totalSteps}
            </span>
            <div className="flex items-center gap-2">
              {!isFirst && (
                <button type="button" data-tour-popover="back" onClick={onPrevious} className={SECONDARY_BTN_CLASS}>
                  {t(backLabelKey)}
                </button>
              )}
              {showSkip && (
                <button type="button" data-tour-popover="skip" onClick={onSkip} className={SECONDARY_BTN_CLASS}>
                  {t('tour.actions.skip')}
                </button>
              )}
              <button type="button" data-tour-popover="next" onClick={onAdvance} className={NEXT_BTN_CLASS}>
                {t(nextLabelKey)}
              </button>
            </div>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}
