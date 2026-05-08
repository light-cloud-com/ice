/**
 * tour-12 — TourRunner state-machine hook.
 *
 * Hosts the cross-cutting effects that drive the runner's phase
 * transitions (idle → navigating → resolving → entering → placed) plus
 * the onEnter / onExit lifecycle firing. Extracted from
 * `tour-runner.tsx` to keep that component file ≤ 280 LOC (per
 * `feedback_200_loc_ceiling`).
 *
 * The `'entering'` phase (added in the tour-12 followup) gates the
 * overlay/popover paint on the awaited onEnter. Without it, a step
 * whose onEnter mutates layout (sidebar open, scroll, focus) would
 * paint against stale DOM. Render still keys on `phase === 'placed'`;
 * we only flip to `'placed'` AFTER onEnter resolves. See learnings.md
 * `tour-12-entering-phase-required-because-render-gate-must-wait-for-onenter`.
 *
 * Returned shape carries everything the runner needs to render the
 * overlay/popover when `placed`.
 */
import * as React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import type { AppDispatch, RootState } from '../../../store';
import { getTour } from '../utils/tour-registry';
import { useTour } from './use-tour';
import { useTargetResolver, type ResolverResult } from './use-target-resolver';
import { useElementPosition } from './use-element-position';
import { useTourRoute } from './use-tour-route';
import { setPhase, selectPhase, type TourPhase } from '../store/tour-slice';
import type { TourLifecycleCtx, TourStep } from '../tour.types';

export interface UseTourRunnerReturn {
  phase: TourPhase;
  activeStep: TourStep | undefined;
  totalSteps: number;
  stepIdx: number;
  resolver: ResolverResult;
  liveRect: DOMRect | null;
  advance: () => void;
  previous: () => void;
  skip: () => void;
  stop: () => void;
}

/**
 * Restore focus to a previously-stashed element. Safe against null and
 * detached elements (the prior focus owner may have been unmounted
 * mid-tour).
 */
export function restoreFocus(el: HTMLElement | null): void {
  if (!el) return;
  if (typeof document === 'undefined') return;
  if (!document.contains(el)) return;
  try {
    el.focus();
  } catch {
    /* SVG-without-focus and similar — silently ignore. */
  }
}

