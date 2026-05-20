/**
 * Property Diff Logic
 *
 * Deep comparison of property values for deployment planning.
 */

import type { PropertyChange } from '../types/deployment';

// =============================================================================
// Property Comparison
// =============================================================================

/**
 * Compare two property objects and return the list of changes.
 */
export function diff_properties(
  desired: Record<string, unknown>,
  current: Record<string, unknown>,
  sensitive_keys: Set<string> = new Set(),
): PropertyChange[] {
  const changes: PropertyChange[] = [];

  // Find added and changed properties
  for (const [key, desired_value] of Object.entries(desired)) {
    const current_value = current[key];
    const path = key;
    const is_sensitive = sensitive_keys.has(key) || is_sensitive_key(key);

    if (!(key in current)) {
      // Property added
      changes.push({
        path,
        old_value: undefined,
        new_value: is_sensitive ? '[SENSITIVE]' : desired_value,
        sensitive: is_sensitive,
      });
    } else if (!deep_equal(desired_value, current_value)) {
      // Property changed
      if (
        typeof desired_value === 'object' &&
        typeof current_value === 'object' &&
        desired_value !== null &&
        current_value !== null &&
        !Array.isArray(desired_value) &&
        !Array.isArray(current_value)
      ) {
        // Recurse into nested objects
        const nested_changes = diff_properties(
          desired_value as Record<string, unknown>,
          current_value as Record<string, unknown>,
          sensitive_keys,
        );
        for (const nested of nested_changes) {
          changes.push({
            ...nested,
            path: `${path}.${nested.path}`,
          });
        }
      } else {
        changes.push({
          path,
          old_value: is_sensitive ? '[SENSITIVE]' : current_value,
          new_value: is_sensitive ? '[SENSITIVE]' : desired_value,
          sensitive: is_sensitive,
        });
      }
    }
  }

  // Find removed properties
  for (const key of Object.keys(current)) {
    if (!(key in desired)) {
      const is_sensitive = sensitive_keys.has(key) || is_sensitive_key(key);
      changes.push({
        path: key,
        old_value: is_sensitive ? '[SENSITIVE]' : current[key],
        new_value: undefined,
        sensitive: is_sensitive,
      });
    }
  }

  return changes;
}

/**
 * Check if a property key is typically sensitive.
 */
function is_sensitive_key(key: string): boolean {
  const sensitive_patterns = [
    /password/i,
    /secret/i,
    /token/i,
    /key/i,
    /credential/i,
    /auth/i,
    /private/i,
    /api.?key/i,
  ];

  return sensitive_patterns.some((pattern) => pattern.test(key));
}

// =============================================================================
// Deep Equality
// =============================================================================

/**
 * Deep equality check for two values.
 */
export function deep_equal(a: unknown, b: unknown): boolean {
  // Same reference or primitive equality
  if (a === b) return true;

  // Null checks
  if (a === null || b === null) return a === b;
  if (a === undefined || b === undefined) return a === b;

  // Type check
  if (typeof a !== typeof b) return false;

  // Array comparison
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deep_equal(a[i], b[i])) return false;
    }
    return true;
  }

  // Object comparison
  if (typeof a === 'object' && typeof b === 'object') {
    const keys_a = Object.keys(a as object);
    const keys_b = Object.keys(b as object);

    if (keys_a.length !== keys_b.length) return false;

    for (const key of keys_a) {
      if (!keys_b.includes(key)) return false;
      if (!deep_equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
        return false;
      }
    }

    return true;
  }

  return false;
}

// =============================================================================
// Destructive Change Detection
// =============================================================================

/**
 * Known resource types and their force-replacement properties.
 * When these properties change, the resource must be replaced.
 *
 * Keys here MUST match the output of `normalize_resource_type`,
 * which converts `_` to `.` along with `::` and `/`. Previously this
 * table held keys like `azure.compute.virtual_machine` that the
 * normalizer rewrote to `azure.compute.virtual.machine` before the
 * lookup — so the entries for Azure VMs, Azure storage accounts, and
 * GCP SQL instances were silently unreachable, and destructive
 * changes to those resources never triggered the destroy/recreate
 * flow. See `state/findings.md` #10.
 */
