/**
 * Deploy State Slice
 *
 * Manages deployment state for the desktop app:
 * - Deploy panel visibility
 * - Plan preview (changes to apply)
 * - Deploy progress and logs
 * - Deploy history
 */

import { createSlice } from '@reduxjs/toolkit';
import { setActiveCard } from './cards-slice';
// Reducer groups (rf-dslice-3 through rf-dslice-13) live under
// `./deploy/reducers/`. The runtime imports bring each group's case-reducer
// object into THIS module's lexical scope so the `createSlice` `reducers:`
// block can spread them. RTK still owns the action type strings
// (`'deploy/openDeployPanel'` etc.) because action types are derived from
// the keys of the spread object inside `createSlice`.
import { authReducers } from './deploy/reducers/auth';
import { deployPhasesReducers } from './deploy/reducers/deploy-phases';
import { diagnosisReducers } from './deploy/reducers/diagnosis';
import { hydrateReducers } from './deploy/reducers/hydrate';
import { logsResourcesDriftReducers } from './deploy/reducers/logs-resources-drift';
import { outcomeReducers } from './deploy/reducers/outcome';
import { panelConfigReducers } from './deploy/reducers/panel-config';
import { planningReducers } from './deploy/reducers/planning';
import { preDeployReducers } from './deploy/reducers/pre-deploy';
import { requirementsReducers } from './deploy/reducers/requirements';
import { wireEventsReducers } from './deploy/reducers/wire-events';
import type { DeployState } from './deploy/types';

// ─── Types ──────────────────────────────────────────────────────────────────
//
// Public types live in `./deploy/types` (rf-dslice-1). The re-export
// preserves the public import path for external consumers.

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

// ─── Derived view helpers ──────────────────────────────────────────────────
//
// `deriveRollup` and `orderNodesForPanel` live in `./deploy/derive`
// (rf-dslice-2). The re-export preserves the public import path for external
// consumers (deploy-banner, deploy-in-flight-panel, etc.).

export { deriveRollup, deriveRollupPercentage, orderNodesForPanel } from './deploy/derive';

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
  driftMeta: { checkedAt: null, unsupported: false },
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
    ...hydrateReducers,
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
      state.driftMeta = { checkedAt: null, unsupported: false };
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

// pdl-7 — typed deploy:event reducers (`applyNodeStatusEvent`,
// `applyNodeProgressEvent`, `applyDeployCompleteEvent`) replace the legacy
// `setDeployProgress` / `addResourceResult` / `type:'progress'` /
// `type:'resource_result'` branches. pdl-5 retired `setDeployProgress` —
// the snapshot-pull path now drives `nodesById` directly via
// `applyNodeStatusEvent` calls reconstructed from `snapshot.nodeStatuses`.
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
  setDriftMeta,
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
