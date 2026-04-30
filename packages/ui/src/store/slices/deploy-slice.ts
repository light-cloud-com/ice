/**
 * Deploy State Slice
 *
 * Manages deployment state for the desktop app:
 * - Deploy panel visibility
 * - Plan preview (changes to apply)
 * - Deploy progress and logs
 * - Deploy history
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type {
  DeployCompleteEvent,
  DeployNodeProgressEvent,
  DeployNodeStatusEvent,
} from '@ice/types';
import { setActiveCard } from './cards-slice';
import { t } from '../../i18n';

// ─── Types ──────────────────────────────────────────────────────────────────
//
// Types live in `./deploy/types` (rf-dslice-1). The re-export preserves the
// public import path for external consumers; the `import type` line brings
// the names into THIS module's lexical scope for internal references.

export type {
  DeployPlan,
  DeployResourceResult,
  DeployedResource,
  NodeDriftInfo,
  DeployStatus,
  NodeDeployState,
  DeployRollup,
  DeployState,
  DiagnosisState,
  ResolvedRequirementState,
} from './deploy/types';
import type {
  DeployPlan,
  DeployResourceResult,
  DeployedResource,
  NodeDriftInfo,
  DeployState,
  NodeDeployState,
  ResolvedRequirementState,
} from './deploy/types';

// ─── Derived view helpers ──────────────────────────────────────────────────
//
// `deriveRollup` and `orderNodesForPanel` live in `./deploy/derive`
// (rf-dslice-2). The re-export preserves the public import path for external
// consumers (deploy-banner, deploy-in-flight-panel, etc.).

export { deriveRollup, orderNodesForPanel } from './deploy/derive';

// ─── Reducer groups ────────────────────────────────────────────────────────
//
// Panel + configuration reducers (rf-dslice-3) live in
// `./deploy/reducers/panel-config`. The runtime import brings the
// case-reducer object into THIS module's lexical scope so the `createSlice`
// `reducers:` block can spread it. RTK still owns the action type strings
// (`'deploy/openDeployPanel'` etc.) because action types are derived from
// the keys of the spread object inside `createSlice`.

import { panelConfigReducers } from './deploy/reducers/panel-config';

const initialState: DeployState = {
  isOpen: false,
  provider: 'gcp',
  gcpProject: '',
  region: 'us-central1',
  environment: 'development',
  status: 'idle',
  error: null,
  plan: null,
  logs: [],
  results: [],
  nodesById: {},
  history: [],
  deployedResources: [],
  driftByNode: {},
  driftCheckLoading: false,
  requirements: [],
  requirementsLoading: false,
  diagnosis: { status: 'idle', result: null, error: null },
  dismissedWarnings: [],
  criticalAcknowledged: false,
};

// ─── Slice ──────────────────────────────────────────────────────────────────

const deploySlice = createSlice({
  name: 'deploy',
  initialState,
  reducers: {
    ...panelConfigReducers,

    // Authentication
    startAuthenticating(state) {
      state.status = 'authenticating';
      state.error = null;
      state.logs = [t('deploy.slice.connecting')];
    },
    authSuccess(state) {
      state.status = 'idle';
      state.logs.push(t('deploy.slice.authSuccess'));
    },
    authFailed(state, action: PayloadAction<string>) {
      state.status = 'error';
      state.error = action.payload;
      state.logs.push(t('deploy.slice.authFailed', { error: action.payload }));
    },

    // Planning
    startPlanning(state) {
      state.status = 'planning';
      state.error = null;
      state.plan = null;
      state.logs = [t('deploy.slice.planning')];
      // Reset per-plan UI state (AI-Native #3)
      state.dismissedWarnings = [];
      state.criticalAcknowledged = false;
    },
    setPlan(state, action: PayloadAction<DeployPlan>) {
      // Normalize plan shape — backend may omit updates/deletes or send numbers
      // instead of arrays in older responses. Guarantee arrays downstream.
      const raw = (action.payload || {}) as Partial<DeployPlan>;
      const normalized: DeployPlan = {
        creates: Array.isArray(raw.creates) ? raw.creates : [],
        updates: Array.isArray(raw.updates) ? raw.updates : [],
        deletes: Array.isArray(raw.deletes) ? raw.deletes : [],
        skipped: Array.isArray(raw.skipped) ? raw.skipped : [],
        warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
      };
      state.status = 'planned';
      state.plan = normalized;
      state.logs.push(
        t('deploy.slice.planReady', {
          creates: normalized.creates.length,
          updates: normalized.updates.length,
          deletes: normalized.deletes.length,
        }),
      );
    },

    // Deploy execution
    startDeploying(state, action: PayloadAction<{ cardId?: string } | undefined>) {
      // Idempotent: a no-op if a deploy/destroy is already in flight.
      // Used both by the user-initiated path (Plan → Deploy click) and
      // by the socket subscription hook when an externally-triggered
      // deploy (e.g. GitHub push webhook) starts streaming events. The
      // subscription hook can't tell whether the slice is already in a
      // deploy state, so it dispatches blindly and we deduplicate here.
      // Also a no-op when destroying — destroy events use the same
      // progress channel and would otherwise stomp the destroying label.
      if (state.status === 'deploying' || state.status === 'planning' || state.status === 'destroying') return;
      state.status = 'deploying';
      state.results = [];
      state.nodesById = {};
      state.error = null;
      state.currentDeployCardId = action?.payload?.cardId ?? state.currentDeployCardId;
      state.logs.push(t('deploy.slice.deploying'));
    },
    startDestroying(state, action: PayloadAction<{ cardId?: string } | undefined>) {
      // Tear-down counterpart to startDeploying. Sets the slice into
      // a 'destroying' state so the StatusBadge + UI labels reflect
      // the operation. The subscription hook checks for this state
      // before flipping back to 'deploying' on incoming progress events.
      if (state.status === 'destroying') return;
      state.status = 'destroying';
      state.results = [];
      state.nodesById = {};
      state.error = null;
      state.currentDeployCardId = action?.payload?.cardId ?? state.currentDeployCardId;
      state.logs.push('Destroying deployment...');
    },
    /**
     * pdl-7 — apply a per-node lifecycle event from the typed `deploy:event`
     * channel. Upserts the node record in `nodesById`, dedups by `seq`
     * (lower-or-equal seq is dropped — replay arrived after live, or
     * out-of-order delivery). Also mirrors terminal events into
     * `state.results` so the deploy-panel's existing consumers (DNS
     * records filter, ResultsSummary, ApiErrorBanner) keep working
     * unchanged. The HTTP response's `deploySuccess` / `deployError`
     * payload still wins on completion — those carry the authoritative
     * `outputs` / `provider_id` / `api_enable_url` that `node_status`
     * events don't have.
     */
    applyNodeStatusEvent(state, action: PayloadAction<DeployNodeStatusEvent>) {
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
    /**
     * pdl-7 — apply a per-node mid-apply progress milestone. Updates the
     * `step` field on the existing record. Defensively seeds a minimal
     * `applying` record when no prior status has arrived yet (handler
     * fires `on_step` before the scheduler's first `applying` event).
     */
    applyNodeProgressEvent(state, action: PayloadAction<DeployNodeProgressEvent>) {
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
    /**
     * pdl-7 — apply the terminal `complete` wire event. Maps `outcome`
     * onto the slice's `DeployStatus`:
     *   success                 → 'success'
     *   partial | failure       → 'error' (red header + Copy errors button)
     *   cancelled               → 'cancelled' (zero successes, per pdl-2 contract)
     * Doesn't push to `state.history` — `hydrateDeployFromHistory` reads
     * from the DB row that the backend already wrote, so pushing here
     * would double-add on a refresh.
     */
    applyDeployCompleteEvent(state, action: PayloadAction<DeployCompleteEvent>) {
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

    // Completion
    deploySuccess(
      state,
      action: PayloadAction<{ duration_ms: number; results?: DeployResourceResult[] }>,
    ) {
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
    deployError(state, action: PayloadAction<string | { error: string; results?: DeployResourceResult[] }>) {
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
        duration_ms: payload.results
          ? payload.results.reduce((acc, r) => acc + (r.duration_ms || 0), 0)
          : 0,
      });
      if (state.history.length > 50) {
        state.history = state.history.slice(0, 50);
      }
    },

    // Reset
    resetDeploy(state) {
      state.status = 'idle';
      state.error = null;
      state.plan = null;
      state.currentDeployCardId = undefined;
      state.logs = [];
      state.results = [];
      state.nodesById = {};
    },

    appendLog(state, action: PayloadAction<string>) {
      state.logs.push(action.payload);
    },

    // Deployed resources (for monitoring)
    setDeployedResources(state, action: PayloadAction<DeployedResource[]>) {
      state.deployedResources = action.payload;
    },

    // Drift detection
    setDriftCheckLoading(state, action: PayloadAction<boolean>) {
      state.driftCheckLoading = action.payload;
    },
    setDriftResults(state, action: PayloadAction<NodeDriftInfo[]>) {
      state.driftByNode = {};
      for (const info of action.payload) {
        state.driftByNode[info.nodeId] = info;
      }
      state.driftCheckLoading = false;
    },
    clearDrift(state) {
      state.driftByNode = {};
      state.driftCheckLoading = false;
    },
    // Phase 8 — block requirements
    startRequirementsFetch(state) {
      state.requirementsLoading = true;
    },
    setRequirements(state, action: PayloadAction<ResolvedRequirementState[]>) {
      state.requirements = action.payload;
      state.requirementsLoading = false;
      state.requirementsFetchedAt = new Date().toISOString();
    },
    updateRequirement(state, action: PayloadAction<ResolvedRequirementState>) {
      const idx = state.requirements.findIndex(
        (r) => r.definitionId === action.payload.definitionId && r.nodeId === action.payload.nodeId,
      );
      if (idx >= 0) {
        state.requirements[idx] = action.payload;
      } else {
        state.requirements.push(action.payload);
      }
    },
    clearRequirements(state) {
      state.requirements = [];
      state.requirementsLoading = false;
      state.requirementsFetchedAt = undefined;
    },

    // AI-Native #2 — diagnosis actions
    startDiagnosis(state) {
      state.diagnosis = { status: 'loading', result: null, error: null };
    },
    setDiagnosis(state, action: PayloadAction<{ diagnosis: string; suggestedFixes: string[] }>) {
      state.diagnosis = { status: 'loaded', result: action.payload, error: null };
    },
    diagnosisError(state, action: PayloadAction<string>) {
      state.diagnosis = { status: 'error', result: null, error: action.payload };
    },
    clearDiagnosis(state) {
      state.diagnosis = { status: 'idle', result: null, error: null };
    },

    // AI-Native #3 — pre-deploy warning actions
    dismissPreDeployWarning(state, action: PayloadAction<string>) {
      if (!state.dismissedWarnings.includes(action.payload)) {
        state.dismissedWarnings.push(action.payload);
      }
    },
    acknowledgeCritical(state, action: PayloadAction<boolean>) {
      state.criticalAcknowledged = action.payload;
    },
    resetPreDeployWarnings(state) {
      state.dismissedWarnings = [];
      state.criticalAcknowledged = false;
    },
    /**
     * Seed the slice from a persisted CanvasDeployment row so the
     * deploy panel's results section survives page reloads. Maps the
     * DB-side `status` enum (success | partial | failed | cancelled)
     * onto the slice's runtime status; partial → 'error' so the red
     * "Deploy finished with errors" header + Copy errors button
     * render as expected.
     *
     * Trusted aggressively: even when the live state says 'deploying',
     * a terminal DB row wins. The gateway's deploy-snapshot can outlive
     * the actual deploy (process exits/restarts during deploy don't
     * always finalize the snapshot), so a "deploying@99% forever" UI
     * state regularly out-survives the DB row that says the deploy
     * finished. Trusting the DB is correct: the row is only ever
     * written on terminal completion.
     */
    hydrateDeployFromHistory(
      state,
      action: PayloadAction<{
        cardId: string;
        status: string;
        results?: DeployResourceResult[];
        error?: string | null;
        duration_ms?: number | null;
        environment?: string | null;
      }>,
    ) {
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
  },
  extraReducers: (builder) => {
    // Reset per-project deploy state when the active card actually
    // changes. setActiveCard can fire repeatedly with the same id (route
    // re-renders, environment refreshes, etc.); resetting unconditionally
    // would wipe a freshly-completed deploy's results section the moment
    // the sidebar refreshed. Track the last seen card id in
    // currentDeployCardId so we only reset on a true switch.
    //
    // We deliberately preserve user prefs that are not project-scoped
    // (provider, gcpProject, region, environment, dismissedWarnings)
    // so the user doesn't have to re-pick them every project switch.
    builder.addCase(setActiveCard, (state, action) => {
      const newCardId = action.payload;
      // No-op when re-selecting the same card. setActiveCard fires
      // repeatedly with the same id during route re-renders / sidebar
      // refreshes; resetting unconditionally would wipe a freshly-
      // completed deploy's results section the moment the layout
      // re-rendered.
      if (state.lastResetCardId === newCardId) return;
      // Also no-op while a deploy is mid-flight on this card — flipping
      // status to 'idle' under it would hide the running progress UI.
      if (state.status === 'deploying' || state.status === 'destroying' || state.status === 'planning') return;
      state.status = 'idle';
      state.error = null;
      state.plan = null;
      state.logs = [];
      state.results = [];
      state.nodesById = {};
      state.deployedResources = [];
      state.driftByNode = {};
      state.driftCheckLoading = false;
      state.requirements = [];
      state.requirementsLoading = false;
      state.requirementsFetchedAt = undefined;
      state.diagnosis = { status: 'idle', result: null, error: null };
      state.criticalAcknowledged = false;
      state.currentDeployCardId = undefined;
      state.lastResetCardId = newCardId;
    });
  },
});

