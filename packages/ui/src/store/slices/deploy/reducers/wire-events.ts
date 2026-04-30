/**
 * Deploy slice — wire-event reducers (the highest-risk group).
 *
 * Three reducers covering the typed `deploy:event` channel from pdl-7:
 *
 * - `applyNodeStatusEvent` — upserts `nodesById` from a per-node lifecycle
 *   event. **Load-bearing dedup logic** with three independent checks:
 *   1. Same-action seq dedup: `existing.last_seq >= e.seq` → drop.
 *   2. Action-aware: different actions (create / update / delete) bypass
 *      dedup entirely. The `seq` counter resets per `deploymentId`, so a
 *      destroy after a successful apply legitimately starts back at seq=1.
 *   3. Fresh-operation start: a `queued` arriving on a terminal record
 *      means a new op is starting, regardless of the action label.
 *
 *   Also mirrors terminal events into `state.results` so legacy consumers
 *   (DNS records filter, ResultsSummary, ApiErrorBanner) keep working.
 *   Skips the mirror once the slice's overall status is terminal.
 *
 * - `applyNodeProgressEvent` — updates `step` from a mid-apply progress
 *   milestone. Defensively seeds a minimal `applying` record when no prior
 *   status has arrived yet. Skips dedup against a TERMINAL existing record
 *   (same B1 medicine as `applyNodeStatusEvent`).
 *
 * - `applyDeployCompleteEvent` — maps the `outcome` (success / partial /
 *   failure / cancelled) onto `DeployStatus`. Doesn't push to history;
 *   `hydrateDeployFromHistory` reads from the DB row that the backend
 *   already wrote, so pushing here would double-add on a refresh.
 *
 * @see rf-dslice-7
 */

import type { PayloadAction } from '@reduxjs/toolkit';
import type {
  DeployCompleteEvent,
  DeployNodeProgressEvent,
  DeployNodeStatusEvent,
} from '@ice/types';
import type { DeployResourceResult, DeployState } from '../types';
import { t } from '../../../../i18n';

export const wireEventsReducers = {
  applyNodeStatusEvent: (state: DeployState, action: PayloadAction<DeployNodeStatusEvent>) => {
    const e = action.payload;
    const existing = state.nodesById[e.node_id];
    // Dedup: if the existing record's last_seq is higher, skip.
    //
    // pdl-10 critic finding B1 — the deploy-tape `seq` counter resets per
    // `deploymentId` (see `deploy-event-log.ts:nextSeqByDeployment`), so
    // a destroy after a successful apply starts back at seq=1 while the
    // existing record's `last_seq` is at the apply's terminal seq (e.g.
    // 9). Without action-awareness here, every destroy event would be
    // silently dropped, leaving the smoke-test regression in
    // `ux-destroy-action-bypasses-node-status-wire` unfixed even after
    // pdl-10's backend wiring. Different actions (create / update /
    // delete) are different operations by definition; their seq
    // counters are independent so the dedup must be too. Same medicine
    // applies to a future re-deploy: a `queued` status arriving on a
    // node whose existing record is terminal means a new operation is
    // starting, regardless of whether the action label changed.
    if (existing) {
      const sameAction = existing.action === e.action;
      const isFreshOperationStart =
        e.status === 'queued' &&
        (existing.status === 'succeeded' ||
          existing.status === 'failed' ||
          existing.status === 'skipped' ||
          existing.status === 'cancelled-due-to-dep');
      if (sameAction && !isFreshOperationStart && existing.last_seq >= e.seq) return;
    }
    state.nodesById[e.node_id] = {
      node_id: e.node_id,
      status: e.status,
      resource_name: e.resource_name,
      resource_type: e.resource_type,
      action: e.action,
      error: e.error,
      duration_ms: e.duration_ms,
      // Preserve the previous step on a status-only flip — the next
      // progress event can update it. Don't clobber to undefined.
      step: existing?.step,
      last_at: e.at,
      last_seq: e.seq,
    };

    // Skip the post-complete results mirror if the status has flipped
    // to a terminal — `deploySuccess` / `deployError` (or
    // `applyDeployCompleteEvent`) own that surface.
    if (state.status === 'success' || state.status === 'error' || state.status === 'cancelled') return;

    // Mirror terminal node_status events into state.results so the
    // existing deploy-panel consumers (DNS records, ResultsSummary,
    // ApiErrorBanner) keep working without churn. The node_status
    // wire shape is a strict subset of DeployResourceResult — outputs
    // / provider_id / api_enable_url are missing because the wire
    // stream doesn't carry them. The HTTP response's deploySuccess /
    // deployError replaces this list with the authoritative version
    // on completion (see existing comments at deploySuccess line 357).
    const isTerminal =
      e.status === 'succeeded' ||
      e.status === 'failed' ||
      e.status === 'skipped' ||
      e.status === 'cancelled-due-to-dep';
    if (!isTerminal) return;
    const resultIndex = state.results.findIndex((r) => r.source_node_id === e.node_id);
    const result: DeployResourceResult = {
      name: e.resource_name,
      type: e.resource_type,
      action: e.action,
      success: e.status === 'succeeded',
      error: e.error?.message,
      duration_ms: e.duration_ms,
      source_node_id: e.node_id,
    };
    if (resultIndex >= 0) {
      // Preserve any outputs / provider_id that may have been written
      // earlier (e.g. from a snapshot hydrate).
      const prior = state.results[resultIndex];
      state.results[resultIndex] = { ...prior, ...result, outputs: prior.outputs, provider_id: prior.provider_id };
    } else {
      state.results.push(result);
    }
  },
  applyNodeProgressEvent: (state: DeployState, action: PayloadAction<DeployNodeProgressEvent>) => {
    const e = action.payload;
    const existing = state.nodesById[e.node_id];
    if (!existing) {
      state.nodesById[e.node_id] = {
        node_id: e.node_id,
        status: 'applying',
        resource_name: e.resource_name,
        // Wire `node_progress` doesn't carry resource_type/action — leave
        // empty for now; the next node_status event will fill them in.
        resource_type: '',
        action: 'create',
        step: e.step,
        last_at: e.at,
        last_seq: e.seq,
      };
      return;
    }
    // Don't dedup against a TERMINAL existing record — that's a stale
    // post-completion snapshot from a prior op (see B1 fix in
    // applyNodeStatusEvent). A progress event arriving means the new op
    // is mid-flight; the next node_status event will refresh the
    // record properly.
    const isExistingTerminal =
      existing.status === 'succeeded' ||
      existing.status === 'failed' ||
      existing.status === 'skipped' ||
      existing.status === 'cancelled-due-to-dep';
    if (!isExistingTerminal && existing.last_seq >= e.seq) return;
    existing.step = e.step;
    existing.last_at = e.at;
    existing.last_seq = e.seq;
  },
  applyDeployCompleteEvent: (state: DeployState, action: PayloadAction<DeployCompleteEvent>) => {
    const e = action.payload;
    if (e.outcome === 'success') {
      state.status = 'success';
    } else if (e.outcome === 'cancelled') {
      state.status = 'cancelled';
    } else {
      state.status = 'error';
    }
    state.currentDeployCardId = undefined;
    state.logs.push(t('deploy.slice.completed', { seconds: '0.0' }));
  },
} as const;
