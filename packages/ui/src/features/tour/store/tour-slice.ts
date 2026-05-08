/**
 * tour-6 — Tour engine Redux slice.
 *
 * Feature-local (per blueprint §4.1 + decision 2026-05-08): the slice
 * lives under `features/tour/store/` rather than `store/slices/` so the
 * tour feature stays self-contained. Registered in the root store at
 * `packages/ui/src/store/index.ts` exactly once.
 *
 * State machine (blueprint §3.5, refined per tour-12 followup):
 *   idle → navigating → resolving → entering → placed → ... → idle
 *   any → missing → idle (when resolver gives up)
 *
 * The `'entering'` phase exists so `step.onEnter` resolves BEFORE the
 * overlay/popover paints. Without it, an onEnter that mutates layout
 * (sidebar open, scroll, focus) would paint against stale DOM. Render
 * gate stays at `phase === 'placed'`; the runner only flips to
 * `'placed'` after the awaited onEnter settles.
 *
 * Persistence (blueprint §4.2): three-tier — localStorage fast-path,
 * server (`PUT /api/onboarding/completed-tours/:id`), and slice merge.
 * `hydrateFromUser` unions both, server wins on conflict, writes the
 * merged set back to localStorage so the next boot is consistent even
 * before the profile API resolves.
 *
 * Action prefix `tour/` is added to `LOGGED_ACTION_PREFIXES` in the
 * root store for E2E observability.
 */
import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import axiosInstance from '../../../shared/api/axios-instance';
import { getTour } from '../utils/tour-registry';

declare const process: { env: { NODE_ENV?: string } };

/** localStorage key for the completed-tours fast-path read. */
export const COMPLETED_TOURS_STORAGE_KEY = 'ice-completed-tours';

export type TourPhase =
  | 'idle'
  | 'navigating'
  | 'resolving'
  | 'entering'
  | 'placed'
  | 'missing';

export interface TourPerTourTelemetry {
  /** Number of `recordAdvance` dispatches for this tour. Reset on `start`. */
  stepsAdvanced: number;
  /** True if the tour was closed via `skip` (vs. completed naturally). */
  skipped: boolean;
}

export interface TourState {
  activeTourId: string | null;
  /** 0-based step index within the active tour. */
  stepIdx: number;
  phase: TourPhase;
  /** Tour ids in completion order (insertion-deduped). */
  completedTours: string[];
  /** Per-tour stepwise telemetry, captured for future analytics. */
  perTour: Record<string, TourPerTourTelemetry>;
  /** True after the first `hydrateFromUser` dispatch — gates auto-fire. */
  hydrated: boolean;
}

/**
 * Read the localStorage fast-path. Wrapped in `try / catch` so a bad
 * JSON blob (or `localStorage` access throwing in private-mode Safari)
 * collapses to an empty array rather than crashing slice init. Matches
 * the pattern used in `onboarding-checklist.tsx:32-38`.
 */
