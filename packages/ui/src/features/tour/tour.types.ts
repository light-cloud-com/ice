/**
 * tour-1 — Tour engine type shapes.
 *
 * Canonical contract for the in-house JSON-driven guided-tour engine.
 * See `state/blueprints/tour.md` §2.3 for the full design rationale; the
 * types here are leaves-only, no runtime, no React, no Redux. Components
 * (tour-runner, tour-overlay, tour-popover), hooks (`useTour`,
 * `useTargetResolver`, …), and the `tour-slice` are landed in later
 * units (tour-3 → tour-12) and import these definitions verbatim.
 *
 * `AppDispatch` is sourced from the root store at `../../store` to keep
 * the lifecycle context typed against the live reducer set; importing
 * `NavigateFunction` from `react-router-dom` matches the runner's mount
 * point inside `<BrowserRouter>` (see blueprint §2.1).
 */
import type { AppDispatch } from '../../store';
import type { UserProfile } from '../../store/slices/account-slice';
import type React from 'react';
import type { NavigateFunction } from 'react-router-dom';

/**
 * Spotlight side relative to the resolved target. `'auto'` defers to the
 * popover's auto-placement heuristic (most-space-wins; see tour-10).
 */
export type Placement = 'top' | 'bottom' | 'left' | 'right' | 'auto';

/**
 * Per-step button overrides. Labels are i18n keys passed through `t()`;
 * `hideSkip` removes the Skip control entirely (e.g. on the terminal
 * step where Skip would be a no-op alias for Finish).
 */
export interface TourStepActions {
  /** Override default "Next" label. i18n key, runs through t(). */
  nextLabel?: string;
  /** Override default "Back" label. */
  backLabel?: string;
  /** Hide the skip button on this step (e.g. terminal step). */
  hideSkip?: boolean;
}

/**
 * One coachmark in a tour. The runner drives steps strictly in array
 * order; branching is out of scope for v1 (see blueprint §7).
 */
export interface TourStep {
  /** Unique within the parent tour (validated by `registerTour`). */
  id: string;
  /**
   * CSS selector (e.g. `'#ice-canvas-svg'`, `'[data-tour-id="..."]'`)
   * OR a thunk returning the live element. Selector preferred —
   * JSON-friendly and inspectable.
   */
  target: string | (() => Element | null);
  /** i18n key, evaluated through `t()`. */
  title: string;
  /**
   * Either an i18n key OR a `ReactNode` (rendered as-is). When a
   * string is passed, the popover runs it through `t()`; ReactNode
   * bypasses translation.
   */
  body: string | React.ReactNode;
  /** Default `'auto'` (computed by tour-popover from anchor rect). */
  placement?: Placement;
  /** Padding around the target rect for the spotlight. Default 8. */
  pad?: number;
  /**
   * Route to navigate to before resolving target. Skipped when
   * `pathname` already starts with this. Compared as-is (no params).
   */
  route?: string;
  /** Runs after navigation completed AND target resolved AND placed. */
  onEnter?: (ctx: TourLifecycleCtx) => void | Promise<void>;
  /** Runs before stepIdx changes (or close). */
  onExit?: (ctx: TourLifecycleCtx) => void | Promise<void>;
  /** If returns `false` the step is skipped (auto-advance). */
  condition?: (ctx: TourLifecycleCtx) => boolean;
  actions?: TourStepActions;
}

/**
 * Top-level tour. Step ids must be unique within `steps`; the array
 * MUST be non-empty (both validated by `registerTour`).
 */
export interface Tour {
  /** Globally unique. e.g. `'canvas-tour'`, `'palette-tour'`. */
  id: string;
  /** i18n key for tour-level title (used in registry UI / restart menu). */
  title: string;
  steps: TourStep[];
  /** Auto-fire predicate. If returns `true` the tour starts on app boot. */
  autoStart?: (s: AutoStartCtx) => boolean;
  /**
   * When `true`, the engine will NOT mark this tour completed on skip
   * (rare, e.g. tutorial-mode tours that the user re-runs intentionally).
   */
  manualOnly?: boolean;
}

/**
 * Lifecycle hook context handed to `onEnter` / `onExit` / `condition`.
 * Wraps the dispatch + navigate handles so step authors can side-effect
 * the redux store and the router without re-importing them.
 */
export interface TourLifecycleCtx {
  tourId: string;
  stepId: string;
  stepIdx: number;
  dispatch: AppDispatch;
  navigate: NavigateFunction;
}

/**
 * Inputs to a tour's auto-start predicate. `user` is the same shape
 * returned from `account-slice`'s `fetchProfile` thunk; `completedTours`
 * is the merged localStorage + server set; `pathname` is the current
 * location (re-evaluated on every router change by `<TourRunner />`).
 */
export interface AutoStartCtx {
  user: UserProfile | null;
  completedTours: string[];
  pathname: string;
}
