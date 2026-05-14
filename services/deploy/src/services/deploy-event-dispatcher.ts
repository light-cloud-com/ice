/**
 * Deploy Event Dispatcher — typed wire emit + persistent event-log mirror.
 *
 * Extracted from `services/deploy/src/services/deploy.service.ts` (rf-deploy-9).
 * The orchestrator re-exports `emitDeployEvent`, `emitLog`, and
 * `emitDestroyNodeStatus` so legacy importers (e.g. `queue.service.ts`,
 * `requirement-poller.service.ts`) keep resolving without a sweeping
 * multi-file edit. Foundation for rf-deploy-12 (scheduler-callbacks),
 * rf-deploy-13 (destroy-runner), and rf-deploy-14 (quota-retry).
 */

import {
  emitDeployComplete,
  emitDeployLog,
  emitDeployNodeProgress,
  emitDeployNodeStatus,
  emitDeployRequirementVerified,
} from '@ice/shared';
import type { DeployEvent, DeployLogEvent } from '@ice/types';
import { nextDeploySeq, recordDeployEvent } from './deploy-event-log';
import { updateDeploySnapshotNode } from './deploy-locks';
import { describeEventForLog, mapStatusToOverlay } from '../utils/deploy-event-formatter';

/**
 * Emit a typed {@link DeployEvent} over the socket and persist a row to
 * the event log so reconnecting clients can replay the narrative. The
 * caller passes a `DeployEvent` with `seq: 0` as a placeholder; this
 * helper allocates the next monotonic seq from `nextDeploySeq` and
 * mutates `event.seq` in place so both the wire emit and the persistent
 * log row carry the SAME number — see `deploy-event-log.ts:nextDeploySeq`
 * for why that matters (reconnect dedup correctness).
 *
 * For events fired OUTSIDE an active deploy (e.g. the requirement-poller
 * after a deploy has finished), `nextDeploySeq` returns null and we fall
 * back to `Date.now()`. Those events are rare, idempotent, and the
 * frontend treats them as point-in-time updates rather than replayable
 * tape — the dedup-on-reconnect contract isn't load-bearing for them.
 *
 * Replaces the legacy untyped `emitDeployProgress(cardId, { type, ... })`
 * shadow that fronted the @ice/shared wire emitter — pdl-2 split the wire
 * into five typed helpers, this dispatcher routes by `event.type`.
 */
export function emitDeployEvent(cardId: string, event: DeployEvent): void {
  // Allocate seq before either side-effect so they share the value.
  // Falls back to Date.now() for events fired outside an active deploy.
  const allocated = nextDeploySeq(cardId);
  event.seq = allocated ?? Date.now();

  console.log(
    '[deploy] emit cardId=' +
      cardId +
      ' type=' +
      event.type +
      ' seq=' +
      event.seq +
      ' detail=' +
      describeEventForLog(event),
  );

  try {
    switch (event.type) {
      case 'node_status':
        emitDeployNodeStatus(cardId, event);
        break;
      case 'node_progress':
        emitDeployNodeProgress(cardId, event);
        break;
      case 'log':
        emitDeployLog(cardId, event);
        break;
      case 'complete':
        emitDeployComplete(cardId, event);
        break;
      case 'requirement_verified':
        emitDeployRequirementVerified(cardId, event);
        break;
    }
  } catch (err: any) {
    console.warn('[deploy] wire emit failed: ' + err.message);
  }

  try {
    recordDeployEvent(cardId, event.seq, event.type, event);
  } catch (err: any) {
    // Event-log failures must never break the live emit.
    console.warn('[deploy] recordDeployEvent failed: ' + err.message);
  }
}

/** Convenience wrapper for the most-common case: emit a free-text log line. */
export function emitLog(cardId: string, message: string, level: DeployLogEvent['level'] = 'info'): void {
  emitDeployEvent(cardId, {
    type: 'log',
    card_id: cardId,
    level,
    message,
    at: new Date().toISOString(),
    seq: 0,
  });
}

/**
 * pdl-10 — emit a `node_status` event for a destroy operation. Mirrors the
 * apply-path's `on_node_status` translation but builds the payload directly
 * from the persisted resource shape (no `translation.deployables[]` map
 * exists for destroy — each resource carries its own `source_node_id` from
 * the post-deploy resource-mapping step at line ~1170, or its `node_id`
 * from the `DeployedResourceMapping` table).
 *
 * `canvasNodeId` is required — destroy events without a canvas correlation
 * are silently skipped at the call site (legacy resources persisted before
 * pdl-4's resource-mapping step have no `source_node_id` and fall through
 * to the `emitLog` log-line path instead, which still gives the deploy
 * panel's log scroll a record of the deletion).
 *
 * Updates the in-memory snapshot's nodeStatuses too so a tab joining
 * mid-destroy hydrates the same overlay color as the live event would
 * have produced — same medicine as the apply-path's `on_node_status`
 * snapshot mirror.
 *
 * Per learning anchor `ux-destroy-action-bypasses-node-status-wire`: this
 * helper closes the gap pdl-4's implementer noted in their deviation —
 * destroy paths DO have per-resource canvas-node-id information (it just
 * lives in different places than the apply path's translation map).
 */
export function emitDestroyNodeStatus(
  cardId: string,
  payload: {
    canvasNodeId: string;
    resourceName: string;
    resourceType: string;
    status: 'queued' | 'applying' | 'succeeded' | 'failed';
    error?: { code: string; message: string; recoverable?: boolean };
    duration_ms?: number;
  },
): void {
  emitDeployEvent(cardId, {
    type: 'node_status',
    card_id: cardId,
    node_id: payload.canvasNodeId,
    resource_name: payload.resourceName,
    resource_type: payload.resourceType,
    action: 'delete',
    status: payload.status,
    error: payload.error,
    duration_ms: payload.duration_ms,
    at: new Date().toISOString(),
    seq: 0, // emitDeployEvent fills this in via nextDeploySeq
  });
  // Mirror to the in-memory snapshot so a reconnecting tab during a
  // destroy hydrates the same per-node overlay state the live wire would
  // have produced. Without this, the destroy snapshot persists with an
  // empty `nodeStatuses` map and a refresh mid-destroy regresses to the
  // pre-pdl-10 "panel goes dark during destroy" behavior.
  const overlayStatus = mapStatusToOverlay(payload.status);
  updateDeploySnapshotNode(cardId, payload.canvasNodeId, overlayStatus);
}
