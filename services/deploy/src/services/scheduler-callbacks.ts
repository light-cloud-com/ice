/**
 * Scheduler Callbacks — factory for the per-deploy `on_node_status` /
 * `on_node_progress` / `on_log` / `on_resource_result` quartet that the
 * orchestrator passes into `deploy_graph(...)`.
 *
 * Extracted from `services/deploy/src/services/deploy.service.ts` (rf-deploy-12).
 *
 * BEHAVIOR-RISK background: the apply path and the auto-cleanup retry both
 * spread a partially-overlapping shape into `deploy_graph`'s options. The
 * apply path passes all four callbacks AND tracks overall progress (X-of-N
 * and the cap-at-99 percentage). The retry path stays silent on
 * canvas-id-miss, skips the overall-progress write, and intentionally omits
 * `on_resource_result`. This factory always returns all four — the caller
 * spreads only the ones it wants. The `totals` and `warnOnMiss` knobs
 * carry the two behavior axes that previously lived inline.
 */

import type { NodeStatusEvent, NodeProgressEvent } from '@ice/core';
import { emitDeployEvent, emitLog } from './deploy-event-dispatcher';
import { updateDeploySnapshotNode } from './deploy-locks';
import { mapStatusToOverlay } from '../utils/deploy-event-formatter';

export interface SchedulerCallbacksArgs {
  /** Card id used for every wire emit + snapshot mutation. */
  cardId: string;
  /** `${type}:${name}` graph node id → canvas node id, built once per deploy. */
  graphIdToCanvasId: Map<string, string>;
  /**
   * Overall-progress tracker. Provide on the primary apply path so the
   * factory bumps `completed.count` on each terminal status. Omit on the
   * retry path — the original retry callback never tracked overall
   * progress.
   *
   * `completed` is a small object box (`{ count: 0 }`) so the closure can
   * mutate it in place — JS doesn't pass numbers by reference, and the
   * orchestrator may want to read the running tally from the outer scope
   * after the deploy returns.
   *
   * Note: prior to the dead-fields cleanup (state/progress.md) this
   * factory also wrote `progress` / `currentResource` to the in-memory
   * `DeployProgressSnapshot`. The frontend now derives every in-flight
   * signal from the typed `node_status` wire stream (pdl-5), so those
   * snapshot fields became unread and were removed; the count bump is
   * preserved because callers still read it after the deploy returns.
   */
  totals?: { total: number; completed: { count: number } };
  /**
   * Whether `on_node_status` should `console.warn` when the
   * graph-id → canvas-id translation misses. Defaults to `true` on the
   * primary path (a missing-row UI cell is more visible than a
   * miscorrelated one). Pass `false` on the retry path so the warn
   * doesn't drown the deploy log mid-retry.
   */
  warnOnMiss?: boolean;
}

export interface SchedulerCallbacks {
  on_node_status: (event: NodeStatusEvent) => void;
  on_node_progress: (event: NodeProgressEvent) => void;
  on_log: (message: string) => void;
  on_resource_result: (resourceResult: any) => void;
}

/**
 * Build the four callbacks `deploy_graph(...)` consumes. The factory
 * always returns all four; the caller decides which to spread into the
 * scheduler options. The retry callsite, for example, omits
 * `on_resource_result` from the spread so the post-deploy URL log line
 * doesn't fire twice.
 */
export function makeSchedulerCallbacks(args: SchedulerCallbacksArgs): SchedulerCallbacks {
  const { cardId, graphIdToCanvasId, totals } = args;
  const warnOnMiss = args.warnOnMiss ?? true;

  return {
    on_node_status: (event: NodeStatusEvent) => {
      // Translate the scheduler's graph node id (`${type}:${name}`) to
      // the canvas node id the wire contract requires. On miss, drop
      // the wire emit and warn — a missing-row UI cell is more visible
      // than a miscorrelated one (a status row attached to the wrong
      // block silently lies).
      const canvasId = graphIdToCanvasId.get(event.node_id);
      if (!canvasId) {
        if (warnOnMiss) {
          console.warn(
            '[deploy] on_node_status: no canvas id for graph_node_id=' + event.node_id +
              ' (resource_name=' + event.resource_name + '). Dropping wire emit.',
          );
        }
        return;
      }
      emitDeployEvent(cardId, {
        type: 'node_status',
        card_id: cardId,
        node_id: canvasId,
        resource_name: event.resource_name,
        resource_type: event.resource_type,
        action: event.action,
        status: event.status,
        error: event.error,
        duration_ms: event.duration_ms,
        at: event.at,
        seq: 0,
      });

      // Mirror to the in-memory snapshot so reconnecting tabs hydrate
      // without waiting for the next live event.
      const overlayStatus = mapStatusToOverlay(event.status);
      updateDeploySnapshotNode(cardId, canvasId, overlayStatus);
      if (
        totals &&
        (event.status === 'succeeded' ||
          event.status === 'failed' ||
          event.status === 'skipped' ||
          event.status === 'cancelled-due-to-dep')
      ) {
        totals.completed.count += 1;
      }
    },
    on_node_progress: (event: NodeProgressEvent) => {
      const canvasId = graphIdToCanvasId.get(event.node_id);
      if (!canvasId) {
        // `on_node_progress` fires high-frequency during slow handler
        // operations (Cloud Build polls etc.). A missing translation is
        // a real bug at the bridge boundary, but spamming a warn per
        // tick would drown the deploy log — emit one debug-tier line
        // and drop. The matching `on_node_status` warn above is the
        // primary signal; this is just a quiet sibling.
        return;
      }
      emitDeployEvent(cardId, {
        type: 'node_progress',
        card_id: cardId,
        node_id: canvasId,
        resource_name: event.resource_name,
        step: event.step,
        at: event.at,
        seq: 0,
      });
      // Mirror step to the snapshot so the canvas overlay's small
      // sub-step indicator picks it up on hydrate.
      updateDeploySnapshotNode(cardId, canvasId, 'deploying', event.step);
    },
    on_log: (message: string) => {
      emitLog(cardId, message);
    },
    on_resource_result: (resourceResult: any) => {
      // Kept for the post-deploy resource-mapping table mutation
      // (further below this scope, lines ~1130). The wire emit for
      // per-resource lifecycle is covered by `on_node_status`'s
      // terminal events; we don't add a parallel `resource_result`
      // wire event because the contract doesn't have one. We DO emit
      // a friendly log line when a compute resource lands with a URL —
      // that was previously inside the legacy `on_progress` callback,
      // and `on_node_status` doesn't carry handler outputs, so this
      // callback is the only place to surface the URL live.
      if (resourceResult?.success && resourceResult?.outputs) {
        const out = resourceResult.outputs as Record<string, unknown>;
        const url = (out.custom_domain_url || out.url || out.default_url || out.endpoint) as string | undefined;
        const domain = out.domain as string | undefined;
        const ip = (out.ip_address || out.IPAddress) as string | undefined;
        let endpoint: string | undefined;
        if (url && String(url).trim()) endpoint = String(url).trim();
        else if (domain && String(domain).trim()) endpoint = `https://${String(domain).trim()}`;
        else if (ip && String(ip).trim()) endpoint = `http://${String(ip).trim()}`;
        if (endpoint) {
          emitLog(cardId, `Deployed ${resourceResult.name} → ${endpoint}`);
        }
      }
    },
  };
}
