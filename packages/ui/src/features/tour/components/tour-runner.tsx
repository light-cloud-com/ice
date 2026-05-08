/**
 * tour-12 — TourRunner orchestrator.
 *
 * Top-level coordinator that wires the tour-engine pieces (resolver,
 * position, keyboard, route) into a single render-driven state machine.
 * Mounted ONCE inside `<BrowserRouter>` + `<Provider>` + `<LocaleProvider>`
 * so it has access to `useNavigate` / `useDispatch` / `useTranslation`
 * (the popover consumes the i18n context).
 *
 * Lifecycle (per blueprint §3.5): idle → navigating → resolving →
 * placed → ... → idle. The phase machine + onEnter/onExit firing live
 * in `use-tour-runner.ts` to keep this file's body lean (per
 * `feedback_200_loc_ceiling`); the runner just renders the overlay +
 * popover when phase==='placed' and registers the in-tree config tours
 * on mount.
 *
 * StrictMode-double-mount safety: the tour registry throws on duplicate
 * ids in dev. We track which ids THIS process has already registered
 * via a module-scoped `Set<string>`; a re-mounted runner is a no-op for
 * tours already in the registry. See learnings.md
 * `tour-12-strictmode-register-guard`.
 */

import * as React from 'react';

import {
  registerTour as registerTourImpl,
  getTour,
} from '../utils/tour-registry';
import { tours } from '../config/tours';
import { useTourAutostart } from '../hooks/use-tour-autostart';
import { useTourKeyboard } from '../hooks/use-tour-keyboard';
import { useTourRunner } from '../hooks/use-tour-runner';
import { TourOverlay } from './tour-overlay';
import { TourPopover } from './tour-popover';

/**
 * Module-scoped guard — survives StrictMode double-mount. Generalizes
 * any "register once, never twice" idempotency need.
 */
const registeredIds = new Set<string>();

/**
 * Register the in-tree config tours exactly once per id. Safe across
 * StrictMode double-mount and multiple TourRunner instances.
 */
function useRegisterTours(): void {
  React.useEffect(() => {
    for (const tour of tours) {
      if (registeredIds.has(tour.id)) continue;
      // Already in registry from a previous mount? Skip — registerTour
      // throws on duplicate in dev.
      if (getTour(tour.id)) {
        registeredIds.add(tour.id);
        continue;
      }
      try {
        registerTourImpl(tour);
        registeredIds.add(tour.id);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[tour] Failed to register tour "${tour.id}":`, err);
      }
    }
  }, []);
}

export function TourRunner(): JSX.Element | null {
  useRegisterTours();
  // tour-13: watch `?tour=<id>` URL param + auto-launch matching tour.
  useTourAutostart();
  const {
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
  } = useTourRunner();

  // Keyboard shortcuts active only while a step is placed.
  useTourKeyboard({
    active: phase === 'placed',
    onAdvance: advance,
    onPrevious: previous,
    onSkip: stop,
  });

  // Render gate: only show overlay + popover when the step is placed
  // AND we have a resolved element (defensive — placed implies element,
  // but the type system doesn't know that).
  if (phase !== 'placed' || !activeStep || !resolver.element) return null;

  return (
    <>
      <TourOverlay
        rect={liveRect}
        pad={activeStep.pad}
        onSkip={stop}
      />
      <TourPopover
        step={activeStep}
        stepIdx={stepIdx}
        totalSteps={totalSteps}
        anchor={resolver.element}
        placement={activeStep.placement}
        onAdvance={advance}
        onPrevious={previous}
        onSkip={skip}
        onClose={stop}
      />
    </>
  );
}

/**
 * Test-only escape hatch — clears the StrictMode-guard set so a fresh
 * mount re-registers the in-tree tours (paired with `clearRegistry()`
 * from `utils/tour-registry`). NOT exported from the public barrel.
 *
 * @internal
 */
export function __clearTourRunnerRegisteredIds(): void {
  registeredIds.clear();
}
