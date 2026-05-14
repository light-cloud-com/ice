/**
 * Parallel deploy scheduler — `on_progress` wrapper (rf-sched-5).
 *
 * The wrapper exists so handler-level `on_step` milestones (which arrive
 * via the legacy `on_progress(resource, action, 'step', { step })` shape
 * from `GCPHandlerContext.on_step`) can also be forwarded to the new
 * per-node `on_node_progress` channel — without changing handler
 * signatures or the service-layer `on_progress` consumer.
 *
 * Wiring path: `deploy-engine.ts` calls `wrap_on_progress_for_node_progress`
 * BEFORE `deployer.initialize` runs, so the deployer captures the
 * wrapped callback. Inside the wrapper we keep the original
 * `on_progress` invocation (full pass-through, not a replacement) and
 * additionally fire `on_node_progress` for `step`-status payloads with a
 * matching `resource_name` in `changes_by_resource_name`.
 *
 * Pre-extraction: `wrap_on_progress_for_node_progress` lived at
 * `scheduler.ts` L662-694. Lifted verbatim — no semantic change.
 */

import type { ResourceChange } from '../../diff/types';
import type { DeployOptions } from '../types';

/**
 * Wrap the host-supplied `on_progress` callback so that handler-level
 * `on_step` milestones (which arrive as `on_progress(resource, action,
 * 'step', { step })` from the GCPDeployer's step bridge) are forwarded
 * to the new `on_node_progress` channel. Pass-through for every other
 * status so existing service-layer behavior is preserved.
 *
 * The mapping `resource_name → node_id` is built from the changes
 * passed to the scheduler so the new channel carries the stable graph
 * id alongside the resource name.
 *
 * Short-circuit: if neither `on_node_progress` nor `on_progress` is set,
 * returns the input options unchanged (no allocation, no closure).
 */
export function wrap_on_progress_for_node_progress(
  options: DeployOptions,
  changes_by_resource_name: Map<string, ResourceChange>,
): DeployOptions {
  const original_progress = options.on_progress;
  const node_progress = options.on_node_progress;
  if (!node_progress && !original_progress) return options;

  const wrapped: DeployOptions = {
    ...options,
    on_progress: (resource, action, status, extra) => {
      // Forward step events to the new channel (in addition to
      // delegating to the original callback for back-compat).
      if (status === 'step' && extra?.step && node_progress) {
        const change = changes_by_resource_name.get(resource);
        if (change) {
          try {
            node_progress({
              node_id: change.id,
              resource_name: change.name,
              step: extra.step,
              at: new Date().toISOString(),
            });
          } catch {
            // Host callback bugs must not break the deploy.
          }
        }
      }
      original_progress?.(resource, action, status, extra);
    },
  };
  return wrapped;
}
