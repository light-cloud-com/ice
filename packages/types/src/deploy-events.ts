/**
 * Deploy live event wire format (Socket.IO room `deploy:<cardId>`).
 *
 * The parallel deploy scheduler (pdl-1) emits per-node lifecycle events
 * through the service layer (pdl-4). The frontend (pdl-7) consumes them.
 * This module is the cross-package contract — importable from both backend
 * and frontend so a drift in either side surfaces at typecheck time, not
 * as a silently-mis-decoded payload at runtime.
 *
 * Three identifier spaces travel together (see learning
 * `scheduler-resource-name-vs-graph-node-id-vs-canvas-node-id`):
 *
 *   1. **canvas node id** — the user-facing block id from
 *      `cards-slice.nodes[i].id` (e.g. `cmoh24gso000b7oay4cwn584j`).
 *      This is what the frontend keys its node-state map on. The wire
 *      events MUST carry this id in `node_id` — the service layer is
 *      responsible for translating from the scheduler's graph node id
 *      via `translation.deployables[]` before emitting.
 *   2. **graph node id** — the engine-internal `${type}:${name}` id
 *      built by `MutableGraph.add_node`. Lives only inside the engine.
 *   3. **resource name** — the sanitized hash-suffixed cloud resource
 *      name. Carried in `resource_name` for log readability; not used
 *      for correlation.
 *
 * Wire shape: a single Socket.IO event name `deploy:event` carries the
 * discriminated union below as its payload, with `type` as the
 * discriminator. One listener (`socket.on('deploy:event', dispatch)`) is
 * cheaper on the frontend than N per-type listeners and keeps the event
 * order observable from a single source. Per the pdl-2 brief, this
 * unified pattern replaces the legacy `type: 'progress'` aggregate event
 * that the deploy panel used to render. **No backwards-compat window** —
 * ICE is pre-1.0 and there are no external listeners to protect.
 */

/** Per-node lifecycle status. Terminal states are listed in
 * {@link TERMINAL_NODE_STATUSES}. */
export type DeployNodeStatus =
  | 'queued'
  | 'applying'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'cancelled-due-to-dep';

/**
 * Per-node lifecycle event. Emitted on every transition into a new
 * status, including the initial `queued` and the terminal one. The
 * frontend reducer keys these by `node_id` (canvas node id) and updates
 * `nodesById[node_id].status` in place.
 *
 * Sequence:
 *   queued → applying → (succeeded | failed | skipped | cancelled-due-to-dep)
 *
 * `skipped` fires for nodes the engine chooses not to apply (e.g.
 * `continue_on_error: true` after an upstream failure). `cancelled-due-to-dep`
 * fires when a parent's failure invalidates the node.
 */
export interface DeployNodeStatusEvent {
  type: 'node_status';
  card_id: string;
  /**
   * Canvas node id — what the UI uses to correlate. The service layer
   * translates from the scheduler's graph node id (which is `${type}:${name}`)
   * via the `deployables[]` lookup in card-translator.ts.
   */
  node_id: string;
  resource_name: string;
  resource_type: string;
  action: 'create' | 'update' | 'delete';
  status: DeployNodeStatus;
  /** Set when status === 'failed'. */
  error?: { code: string; message: string; recoverable?: boolean };
  /** ISO-8601 timestamp at which the transition was emitted. */
  at: string;
  /**
   * Set on terminal statuses (succeeded, failed, skipped, cancelled-due-to-dep).
   * Wall-clock duration in ms since the corresponding 'applying' event.
   * Omitted on non-terminal transitions.
   */
  duration_ms?: number;
  /** Monotonic sequence number from the deploy event log; used by
   *  reconnecting clients to dedupe replayed events against live ones. */
  seq: number;
}

/**
 * Mid-apply progress milestone for a single node — e.g. handler steps
 * like "creating instance / waiting for DNS / verifying health". Emitted
 * by handlers via `GCPHandlerContext.on_step` (existing hook,
 * widened in pdl-3). Not all handlers emit progress; the consumer
 * reducer must treat the absence of progress as "no detail available"
 * rather than "stalled".
 */
export interface DeployNodeProgressEvent {
  type: 'node_progress';
  card_id: string;
  node_id: string;
  resource_name: string;
  /** Step descriptor. `total` is the handler's best estimate; the
   *  reducer must NOT assume `index === total` implies success — wait
   *  for the corresponding `node_status` terminal. */
  step: { label: string; index: number; total: number };
  at: string;
  seq: number;
}

/**
 * Free-text log line from the deploy. Most logs are deploy-scoped (no
 * `node_id`), but handler logs may carry a `node_id` so the frontend can
 * thread them through the per-node row instead of the deploy-level log.
 */
export interface DeployLogEvent {
  type: 'log';
  card_id: string;
  /** Optional — most logs are deploy-scoped, not node-scoped. */
  node_id?: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  at: string;
  seq: number;
}

/**
 * Terminal event for the entire deploy. Sent exactly once per deploy.
 * `outcome === 'partial'` means some nodes succeeded and others failed —
 * possible because failure isolation cancels only descendants of the
 * failed node, not unrelated branches (see decisions entry
 * "2026-04-28 — Parallel deploy scheduler with per-node live status").
 */
