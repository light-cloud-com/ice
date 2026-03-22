/**
 * Provider Type Definitions
 *
 * Core types for cloud provider integration.
 * Defines interfaces for deploying resources to AWS, Azure, GCP, etc.
 */

import type { Node, NodeId } from './graph.js';

// =============================================================================
// Provider Identification
// =============================================================================

/**
 * Supported cloud providers.
 */
export type ProviderName = 'aws' | 'azure' | 'gcp' | 'kubernetes' | string;

/**
 * Provider identifier with region.
 */
export interface ProviderId {
  readonly name: ProviderName;
  readonly region?: string;
  readonly account?: string;
}

/**
 * Create a provider ID string.
 */
export function create_provider_id(provider: ProviderId): string {
  const parts = [provider.name];
  if (provider.region) {
    parts.push(provider.region);
  }
  if (provider.account) {
    parts.push(provider.account);
  }
  return parts.join(':');
}

// =============================================================================
// Provider Credentials
// =============================================================================

/**
 * Base interface for provider credentials.
 */
export interface ProviderCredentials {
  readonly provider: ProviderName;
  readonly type: CredentialType;
}

/**
 * Types of credentials.
 */
export type CredentialType =
  | 'access_key' // AWS-style access key + secret
  | 'service_account' // GCP-style service account JSON
  | 'client_secret' // Azure-style client ID + secret
  | 'token' // Bearer token
  | 'kubeconfig' // Kubernetes config
  | 'assume_role' // AWS assume role
  | 'environment'; // Use environment variables

/**
 * AWS-style access key credentials.
 */
export interface AccessKeyCredentials extends ProviderCredentials {
  readonly type: 'access_key';
  readonly access_key_id: string;
  readonly secret_access_key: string;
  readonly session_token?: string;
}

/**
 * Service account credentials (GCP).
 */
export interface ServiceAccountCredentials extends ProviderCredentials {
  readonly type: 'service_account';
  readonly project_id: string;
  readonly client_email: string;
  readonly private_key: string;
}

/**
 * Client secret credentials (Azure).
 */
export interface ClientSecretCredentials extends ProviderCredentials {
  readonly type: 'client_secret';
  readonly tenant_id: string;
  readonly client_id: string;
  readonly client_secret: string;
  readonly subscription_id: string;
}

/**
 * Environment-based credentials.
 */
export interface EnvironmentCredentials extends ProviderCredentials {
  readonly type: 'environment';
  readonly profile?: string;
}

// =============================================================================
// Provider Configuration
// =============================================================================

/**
 * Configuration for a provider client.
 */
export interface ProviderConfig {
  /** Provider name */
  readonly provider: ProviderName;

  /** Default region */
  readonly region?: string;

  /** Credentials */
  readonly credentials: ProviderCredentials;

  /** Request timeout in milliseconds */
  readonly timeout_ms?: number;

  /** Maximum retry attempts */
  readonly max_retries?: number;

  /** Custom endpoint (for local testing) */
  readonly endpoint?: string;

  /** Additional provider-specific options */
  readonly options?: Record<string, unknown>;
}

// =============================================================================
// Resource Operations
// =============================================================================

/**
 * Status of a resource in the cloud.
 */
export type ResourceStatus =
  | 'pending' // Resource creation requested
  | 'creating' // Resource is being created
  | 'available' // Resource is ready
  | 'updating' // Resource is being updated
  | 'deleting' // Resource is being deleted
  | 'deleted' // Resource has been deleted
  | 'failed' // Operation failed
  | 'unknown'; // Status cannot be determined

/**
 * Cloud resource state.
 */
export interface ResourceState {
  /** Resource identifier in the cloud */
  readonly cloud_id: string;

  /** Current status */
  readonly status: ResourceStatus;

  /** Status message */
  readonly message?: string;

  /** When the resource was created */
  readonly created_at?: string;

  /** When the resource was last updated */
  readonly updated_at?: string;

  /** Resource outputs (computed values) */
  readonly outputs: Record<string, unknown>;

  /** Resource ARN/ID/URI */
  readonly arn?: string;

  /** Provider-specific metadata */
  readonly provider_metadata?: Record<string, unknown>;
}

/**
 * Result of a deployment operation.
 */
export interface DeploymentResult {
  readonly success: boolean;
  readonly node_id: NodeId;
  readonly state?: ResourceState;
  readonly error?: DeploymentError;
  readonly duration_ms: number;
}

/**
 * Deployment error information.
 */
export interface DeploymentError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;
}

/**
 * Result of a destroy operation.
 */
export interface DestroyResult {
  readonly success: boolean;
  readonly node_id: NodeId;
  readonly error?: DeploymentError;
  readonly duration_ms: number;
}

// =============================================================================
// Provider Client Interface
// =============================================================================

/**
 * Base interface for provider clients.
 * Each provider implements this interface for resource operations.
 */
export interface ProviderClient {
  /** Provider name */
  readonly provider: ProviderName;

  /** Provider region */
  readonly region?: string;

  /**
   * Check if the provider is configured and accessible.
   */
  health_check(): Promise<HealthCheckResult>;

  /**
   * Deploy a resource to the cloud.
   */
  deploy(node: Node): Promise<DeploymentResult>;

  /**
   * Update an existing resource.
   */
  update(node: Node, current_state: ResourceState): Promise<DeploymentResult>;

  /**
   * Destroy a resource.
   */
  destroy(node: Node, current_state: ResourceState): Promise<DestroyResult>;

  /**
   * Get the current state of a resource.
   */
  get_state(node: Node): Promise<ResourceState | null>;

  /**
   * Refresh state from the cloud.
   */
  refresh_state(node: Node, current_state: ResourceState): Promise<ResourceState>;

  /**
   * Check if a resource type is supported.
   */
  supports_type(ice_type: string): boolean;

  /**
   * Get the native resource type for an ICE type.
   */
  get_native_type(ice_type: string): string | null;
}

/**
 * Result of a health check.
 */
export interface HealthCheckResult {
  readonly healthy: boolean;
  readonly message?: string;
  readonly latency_ms?: number;
  readonly details?: Record<string, unknown>;
}

// =============================================================================
// Provider Registry
// =============================================================================

/**
 * Registry of available providers.
 */
export interface ProviderRegistry {
  /**
   * Register a provider client factory.
   */
  register(name: ProviderName, factory: ProviderFactory): void;

  /**
   * Get a provider client.
   */
  get(config: ProviderConfig): Promise<ProviderClient>;

  /**
   * Check if a provider is registered.
   */
  has(name: ProviderName): boolean;

  /**
   * List all registered providers.
   */
  list(): ProviderName[];
}

/**
 * Factory function for creating provider clients.
 */
export type ProviderFactory = (config: ProviderConfig) => Promise<ProviderClient>;

// =============================================================================
// Provider Capabilities
// =============================================================================

/**
 * Capabilities of a provider.
 */
export interface ProviderCapabilities {
  /** Provider name */
  readonly provider: ProviderName;

  /** Supported ICE resource types */
  readonly supported_types: string[];

  /** Supported regions */
  readonly regions: string[];

  /** Maximum parallel operations */
  readonly max_parallel_operations: number;

  /** Supports dry-run/preview */
  readonly supports_preview: boolean;

  /** Supports import of existing resources */
  readonly supports_import: boolean;

  /** Supports resource tagging */
  readonly supports_tags: boolean;
}
