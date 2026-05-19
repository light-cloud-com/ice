/**
 * Deploy Event Log — append-only narrative tape of a live deploy.
 *
 * Every progress/resource_result/log/complete event is persisted so clients
 * can replay the full narrative on reload or reconnect. The in-memory
 * snapshot in `deploy-locks.ts` carries the "where am I right now" state;
 * this module carries the "how did I get here" tape. Together they let a
 * refreshed page show the same live progress it would have seen without
 * the refresh.
 *
 * Writes are batched (250ms or 100 events) so the hot path of
 * `emitDeployProgress` never waits on a DB round-trip.
 */

import prisma from '@ice/db';
import { getDeploySnapshot } from './deploy-locks';

interface QueuedEvent {
  deploymentId: string;
  cardId: string;
  seq: number;
  type: string;
  payload: any;
}

const queue: QueuedEvent[] = [];
const nextSeqByDeployment = new Map<string, number>();
let flushTimer: NodeJS.Timeout | null = null;
const FLUSH_INTERVAL_MS = 250;
const FLUSH_BATCH_SIZE = 100;

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushDeployEvents();
  }, FLUSH_INTERVAL_MS);
  flushTimer.unref?.();
}

/**
 * Allocate the next monotonic seq for the active deploy on this card.
 *
 * Returns null if there's no active deployment (e.g. a stray emit fired
 * by the requirement-poller after the deploy ended). Callers fall back
 * to `Date.now()` in that path — those events are rare, idempotent, and
 * the contract's "dedup on reconnect" semantic isn't load-bearing for
 * post-deploy point-in-time updates.
 *
 * Pulled out of `recordDeployEvent` so the wire emit and the persistent
 * log row share the SAME seq value. Without this, the wire `seq` and
 * the DB `seq` could drift if the wire emit and the log record were
 * computed independently — reconnecting clients use seq for dedup, so
 * a drift here would surface as duplicated rows on the consumer side.
 */
export function nextDeploySeq(cardId: string): number | null {
  const snapshot = getDeploySnapshot(cardId);
  const deploymentId = snapshot?.deploymentId;
  if (!deploymentId) return null;
  const nextSeq = (nextSeqByDeployment.get(deploymentId) || 0) + 1;
  nextSeqByDeployment.set(deploymentId, nextSeq);
  return nextSeq;
}

/**
 * Append an event to the deploy log with a pre-allocated seq.
 *
 * The seq is allocated by the caller via {@link nextDeploySeq} so the
 * live wire emit and this persistent record carry the same number — see
 * the doc on `nextDeploySeq` for why that matters. Silently no-ops when
 * no active snapshot exists (e.g. a stray emit outside of a deploy) so
 * this never breaks the emitter on the hot path.
 */
export function recordDeployEvent(cardId: string, seq: number, type: string, payload: any): void {
  const snapshot = getDeploySnapshot(cardId);
  const deploymentId = snapshot?.deploymentId;
  if (!deploymentId) return;

  queue.push({
    deploymentId,
    cardId,
    seq,
    type,
    payload,
  });

  if (queue.length >= FLUSH_BATCH_SIZE) {
    void flushDeployEvents();
  } else {
    scheduleFlush();
  }
}

/** Flush queued events to the DB. Called periodically and on shutdown. */
export async function flushDeployEvents(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    await prisma.deployEvent.createMany({
      data: batch.map((e) => ({
        deployment_id: e.deploymentId,
        card_id: e.cardId,
        seq: e.seq,
        type: e.type,
        payload: e.payload,
      })),
    });
  } catch (err: any) {
    // Don't let event-log failures break the deploy. Log and drop.
    console.warn('[deploy-event-log] flush failed:', err.message);
  }
}

/**
 * Load events for a deployment from `seq > since`, oldest first. Returns
 * the raw rows so the stream endpoint can pass them to the client. The
 * client uses `latest_seq` to know where to resume on reconnect.
 */
export async function loadDeployEvents(
  deploymentId: string,
  since = 0,
): Promise<{ events: Array<{ seq: number; type: string; payload: any; created_at: Date }>; latestSeq: number }> {
  const rows = await prisma.deployEvent.findMany({
    where: { deployment_id: deploymentId, seq: { gt: since } },
    orderBy: { seq: 'asc' },
    select: { seq: true, type: true, payload: true, created_at: true },
  });
  const latestSeq = rows.length > 0 ? rows[rows.length - 1].seq : since;
  return { events: rows, latestSeq };
}

/**
 * Find the most-recent deployment for a card (any status) so the stream
 * endpoint can locate the right event tape without needing the deployment
 * id on the client side.
 */
export async function findLatestDeploymentId(cardId: string): Promise<string | null> {
  const row = await prisma.canvasDeployment.findFirst({
    where: { card_id: cardId },
    orderBy: { created_at: 'desc' },
    select: { id: true },
  });
  return row?.id || null;
}

/** Drop the seq counter for a finished deployment — memory hygiene. */
export function forgetDeploymentSeq(deploymentId: string): void {
  nextSeqByDeployment.delete(deploymentId);
}

/** Called from the shutdown hook so we don't lose the tail end of a deploy. */
export async function drainDeployEvents(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushDeployEvents();
}
