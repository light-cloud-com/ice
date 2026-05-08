/**
 * tour-8 — Tour overlay (spotlight + click-shield).
 *
 * Pure presentational component. The runner (tour-12) owns rect derivation
 * (target resolver + element-position hook); this component just paints.
 *
 * What it renders, when `rect` is non-null, into `document.body` via
 * `react-dom`'s `createPortal`:
 *
 *   1. **Spotlight**: a fixed-position div sized to the target rect plus
 *      `pad`, with `box-shadow: 0 0 0 9999px rgba(0,0,0,0.55)` so the
 *      *outside* of the box dims to ~55% black while the inner cutout
 *      stays untouched. `pointer-events: none` lets clicks fall through
 *      onto whatever is beneath (the actual page content).
 *
 *   2. **Click-shield**: NOT a single full-viewport div, because that
 *      would also catch clicks inside the spotlight rect. Instead, four
 *      strips around the rect (top / bottom / left / right) — each with
 *      `pointer-events: auto` and the shared `onSkip` handler. Inside the
 *      rect there is no shield, so the user can interact with the page.
 *
 * Z-index: both spotlight and shield strips sit at `z-[9998]`. The popover
 * (tour-10) lives at `z-[9999]` so it's never occluded.
 *
 * Animation: 180ms transitions on top/left/width/height match the
 * blueprint §3.1 spec; `useReducedMotion()` true → no transition style.
 *
 * Limitations: the box-shadow technique requires no transformed ancestor
 * with its own stacking context (anchors live at the app root, not inside
 * `transform`-scoped subtrees) — see blueprint §7 v1 limitations.
 */

import { useMemo } from 'react';
import { createPortal } from 'react-dom';

import { useReducedMotion } from '../../../shared/hooks/use-reduced-motion';
import { cn } from '../../../shared/utils/cn';

export interface TourOverlayProps {
  /** Resolved target rect; if null the overlay renders nothing. */
  rect: DOMRect | null;
  /** Padding around the rect for the spotlight. Default 8. */
  pad?: number;
  /** Border-radius for the spotlight cutout. Default 8. */
  radius?: number;
  /** Called when the user clicks outside the spotlit area. */
  onSkip: () => void;
}

const TRANSITION = 'top 180ms, left 180ms, width 180ms, height 180ms';

/**
 * Tailwind class shared by every overlay layer. Keeps the spotlight and
 * the four shield strips visually beneath the popover (tour-10 →
 * `z-[9999]`).
 */
const Z_CLASS = 'fixed z-[9998]';

interface ShieldStripStyles {
  top: React.CSSProperties;
  bottom: React.CSSProperties;
  left: React.CSSProperties;
  right: React.CSSProperties;
}

/**
 * Compute the four shield strips that surround the spotlight rect.
 *
 * The outer rect (top/left/width/height of the spotlight) already includes
 * the user-supplied `pad`, so each strip's edges align flush with the
 * spotlight border.
 */
function computeShieldStrips(spotlightLeft: number, spotlightTop: number, spotlightWidth: number, spotlightHeight: number): ShieldStripStyles {
  const right = spotlightLeft + spotlightWidth;
  const bottom = spotlightTop + spotlightHeight;
  return {
    // Top strip: full width above the spotlight.
    top: { top: 0, left: 0, width: '100vw', height: Math.max(0, spotlightTop) },
    // Bottom strip: full width below the spotlight, down to the viewport edge.
    bottom: { top: bottom, left: 0, width: '100vw', height: `calc(100vh - ${bottom}px)` },
    // Left strip: from x=0 to spotlight left, only as tall as the spotlight.
    left: { top: spotlightTop, left: 0, width: Math.max(0, spotlightLeft), height: spotlightHeight },
    // Right strip: from spotlight right to x=100vw, same height.
    right: { top: spotlightTop, left: right, width: `calc(100vw - ${right}px)`, height: spotlightHeight },
  };
}

export function TourOverlay({ rect, pad = 8, radius = 8, onSkip }: TourOverlayProps): JSX.Element | null {
  const reducedMotion = useReducedMotion();

  // Memoize so children don't churn between renders when nothing changed.
  // `rect` identity is the trigger — `useElementPosition` produces a fresh
  // DOMRect on every observer tick, so consumers shouldn't rely on
  // referential equality to skip work.
  const layout = useMemo(() => {
    if (!rect) return null;
    // Negative pad collapses inward but width/height clamp at 0 (matches
    // `expandRect` in `utils/target-rect.ts`). We don't use `expandRect`
    // here directly because it returns a serializable lookalike; we want
    // raw numbers to feed inline styles.
    const left = rect.left - pad;
    const top = rect.top - pad;
    const width = Math.max(0, rect.width + pad * 2);
    const height = Math.max(0, rect.height + pad * 2);
    return { left, top, width, height };
  }, [rect, pad]);

  if (!layout) return null;

  const spotlightStyle: React.CSSProperties = {
    top: layout.top,
    left: layout.left,
    width: layout.width,
    height: layout.height,
    borderRadius: radius,
    pointerEvents: 'none',
    boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
    transition: reducedMotion ? undefined : TRANSITION,
  };

  const strips = computeShieldStrips(layout.left, layout.top, layout.width, layout.height);
  const stripBaseStyle: React.CSSProperties = { pointerEvents: 'auto' };

  const overlay = (
    <>
      {/*
       * Click-shield strips. Each strip is a full-bleed click target
       * around the spotlight; clicks land here → onSkip(). Inside the
       * spotlight rect no strip exists, so the page beneath stays
       * interactive.
       */}
      <div
        data-tour-shield="top"
        className={cn(Z_CLASS)}
        style={{ ...stripBaseStyle, ...strips.top }}
        onClick={onSkip}
      />
      <div
        data-tour-shield="bottom"
        className={cn(Z_CLASS)}
        style={{ ...stripBaseStyle, ...strips.bottom }}
        onClick={onSkip}
      />
      <div
        data-tour-shield="left"
        className={cn(Z_CLASS)}
        style={{ ...stripBaseStyle, ...strips.left }}
        onClick={onSkip}
      />
      <div
        data-tour-shield="right"
        className={cn(Z_CLASS)}
        style={{ ...stripBaseStyle, ...strips.right }}
        onClick={onSkip}
      />
      {/*
       * Spotlight. The big inset box-shadow paints the dim outside; the
       * inner rect remains pristine. `pointer-events: none` lets clicks
       * within the rect pass through to the actual page content beneath.
       */}
      <div
        data-tour-overlay="spotlight"
        className={cn(Z_CLASS)}
        style={spotlightStyle}
      />
    </>
  );

  return createPortal(overlay, document.body);
}
