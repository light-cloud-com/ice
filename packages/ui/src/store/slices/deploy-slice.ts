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
import { t } from '../../i18n';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DeployResourceChange {
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

interface DeployResourceResult {
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

interface DriftChange {
  path: string;
  desired: unknown;
  actual: unknown;
}

type DriftStatus = 'in_sync' | 'drifted' | 'missing' | 'extra' | 'unknown';

export interface NodeDriftInfo {
  nodeId: string;
  status: DriftStatus;
  changes: DriftChange[];
}

interface DeployRecord {
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
  | 'destroying'
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
  /**
   * Phase 5.1 (partial) — id of the card whose deploy is currently in flight.
   * Used by the project tree to show a spinner on the corresponding env row,
   * independent of which card the deploy panel is currently displaying.
   */
  currentDeployCardId?: string;

  // Plan
  plan: DeployPlan | null;

  // Progress
  progress: number; // 0-100
  currentResource: string;
  /** Phase 2: current resource's sub-step (e.g., LB "creating backend service 2/4"). */
  currentStep?: { label: string; index: number; total: number };
  logs: string[];

  // Results
  results: DeployResourceResult[];

  // History
  history: DeployRecord[];

  // Deployed resources (for monitoring)
  deployedResources: DeployedResource[];

  // Drift detection
  driftByNode: Record<string, NodeDriftInfo>;
  driftCheckLoading: boolean;

  // Phase 8 — block requirements (DNS, domain verification, cert issuance, etc.)
  requirements: ResolvedRequirementState[];
  requirementsLoading: boolean;
  requirementsFetchedAt?: string;

  // AI-Native #2 — deploy failure diagnosis
  diagnosis: DiagnosisState;

  // AI-Native #3 — pre-deploy warnings (security + cost)
  dismissedWarnings: string[];
  criticalAcknowledged: boolean;
}

export interface DiagnosisState {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  result: {
    diagnosis: string;
    suggestedFixes: string[];
  } | null;
  error: string | null;
}

export interface ResolvedRequirementState {
  definitionId: string;
  scope: 'block' | 'card' | 'global';
  timing: 'before-deploy' | 'post-deploy';
  blocking: boolean;
  title: string;
  description?: string;
  result: {
    status: 'unknown' | 'checking' | 'unmet' | 'met' | 'verified' | 'expired';
    message?: string;
    lastCheckedAt: string;
    details?: unknown;
  };
  action?: {
    type: string;
    label: string;
    payload?: Record<string, unknown>;
  } | null;
  nodeId?: string;
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
      state.progress = 0;
      state.currentResource = '';
      state.results = [];
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
      state.progress = 0;
      state.currentResource = '';
      state.results = [];
      state.error = null;
      state.currentDeployCardId = action?.payload?.cardId ?? state.currentDeployCardId;
      state.logs.push('Destroying deployment...');
    },
    setDeployProgress(
      state,
      action: PayloadAction<{
        progress: number;
        resource: string;
        message: string;
        step?: { label: string; index: number; total: number };
      }>,
    ) {
      state.progress = action.payload.progress;
      state.currentResource = action.payload.resource;
      state.currentStep = action.payload.step;
      if (action.payload.message) state.logs.push(action.payload.message);
    },
    addResourceResult(state, action: PayloadAction<DeployResourceResult>) {
      state.results.push(action.payload);
    },

    // Completion
    deploySuccess(state, action: PayloadAction<{ duration_ms: number }>) {
      state.status = 'success';
      state.progress = 100;
      state.currentResource = '';
      state.currentDeployCardId = undefined;
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
      state.currentDeployCardId = undefined;
      state.logs.push(t('deploy.slice.error', { error: action.payload }));
    },

    // Reset
    resetDeploy(state) {
      state.status = 'idle';
      state.error = null;
      state.plan = null;
      state.progress = 0;
      state.currentResource = '';
      state.currentDeployCardId = undefined;
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
  setDeployProgress,
  addResourceResult,
  deploySuccess,
  deployError,
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
