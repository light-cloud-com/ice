/**
 * DeployedResourcesList
 *
 * Static "previously-deployed resources" panel surfaced when the slice has
 * resources from a prior deploy hydrated into `deploy.deployedResources` and
 * the current `deploy.status` is `'idle'`. The header counts the resources
 * (with hand-rolled English pluralization), and the body lists each resource
 * with its name, type, and (if present) cloud provider id.
 *
 * Extraction notes (rf-pdpl-9):
 * - Both gates — `deploy.deployedResources.length > 0` and
 *   `deploy.status === 'idle'` — stay at the orchestrator's call site so the
 *   component's job stays the list, not the gate. The component itself does
 *   not early-return on empty; the orchestrator already gates on length, and
 *   the original behavior for an empty array would have been an empty
 *   `divide-y` body with a "0 deployed resources (from prior deploy)" header.
 *   Preserving that defensively means no behavior change if the orchestrator
 *   ever drops the length gate.
 * - The two hardcoded English strings — `'deployed resource'` and
 *   `'(from prior deploy)'` — are NOT in the i18n catalog. Per the unit's
 *   no-behavior-change guard, they stay verbatim; the `length !== 1` ternary
 *   for plural is a hand-rolled pluralization quirk that the i18n system
 *   would handle differently, so it also stays.
 *
 * Extracted from `deploy-panel.tsx` lines 540–564.
 */
import { CheckCircle } from 'lucide-react';
import React from 'react';

interface DeployedResourcesListProps {
  resources: Array<{ name: string; type: string; provider_id?: string }>;
}

export const DeployedResourcesList: React.FC<DeployedResourcesListProps> = ({ resources }) => {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="px-4 py-2 bg-muted/40 border-b border-border text-sm font-medium flex items-center gap-2">
        <CheckCircle className="w-3.5 h-3.5 text-blue-500" />
        {resources.length} deployed resource
        {resources.length !== 1 ? 's' : ''} (from prior deploy)
      </div>
      <div className="divide-y divide-border max-h-32 overflow-y-auto">
        {resources.map((r, i) => (
          <div key={i} className="px-4 py-1.5 text-xs flex items-center gap-2">
            <span className="font-medium text-sm">{r.name}</span>
            <span className="text-muted-foreground font-mono">{r.type}</span>
            {r.provider_id && (
              <span
                className="ml-auto text-muted-foreground font-mono truncate max-w-[250px]"
                title={r.provider_id}
              >
                {r.provider_id}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