export const {
  openDeployPanel,
  closeDeployPanel,
  setProvider,
  setGcpProject,
  setRegion,
  setEnvironment,
  startAuthenticating,
  authSuccess,
  authFailed,
  startPlanning,
  setPlan,
  startDeploying,
  startDestroying,
  // pdl-7 — typed deploy:event reducers (replace legacy setDeployProgress /
  // addResourceResult / type:'progress' / type:'resource_result' branches).
  // pdl-5 retired `setDeployProgress` — the snapshot-pull path now drives
  // `nodesById` directly via `applyNodeStatusEvent` calls reconstructed
  // from `snapshot.nodeStatuses`.
  applyNodeStatusEvent,
  applyNodeProgressEvent,
  applyDeployCompleteEvent,
  deploySuccess,
  deployError,
  hydrateDeployFromHistory,
  resetDeploy,
  appendLog,
  setDeployedResources,
  setDriftCheckLoading,
  setDriftResults,
  clearDrift,
  startRequirementsFetch,
  setRequirements,
  updateRequirement,
  clearRequirements,
  startDiagnosis,
  setDiagnosis,
  diagnosisError,
  clearDiagnosis,
  dismissPreDeployWarning,
  acknowledgeCritical,
  resetPreDeployWarnings,
} = deploySlice.actions;

export default deploySlice.reducer;