const FORCE_NEW_PROPERTIES: Record<string, string[]> = {
  // AWS
  'aws.ec2.instance': ['ami', 'instance_type', 'availability_zone', 'subnet_id'],
  'aws.s3.bucket': ['bucket', 'region'],
  'aws.rds.instance': ['engine', 'engine_version', 'instance_class', 'allocated_storage'],
  'aws.lambda.function': ['runtime', 'handler'],
  'aws.vpc.vpc': ['cidr_block'],
  'aws.vpc.subnet': ['vpc_id', 'cidr_block', 'availability_zone'],
  'aws.iam.role': ['name', 'path'],
  'aws.dynamodb.table': ['name', 'hash_key', 'range_key'],

  // Azure
  'azure.compute.virtual.machine': ['vm_size', 'location'],
  'azure.storage.storage.account': ['name', 'location'],
  'azure.sql.database': ['name', 'server_id'],

  // GCP
  'gcp.compute.instance': ['machine_type', 'zone'],
  'gcp.storage.bucket': ['name', 'location'],
  'gcp.sql.database.instance': ['name', 'region'],

  // Kubernetes
  'kubernetes.core.namespace': ['name'],
  'kubernetes.apps.deployment': ['name', 'namespace'],
  'kubernetes.core.service': ['name', 'namespace'],
};

/**
 * Determine if property changes require resource replacement.
 */
export function is_destructive_change(resource_type: string, changes: PropertyChange[]): boolean {
  // Normalize the resource type (remove version, etc.)
  const normalized_type = normalize_resource_type(resource_type);

  const force_new = FORCE_NEW_PROPERTIES[normalized_type];
  if (!force_new) {
    // Unknown type - assume not destructive unless explicitly marked
    return false;
  }

  // Check if any changed property is in the force-new list
  for (const change of changes) {
    const property_name = change.path.split('.')[0] ?? ''; // Get top-level property
    if (force_new.includes(property_name)) {
      return true;
    }
  }

  return false;
}

/**
 * Normalize a resource type for lookup.
 */
function normalize_resource_type(type: string): string {
  // Convert various formats to lowercase dotted format
  return type.toLowerCase().replace(/::/g, '.').replace(/\//g, '.').replace(/_/g, '.');
}

// =============================================================================
// Change Summary
// =============================================================================

/**
 * Generate a human-readable summary of changes.
 */
export function summarize_changes(changes: PropertyChange[]): string {
  if (changes.length === 0) {
    return 'No changes';
  }

  const added = changes.filter((c) => c.old_value === undefined);
  const removed = changes.filter((c) => c.new_value === undefined);
  const modified = changes.filter((c) => c.old_value !== undefined && c.new_value !== undefined);

  const parts: string[] = [];

  if (added.length > 0) {
    parts.push(`${added.length} added`);
  }
  if (modified.length > 0) {
    parts.push(`${modified.length} modified`);
  }
  if (removed.length > 0) {
    parts.push(`${removed.length} removed`);
  }

  return parts.join(', ');
}

/**
 * Format a single property change for display.
 */
export function format_property_change(change: PropertyChange): string {
  const { path, old_value, new_value, sensitive } = change;

  if (sensitive) {
    if (old_value === undefined) {
      return `+ ${path}: [SENSITIVE]`;
    }
    if (new_value === undefined) {
      return `- ${path}: [SENSITIVE]`;
    }
    return `~ ${path}: [SENSITIVE] -> [SENSITIVE]`;
  }

  const format_value = (v: unknown): string => {
    if (v === undefined) return '<not set>';
    if (v === null) return 'null';
    if (typeof v === 'string') return `"${v}"`;
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  if (old_value === undefined) {
    return `+ ${path}: ${format_value(new_value)}`;
  }
  if (new_value === undefined) {
    return `- ${path}: ${format_value(old_value)}`;
  }
  return `~ ${path}: ${format_value(old_value)} -> ${format_value(new_value)}`;
}
