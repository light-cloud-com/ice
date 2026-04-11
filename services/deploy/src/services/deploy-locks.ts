/**
 * Deploy Locks & Temp Dir Registry
 *
 * Two responsibilities, both load-bearing for Phase 0 safety:
 *
 * 1. **Per-card in-flight locks.** Prevents two Apply requests or two Destroy
 *    requests from running concurrently for the same card. The backend can
 *    still run Apply on card A in parallel with Apply on card B — the lock
 *    is scoped to (card_id, operation).
 *
 * 2. **Temp credential directory registry.** Every deploy that writes an SA
 *    key to disk registers its temp directory here on creation and releases
 *    it on normal cleanup. On SIGTERM/SIGINT the gateway calls
 *    `cleanupAllTempDirs()` to remove anything still registered, so crashed
 *    deploys don't leak secrets to `/tmp`.
 *
 * In-memory is correct here because ICE runs as a single gateway process.
 * If we ever scale horizontally, the lock becomes a Redis entry with a TTL.
 */

import fs from 'fs';

// ── Per-card deploy lock ─────────────────────────────────────────────────────

export type DeployOperation = 'apply' | 'destroy' | 'rollback';

interface LockEntry {
  operation: DeployOperation;
  controller: AbortController;
}

const inFlight = new Map<string, LockEntry>();

export class DeployLockError extends Error {
  code = 'DEPLOY_IN_FLIGHT' as const;
  constructor(cardId: string, operation: DeployOperation) {
    super(`A ${operation} is already in progress for card ${cardId}`);
    this.name = 'DeployLockError';
  }
}

function lockKey(cardId: string, operation: DeployOperation): string {
  return `${cardId}:${operation}`;
}

/**
 * Acquire a lock for (cardId, operation). Throws DeployLockError if another
 * lock is already held for the same key. Returns both the AbortSignal the
 * operation should honor and a release function that must be called in a
 * `finally` block.
 */
export function acquireDeployLock(
  cardId: string,
  operation: DeployOperation,
): { release: () => void; signal: AbortSignal } {
  const key = lockKey(cardId, operation);
  if (inFlight.has(key)) {
    throw new DeployLockError(cardId, operation);
  }
  const controller = new AbortController();
  inFlight.set(key, { operation, controller });
  return {
    release: () => {
      const entry = inFlight.get(key);
      if (entry && entry.controller === controller) inFlight.delete(key);
    },
    signal: controller.signal,
  };
}

/**
 * Phase 5: ask the in-flight deploy for a card to cancel. Aborts the signal
 * for whichever apply/rollback is running so the deploy loop can wind down
 * between resources. Returns true if any operation was cancelled.
 */
export function cancelDeploy(cardId: string): boolean {
  const operations: DeployOperation[] = ['apply', 'rollback', 'destroy'];
  let cancelled = false;
  for (const op of operations) {
    const entry = inFlight.get(lockKey(cardId, op));
    if (entry) {
      entry.controller.abort();
      cancelled = true;
    }
  }
  return cancelled;
}

/** For tests / debugging — do not rely on this in production code paths. */
export function isDeployInFlight(cardId: string, operation: DeployOperation): boolean {
  return inFlight.has(lockKey(cardId, operation));
}

// ── Temp credential directory registry ──────────────────────────────────────

const tempDirs = new Set<string>();

export function registerTempDir(dir: string): void {
  if (dir) tempDirs.add(dir);
}

export function releaseTempDir(dir: string | undefined): void {
  if (!dir) return;
  tempDirs.delete(dir);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Already gone, permission issue, or race — non-fatal.
  }
}

/**
 * Called by the gateway shutdown handler. Scrubs any temp dirs left behind
 * by deploys that didn't reach their normal `finally` block (SIGTERM, OOM,
 * uncaught exception). Safe to call multiple times.
 */
export function cleanupAllTempDirs(): void {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // nothing to do
    }
  }
  tempDirs.clear();
}

