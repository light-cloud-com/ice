/**
 * ICE Diff Engine
 *
 * Compares desired state (ICE graph) with current infrastructure state.
 */

import type {
  DiffResult,
  DiffOptions,
  ResourceChange,
  DiffPropertyChange,
  DiffSummary,
  DiffError,
  DiffWarning,
  ChangeType,
} from './types';
import type { Graph, Node } from '../types/graph';

/**
 * Default diff options.
 */
const DEFAULT_OPTIONS: Required<DiffOptions> = {
  target: [],
  exclude: [],
  changes_only: false,
  detailed: true,
};

/**
 * Compare two graphs and generate a plan of changes.
 *
 * @param desired - The desired state graph (what we want)
 * @param current - The current state graph (what exists)
 * @param provider - The cloud provider being targeted
 * @param options - Diff options
 */
export function diff_graphs(desired: Graph, current: Graph, provider: string, options: DiffOptions = {}): DiffResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const errors: DiffError[] = [];
  const warnings: DiffWarning[] = [];
  const changes: ResourceChange[] = [];

  // Index current state by type+name for lookup
  const current_by_key = new Map<string, Node>();
  for (const node of current.nodes.values()) {
    const key = make_resource_key(node);
    current_by_key.set(key, node);
  }

  // Index desired state by type+name
  const desired_by_key = new Map<string, Node>();
  for (const node of desired.nodes.values()) {
    const key = make_resource_key(node);
    desired_by_key.set(key, node);
  }

  // Check each desired resource
  for (const desired_node of desired.nodes.values()) {
    const key = make_resource_key(desired_node);

    // Apply filters
    if (!should_include(desired_node, opts)) {
      continue;
    }

    const current_node = current_by_key.get(key);

    if (!current_node) {
      // Resource doesn't exist - needs to be created
      changes.push({
        id: desired_node.id,
        name: desired_node.name,
        type: desired_node.type,
        provider,
        change_type: 'create',
        property_changes: [],
        current_properties: null,
        desired_properties: desired_node.properties,
      });
    } else {
      // Resource exists - check for updates
      const property_changes = compare_properties(current_node.properties, desired_node.properties, opts.detailed);

      const change_type: ChangeType = property_changes.length > 0 ? 'update' : 'no_change';

      if (!opts.changes_only || change_type !== 'no_change') {
        changes.push({
          id: desired_node.id,
          name: desired_node.name,
          type: desired_node.type,
          provider,
          change_type,
          property_changes,
          current_properties: current_node.properties,
          desired_properties: desired_node.properties,
          provider_id: get_provider_id(current_node, provider),
        });
      }
    }
  }

  // Check for resources to delete (in current but not in desired)
  for (const current_node of current.nodes.values()) {
    const key = make_resource_key(current_node);

    // Apply filters
    if (!should_include(current_node, opts)) {
      continue;
    }

    if (!desired_by_key.has(key)) {
      changes.push({
        id: current_node.id,
        name: current_node.name,
        type: current_node.type,
        provider,
        change_type: 'delete',
        property_changes: [],
        current_properties: current_node.properties,
        desired_properties: null,
        provider_id: get_provider_id(current_node, provider),
      });
    }
  }

  // Sort changes: deletes first, then updates, then creates
  changes.sort((a, b) => {
    const order: Record<ChangeType, number> = {
      delete: 0,
      update: 1,
      create: 2,
      no_change: 3,
    };
    return order[a.change_type] - order[b.change_type];
  });

  const summary = calculate_summary(changes);

  return {
    success: errors.length === 0,
    changes,
    summary,
    provider,
    generated_at: new Date().toISOString(),
    errors,
    warnings,
  };
}

/**
 * Create a unique key for a resource based on type and name.
 */
function make_resource_key(node: Node): string {
  return `${node.type}::${node.name}`;
}

/**
 * Check if a node should be included based on filters.
 */
