/**
 * Pure formatter helpers for deploy events. Extracted from
 * `services/deploy/src/services/deploy.service.ts` (rf-deploy-1) — the
 * orchestrator file re-exports `mapStatusToOverlay` to preserve the
 * public API.
 */

import type { DeployEvent } from '@ice/types';

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

// Re-exported from `@ice/types` (rf-0c dedup) so the server-side
// callers (snapshot mirror in scheduler-callbacks, destroy-status
// emitter in deploy-event-dispatcher) and the frontend
// (`mapStatusToOverlay` re-exported via use-deploy-subscription) all
// resolve the same single canonical implementation.
export { mapStatusToOverlay } from '@ice/types';