/** Exposed for tests / introspection only. */
export function _getRegisteredTempDirs(): string[] {
  return [...tempDirs];
}

// ── In-flight deploy progress snapshot ──────────────────────────────────────
//
// A second tab / second window opening the same project needs to see the
// current deploy progress WITHOUT waiting for the next socket event. The
// primary channel (socket.io rooms) only delivers events that arrive after
// subscription — it has no concept of "give me the latest state." So we
// keep a small in-memory snapshot keyed by cardId that the deploy service
// updates on every progress event, and a new `/current/:cardId` endpoint
// reads back. Redis-backed in production if we ever scale horizontally.

export interface DeployProgressSnapshot {
  cardId: string;
  status: 'planning' | 'deploying' | 'success' | 'partial' | 'failed' | 'cancelled';
  progress: number; // 0-100
  currentResource?: string;
  currentStep?: { label: string; index: number; total: number };
  deploymentId?: string;
  startedAt: string;
  updatedAt: string;
  /** Per-node live status — flows directly to block UI without waiting for result events. */
  nodeStatuses: Record<string, { deploy_status: string; step?: { label: string; index: number; total: number } }>;
}

const progressSnapshots = new Map<string, DeployProgressSnapshot>();

/**
 * Optional persistence hook — wired up in `deploy.service.ts` at import
 * time so the snapshot functions can upsert to the DB without this file
 * taking a direct prisma dependency (keeps it cheap to test and avoids
 * a circular import). Set it via `setSnapshotPersister`.
 */
type SnapshotPersister = (snapshot: DeployProgressSnapshot) => void;
let snapshotPersister: SnapshotPersister | null = null;
export function setSnapshotPersister(fn: SnapshotPersister | null): void {
  snapshotPersister = fn;
}

function persist(snapshot: DeployProgressSnapshot): void {
  if (!snapshotPersister) return;
  try {
    snapshotPersister(snapshot);
  } catch {
    // Never let persistence failures break the live emit path.
  }
}

export function startDeploySnapshot(cardId: string, deploymentId?: string): void {
  const now = new Date().toISOString();
  const snapshot: DeployProgressSnapshot = {
    cardId,
    status: 'deploying',
    progress: 0,
    deploymentId,
    startedAt: now,
    updatedAt: now,
    nodeStatuses: {},
  };
  progressSnapshots.set(cardId, snapshot);
  persist(snapshot);
}

export function updateDeploySnapshot(cardId: string, patch: Partial<DeployProgressSnapshot>): void {
  const current = progressSnapshots.get(cardId);
  if (!current) return;
  Object.assign(current, patch, { updatedAt: new Date().toISOString() });
  persist(current);
}

export function updateDeploySnapshotNode(
  cardId: string,
  nodeId: string,
  status: string,
  step?: { label: string; index: number; total: number },
): void {
  const current = progressSnapshots.get(cardId);
  if (!current) return;
  current.nodeStatuses[nodeId] = { deploy_status: status, step };
  current.updatedAt = new Date().toISOString();
  persist(current);
}

export function finishDeploySnapshot(
  cardId: string,
  status: 'success' | 'partial' | 'failed' | 'cancelled',
): void {
  const current = progressSnapshots.get(cardId);
  if (!current) return;
  current.status = status;
  current.progress = 100;
  current.updatedAt = new Date().toISOString();
  persist(current);
  // Keep the snapshot for a short grace period so late-joining clients
  // can still see the final state from memory, then drop it. The DB
  // copy persists until the deployment row itself is pruned.
  setTimeout(() => {
    const still = progressSnapshots.get(cardId);
    if (still && still.status !== 'deploying' && still.status !== 'planning') {
      progressSnapshots.delete(cardId);
    }
  }, 60_000).unref?.();
}

export function getDeploySnapshot(cardId: string): DeployProgressSnapshot | undefined {
  return progressSnapshots.get(cardId);
}

export function clearDeploySnapshot(cardId: string): void {
  progressSnapshots.delete(cardId);
}
