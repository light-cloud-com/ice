/**
 * Pure formatter helpers for deploy events. Extracted from
 * `services/deploy/src/services/deploy.service.ts` (rf-deploy-1) — the
 * orchestrator file re-exports `mapStatusToOverlay` to preserve the
 * public API.
 */

import type { DeployEvent, DeployNodeStatus } from '@ice/types';

/** Short tail string for the per-emit log line. Pure formatter — never throws. */
export function describeEventForLog(event: DeployEvent): string {
  switch (event.type) {
    case 'log':
      return (event.message || '').slice(0, 80);
    case 'node_status':
      return event.resource_name + ' → ' + event.status;
    case 'node_progress':
      return event.resource_name + ' step=' + event.step.label;
    case 'complete':
      return 'outcome=' + event.outcome;
    case 'requirement_verified':
      return event.requirement + '=' + event.status;
    default:
      return '';
  }
}

/** Map a scheduler `DeployNodeStatus` to the canvas overlay status used by
 *  `updateDeploySnapshotNode` (and the canvas block badge). Must agree
 *  with the frontend's `mapWireStatusToOverlay` in
 *  `packages/ui/src/features/deploy/hooks/use-deploy-subscription.ts` —
 *  divergence means a tab opened mid-deploy hydrates a `queued` node
 *  via the snapshot path with one color and gets the same node
 *  overwritten to a different color microseconds later by the live
 *  event. Both sides must pick the same overlay string for the same
 *  wire status. The matching `STATUS_COLORS` entries live in
 *  `packages/ui/src/config/canvas-constants.ts`. */
export function mapStatusToOverlay(status: DeployNodeStatus): string {
  if (status === 'queued') return 'queued';
  if (status === 'applying') return 'deploying';
  if (status === 'succeeded') return 'active';
  if (status === 'failed') return 'error';
  if (status === 'cancelled-due-to-dep') return 'cancelled';
  return 'skipped';
}