function should_include(node: Node, opts: Required<DiffOptions>): boolean {
  // Check target filter
  if (opts.target.length > 0) {
    const matches_target = opts.target.some(
      (pattern) => matches_pattern(node.name, pattern) || matches_pattern(node.type, pattern),
    );
    if (!matches_target) return false;
  }

  // Check exclude filter
  if (opts.exclude.length > 0) {
    const matches_exclude = opts.exclude.some(
      (pattern) => matches_pattern(node.name, pattern) || matches_pattern(node.type, pattern),
    );
    if (matches_exclude) return false;
  }

  return true;
}

/**
 * Simple glob-like pattern matching.
 */
function matches_pattern(value: string, pattern: string): boolean {
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(value);
  }
  return value === pattern;
}

/**
 * Compare two property objects and return changes.
 *
 * Internal `_`-prefixed keys are skipped at every level of nesting
 * (findings.md #48). They carry provider-internal metadata (cloud ids,
 * self-links) that should never appear in a drift report.
 */
function compare_properties(
  current: Record<string, unknown>,
  desired: Record<string, unknown>,
  detailed: boolean,
): DiffPropertyChange[] {
  const changes: DiffPropertyChange[] = [];

  // Get all keys from both objects
  const all_keys = new Set([...Object.keys(current), ...Object.keys(desired)]);

  for (const key of all_keys) {
    // Skip internal properties (prefixed with _)
    if (key.startsWith('_')) continue;

    const old_value = current[key];
    const new_value = desired[key];

    if (!deep_equal(old_value, new_value)) {
      if (detailed) {
        // Recursively compare nested objects
        if (is_object(old_value) && is_object(new_value)) {
          const nested_changes = compare_nested(
            old_value as Record<string, unknown>,
            new_value as Record<string, unknown>,
            key,
          );
          changes.push(...nested_changes);
        } else {
          changes.push({ path: key, old_value, new_value });
        }
      } else {
        changes.push({ path: key, old_value, new_value });
      }
    }
  }

  return changes;
}

/**
 * Compare nested objects and return changes with paths.
 */
function compare_nested(
  current: Record<string, unknown>,
  desired: Record<string, unknown>,
  prefix: string,
): DiffPropertyChange[] {
  const changes: DiffPropertyChange[] = [];
  const all_keys = new Set([...Object.keys(current), ...Object.keys(desired)]);

  for (const key of all_keys) {
    // findings.md #48 — propagate the `_`-prefix internal-skip to
    // every nesting level. Without this, a provider that nests
    // `_internal.foo` under a real property surfaced as a drift
    // record even though the rest of the engine treated `_`-prefixed
    // keys as opaque metadata.
    if (key.startsWith('_')) continue;

    const path = `${prefix}.${key}`;
    const old_value = current[key];
    const new_value = desired[key];

    if (!deep_equal(old_value, new_value)) {
      if (is_object(old_value) && is_object(new_value)) {
        const nested_changes = compare_nested(
          old_value as Record<string, unknown>,
          new_value as Record<string, unknown>,
          path,
        );
        changes.push(...nested_changes);
      } else {
        changes.push({ path, old_value, new_value });
      }
    }
  }

  return changes;
}

/**
 * Check if a value is a plain object.
 */