function readCompletedFromStorage(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(COMPLETED_TOURS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

/**
 * Write the deduped completed-tours array back to localStorage. Quota
 * errors swallowed — losing the fast-path read on next boot is
 * recoverable (server-side `hydrateFromUser` re-fills it).
 */
function writeCompletedToStorage(ids: string[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(COMPLETED_TOURS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore quota / access errors */
  }
}

const initialState: TourState = {
  activeTourId: null,
  stepIdx: 0,
  phase: 'idle',
  completedTours: readCompletedFromStorage(),
  perTour: {},
  hydrated: false,
};

/**
 * POST the just-completed tour id to the server. Optimistic — the slice
 * has already updated its state by the time this fires, so a network
 * failure logs but doesn't roll back. Matches the rest of the
 * onboarding router shape (PUT `/onboarding/...` on the same auth
 * middleware).
 */
export const persistCompletedTour = createAsyncThunk<void, string>(
  'tour/persistCompletedTour',
  async (tourId) => {
    try {
      await axiosInstance.put(`/onboarding/completed-tours/${encodeURIComponent(tourId)}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[tour] failed to persist completion of "${tourId}":`, err);
    }
  },
);

const tourSlice = createSlice({
  name: 'tour',
  initialState,
  reducers: {
    /**
     * Begin a tour. Validates the id is registered (blueprint §6/tour-6
     * test 2 — unregistered id is a no-op + dev warn). Resets stepIdx,
     * flips phase to `navigating`, and seeds the per-tour telemetry
     * counter.
     */
    startTour(state, action: PayloadAction<{ tourId: string; totalSteps: number }>) {
      const { tourId } = action.payload;
      const tour = getTour(tourId);
      if (!tour) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn(`[tour] startTour("${tourId}") — tour is not registered; ignoring.`);
        }
        return;
      }
      state.activeTourId = tourId;
      state.stepIdx = 0;
      state.phase = 'navigating';
      state.perTour[tourId] = { stepsAdvanced: 0, skipped: false };
    },
    /** Set the active step index. Caller is responsible for bounds checking. */
    setStep(state, action: PayloadAction<number>) {
      state.stepIdx = action.payload;
    },
    /** Update the lifecycle phase. Drives the runner's effect chain. */
    setPhase(state, action: PayloadAction<TourPhase>) {
      state.phase = action.payload;
    },
    /**
     * Mark a tour completed: append (deduped, insertion-order), reset
     * active state, and write through to localStorage. The thunk that
     * persists to the server is dispatched separately by `useTour`.
     */
    markCompleted(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (!state.completedTours.includes(id)) {
        state.completedTours.push(id);
      }
      state.activeTourId = null;
      state.stepIdx = 0;
      state.phase = 'idle';
      writeCompletedToStorage(state.completedTours);
    },
    /**
     * Close the current tour without marking it completed. Telemetry
     * (`perTour[id].skipped = true` on skip) is set by `skipTour`.
     */
    stopTour(state) {
      state.activeTourId = null;
      state.stepIdx = 0;
      state.phase = 'idle';
    },
    /**
     * Convenience flag for the `skip` path: marks the active tour's
     * telemetry as skipped before `markCompleted` flips activeTourId.
     * Caller is expected to dispatch `markCompleted` immediately after.
     */
    flagSkipped(state, action: PayloadAction<string>) {
      const id = action.payload;
      const t = state.perTour[id];
      if (t) t.skipped = true;
      else state.perTour[id] = { stepsAdvanced: 0, skipped: true };
    },
    /**
     * Merge server completedTours with the in-memory + localStorage set.
     * Server wins on conflict (per blueprint §4.2): the union is
     * computed by appending any server ids missing from local in their
     * server-supplied order, then writing the merged list back to
     * localStorage so future fast-path reads see the latest set.
     */
    hydrateFromUser(state, action: PayloadAction<{ completedTours: string[] }>) {
      const serverIds = (action.payload.completedTours ?? []).filter(
        (x): x is string => typeof x === 'string',
      );
      const merged: string[] = [...state.completedTours];
      const seen = new Set(merged);
      for (const id of serverIds) {
        if (!seen.has(id)) {
          merged.push(id);
          seen.add(id);
        }
      }
      state.completedTours = merged;
      state.hydrated = true;
      writeCompletedToStorage(merged);
    },
    /**
     * Increment the per-tour `stepsAdvanced` counter. Called by
     * `useTour.advance()` BEFORE the `setStep` dispatch so the counter
     * reflects user-driven advances, not internal phase transitions.
     */
    recordAdvance(state) {
      const id = state.activeTourId;
      if (!id) return;
      const t = state.perTour[id];
      if (t) t.stepsAdvanced += 1;
      else state.perTour[id] = { stepsAdvanced: 1, skipped: false };
    },
    /**
     * Reset only the active-tour fields. `completedTours` and `perTour`
     * are preserved (use case: switching tours without losing history).
     */
    resetTour(state) {
      state.activeTourId = null;
      state.stepIdx = 0;
      state.phase = 'idle';
    },
  },
});

export const {
  startTour,
  setStep,
  setPhase,
  markCompleted,
  stopTour,
  flagSkipped,
  hydrateFromUser,
  recordAdvance,
  resetTour,
} = tourSlice.actions;

export default tourSlice.reducer;

// Selectors — small enough to live alongside the slice rather than a
// separate module. Each takes the full RootState slot via a generic
// shape so the slice can be consumed without circular store imports.
export interface TourSliceRoot {
  tour: TourState;
}

export const selectActiveTourId = (s: TourSliceRoot): string | null => s.tour.activeTourId;
export const selectStepIdx = (s: TourSliceRoot): number => s.tour.stepIdx;
export const selectPhase = (s: TourSliceRoot): TourPhase => s.tour.phase;
export const selectCompletedTours = (s: TourSliceRoot): string[] => s.tour.completedTours;
export const selectIsCompleted = (id: string) => (s: TourSliceRoot): boolean =>
  s.tour.completedTours.includes(id);
export const selectHydrated = (s: TourSliceRoot): boolean => s.tour.hydrated;
