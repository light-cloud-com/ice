/**
 * Tests for the MockProvider — the in-memory ProviderClient used by the
 * apply engine in offline / test runs.
 *
 * Covers the in-memory state machine (deploy → update → destroy), the
 * simulated-latency knob, the failure-injection knobs (fail_nodes set and
 * failure_rate), state operations (get_state / refresh_state), type-support
 * predicates, and both factory entry points.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MockProvider, create_mock_provider, create_mock_provider_factory } from '../mock-provider';
import type { Node, NodeId } from '../../types/graph';
import type { ProviderConfig, ResourceState } from '../../types/providers';

// ─── Helpers ────────────────────────────────────────────────────────

function make_node(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id: id as NodeId,
    type: 'Test.Resource',
    name: `node-${id}`,
    properties: { sample: 'value' },
    metadata: {
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      labels: {},
      annotations: {},
    },
    ...overrides,
  } as Node;
}

function make_config(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    provider: 'aws',
    region: 'us-east-1',
    credentials: { provider: 'aws', type: 'environment' },
    ...overrides,
  };
}

function make_state(overrides: Partial<ResourceState> = {}): ResourceState {
  return {
    cloud_id: 'existing-cloud-id',
    status: 'available',
    outputs: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Latency knob ───────────────────────────────────────────────────

describe('MockProvider simulated latency', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the configured delay range for health_check', async () => {
    const provider = new MockProvider(make_config(), { delay_range: [10, 10] });
    const promise = provider.health_check();
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;
    expect(result.healthy).toBe(true);
    expect(result.message).toBe('Mock provider is healthy');
    expect(result.details).toMatchObject({
      provider: 'aws',
      region: 'us-east-1',
      mode: 'mock',
    });
    expect(result.latency_ms).toBeDefined();
  });

  it('uses default delay range when none provided', async () => {
    const provider = new MockProvider(make_config());
    const promise = provider.deploy(make_node('a'));
    // Default range is [100, 500]; advance 500ms to be safe.
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;
    expect(result.success).toBe(true);
  });
});

// ─── Deploy ────────────────────────────────────────────────────────

describe('MockProvider.deploy', () => {
  it('returns a successful deploy result with generated state', async () => {
    const provider = new MockProvider(make_config(), { delay_range: [0, 0] });
    const node = make_node('alpha');

    const result = await provider.deploy(node);

    expect(result.success).toBe(true);
    expect(result.node_id).toBe(node.id);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    expect(result.state).toBeDefined();
    expect(result.state!.status).toBe('available');
    expect(result.state!.message).toBe('Mock create successful');
    // Default state generator wires node.name + properties into outputs.
    expect(result.state!.outputs).toMatchObject({
      name: node.name,
      type: node.type,
      sample: 'value',
    });
    // arn includes provider and either region or 'global'
    expect(result.state!.arn).toMatch(/^arn:mock:aws:us-east-1:resource\//);
  });

  it('falls back to "global" in the arn when region is omitted', async () => {
    const provider = new MockProvider(make_config({ region: undefined }), { delay_range: [0, 0] });

    const result = await provider.deploy(make_node('beta'));
    expect(result.state!.arn).toMatch(/^arn:mock:aws:global:resource\//);
  });

  it('produces a unique cloud_id per call from the internal counter', async () => {
    const provider = new MockProvider(make_config(), { delay_range: [0, 0] });
    const r1 = await provider.deploy(make_node('a'));
    const r2 = await provider.deploy(make_node('b'));

    expect(r1.state!.cloud_id).not.toBe(r2.state!.cloud_id);
    expect(r1.state!.cloud_id).toMatch(/^mock-aws-1-/);
    expect(r2.state!.cloud_id).toMatch(/^mock-aws-2-/);
  });

  it('returns a typed failure when the node id is in fail_nodes', async () => {
    const provider = new MockProvider(make_config(), {
      delay_range: [0, 0],
      fail_nodes: new Set(['boom']),
    });

    const result = await provider.deploy(make_node('boom'));
    expect(result.success).toBe(false);
    expect(result.state).toBeUndefined();
    expect(result.error).toEqual({
      code: 'MOCK_DEPLOY_FAILED',
      message: 'Mock deployment failed for boom',
      retryable: true,
    });
  });

  it('honours failure_rate=1 to force every deploy to fail', async () => {
    const provider = new MockProvider(make_config(), {
      delay_range: [0, 0],
      failure_rate: 1,
    });
    const result = await provider.deploy(make_node('any'));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('MOCK_DEPLOY_FAILED');
  });

  it('succeeds when failure_rate=0 even after many invocations', async () => {
    const provider = new MockProvider(make_config(), {
      delay_range: [0, 0],
      failure_rate: 0,
    });
    for (let i = 0; i < 5; i++) {
      const r = await provider.deploy(make_node(`n-${i}`));
      expect(r.success).toBe(true);
    }
  });

  it('uses Math.random against failure_rate when no explicit fail list applies', async () => {
    const provider = new MockProvider(make_config(), {
      delay_range: [0, 0],
      failure_rate: 0.5,
    });

    const random_spy = vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const fail_result = await provider.deploy(make_node('rand-fail'));
    random_spy.mockReturnValue(0.6);
    const ok_result = await provider.deploy(make_node('rand-ok'));
    random_spy.mockRestore();

    expect(fail_result.success).toBe(false);
    expect(ok_result.success).toBe(true);
  });
});

// ─── Update ────────────────────────────────────────────────────────

describe('MockProvider.update', () => {
  it('preserves the current_state.cloud_id while regenerating other fields', async () => {
    const provider = new MockProvider(make_config(), { delay_range: [0, 0] });
    const node = make_node('upd');
    const current = make_state({ cloud_id: 'preserved-id' });

    const result = await provider.update(node, current);
    expect(result.success).toBe(true);
    expect(result.state!.cloud_id).toBe('preserved-id');
    expect(result.state!.message).toBe('Mock update successful');
  });

  it('returns a typed failure when the node is in fail_nodes', async () => {
    const provider = new MockProvider(make_config(), {
      delay_range: [0, 0],
      fail_nodes: new Set(['fail-update']),
    });
    const result = await provider.update(make_node('fail-update'), make_state());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('MOCK_UPDATE_FAILED');
    expect(result.error?.retryable).toBe(true);
  });
});

// ─── Destroy ───────────────────────────────────────────────────────

describe('MockProvider.destroy', () => {
  it('returns a success destroy result on the happy path', async () => {
    const provider = new MockProvider(make_config(), { delay_range: [0, 0] });
    const node = make_node('to-delete');
    const result = await provider.destroy(node, make_state());
    expect(result.success).toBe(true);
    expect(result.node_id).toBe(node.id);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('returns a typed failure when the node is in fail_nodes', async () => {
    const provider = new MockProvider(make_config(), {
      delay_range: [0, 0],
      fail_nodes: new Set(['no-delete']),
    });
    const result = await provider.destroy(make_node('no-delete'), make_state());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('MOCK_DESTROY_FAILED');
  });
});

// ─── State operations ─────────────────────────────────────────────

describe('MockProvider state operations', () => {
  it('get_state always returns null because the mock does not persist', async () => {
    const provider = new MockProvider(make_config(), { delay_range: [0, 0] });
    const result = await provider.get_state(make_node('any'));
    expect(result).toBeNull();
  });

  it('refresh_state echoes the current state with a refreshed updated_at', async () => {
    const provider = new MockProvider(make_config(), { delay_range: [0, 0] });
    const current = make_state({
      cloud_id: 'cid',
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-01T00:00:00.000Z',
    });

    const refreshed = await provider.refresh_state(make_node('x'), current);
    expect(refreshed.cloud_id).toBe('cid');
    expect(refreshed.created_at).toBe('2025-01-01T00:00:00.000Z');
    expect(refreshed.updated_at).not.toBe('2025-01-01T00:00:00.000Z');
    expect(typeof refreshed.updated_at).toBe('string');
  });
});

// ─── Type support ────────────────────────────────────────────────

describe('MockProvider type support', () => {
  it('supports_type returns true for any type (mock supports everything)', () => {
    const provider = new MockProvider(make_config(), { delay_range: [0, 0] });
    expect(provider.supports_type('Anything.AtAll')).toBe(true);
    expect(provider.supports_type('')).toBe(true);
  });

  it('get_native_type echoes the input ICE type', () => {
    const provider = new MockProvider(make_config(), { delay_range: [0, 0] });
    expect(provider.get_native_type('Ec2.Vpc')).toBe('Ec2.Vpc');
  });
});

// ─── Custom state generator ──────────────────────────────────────

describe('MockProvider.state_generator override', () => {
  it('uses a caller-supplied generator instead of the default for create', async () => {
    const custom = vi.fn(
      () =>
        ({
          cloud_id: 'custom-id',
          status: 'available',
          outputs: { custom: true },
        }) as ResourceState,
    );

    const provider = new MockProvider(make_config(), {
      delay_range: [0, 0],
      state_generator: custom,
    });

    const node = make_node('custom');
    const result = await provider.deploy(node);

    expect(custom).toHaveBeenCalledWith(node, 'create');
    expect(result.state!.cloud_id).toBe('custom-id');
    expect(result.state!.outputs).toEqual({ custom: true });
  });

  it('uses the override for update too while still preserving cloud_id', async () => {
    const custom = vi.fn(
      () =>
        ({
          cloud_id: 'should-be-overwritten',
          status: 'available',
          outputs: { mode: 'update' },
        }) as ResourceState,
    );

    const provider = new MockProvider(make_config(), {
      delay_range: [0, 0],
      state_generator: custom,
    });

    const result = await provider.update(make_node('u'), make_state({ cloud_id: 'kept' }));
    expect(custom).toHaveBeenCalledWith(expect.any(Object), 'update');
    expect(result.state!.cloud_id).toBe('kept');
    expect(result.state!.outputs).toEqual({ mode: 'update' });
  });
});

// ─── Default state generator branches ────────────────────────────

describe('default_state_generator status branch', () => {
  it('marks state status as "deleted" when the action is not create or update', async () => {
    // The destroy/get_state public methods do not call the state generator,
    // findings.md #40 — the previous `'deleted'` fallback in the
    // default state generator was unreachable through the public
    // ProviderClient surface (destroy doesn't call the generator;
    // only deploy/update do). The default now always returns
    // `'available'`; callers wanting other statuses must inject a
    // custom state_generator.
    const provider = new MockProvider(make_config(), { delay_range: [0, 0] });

    const create_result = await provider.deploy(make_node('one'));
    const update_result = await provider.update(make_node('one'), make_state({ cloud_id: 'cid' }));
    expect(create_result.state!.status).toBe('available');
    expect(update_result.state!.status).toBe('available');

    // Even when the generator is invoked with an unusual action it
    // returns 'available' — the action label still threads through
    // to the message and provider_metadata, just not the status.
    const generator = (
      provider as unknown as {
        options: { state_generator: (n: Node, a: string) => ResourceState };
      }
    ).options.state_generator;

    const noop_state = generator(make_node('two'), 'noop');
    expect(noop_state.status).toBe('available');
    expect(noop_state.message).toBe('Mock noop successful');
  });
});

// ─── Factory functions ───────────────────────────────────────────

describe('create_mock_provider_factory', () => {
  it('returns a factory that constructs a MockProvider for the given config', async () => {
    const factory = create_mock_provider_factory({ delay_range: [0, 0] });
    const client = await factory(make_config({ provider: 'gcp', region: 'eu-west-2' }));

    expect(client.provider).toBe('gcp');
    expect(client.region).toBe('eu-west-2');
    // Should expose ProviderClient-shaped methods
    expect(typeof client.deploy).toBe('function');
    expect(typeof client.health_check).toBe('function');
  });

  it('forwards options to every MockProvider it produces', async () => {
    const factory = create_mock_provider_factory({
      delay_range: [0, 0],
      fail_nodes: new Set(['x']),
    });
    const client = await factory(make_config());

    const result = await client.deploy(make_node('x'));
    expect(result.success).toBe(false);
  });

  it('uses default options when none are provided to the factory', async () => {
    const factory = create_mock_provider_factory();
    const client = await factory(make_config());
    expect(client.provider).toBe('aws');
  });
});

describe('create_mock_provider', () => {
  it('builds a provider for the named cloud with mock-region defaults', async () => {
    const provider = create_mock_provider('azure', { delay_range: [0, 0] });
    expect(provider.provider).toBe('azure');
    expect(provider.region).toBe('mock-region');

    const result = await provider.deploy(make_node('z'));
    expect(result.success).toBe(true);
    expect(result.state!.arn).toMatch(/^arn:mock:azure:mock-region:resource\//);
  });

  it('uses default options when omitted', () => {
    const provider = create_mock_provider('aws');
    expect(provider.provider).toBe('aws');
  });
});
