/**
 * Deploy slice — outcome reducers.
 *
 * Three reducers covering the terminal HTTP-response paths and the manual
 * reset:
 *
 * - `deploySuccess` — flip status to 'success', replace `results` with the
 *   authoritative API payload (when provided), append a log, push to
 *   `history` (capped at 50 entries).
 *
 * - `deployError` — accept either a bare string or `{ error, results }`,
 *   flip status to 'error', store message, replace `results`, append log,
 *   push to history.
 *
 * - `resetDeploy` — wipe per-deploy fields back to defaults. Field reset
 *   list is LOAD-BEARING: status, error, plan, currentDeployCardId, logs,
 *   results, nodesById. Adding/dropping a field changes the post-reset
 *   shape and breaks downstream consumers.
 *
 * @see rf-dslice-8
 */

import { t } from '../../../../i18n';
import type { DeployResourceResult, DeployState } from '../types';
import type { PayloadAction } from '@reduxjs/toolkit';

export const outcomeReducers = {
  deploySuccess: (
    state: DeployState,
    action: PayloadAction<{ duration_ms: number; results?: DeployResourceResult[] }>,
  ) => {
    state.status = 'success';
    state.currentDeployCardId = undefined;
    // Authoritative results from the API response — replaces whatever
    // the socket events accumulated via `applyNodeStatusEvent`'s
    // mirror path. The wire's `node_status` events don't carry
    // `outputs` / `provider_id` / `api_enable_url`; the HTTP response
    // does, and those fields are what the deploy-panel ResultsSummary
    // and DNS-records filter need to render.
    if (Array.isArray(action.payload.results) && action.payload.results.length > 0) {
      state.results = action.payload.results;
    }
    state.logs.push(t('deploy.slice.completed', { seconds: (action.payload.duration_ms / 1000).toFixed(1) }));

    // Add to history (capped at 50 entries)
    state.history.unshift({
      id: `deploy-${Date.now()}`,
      timestamp: Date.now(),
      environment: state.environment,
      provider: state.provider,
      project: state.gcpProject,
      region: state.region,
      results: state.results,
      success: state.results.every((r) => r.success),
      duration_ms: action.payload.duration_ms,
    });
    if (state.history.length > 50) {
      state.history = state.history.slice(0, 50);
    }
  },
  deployError: (
    state: DeployState,
    action: PayloadAction<string | { error: string; results?: DeployResourceResult[] }>,
  ) => {
    const payload = typeof action.payload === 'string' ? { error: action.payload } : action.payload;
    state.status = 'error';
    state.error = payload.error;
    state.currentDeployCardId = undefined;
    // Authoritative per-resource results from the API response, when
    // provided — the summary needs these to show the partial-success
    // breakdown ("11 of 13 deployed; 2 failed").
    if (Array.isArray(payload.results) && payload.results.length > 0) {
      state.results = payload.results;
    }
    state.logs.push(t('deploy.slice.error', { error: payload.error }));
    // Add the (failed) deploy to history alongside successes so users
    // can review what failed without scrolling the live log.
    state.history.unshift({
      id: `deploy-${Date.now()}`,
      timestamp: Date.now(),
      environment: state.environment,
      provider: state.provider,
      project: state.gcpProject,
      region: state.region,
      results: state.results,
      success: false,
      duration_ms: payload.results ? payload.results.reduce((acc, r) => acc + (r.duration_ms || 0), 0) : 0,
    });
    if (state.history.length > 50) {
      state.history = state.history.slice(0, 50);
    }
  },
  resetDeploy: (state: DeployState) => {
    state.status = 'idle';
    state.error = null;
    state.plan = null;
    state.currentDeployCardId = undefined;
    state.logs = [];
    state.results = [];
    state.nodesById = {};
  },
} as const;
