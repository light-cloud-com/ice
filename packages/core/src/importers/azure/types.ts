/**
 * Azure Importer Type Definitions
 */

/**
 * A discovered Azure resource.
 */
export interface AzureResource {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly location: string;
  readonly resource_group: string;
  readonly subscription_id: string;
  readonly properties: Record<string, unknown>;
  readonly tags?: Record<string, string>;
}

/**
 * Options for Azure import.
 */
export interface AzureImportOptions {
  /** Azure subscription IDs to scan (empty = all accessible) */
  readonly subscriptions?: string[];

  /** Resource groups to scan (empty = all) */
  readonly resource_groups?: string[];

  /** Only import resources matching these ICE types */
  readonly filter_types?: string[];

  /** Exclude resources matching these ICE types */
  readonly exclude_types?: string[];

  /** Only import resources with these tags */
  readonly filter_tags?: Record<string, string>;

  /** Whether to infer dependencies (default: true) */
  readonly infer_dependencies?: boolean;
}

/**
 * Result of importing Azure resources.
 */
export interface AzureImportResult {
  readonly success: boolean;
  readonly resources: AzureImportedResource[];
  readonly errors: AzureImportError[];
  readonly warnings: AzureImportWarning[];
  readonly metadata: AzureImportMetadata;
}

/**
 * Imported resource from Azure.
 */
export interface AzureImportedResource {
  readonly azure_id: string;
  readonly azure_type: string;
  readonly ice_type: string;
  readonly name: string;
  readonly properties: Record<string, unknown>;
  readonly dependencies: string[];
  readonly provider: 'azure';
  readonly subscription_id: string;
  readonly resource_group: string;
  readonly location: string;
  readonly tags: Record<string, string>;
}

/**
 * Import error.
 */
export interface AzureImportError {
  readonly code: string;
  readonly message: string;
  readonly resource?: string;
}

/**
 * Import warning.
 */
export interface AzureImportWarning {
  readonly code: string;
  readonly message: string;
  readonly resource?: string;
}

/**
 * Import metadata.
 */
export interface AzureImportMetadata {
  readonly subscriptions: string[];
  readonly locations: string[];
  readonly resource_count: number;
  readonly imported_at: string;
  readonly duration_ms: number;
}