export function useTourRunner(): UseTourRunnerReturn {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { activeTourId, stepIdx, advance, previous, skip, stop } = useTour();
  const phase = useSelector((s: RootState) => selectPhase(s));

  const tour = activeTourId ? getTour(activeTourId) : undefined;
  const totalSteps = tour?.steps.length ?? 0;
  const activeStep: TourStep | undefined = tour?.steps[stepIdx];

  // Stashed element for return-focus on stop/skip/completed.
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const enteredStepRef = React.useRef<string | null>(null);
  const prevStepRef = React.useRef<{ tourId: string; stepId: string } | null>(null);
  const navigateRequestedRef = React.useRef<string | null>(null);

  // Capture document.activeElement when a tour starts; restore on end.
  React.useEffect(() => {
    if (!activeTourId) {
      restoreFocus(previousFocusRef.current);
      previousFocusRef.current = null;
      enteredStepRef.current = null;
      prevStepRef.current = null;
      navigateRequestedRef.current = null;
      return;
    }
    if (!previousFocusRef.current && typeof document !== 'undefined') {
      const active = document.activeElement;
      previousFocusRef.current = active instanceof HTMLElement ? active : null;
    }
  }, [activeTourId]);

  const target = activeStep?.target ?? null;
  const enabled = Boolean(activeStep) && phase !== 'idle' && phase !== 'navigating';
  const resolver = useTargetResolver(target, { enabled });
  const elementPosition = useElementPosition(resolver.element ?? null);

  const route = useTourRoute({ targetRoute: activeStep?.route });

  // Memoized lifecycle ctx — re-allocates only when (tourId, stepId, stepIdx).
  const lifecycleCtx: TourLifecycleCtx | null = React.useMemo(() => {
    if (!activeTourId || !activeStep) return null;
    return {
      tourId: activeTourId,
      stepId: activeStep.id,
      stepIdx,
      dispatch,
      navigate,
    };
  }, [activeTourId, activeStep, stepIdx, dispatch, navigate]);

  // navigating → resolving (with optional route navigate).
  React.useEffect(() => {
    if (phase !== 'navigating') return;
    if (!activeStep) return;
    if (!activeStep.route) {
      dispatch(setPhase('resolving'));
      return;
    }
    const stepKey = `${activeTourId}:${activeStep.id}`;
    if (navigateRequestedRef.current !== stepKey) {
      navigateRequestedRef.current = stepKey;
      route.navigateTo();
    }
    if (route.phase === 'arrived') {
      dispatch(setPhase('resolving'));
    }
  }, [phase, activeStep, activeTourId, route, dispatch]);

  // resolving → entering (or auto-advance on missing). The 'entering'
  // phase is the await-onEnter gate: we move to 'placed' (and the
  // render gate opens) ONLY after the next effect resolves the
  // lifecycle hook.
  React.useEffect(() => {
    if (phase !== 'resolving') return;
    if (resolver.status === 'placed') {
      dispatch(setPhase('entering'));
    } else if (resolver.status === 'missing') {
      // eslint-disable-next-line no-console
      console.warn(`[tour] Step "${activeStep?.id}" target missing; skipping.`);
      advance();
    }
  }, [phase, resolver.status, activeStep, advance, dispatch]);

  // entering → placed: await onExit (previous step) then onEnter
  // (current step), THEN flip to 'placed' so the overlay/popover
  // mount. Cancellation: if the user advances/skips/stops while
  // onEnter is pending, the activeRef tuple won't match by the time we
  // get back; drop the setPhase('placed') so we don't paint a stale
  // step.
  React.useEffect(() => {
    if (!lifecycleCtx) {
      prevStepRef.current = null;
      enteredStepRef.current = null;
      return;
    }
    if (phase !== 'entering') return;
    const stepKey = `${lifecycleCtx.tourId}:${lifecycleCtx.stepId}`;
    if (enteredStepRef.current === stepKey) return;
    enteredStepRef.current = stepKey;

    const ctxAtStart = lifecycleCtx;
    let cancelled = false;
    let settled = false;
    (async () => {
      const prev = prevStepRef.current;
      if (prev && prev.stepId !== ctxAtStart.stepId) {
        const prevTour = getTour(prev.tourId);
        const prevStep = prevTour?.steps.find((s) => s.id === prev.stepId);
        if (prevStep?.onExit) {
          try {
            await prevStep.onExit({ ...ctxAtStart, stepId: prev.stepId });
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(`[tour] onExit("${prev.stepId}") threw:`, err);
          }
        }
      }
      if (cancelled) return;
      const enterFn = activeStep?.onEnter;
      if (enterFn) {
        try {
          await enterFn(ctxAtStart);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(`[tour] onEnter("${ctxAtStart.stepId}") threw:`, err);
        }
      }
      if (cancelled) return;
      prevStepRef.current = {
        tourId: ctxAtStart.tourId,
        stepId: ctxAtStart.stepId,
      };
      settled = true;
      dispatch(setPhase('placed'));
    })();
    return () => {
      cancelled = true;
      // If we got cancelled BEFORE settling (user advanced mid-await),
      // re-arm the entered-step guard so the step can be re-entered
      // from scratch on a future return. After a successful settle,
      // the guard must persist — we don't want phase oscillations to
      // re-fire onEnter for a step already entered.
      if (!settled && enteredStepRef.current === stepKey) {
        enteredStepRef.current = null;
      }
    };
  }, [lifecycleCtx, phase, activeStep, dispatch]);

  // Live rect: from the position hook, falling back to resolver's snapshot
  // for the first frame of `placed` before the position observer fires.
  const liveRect: DOMRect | null =
    elementPosition ?? (resolver.rect as DOMRect | null) ?? null;

  return {
    phase,
    activeStep,
    totalSteps,
    stepIdx,
    resolver,
    liveRect,
    advance,
    previous,
    skip,
    stop,
  };
}
