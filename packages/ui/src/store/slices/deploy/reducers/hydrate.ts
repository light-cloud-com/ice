/**
 * Deploy slice — hydrate-from-history reducer.
 *
 * Single reducer that seeds the slice from a persisted `CanvasDeployment`
 * row so the deploy panel's results section survives page reloads. Maps
 * the DB-side `status` enum (`success | partial | failed | cancelled`)
 * onto the slice's runtime status; `partial`/`failed`/`cancelled` all
 * fold into `'error'` so the red header + Copy errors button render
 * as expected.
 *
 * **Load-bearing non-terminal status guard**: the early return on a
 * non-completed status prevents hydrating an in-flight row, which would
 * otherwise yank the live deploy back to a stale completion state.
 *
 * Trusted aggressively for terminal DB rows: even when live state says
 * 'deploying', a terminal DB row wins. The gateway's deploy-snapshot can
 * outlive the actual deploy (process exits/restarts don't always finalize
 * the snapshot), so a "deploying@99% forever" UI state regularly
 * out-survives the DB row that says the deploy finished. Trusting the DB
 * is correct: the row is only ever written on terminal completion.
 *
 * @see rf-dslice-13
 */

import { t } from '../../../../i18n';
import type { DeployResourceResult, DeployState } from '../types';
import type { PayloadAction } from '@reduxjs/toolkit';

export const hydrateReducers = {
  hydrateDeployFromHistory: (
    state: DeployState,
    action: PayloadAction<{
      cardId: string;
      status: string;
      results?: DeployResourceResult[];
      error?: string | null;
      duration_ms?: number | null;
      environment?: string | null;
    }>,
  ) => {
    const { status, results, error, duration_ms, environment, cardId } = action.payload;
    const completed = ['success', 'partial', 'failed', 'cancelled'];
    if (!completed.includes(status)) return;

    // Map DB status → slice status. 'cancelled' folds into 'error'
    // so the red header + Copy errors button render (a cancelled
    // deploy is just an error from the UX perspective).
    state.status = status === 'success' ? 'success' : 'error';
    state.error = error || null;
    state.results = Array.isArray(results) ? results : [];
    // Update lastResetCardId so the setActiveCard extraReducer doesn't
    // fire and wipe what we just hydrated.
    state.lastResetCardId = cardId;
    if (environment && (environment === 'development' || environment === 'staging' || environment === 'production')) {
      state.environment = environment as 'development' | 'staging' | 'production';
    }
    if (typeof duration_ms === 'number') {
      // Don't push to history (it's already in the DB) — just leave it
      // here for the summary header's duration display via results.
      state.logs.push(t('deploy.slice.completed', { seconds: (duration_ms / 1000).toFixed(1) }));
    }
  },
} as const;
