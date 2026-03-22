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
import { DEPLOY_SLICE_MESSAGES } from '../../i18n/messages';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DeployResourceChange {
  name: string;
  type: string;
  action: 'create' | 'update' | 'delete';
  properties?: Record<string, unknown>;
}

export interface DeployPlan {
  creates: DeployResourceChange[];
  updates: DeployResourceChange[];
  deletes: DeployResourceChange[];
  skipped: Array<{ name: string; reason: string }>;
  warnings: string[];
}

export interface DeployResourceResult {
  name: string;
  type: string;
  action: 'create' | 'update' | 'delete';
  success: boolean;
  error?: string;
  api_enable_url?: string;
  provider_id?: string;
  outputs?: Record<string, unknown>;
  duration_ms?: number;
  source_node_id?: string;
}

export interface DeployedResource {
  node_id: string;
  name: string;
  type: string;
  provider_id: string;
  status: string;
  outputs?: Record<string, unknown>;
  deployed_at: string;
}

export interface DeployRecord {
  id: string;
  timestamp: number;
  environment: string;
  provider: string;
  project: string;
  region: string;
  results: DeployResourceResult[];
  success: boolean;
  duration_ms: number;
}

export type DeployStatus =
  | 'idle'
  | 'authenticating'
  | 'planning'
  | 'planned'
  | 'deploying'
  | 'success'
  | 'error'
  | 'cancelled';

export interface DeployState {
  // Panel
  isOpen: boolean;

  // Configuration
  provider: string;
  gcpProject: string;
  region: string;
  environment: 'development' | 'staging' | 'production';

  // Status
  status: DeployStatus;
  error: string | null;

  // Plan
  plan: DeployPlan | null;

  // Progress
  progress: number; // 0-100
  currentResource: string;
  logs: string[];

  // Results
  results: DeployResourceResult[];

  // History
  history: DeployRecord[];

  // Deployed resources (for monitoring)
  deployedResources: DeployedResource[];
}

const initialState: DeployState = {
  isOpen: false,
  provider: 'gcp',
  gcpProject: '',
  region: 'us-central1',
  environment: 'development',
  status: 'idle',
  error: null,
  plan: null,
  progress: 0,
  currentResource: '',
  logs: [],
  results: [],
  history: [],
  deployedResources: [],
};

// ─── Slice ──────────────────────────────────────────────────────────────────

const deploySlice = createSlice({
  name: 'deploy',
  initialState,
  reducers: {
    openDeployPanel(state) {
      state.isOpen = true;
    },
    closeDeployPanel(state) {
      state.isOpen = false;
    },

    // Configuration
    setProvider(state, action: PayloadAction<string>) {
      state.provider = action.payload;
    },
    setGcpProject(state, action: PayloadAction<string>) {
      state.gcpProject = action.payload;
    },
    setRegion(state, action: PayloadAction<string>) {
      state.region = action.payload;
    },
    setEnvironment(state, action: PayloadAction<'development' | 'staging' | 'production'>) {
      state.environment = action.payload;
    },

    // Authentication
    startAuthenticating(state) {
      state.status = 'authenticating';
      state.error = null;
      state.logs = [DEPLOY_SLICE_MESSAGES.CONNECTING];
    },
    authSuccess(state) {
      state.status = 'idle';
      state.logs.push(DEPLOY_SLICE_MESSAGES.AUTH_SUCCESS);
    },
    authFailed(state, action: PayloadAction<string>) {
      state.status = 'error';
      state.error = action.payload;
      state.logs.push(DEPLOY_SLICE_MESSAGES.AUTH_FAILED(action.payload));
    },

    // Planning
    startPlanning(state) {
      state.status = 'planning';
      state.error = null;
      state.plan = null;
      state.logs = [DEPLOY_SLICE_MESSAGES.PLANNING];
    },
    setPlan(state, action: PayloadAction<DeployPlan>) {
      state.status = 'planned';
      state.plan = action.payload;
      state.logs.push(
        DEPLOY_SLICE_MESSAGES.PLAN_READY(
          action.payload.creates.length,
          action.payload.updates.length,
          action.payload.deletes.length
        )
      );
    },

    // Deploy execution
    startDeploying(state) {
      state.status = 'deploying';
      state.progress = 0;
      state.currentResource = '';
      state.results = [];
      state.error = null;
      state.logs.push(DEPLOY_SLICE_MESSAGES.DEPLOYING);
    },
    setDeployProgress(
      state,
      action: PayloadAction<{ progress: number; resource: string; message: string }>
    ) {
      state.progress = action.payload.progress;
      state.currentResource = action.payload.resource;
      state.logs.push(action.payload.message);
    },
    addResourceResult(state, action: PayloadAction<DeployResourceResult>) {
      state.results.push(action.payload);
    },

    // Completion
    deploySuccess(state, action: PayloadAction<{ duration_ms: number }>) {
      state.status = 'success';
      state.progress = 100;
      state.currentResource = '';
      state.logs.push(
        DEPLOY_SLICE_MESSAGES.DEPLOY_COMPLETED((action.payload.duration_ms / 1000).toFixed(1))
      );

      // Add to history (capped at 50 entries)
      state.history.unshift({
        id: `deploy-${Date.now()}`,
        timestamp: Date.now(),
        environment: state.environment,
        provider: state.provider,
        project: state.gcpProject,
        region: state.region,
        results: state.results,
        success: true,
        duration_ms: action.payload.duration_ms,
      });
      if (state.history.length > 50) {
        state.history = state.history.slice(0, 50);
      }
    },
    deployError(state, action: PayloadAction<string>) {
      state.status = 'error';
      state.error = action.payload;
      state.logs.push(DEPLOY_SLICE_MESSAGES.ERROR(action.payload));
    },

    // Reset
    resetDeploy(state) {
      state.status = 'idle';
      state.error = null;
      state.plan = null;
      state.progress = 0;
      state.currentResource = '';
      state.logs = [];
      state.results = [];
    },

    appendLog(state, action: PayloadAction<string>) {
      state.logs.push(action.payload);
    },

    // Deployed resources (for monitoring)
    setDeployedResources(state, action: PayloadAction<DeployedResource[]>) {
      state.deployedResources = action.payload;
    },
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
  setDeployProgress,
  addResourceResult,
  deploySuccess,
  deployError,
  resetDeploy,
  appendLog,
  setDeployedResources,
} = deploySlice.actions;

export default deploySlice.reducer;
