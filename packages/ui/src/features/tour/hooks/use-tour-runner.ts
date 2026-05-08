/**
 * tour-12 — TourRunner state-machine hook.
 *
 * Hosts the cross-cutting effects that drive the runner's phase
 * transitions (idle → navigating → resolving → placed) plus the
 * onEnter / onExit lifecycle firing. Extracted from `tour-runner.tsx`
 * to keep that component file ≤ 280 LOC (per `feedback_200_loc_ceiling`).
 *
 * Returned shape carries everything the runner needs to render the
 * overlay/popover when `placed`. Behavior is identical to the prior
 * single-file form — see blueprint §3.5 for the lifecycle spec.
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

  // resolving → placed (or auto-advance on missing).
  React.useEffect(() => {
    if (phase !== 'resolving') return;
    if (resolver.status === 'placed') {
      dispatch(setPhase('placed'));
    } else if (resolver.status === 'missing') {
      // eslint-disable-next-line no-console
      console.warn(`[tour] Step "${activeStep?.id}" target missing; skipping.`);
      advance();
    }
  }, [phase, resolver.status, activeStep, advance, dispatch]);

  // onExit (previous step) → onEnter (current step) on placed transitions.
  React.useEffect(() => {
    if (!lifecycleCtx) {
      prevStepRef.current = null;
      enteredStepRef.current = null;
      return;
    }
    if (phase !== 'placed') return;
    const stepKey = `${lifecycleCtx.tourId}:${lifecycleCtx.stepId}`;
    if (enteredStepRef.current === stepKey) return;
    enteredStepRef.current = stepKey;

    let cancelled = false;
    (async () => {
      const prev = prevStepRef.current;
      if (prev && prev.stepId !== lifecycleCtx.stepId) {
        const prevTour = getTour(prev.tourId);
        const prevStep = prevTour?.steps.find((s) => s.id === prev.stepId);
        if (prevStep?.onExit) {
          try {
            await prevStep.onExit({ ...lifecycleCtx, stepId: prev.stepId });
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
          await enterFn(lifecycleCtx);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(`[tour] onEnter("${lifecycleCtx.stepId}") threw:`, err);
        }
      }
      if (cancelled) return;
      prevStepRef.current = { tourId: lifecycleCtx.tourId, stepId: lifecycleCtx.stepId };
    })();
    return () => {
      cancelled = true;
    };
  }, [lifecycleCtx, phase, activeStep]);

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
