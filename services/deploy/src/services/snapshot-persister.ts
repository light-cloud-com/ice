import prisma from '@ice/db';
import {
  setSnapshotPersister,
  getDeploySnapshot,
  type DeployProgressSnapshot,
} from './deploy-locks';

// ── Snapshot persistence ─────────────────────────────────────────────────────
//
// Install a DB persister for `DeployProgressSnapshot` so the latest state
// is always durable on `CanvasDeployment.snapshot`. This is what lets a
// refreshed page see live progress even after a gateway restart: the
// in-memory snapshot is lost but the DB copy survives and `/current/:cardId`
// falls back to it. We throttle writes to once every 500ms per card so a
// burst of progress events doesn't hammer the DB.
const pendingSnapshotWrites = new Map<string, NodeJS.Timeout>();
const SNAPSHOT_WRITE_INTERVAL_MS = 500;

export function installSnapshotPersister(): void {
  setSnapshotPersister((snapshot: DeployProgressSnapshot) => {
    if (!snapshot.deploymentId) return;
    const cardId = snapshot.cardId;
    if (pendingSnapshotWrites.has(cardId)) return; // a write is already queued
    const timer = setTimeout(() => {
      pendingSnapshotWrites.delete(cardId);
      const latest = getDeploySnapshot(cardId);
      if (!latest?.deploymentId) return;
      prisma.canvasDeployment
        .update({
          where: { id: latest.deploymentId },
          data: { snapshot: latest as any },
        })
        .catch((err: any) => {
          console.warn('[snapshot-persist] write failed:', err.message);
        });
    }, SNAPSHOT_WRITE_INTERVAL_MS);
    timer.unref?.();
    pendingSnapshotWrites.set(cardId, timer);
  });
}

/**
 * Force a pending snapshot write to flush NOW. Called at the end of
 * applyDeployment so a very short deploy (e.g. 400 ms no-op) that finishes
 * before the 500 ms throttle fires still leaves its terminal state in
 * the DB — otherwise a second tab opening right as the deploy ends sees
 * no snapshot and can get stuck on a stale "deploying" view.
 */
export async function flushSnapshotNow(cardId: string): Promise<void> {
  const pending = pendingSnapshotWrites.get(cardId);
  if (pending) {
    clearTimeout(pending);
    pendingSnapshotWrites.delete(cardId);
  }
  const latest = getDeploySnapshot(cardId);
  if (!latest?.deploymentId) return;
  try {
    await prisma.canvasDeployment.update({
      where: { id: latest.deploymentId },
      data: { snapshot: latest as any },
    });
  } catch (err: any) {
    console.warn('[snapshot-persist] final flush failed:', err.message);
  }
}