function is_object(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Treat null/undefined as equivalent to an empty array or empty
 * object (findings.md #47). Cloud provider responses commonly omit
 * empty list/object fields entirely (returning null after a JSON
 * round-trip) while the desired-state generator produces `[]` / `{}`
 * — the literal-different-but-semantically-equal pair was the most
 * common false-positive vector in drift reports.
 *
 * Returns true if a is null/undefined and b is an empty array, or
 * an empty object, or null/undefined itself (and vice versa).
 */
function null_equivalent(a: unknown, b: unknown): boolean {
  const a_nullish = a === null || a === undefined;
  const b_nullish = b === null || b === undefined;
  if (a_nullish && b_nullish) return true;
  const a_empty_array = Array.isArray(a) && a.length === 0;
  const b_empty_array = Array.isArray(b) && b.length === 0;
  if (a_nullish && b_empty_array) return true;
  if (b_nullish && a_empty_array) return true;
  const a_empty_object = is_object(a) && Object.keys(a as Record<string, unknown>).length === 0;
  const b_empty_object = is_object(b) && Object.keys(b as Record<string, unknown>).length === 0;
  if (a_nullish && b_empty_object) return true;
  if (b_nullish && a_empty_object) return true;
  return false;
}

/**
 * Deep equality check.
 *
 * findings.md #49 — array-of-objects is compared positionally. A
 * reorder of semantically-identical items therefore produces a
 * single drift record at the parent path (not item-level paths).
 * This is intentional: detecting "the same set, different order"
 * requires a stable identifier (id / name / key), and not every
 * array-of-objects in our schemas has one. Engines that do care
 * about ordering (IAM policy rules, route tables) get correct
 * diffs from this contract; sets get reported on reorder, which is
 * a tolerable false positive — the per-resource update batch
 * collapses idempotent re-applies.
 */
function deep_equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (null_equivalent(a, b)) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deep_equal(item, b[index]));
  }

  if (is_object(a) && is_object(b)) {
    const a_obj = a as Record<string, unknown>;
    const b_obj = b as Record<string, unknown>;
    const keys_a = Object.keys(a_obj);
    const keys_b = Object.keys(b_obj);

    if (keys_a.length !== keys_b.length) return false;
    return keys_a.every((key) => deep_equal(a_obj[key], b_obj[key]));
  }

  return false;
}

/**
 * Get the provider-specific ID from a node.
 */
function get_provider_id(node: Node, provider: string): string | undefined {
  const props = node.properties as Record<string, unknown>;

  switch (provider) {
    case 'gcp':
      return (props._gcp_self_link as string) || (props._gcp_id as string);
    case 'aws':
      return props._aws_arn as string;
    case 'azure':
      return props._azure_id as string;
    default:
      return undefined;
  }
}

/**
 * Calculate summary statistics from changes.
 */
function calculate_summary(changes: ResourceChange[]): DiffSummary {
  return {
    total_changes: changes.filter((c) => c.change_type !== 'no_change').length,
    creates: changes.filter((c) => c.change_type === 'create').length,
    updates: changes.filter((c) => c.change_type === 'update').length,
    deletes: changes.filter((c) => c.change_type === 'delete').length,
    no_changes: changes.filter((c) => c.change_type === 'no_change').length,
  };
}

/**
 * Format a plan result for display.
 */
export function format_plan(result: DiffResult): string {
  const lines: string[] = [];

  lines.push(`\nICE Infrastructure Plan`);
  lines.push(`Provider: ${result.provider}`);
  lines.push(`Generated: ${result.generated_at}`);
  lines.push('');

  if (result.changes.length === 0) {
    lines.push('No changes detected. Infrastructure is up to date.');
    return lines.join('\n');
  }

  // Group by change type
  const creates = result.changes.filter((c) => c.change_type === 'create');
  const updates = result.changes.filter((c) => c.change_type === 'update');
  const deletes = result.changes.filter((c) => c.change_type === 'delete');

  if (creates.length > 0) {
    lines.push(`+ Resources to create (${creates.length}):`);
    for (const change of creates) {
      lines.push(`  + ${change.type} "${change.name}"`);
    }
    lines.push('');
  }

  if (updates.length > 0) {
    lines.push(`~ Resources to update (${updates.length}):`);
    for (const change of updates) {
      lines.push(`  ~ ${change.type} "${change.name}"`);
      for (const prop_change of change.property_changes.slice(0, 5)) {
        lines.push(
          `      ${prop_change.path}: ${format_value(prop_change.old_value)} → ${format_value(prop_change.new_value)}`,
        );
      }
      if (change.property_changes.length > 5) {
        lines.push(`      ... and ${change.property_changes.length - 5} more changes`);
      }
    }
    lines.push('');
  }

  if (deletes.length > 0) {
    lines.push(`- Resources to delete (${deletes.length}):`);
    for (const change of deletes) {
      lines.push(`  - ${change.type} "${change.name}"`);
    }
    lines.push('');
  }

  // Summary
  lines.push('─'.repeat(50));
  lines.push(
    `Plan: ${result.summary.creates} to create, ${result.summary.updates} to update, ${result.summary.deletes} to delete`,
  );

  return lines.join('\n');
}

/**
 * Format a value for display.
 */
function format_value(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
