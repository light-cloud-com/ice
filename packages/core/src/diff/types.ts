/**
 * ICE Diff Types
 *
 * Types for comparing desired state with current infrastructure state.
 */

/**
 * Type of change detected for a resource.
 */
export type ChangeType = 'create' | 'update' | 'delete' | 'no_change';

/**
 * A single property change (diff-specific).
 */
export interface DiffPropertyChange {
  path: string;
  old_value: unknown;
  new_value: unknown;
}

/**
 * A resource change in the diff result.
 */
export interface ResourceChange {
  /** Unique identifier for the resource */
  id: string;
  /** Human-readable name */
  name: string;
  /** ICE resource type */
  type: string;
  /** Provider (gcp, aws, azure) */
  provider: string;
  /** Type of change */
  change_type: ChangeType;
  /** Property changes (for updates) */
  property_changes: DiffPropertyChange[];
  /** Current state properties (null for creates) */
  current_properties: Record<string, unknown> | null;
  /** Desired state properties (null for deletes) */
  desired_properties: Record<string, unknown> | null;
  /** Provider-specific ID (for existing resources) */
  provider_id?: string;
}

/**
 * Summary statistics for a diff.
 */
export interface DiffSummary {
  total_changes: number;
  creates: number;
  updates: number;
  deletes: number;
  no_changes: number;
}

/**
 * Result of a diff operation.
 */
export interface DiffResult {
  /** Whether the diff was generated successfully */
  success: boolean;
  /** List of resource changes */
  changes: ResourceChange[];
  /** Summary statistics */
  summary: DiffSummary;
  /** Provider being diffed against */
  provider: string;
  /** Timestamp when diff was generated */
  generated_at: string;
  /** Errors encountered during diffing */
  errors: DiffError[];
  /** Warnings encountered during diffing */
  warnings: DiffWarning[];
}

/**
 * Error during diffing.
 */
export interface DiffError {
  code: string;
  message: string;
  resource_id?: string;
}

/**
 * Warning during diffing.
 */
export interface DiffWarning {
  code: string;
  message: string;
  resource_id?: string;
}

/**
 * Options for the diff operation.
 */
export interface DiffOptions {
  /** Target resources by name pattern */
  target?: string[];
  /** Exclude resources by name pattern */
  exclude?: string[];
  /** Only show changes (hide no_change resources) */
  changes_only?: boolean;
  /** Detailed property comparison */
  detailed?: boolean;
}
