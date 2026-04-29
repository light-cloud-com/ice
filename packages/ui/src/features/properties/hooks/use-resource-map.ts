/**
 * Hooks for the properties panel that read into the Redux store and / or
 * external APIs. Both are folded into one file because they're tightly related
 * (resource definitions feed into property-issue resolution downstream).
 *
 * Pure builders (`buildResourceMap`, `buildPropertyIssuesMap`) are exported
 * alongside the hooks so the load-bearing branches can be tested in this
 * monorepo's node-only vitest environment (no jsdom, no @testing-library/react).
 */

import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { getApi } from '../../../shared/api/api-adapter';
import type { RootState } from '../../../store';

// ─── Types ──────────────────────────────────────────────────────────────────
// TODO(rf-props-9): remove these duplicated definitions once the canonical home
// lands in `components/fields/render-property-field.tsx`. Until then, mirror
// the exact shapes from `properties-panel.tsx` so an `import { ResourceDef }`
// from this hook is interchangeable with the local orchestrator interface
// (TypeScript treats two structurally identical declarations as compatible
// only when their property types match member-by-member).

interface OptionDetail {
  value: string;
  label: string;
  description?: string;
  cost?: string;
  provider?: string;
  tooltip?: string;
}

interface CustomInputConfig {
  type: 'number' | 'string';
  unit: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

interface HighLevelProperty {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'list' | 'queue_list';
  required: boolean;
  description: string;
  options?: string[];
  default?: unknown;
  tier?: 'essential' | 'detailed' | 'advanced';
  placeholder?: string;
  addLabel?: string;
  optionDetails?: OptionDetail[];
  tooltip?: string;
  customInput?: CustomInputConfig;
}

interface ProviderImpl {
  provider: string;
  resource_type: string;
  display_name: string;
}

export interface ResourceDef {
  ice_type: string;
  display_name: string;
  description: string;
  category: string;
  icon: string;
  behavior: string;
  providers: string[];
  implementations: ProviderImpl[];
  properties: HighLevelProperty[];
}

export interface ResourceCategory {
  category: string;
  categoryId: string;
  resources: ResourceDef[];
}

// ─── Pure builders ──────────────────────────────────────────────────────────

/**
 * Index a resource list (flat or category-nested) by both `id` and `ice_type`
 * so downstream lookups can use either key. Behavior is verbatim from the
 * inline implementation that lived in `PropertiesPanel`.
 */
export function buildResourceMap(
  data: ResourceDef[] | ResourceCategory[],
): Map<string, ResourceDef> {
  const map = new Map<string, ResourceDef>();
  // Handle both flat array (from /resources/all) and nested categories
  const resources =
    Array.isArray(data) && data.length > 0 && 'resources' in data[0]
      ? (data as ResourceCategory[]).flatMap((cat) => cat.resources)
      : (data as ResourceDef[]);
  for (const r of resources) {
    // Key by multiple fields for reliable lookup
    const id = (r as any).id || r.ice_type;
    if (id) map.set(id, r);
    if (r.ice_type && r.ice_type !== id) map.set(r.ice_type, r);
  }
  return map;
}

/**
 * Reduce the global validation-issues list to a per-property map for the
 * currently selected node. Returns `undefined` when there's no selection or
 * when no issues match — preserving the inline useMemo's contract.
 *
 * First-issue-wins on `propertyPath` collisions (the `!map.has(...)` guard).
 */
export function buildPropertyIssuesMap(
  issues: ReadonlyArray<{
    nodeId?: string;
    propertyPath?: string;
    severity: string;
    message: string;
  }>,
  selectedNodeId: string | null,
): Map<string, { severity: string; message: string }> | undefined {
  if (!selectedNodeId) return undefined;
  const map = new Map<string, { severity: string; message: string }>();
  for (const issue of issues) {
    if (issue.nodeId === selectedNodeId && issue.propertyPath && !map.has(issue.propertyPath)) {
      map.set(issue.propertyPath, { severity: issue.severity, message: issue.message });
    }
  }
  return map.size > 0 ? map : undefined;
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Load resource schemas from core DB via IPC and key them by `id`/`ice_type`.
 * Silent-on-fail: when the API is unavailable (offline / dev-server) the map
 * stays empty rather than throwing — load-bearing for those scenarios.
 */
export function useResourceMap(): Map<string, ResourceDef> {
  const [resourceMap, setResourceMap] = useState<Map<string, ResourceDef>>(new Map());

  useEffect(() => {
    getApi()
      .resources.getAll()
      .then((data: ResourceDef[] | ResourceCategory[]) => {
        setResourceMap(buildResourceMap(data));
      })
      .catch(() => {
        // API not available — resourceMap stays empty
      });
  }, []);

  return resourceMap;
}

/**
 * Build a per-property validation-issues map for the currently selected node.
 * Subscribes internally to `state.validation.issues` so the orchestrator
 * doesn't have to thread the array through.
 */
export function usePropertyIssues(
  selectedNodeId: string | null,
): Map<string, { severity: string; message: string }> | undefined {
  const validationIssues = useSelector(
    (state: RootState) => state.validation?.issues ?? [],
  );
  return useMemo(
    () => buildPropertyIssuesMap(validationIssues, selectedNodeId),
    [validationIssues, selectedNodeId],
  );
}
