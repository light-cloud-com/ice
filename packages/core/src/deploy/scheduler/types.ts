/**
 * Parallel deploy scheduler — shared types (rf-sched-1).
 *
 * Extracted from `scheduler.ts` (pre-extraction L44-94 + the
 * pre-extraction private fields on `ParallelChangeScheduler`).
 * Contains:
 *  - public constants (`DEFAULT_PER_HANDLER_CAPS`, `DEFAULT_POOL_SIZE`)
 *  - public types (`SchedulerPhase`, `SchedulerRunInput`)
 *  - internal `NodeRecord` shape (per-node bookkeeping)
 *  - internal `SchedulerContext` shape — the mutable handle threaded
 *    through every standalone helper, modelled on the rf-sqlite-1
 *    `SqliteContext` pattern.
 *
 * The class shell (rf-sched-6) holds one `SchedulerContext` and
 * passes it to every extracted function. Standalone helpers can be
 * tested directly without instantiating the class.
 */

import type { ResourceChange } from '../../diff/types.js';
import type { Graph } from '../../types/graph.js';
import type {
  DeployOptions,
  NodeTerminalStatus,
  ProviderDeployer,
  ResourceDeployResult,
} from '../types.js';

/**
 * Default per-handler concurrency caps. Cloud SQL and Memorystore Redis
 * have GCP-side quotas that race-condition when two creates start
 * concurrently; cap them at 1 by default. Other handlers default to the
 * global `pool_size`.
 */
export const DEFAULT_PER_HANDLER_CAPS: Readonly<Record<string, number>> = Object.freeze({
  'gcp.sql.': 1,
  'gcp.redis.': 1,
});

/**
 * Default pool size when neither `pool_size` nor `parallelism` is set.
 */
export const DEFAULT_POOL_SIZE = 6;

/**
 * Phase identifier — one DAG per phase, run end-to-end.
 */
export type SchedulerPhase = 'create' | 'update' | 'delete';

/**
 * Inputs for one scheduler run (one phase).
 */
export interface SchedulerRunInput {
  /** Changes to apply in this phase. Filtered + same `change_type` for all. */
  changes: ResourceChange[];
  /** Phase being run — used for handler dispatch and event payloads. */
  phase: SchedulerPhase;
  /** Engine graph — provides edges for DAG construction and node lookup. */
  graph: Graph;
  /** Provider deployer — `create`/`update`/`delete` are dispatched here. */
  deployer: ProviderDeployer;
  /** Caller-resolved deploy options (already merged with defaults). */
  options: DeployOptions;
}

/** Internal per-node bookkeeping. */
export interface NodeRecord {
  change: ResourceChange;
  /** Direct dependencies (incoming edges in deploy order). */
  deps: Set<string>;
  /** Direct dependents (used to cancel descendants on failure). */
  dependents: Set<string>;
  /** Terminal state (undefined while not terminal). */
  terminal?: NodeTerminalStatus;
  /** Fired-at timestamp for `applying` so we can compute duration. */
  applying_at?: number;
  /** Has the `queued` event been fired? */
  queued_emitted: boolean;
}

/**
 * Mutable context handed to every standalone helper.
 *
 * - `changes` / `phase` / `graph` / `deployer` / `options` — readonly
 *   inputs from `SchedulerRunInput`.
 * - `pool_size` / `per_handler_caps` / `handler_cap_prefixes` —
 *   constructor-resolved configuration; readonly post-construction.
 * - `records` — DAG nodes keyed by `change.id`; populated by `build_dag`
 *   in the constructor and only mutated through `terminal` /
 *   `applying_at` / `queued_emitted` field updates.
 * - `results` — per-node `ResourceDeployResult[]`, push-only, returned
 *   in completion order.
 * - `in_flight` / `handler_in_flight` — bookkeeping for the pool +
 *   per-handler caps. `dispatch` adds, `on_settled` removes.
 * - `settle_waker` — single-shot promise woken by `wake()` after any
 *   in-flight node settles or the abort signal fires.
 * - `hard_failed` — set true after the first failure when
 *   `continue_on_error: false`. Triggers `cancel_remaining_not_in_flight`
 *   on the next loop tick.
 * - `aborted` — set true when `abort_signal` fires. Same trigger.
 *
 * The shape mirrors the pre-extraction class fields one-for-one;
 * there is no semantic change, only a relocation from class
 * private members to a structurally-typed handle.
 */
export interface SchedulerContext {
  readonly changes: ResourceChange[];
  readonly phase: SchedulerPhase;
  readonly graph: Graph;
  readonly deployer: ProviderDeployer;
  readonly options: DeployOptions;

  readonly pool_size: number;
  readonly per_handler_caps: Record<string, number>;
  readonly handler_cap_prefixes: string[];

  readonly records: Map<string, NodeRecord>;
  readonly results: ResourceDeployResult[];
  readonly in_flight: Set<string>;
  readonly handler_in_flight: Map<string, number>;

  /** Resolves when at least one in-flight node has settled. */
  settle_waker?: { promise: Promise<void>; resolve: () => void };

  /** True after first failure when `continue_on_error: false`. */
  hard_failed: boolean;
  /** True after `abort_signal` fires (we observe but don't abort handlers). */
  aborted: boolean;
}