export interface DeployCompleteEvent {
  type: 'complete';
  card_id: string;
  /**
   * Overall outcome:
   *   - `success`  — all deployable nodes terminated as `succeeded`.
   *   - `partial`  — at least one `succeeded` AND at least one `failed`
   *                   (or `cancelled-due-to-dep`). A user-initiated
   *                   cancel that arrives after at least one resource
   *                   has already succeeded surfaces as `partial`, NOT
   *                   `cancelled`, so the user sees they have a
   *                   cleanup-worthy artifact rather than thinking the
   *                   deploy was a no-op.
   *   - `failure`  — every terminal node is non-success (no `succeeded`).
   *   - `cancelled` — user-initiated cancel AND zero `succeeded`
   *                    resources. Strictly: nothing landed.
   */
  outcome: 'success' | 'partial' | 'failure' | 'cancelled';
  /**
   * Roll-up counts derived from the terminal node_status events. Sent
   * for convenience so consumers don't have to recount, and so a client
   * that joined the room mid-deploy and missed earlier transitions has
   * the final tally for the summary view.
   */
  totals: {
    queued: number;
    applying: number;
    succeeded: number;
    failed: number;
    skipped: number;
    cancelled: number;
  };
  at: string;
  seq: number;
}

/**
 * Post-deploy requirement verification result (e.g. SSL cert ready,
 * Search Console verification). Emitted by the requirement-poller when
 * a row flips, NOT by the apply engine. The frontend uses this to
 * update Custom Domain / Public Endpoint block headers without waiting
 * for a redeploy.
 *
 * The unique identity of a `BlockRequirementStatus` row is
 * `(card_id, node_id, environment, requirement)` — all four fields
 * are required on the wire so the frontend can disambiguate between
 * the same requirement applied to two blocks, or to one block across
 * environments. Earlier drafts dropped `node_id` / `environment` and
 * forced the consumer to look them up by row id; that's a regression.
 */
export interface DeployRequirementVerifiedEvent {
  type: 'requirement_verified';
  card_id: string;
  /** Canvas node id of the block whose requirement flipped. */
  node_id: string;
  /** Environment the requirement is scoped to (e.g. `'staging'`). */
  environment: string;
  /** Free-text identifier matching the existing `requirement_id` usage
   *  in `requirement-poller.service.ts` (e.g. `'managed-cert-issuance'`). */
  requirement: string;
  status: 'satisfied' | 'unsatisfied';
  /** Optional handler-specific detail blob (e.g. cert managed-status,
   *  per-domain status map). Free-form because the shape varies per
   *  requirement type — frontend consumers narrow at use site. Mirrors
   *  the `RequirementCheckResult.details` type from
   *  `@ice/blocks/requirements`. */
  details?: unknown;
  at: string;
  /**
   * Sequence number. **Different scheme from the deploy-tape `seq`** on
   * `DeployNodeStatusEvent` / `DeployNodeProgressEvent` /
   * `DeployLogEvent` / `DeployCompleteEvent` (those are small monotonic
   * ints from the active-deploy event log). Requirement events fire
   * post-deploy, often outside an active deploy, so the poller emits
   * `Date.now()` here. Reducers that sort the unified `deploy:event`
   * stream by `seq` must NOT assume the two schemes are commensurable —
   * route by `event.type` first, then sort within each scheme.
   */
  seq: number;
}

/** Discriminated union of every event sent on the `deploy:event` channel. */
export type DeployEvent =
  | DeployNodeStatusEvent
  | DeployNodeProgressEvent
  | DeployLogEvent
  | DeployCompleteEvent
  | DeployRequirementVerifiedEvent;

// ── Type guards (handy for the frontend reducer in pdl-7) ───────────────

export function isNodeStatusEvent(e: DeployEvent): e is DeployNodeStatusEvent {
  return e.type === 'node_status';
}

export function isNodeProgressEvent(e: DeployEvent): e is DeployNodeProgressEvent {
  return e.type === 'node_progress';
}

export function isDeployLogEvent(e: DeployEvent): e is DeployLogEvent {
  return e.type === 'log';
}

export function isDeployCompleteEvent(e: DeployEvent): e is DeployCompleteEvent {
  return e.type === 'complete';
}

export function isRequirementVerifiedEvent(
  e: DeployEvent,
): e is DeployRequirementVerifiedEvent {
  return e.type === 'requirement_verified';
}

// ── Terminal-status helper ──────────────────────────────────────────────

/** The set of {@link DeployNodeStatus} values that signal "no further
 *  transitions for this node". Consumers can use this to decide when to
 *  stop showing a spinner and freeze the row's final state. */
export const TERMINAL_NODE_STATUSES: ReadonlyArray<DeployNodeStatus> = [
  'succeeded',
  'failed',
  'skipped',
  'cancelled-due-to-dep',
] as const;

export function isTerminalNodeStatus(s: DeployNodeStatus): boolean {
  return (TERMINAL_NODE_STATUSES as readonly DeployNodeStatus[]).includes(s);
}

// ── Socket.IO event name ────────────────────────────────────────────────

/** The single Socket.IO event name carrying every {@link DeployEvent}.
 *  Exported so backend emitters and frontend listeners reference the
 *  same constant — a typo in either side silently drops events. */
export const DEPLOY_EVENT_CHANNEL = 'deploy:event' as const;
