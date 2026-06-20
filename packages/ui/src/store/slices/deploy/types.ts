/**
 * Deploy slice — type definitions.
 *
 * Public types are re-exported from `../deploy-slice` so external consumers
 * keep resolving the same import path during the rf-dslice decomposition.
 *
 * `DeployResourceChange`, `DriftChange`, and `DeployRecord` are marked
 * `@internal` — they exist here so sibling rf-dslice-* modules
 * (reducers/wire-events, reducers/outcome, reducers/hydrate, derive) can
 * import them, but they are NOT part of the slice's public API.
 *
 * @see rf-dslice-1
 */

import type { DeployNodeStatus } from '@ice/types';

// -----------------------------------------------------------------------------
// Internal change/record shapes
// -----------------------------------------------------------------------------

/** @internal Single resource change in a plan or result. */
export interface DeployResourceChange {
  name: string;
  type: string;
  action: 'create' | 'update' | 'delete';
  properties?: Record<string, unknown>;
}

/** @internal Single drift change for a resource. */
export interface DriftChange {
  path: string;
  desired: unknown;
  actual: unknown;
}

/** @internal A single deploy record stored in `DeployState.history`. */
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

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

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

type DriftStatus = 'in_sync' | 'drifted' | 'missing' | 'extra' | 'unknown';

export interface NodeDriftInfo {
  nodeId: string;
  status: DriftStatus;
  changes: DriftChange[];
}

/**
 * Check-level drift metadata (NOT per-node). `unsupported` is true when the
 * drift service could not actually query the cloud (no credentials, or the
 * provider has no describe path) and therefore fell back to a non-authoritative
 * stored-state comparison — see `services/deploy/src/services/drift.service.ts`.
 * `checkedAt` is the ISO timestamp the check ran. Both come back on the
 * drift-check response alongside `driftResults`; the UI must surface them so a
 * green "in sync" can't masquerade as a verified cloud query (OS3/OS4).
 */
export interface DriftMeta {
  checkedAt: string | null;
  unsupported: boolean;
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
  /** Check-level authority/staleness metadata for the last drift check. */
  driftMeta: DriftMeta;

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

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * pdl-5 — order nodes for the deploy panel's per-row list. Applying nodes
 * first (most actionable — the user wants to see what's running NOW),
 * then queued (next up), then terminal sorted by `last_at` descending so
 * the most-recently-finished sits on top of the terminal section.
 *
 * Stable on equal-rank ties — preserves insertion order from
 * `Object.values(nodesById)`.
 */
export const STATUS_RANK: Record<DeployNodeStatus, number> = {
  applying: 0,
  queued: 1,
  succeeded: 2,
  failed: 2,
  skipped: 2,
  'cancelled-due-to-dep': 2,
};
