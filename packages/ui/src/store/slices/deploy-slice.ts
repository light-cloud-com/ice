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
import { authReducers } from './deploy/reducers/auth';
import { planningReducers } from './deploy/reducers/planning';
import { deployPhasesReducers } from './deploy/reducers/deploy-phases';
import { wireEventsReducers } from './deploy/reducers/wire-events';
import { outcomeReducers } from './deploy/reducers/outcome';
import { logsResourcesDriftReducers } from './deploy/reducers/logs-resources-drift';
import { requirementsReducers } from './deploy/reducers/requirements';
import { diagnosisReducers } from './deploy/reducers/diagnosis';
import { preDeployReducers } from './deploy/reducers/pre-deploy';

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
    ...authReducers,
    ...planningReducers,
    ...deployPhasesReducers,
    ...wireEventsReducers,
    ...outcomeReducers,
    ...logsResourcesDriftReducers,
    ...requirementsReducers,
    ...diagnosisReducers,
    ...preDeployReducers,

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
