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
  DeployNodeStatus,
  DeployNodeStatusEvent,
} from '@ice/types';
import { setActiveCard } from './cards-slice';
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

/**
 * Per-node live deploy state. Built from `deploy:event` wire events
 * (pdl-7) keyed by canvas node id. The map lives in `state.nodesById`
 * and is the single source of truth for the deploy panel's per-row
 * status, the canvas overlay's per-block badge, and the deploy-rollup
 * counts ("X of N succeeded"). Derived rollups go through memoized
 * selectors, never recomputed inside the slice.
 */
export interface NodeDeployState {
  /** Canvas node id (key in nodesById, also stored here for selector convenience). */
  node_id: string;
  status: DeployNodeStatus;
  resource_name: string;
  resource_type: string;
  action: 'create' | 'update' | 'delete';
  /** Sub-step from the most recent node_progress event, if any. */
  step?: { label: string; index: number; total: number };
  error?: { code: string; message: string; recoverable?: boolean };
  /** Wall-clock duration on terminal status, ms. */
  duration_ms?: number;
  /** Most-recent ISO timestamp for this node — used to display "Started 12s ago". */
  last_at: string;
  /** Highest seq applied to this node's record. Used to dedup the live + replay streams. */
  last_seq: number;
}

/**
 * pdl-5 — counts derived from the per-node live state. Used by the deploy
 * panel's in-flight rollup ("X in flight · Y done · Z failed") and the
 * canvas-level deploy banner. Cap at 99% while any node is non-terminal:
 * the legacy bouncing-bar bug (59% → 0% → 0% on every step transition)
 * is impossible by construction here because nothing tracks "the active
 * resource" as a single number.
 *
 * `terminal = succeeded + failed + skipped + cancelled`. Progress is
 * `terminal / total`, capped at 99% if any nodes are still queued/applying.
 */
export interface DeployRollup {
  queued: number;
  applying: number;
  succeeded: number;
  failed: number;
  skipped: number;
  cancelled: number;
  total: number;
  terminal: number;
}

export function deriveRollup(nodesById: Record<string, NodeDeployState>): DeployRollup {
  const rollup: DeployRollup = {
    queued: 0,
    applying: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    cancelled: 0,
    total: 0,
    terminal: 0,
  };
  for (const node of Object.values(nodesById)) {
    rollup.total += 1;
    switch (node.status) {
      case 'queued':
        rollup.queued += 1;
        break;
      case 'applying':
        rollup.applying += 1;
        break;
      case 'succeeded':
        rollup.succeeded += 1;
        rollup.terminal += 1;
        break;
      case 'failed':
        rollup.failed += 1;
        rollup.terminal += 1;
        break;
      case 'skipped':
        rollup.skipped += 1;
        rollup.terminal += 1;
        break;
      case 'cancelled-due-to-dep':
        rollup.cancelled += 1;
        rollup.terminal += 1;
        break;
      default:
        // pdl-5 critic — defensive guard against wire-contract drift.
        // TypeScript narrows `node.status` to the 6 known values, so this
        // arm is unreachable through normal code paths; it catches the
        // runtime case where a backend sends a status the frontend hasn't
        // shipped support for yet (per the contract-evolution caveat in
        // learning `requirement-verified-needs-full-tenancy-key-on-the-wire`).
        // We undo the `total += 1` so the bucket sum still equals the
        // total, then warn so an operator sees the drift in the console.
        rollup.total -= 1;
        if (typeof console !== 'undefined') {
          // eslint-disable-next-line no-console
          console.warn(
            '[deploy-rollup] unknown node status:',
            (node as { status?: unknown }).status,
            '— not counted in rollup',
          );
        }
        break;
    }
  }
  return rollup;
}

/**
 * pdl-5 — order nodes for the deploy panel's per-row list. Applying nodes
 * first (most actionable — the user wants to see what's running NOW),
 * then queued (next up), then terminal sorted by `last_at` descending so
 * the most-recently-finished sits on top of the terminal section.
 *
 * Stable on equal-rank ties — preserves insertion order from
 * `Object.values(nodesById)`.
 */
const STATUS_RANK: Record<DeployNodeStatus, number> = {
  applying: 0,
  queued: 1,
  succeeded: 2,
  failed: 2,
  skipped: 2,
  'cancelled-due-to-dep': 2,
};

export function orderNodesForPanel(nodesById: Record<string, NodeDeployState>): NodeDeployState[] {
  const all = Object.values(nodesById);
  return [...all].sort((a, b) => {
    const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rankDiff !== 0) return rankDiff;
    // Within the same rank-2 (terminal) bucket, newest first.
    if (STATUS_RANK[a.status] === 2) {
      // last_at is ISO-8601, lex-sort descending.
      if (a.last_at < b.last_at) return 1;
      if (a.last_at > b.last_at) return -1;
    }
    return 0;
  });
}

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
  // Tracks which card the deploy slice was last reset for. Updated only
  // by the setActiveCard extraReducer so deploy state survives router
  // re-renders, sidebar refreshes, and other re-dispatches of
  // setActiveCard with the same id. Distinct from currentDeployCardId,
  // which represents a *running* deploy and gets cleared on completion.
  lastResetCardId?: string;

  // Plan
  plan: DeployPlan | null;

  // pdl-5 — `currentResource` / `progress` / `currentStep` were removed.
  // The deploy panel and canvas banner now derive every in-flight signal
  // (rollup totals, per-node rows, current step labels) from
  // `nodesById` via `deriveRollup`. The legacy single-resource percentage
  // bouncing 59% → 0% → 0% on every step transition is impossible by
  // construction because no single number tracks "the active resource".
  logs: string[];

  // Results
  results: DeployResourceResult[];

  /**
   * Per-node live state (pdl-7). Keyed by canvas node id. Populated by
   * `applyNodeStatusEvent` / `applyNodeProgressEvent` from `deploy:event`
   * socket events. The deploy panel's per-row UI and the canvas overlay
   * both project off this map. Cleared on `setActiveCard` (extraReducer).
   *
   * Not persisted — transient deploy state. On a page reload, the
   * snapshot/replay paths in `useDeploySubscription` rehydrate from the
   * server-side event tape, so persisting this would only duplicate that
   * work and add a stale-cache failure mode.
   */
  nodesById: Record<string, NodeDeployState>;

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
      if (existing && existing.last_seq >= e.seq) return;
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
      if (existing.last_seq >= e.seq) return;
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
