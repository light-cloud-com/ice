/**
 * Log Stream service shared types.
 *
 * Extracted from `log-stream.service.ts` (rf-lstream-1) so that the
 * source-resolution, stream-lifecycle, polling, tail, and registry
 * helpers can import without round-tripping through the orchestrator
 * shim. The public-API types (`SubscribeArgs`, `LogEntry`,
 * `SourceResolution`, `SubscribeResult`, `StreamingMode`) and the
 * internal `ActiveStream` shape live together because every helper
 * touches both — splitting public from internal here would just force
 * every internal module to import from two places.
 */

export type StreamingMode = 'polling' | 'tail';

export interface SubscribeArgs {
  cardId: string;
  environmentId: string;
  /** Monitoring.Log node id — also the Socket.IO room key. */
  terminalNodeId: string;
  /** 'polling' default, 'tail' opt-in. */
  mode: StreamingMode;
  /** Override when 0 or 2+ inbound edges resolve to supported sources. */
  sourceNodeIdOverride?: string;
  /** Routes credential lookup to the correct GCP project. */
  organisationId: string;
  /**
   * Client-computed candidate sources from live Redux state. When provided
   * the resolver SKIPS the Prisma `nodes`/`edges` JSON read — the canvas's
   * persistence subscriber debounces saves by 2s, so the backend would
   * otherwise read stale rows when the user wires an edge and immediately
   * subscribes. An empty array OR `undefined` falls back to the Prisma
   * read for older clients.
   */
  candidateSources?: Array<{ nodeId: string; iceType: string; label?: string }>;
}

export interface LogEntry {
  /** ISO 8601, monotonically non-decreasing per stream. */
  ts: string;
  level: 'debug' | 'info' | 'notice' | 'warn' | 'error';
  /** textPayload OR JSON.stringify(jsonPayload). */
  message: string;
  resource: { type: string; labels: Record<string, string> };
  /** Dedupe key. */
  insertId: string;
}

export type SourceResolution =
  | { state: 'resolved'; sourceNodeId: string; iceType: string; caveats?: string[] }
  | { state: 'pre-deploy'; sourceNodeId: string; iceType: string }
  | {
      state: 'ambiguous';
      candidates: Array<{ nodeId: string; iceType: string; label?: string }>;
    }
  | { state: 'unsupported-source'; sourceNodeId: string; iceType: string }
  | { state: 'permission-denied'; message: string }
  | { state: 'none' };

export interface SubscribeResult {
  /** Opaque; LT-4 returns it via HTTP. */
  subscriptionId: string;
  resolution: SourceResolution;
}

export interface SubscriberRef {
  subscriptionId: string;
  args: SubscribeArgs;
}

export interface ActiveStream {
  /** Log node id is the room key. One stream per terminalNodeId. */
  terminalNodeId: string;
  mode: StreamingMode;
  filter: string;
  projectId: string;
  resolution: SourceResolution;
  /** Subscribers sharing this underlying stream. */
  subscribers: Map<string, SubscriberRef>;
  /** In-memory dedupe across reconnects (capped). */
  seenInsertIds: Set<string>;
  insertIdOrder: string[];
  /** Polling cursor — last entry's timestamp. */
  lastTs?: string;
  /** Polling cursor — last entry's insertId (defensive only). */
  lastInsertId?: string;
  /** Polling-only. */
  pollTimer?: ReturnType<typeof setInterval>;
  /** Tail-only. */
  tailStream?: { destroy?: () => void; cancel?: () => void } | null;
  /** When refCount drops to 0, scheduled teardown. */
  idleTeardownTimer?: ReturnType<typeof setTimeout>;
  /** Backoff state shared between polling + tail reconnect loops. */
  consecutiveErrors: number;
  /** Set true when teardown is initiated to short-circuit in-flight callbacks. */
  stopped: boolean;
  /** Cached Logging client; one per stream. */
  loggingClient: any;
}

// ── Constants ─────────────────────────────────────────────────────────

export const POLL_INTERVAL_MS = 2000;
export const POLL_PAGE_SIZE = 100;
export const IDLE_TEARDOWN_MS = 60_000;
export const RECONNECT_BASE_MS = 1500;
export const RECONNECT_MAX_MS = 30_000;
export const MAX_CONSECUTIVE_ERRORS_POLLING = 3;
export const SEEN_INSERT_ID_CAP = 500;
