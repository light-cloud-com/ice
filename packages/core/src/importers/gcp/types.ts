/**
 * GCP Importer Type Definitions
 *
 * Types for importing infrastructure directly from Google Cloud Platform.
 */

// =============================================================================
// GCP Resource Types
// =============================================================================

/**
 * A discovered GCP resource from the API.
 */
export interface GCPResource {
  readonly self_link: string;
  readonly name: string;
  readonly id: string;
  readonly kind: string;
  readonly zone?: string;
  readonly region?: string;
  readonly project: string;
  readonly properties: Record<string, unknown>;
  readonly labels?: Record<string, string>;
  readonly creation_timestamp?: string;
}

/**
 * GCP service type enumeration.
 * 'all' uses Cloud Asset Inventory API to discover ALL resources.
 */
export type GCPServiceType =
  | 'all'
  | 'compute'
  | 'storage'
  | 'sql'
  | 'gke'
  | 'network'
  | 'run'
  | 'functions'
  | 'pubsub'
  | 'bigquery'
  | 'iam';

/**
 * Scope of a GCP resource.
 */
export type ResourceScope = 'global' | 'regional' | 'zonal';

/**
 * Resource discovery result from a single service.
 */
export interface ServiceDiscoveryResult {
  readonly service: GCPServiceType;
  readonly resources: GCPResource[];
  readonly errors: GCPImportError[];
  readonly warnings: GCPImportWarning[];
}

// =============================================================================
// Import Result Types
// =============================================================================

/**
 * Result of importing GCP resources.
 */
export interface GCPImportResult {
  readonly success: boolean;
  readonly resources: GCPImportedResource[];
  readonly errors: GCPImportError[];
  readonly warnings: GCPImportWarning[];
  readonly metadata: GCPImportMetadata;
}

/**
 * Imported resource from GCP.
 */
export interface GCPImportedResource {
  readonly gcp_self_link: string;
  readonly gcp_kind: string;
  readonly ice_type: string;
  readonly name: string;
  readonly id: string;
  readonly properties: Record<string, unknown>;
  readonly dependencies: string[];
  readonly provider: 'gcp';
  readonly project: string;
  readonly zone?: string;
  readonly region?: string;
  readonly labels: Record<string, string>;
  /** Node behavior type matching high-level resource definitions */
  readonly behavior?:
    | 'scalable'
    | 'container'
    | 'singleton'
    | 'streaming'
    | 'stateful'
    | 'connector';
}

/**
 * Import error.
 */
export interface GCPImportError {
  readonly code: string;
  readonly message: string;
  readonly service?: GCPServiceType;
  readonly resource?: string;
  readonly details?: unknown;
}

/**
 * Import warning.
 */
export interface GCPImportWarning {
  readonly code: string;
  readonly message: string;
  readonly service?: GCPServiceType;
  readonly resource?: string;
}

/**
 * Import metadata.
 */
export interface GCPImportMetadata {
  readonly project: string;
  readonly regions: string[];
  readonly zones: string[];
  readonly services_scanned: GCPServiceType[];
  readonly resource_count: number;
  readonly imported_at: string;
  readonly duration_ms: number;
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Options for GCP import.
 */
export interface GCPImportOptions {
  /** GCP Project ID */
  readonly project: string;

  /** Regions to scan (empty = default regions) */
  readonly regions?: string[];

  /** Zones to scan (empty = derive from regions) */
  readonly zones?: string[];

  /** Services to scan (empty = all supported) */
  readonly services?: GCPServiceType[];

  /** Only import resources matching these ICE types */
  readonly filter_types?: string[];

  /** Exclude resources matching these ICE types */
  readonly exclude_types?: string[];

  /** Only import resources with these labels */
  readonly filter_labels?: Record<string, string>;

  /** Prefix to add to resource names */
  readonly name_prefix?: string;

  /** Whether to infer dependencies (default: true) */
  readonly infer_dependencies?: boolean;

  /** Maximum concurrent API requests (default: 5) */
  readonly max_concurrent?: number;

  /** Request timeout in milliseconds (default: 30000) */
  readonly timeout_ms?: number;

  /** Path to service account key file (optional) */
  readonly key_file?: string;
}

/**
 * Authentication configuration.
 */
export interface GCPAuthConfig {
  readonly type: 'adc' | 'service_account' | 'key_file';
  readonly project_id: string;
  readonly key_file_path?: string;
}
