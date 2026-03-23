/**
 * Mock Provider
 *
 * A mock provider for testing apply operations without real cloud resources.
 */

import type { Node, NodeId } from '../types/graph.js';
import type {
  ProviderClient,
  ProviderConfig,
  ProviderName,
  ProviderFactory,
  ResourceState,
  ResourceStatus,
  DeploymentResult,
  DestroyResult,
  HealthCheckResult,
} from '../types/providers.js';

// =============================================================================
// Mock Provider Configuration
// =============================================================================

export interface MockProviderOptions {
  /** Simulated operation delay range in ms [min, max] */
  delay_range?: [number, number];
  /** Failure rate (0-1, default 0) */
  failure_rate?: number;
  /** Specific node IDs that should fail */
  fail_nodes?: Set<string>;
  /** Custom state generator */
  state_generator?: (node: Node, action: string) => ResourceState;
}

// =============================================================================
// Mock Provider Implementation
// =============================================================================

export class MockProvider implements ProviderClient {
  readonly provider: ProviderName;
  readonly region?: string;

  private options: Required<MockProviderOptions>;
  private resource_counter = 0;

  constructor(config: ProviderConfig, options: MockProviderOptions = {}) {
    this.provider = config.provider;
    this.region = config.region;

    this.options = {
      delay_range: options.delay_range ?? [100, 500],
      failure_rate: options.failure_rate ?? 0,
      fail_nodes: options.fail_nodes ?? new Set(),
      state_generator: options.state_generator ?? this.default_state_generator.bind(this),
    };
  }

  // ===========================================================================
  // Health Check
  // ===========================================================================

  async health_check(): Promise<HealthCheckResult> {
    const start = Date.now();
    await this.simulate_delay();

    return {
      healthy: true,
      message: 'Mock provider is healthy',
      latency_ms: Date.now() - start,
      details: {
        provider: this.provider,
        region: this.region,
        mode: 'mock',
      },
    };
  }

  // ===========================================================================
  // Deploy Operation
  // ===========================================================================

  async deploy(node: Node): Promise<DeploymentResult> {
    const start = Date.now();
    await this.simulate_delay();

    // Check for forced failure
    if (this.should_fail(node.id)) {
      return {
        success: false,
        node_id: node.id,
        error: {
          code: 'MOCK_DEPLOY_FAILED',
          message: `Mock deployment failed for ${node.id}`,
          retryable: true,
        },
        duration_ms: Date.now() - start,
      };
    }

    const state = this.options.state_generator(node, 'create');

    return {
      success: true,
      node_id: node.id,
      state,
      duration_ms: Date.now() - start,
    };
  }

  // ===========================================================================
  // Update Operation
  // ===========================================================================

  async update(node: Node, current_state: ResourceState): Promise<DeploymentResult> {
    const start = Date.now();
    await this.simulate_delay();

    // Check for forced failure
    if (this.should_fail(node.id)) {
      return {
        success: false,
        node_id: node.id,
        error: {
          code: 'MOCK_UPDATE_FAILED',
          message: `Mock update failed for ${node.id}`,
          retryable: true,
        },
        duration_ms: Date.now() - start,
      };
    }

    const generated_state = this.options.state_generator(node, 'update');
    // Preserve cloud_id from current state
    const state: ResourceState = {
      ...generated_state,
      cloud_id: current_state.cloud_id,
    };

    return {
      success: true,
      node_id: node.id,
      state,
      duration_ms: Date.now() - start,
    };
  }

  // ===========================================================================
  // Destroy Operation
  // ===========================================================================

  async destroy(node: Node, _current_state: ResourceState): Promise<DestroyResult> {
    const start = Date.now();
    await this.simulate_delay();

    // Check for forced failure
    if (this.should_fail(node.id)) {
      return {
        success: false,
        node_id: node.id,
        error: {
          code: 'MOCK_DESTROY_FAILED',
          message: `Mock destroy failed for ${node.id}`,
          retryable: true,
        },
        duration_ms: Date.now() - start,
      };
    }

    return {
      success: true,
      node_id: node.id,
      duration_ms: Date.now() - start,
    };
  }

  // ===========================================================================
  // State Operations
  // ===========================================================================

  async get_state(_node: Node): Promise<ResourceState | null> {
    await this.simulate_delay();
    // Mock provider doesn't persist state - always returns null
    return null;
  }

  async refresh_state(node: Node, current_state: ResourceState): Promise<ResourceState> {
    await this.simulate_delay();
    // Return current state with updated timestamp
    return {
      ...current_state,
      updated_at: new Date().toISOString(),
    };
  }

  // ===========================================================================
  // Type Support
  // ===========================================================================

  supports_type(_ice_type: string): boolean {
    // Mock provider supports all types
    return true;
  }

  get_native_type(ice_type: string): string | null {
    // Return the same type for mock
    return ice_type;
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private async simulate_delay(): Promise<void> {
    const [min, max] = this.options.delay_range;
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  private should_fail(node_id: NodeId): boolean {
    // Check explicit fail list
    if (this.options.fail_nodes.has(node_id)) {
      return true;
    }

    // Check random failure rate
    if (this.options.failure_rate > 0) {
      return Math.random() < this.options.failure_rate;
    }

    return false;
  }

  private default_state_generator(node: Node, action: string): ResourceState {
    this.resource_counter++;

    const cloud_id = `mock-${this.provider}-${this.resource_counter}-${Date.now()}`;
    const now = new Date().toISOString();

    const status: ResourceStatus = action === 'create' || action === 'update' ? 'available' : 'deleted';

    return {
      cloud_id,
      status,
      message: `Mock ${action} successful`,
      created_at: now,
      updated_at: now,
      outputs: {
        id: cloud_id,
        name: node.name,
        type: node.type,
        ...node.properties,
      },
      arn: `arn:mock:${this.provider}:${this.region ?? 'global'}:resource/${cloud_id}`,
      provider_metadata: {
        mock: true,
        action,
        timestamp: now,
      },
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a mock provider factory.
 */
export function create_mock_provider_factory(options: MockProviderOptions = {}): ProviderFactory {
  return async (config: ProviderConfig): Promise<ProviderClient> => {
    return new MockProvider(config, options);
  };
}

/**
 * Create a mock provider for a specific provider type.
 */
export function create_mock_provider(provider: string, options: MockProviderOptions = {}): ProviderClient {
  const config: ProviderConfig = {
    provider: provider as ProviderName,
    region: 'mock-region',
    credentials: { provider: provider as ProviderName, type: 'environment' },
  };

  return new MockProvider(config, options);
}
