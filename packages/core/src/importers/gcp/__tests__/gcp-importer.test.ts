/**
 * Tests for gcp-importer.ts — the top-level orchestrator that fans out
 * to per-service discovery, applies filters, and shapes the import
 * result + the optional graph wrapper.
 *
 * The actual service classes are mocked via vi.mock so we can drive
 * the orchestrator's branches deterministically.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock identities so factories can reference them.
const h = vi.hoisted(() => {
  const assetCtor = vi.fn();
  const computeCtor = vi.fn();
  const storageCtor = vi.fn();
  const assetDiscover = vi.fn();
  const computeDiscover = vi.fn();
  const storageDiscover = vi.fn();
  return { assetCtor, computeCtor, storageCtor, assetDiscover, computeDiscover, storageDiscover };
});

vi.mock('../services/index.js', () => ({
  AssetInventoryService: class {
    constructor(...args: any[]) {
      h.assetCtor(...args);
    }
    discover() {
      return h.assetDiscover();
    }
  },
  ComputeService: class {
    constructor(...args: any[]) {
      h.computeCtor(...args);
    }
    discover() {
      return h.computeDiscover();
    }
  },
  StorageService: class {
    constructor(...args: any[]) {
      h.storageCtor(...args);
    }
    discover() {
      return h.storageDiscover();
    }
  },
  BaseGCPService: class {},
}));

import { import_gcp, import_gcp_to_graph, gcp_result_to_graph } from '../gcp-importer.js';
import type { GCPResource } from '../types.js';

// =========================================================================
// Helpers
// =========================================================================

function makeResource(partial: Partial<GCPResource>): GCPResource {
  return {
    self_link: 'sl',
    name: 'r',
    id: 'i',
    kind: 'compute#instance',
    project: 'p',
    properties: {},
    ...partial,
  };
}

function emptyResult() {
  return { resources: [], errors: [], warnings: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.assetDiscover.mockResolvedValue(emptyResult());
  h.computeDiscover.mockResolvedValue(emptyResult());
  h.storageDiscover.mockResolvedValue(emptyResult());
});

// =========================================================================
// import_gcp — service dispatch
// =========================================================================

describe('import_gcp — service dispatch', () => {
  it('uses AssetInventoryService for the default "all" service', async () => {
    const result = await import_gcp({ project: 'p1' });
    expect(h.assetCtor).toHaveBeenCalledTimes(1);
    expect(h.computeCtor).not.toHaveBeenCalled();
    expect(h.storageCtor).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.metadata.services_scanned).toEqual(['all']);
  });

  it('uses ComputeService for "compute"', async () => {
    await import_gcp({ project: 'p1', services: ['compute'] });
    expect(h.computeCtor).toHaveBeenCalledTimes(1);
  });

  it('uses ComputeService for "network" too', async () => {
    await import_gcp({ project: 'p1', services: ['network'] });
    expect(h.computeCtor).toHaveBeenCalledTimes(1);
  });

  it('uses StorageService for "storage"', async () => {
    await import_gcp({ project: 'p1', services: ['storage'] });
    expect(h.storageCtor).toHaveBeenCalledTimes(1);
  });

  it('records an UNKNOWN_SERVICE warning for an unrecognized service', async () => {
    const result = await import_gcp({ project: 'p1', services: ['nonexistent' as any] });
    expect(result.warnings.some((w) => w.code === 'UNKNOWN_SERVICE' && w.message.includes('nonexistent'))).toBe(true);
    expect(result.metadata.services_scanned).not.toContain('nonexistent');
  });

  it('aggregates errors and warnings from each service', async () => {
    h.assetDiscover.mockResolvedValueOnce({
      resources: [],
      errors: [{ code: 'X', message: 'asset-err' }],
      warnings: [{ code: 'Y', message: 'asset-warn' }],
    });
    h.computeDiscover.mockResolvedValueOnce({
      resources: [],
      errors: [{ code: 'Z', message: 'compute-err' }],
      warnings: [],
    });
    const result = await import_gcp({ project: 'p1', services: ['all', 'compute'] });
    expect(result.errors.map((e) => e.message)).toEqual(['asset-err', 'compute-err']);
    expect(result.warnings.find((w) => w.message === 'asset-warn')).toBeDefined();
  });

  it('captures a thrown error from a service into a SERVICE_ERROR entry', async () => {
    h.assetDiscover.mockRejectedValueOnce(new Error('boom'));
    const result = await import_gcp({ project: 'p1' });
    expect(result.errors.some((e) => e.code === 'SERVICE_ERROR' && e.message.includes('boom'))).toBe(true);
  });

  it('captures a thrown non-Error value from a service via String(error)', async () => {
    h.assetDiscover.mockRejectedValueOnce('string-thrown');
    const result = await import_gcp({ project: 'p1' });
    expect(result.errors.some((e) => e.message.includes('string-thrown'))).toBe(true);
  });

  it('flags failure when ALL errors are ACCESS_DENIED and zero resources came in (findings #27)', async () => {
    // Previously every ACCESS_DENIED was treated as benign, so an
    // importer run that hit permission errors on every service still
    // reported success and silently produced an empty resource set —
    // exactly the misconfiguration mode that most needs surfacing.
    h.assetDiscover.mockResolvedValueOnce({
      resources: [],
      errors: [{ code: 'AUTH_INSUFFICIENT_PERMISSIONS_ACCESS_DENIED', message: 'forbidden' }],
      warnings: [],
    });
    const result = await import_gcp({ project: 'p1' });
    expect(result.success).toBe(false);
  });

  it('treats ACCESS_DENIED as partial success when at least one resource imported (findings #27)', async () => {
    h.assetDiscover.mockResolvedValueOnce({
      resources: [{ kind: 'compute#instance', id: 'i-1', name: 'i-1', region: 'us-central1', zone: 'us-central1-a', properties: {} }] as any,
      errors: [{ code: 'AUTH_INSUFFICIENT_PERMISSIONS_ACCESS_DENIED', message: 'forbidden on storage' }],
      warnings: [],
    });
    const result = await import_gcp({ project: 'p1' });
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.resources.length).toBeGreaterThan(0);
  });

  it('regards the import as failure when any error is non-ACCESS_DENIED', async () => {
    h.assetDiscover.mockResolvedValueOnce({
      resources: [],
      errors: [{ code: 'API_ERROR', message: 'real fail' }],
      warnings: [],
    });
    const result = await import_gcp({ project: 'p1' });
    expect(result.success).toBe(false);
  });
});

// =========================================================================
// import_gcp — option defaults and zone derivation
// =========================================================================

describe('import_gcp — defaults and zone derivation', () => {
  it('uses DEFAULT_REGIONS when no regions supplied, derives zones from those', async () => {
    await import_gcp({ project: 'p1' });
    expect(h.assetCtor).toHaveBeenCalledWith(
      'p1',
      expect.arrayContaining(['us-central1', 'us-east1', 'us-west1', 'europe-west1']),
      expect.any(Array),
      undefined,
    );
    const passedZones = h.assetCtor.mock.calls[0]![2] as string[];
    // 4 regions × 3 zones each
    expect(passedZones).toContain('us-central1-a');
    expect(passedZones).toContain('us-central1-b');
    expect(passedZones).toContain('us-central1-c');
    expect(passedZones).toContain('europe-west1-a');
    expect(passedZones.length).toBe(12);
  });

  it('honors regions option', async () => {
    await import_gcp({ project: 'p1', regions: ['asia-east1'] });
    const passedRegions = h.assetCtor.mock.calls[0]![1] as string[];
    expect(passedRegions).toEqual(['asia-east1']);
    const passedZones = h.assetCtor.mock.calls[0]![2] as string[];
    expect(passedZones).toEqual(['asia-east1-a', 'asia-east1-b', 'asia-east1-c']);
  });

  it('uses explicit zones when supplied (skips derive_zones)', async () => {
    await import_gcp({ project: 'p1', regions: ['x'], zones: ['x-z'] });
    const passedZones = h.assetCtor.mock.calls[0]![2] as string[];
    expect(passedZones).toEqual(['x-z']);
  });

  it('passes key_file through to the service constructor', async () => {
    await import_gcp({ project: 'p1', key_file: '/tmp/k.json' });
    expect(h.assetCtor).toHaveBeenCalledWith('p1', expect.any(Array), expect.any(Array), '/tmp/k.json');
  });

  it('skips undefined option fields when merging with defaults', async () => {
    // explicitly pass undefined for each tunable option — defaults must kick in
    await import_gcp({ project: 'p1', regions: undefined, services: undefined, name_prefix: undefined });
    expect(h.assetCtor).toHaveBeenCalledTimes(1);
  });
});

// =========================================================================
// import_gcp — filtering, name prefixing, location-suffix
// =========================================================================

describe('import_gcp — type/label filtering', () => {
  it('filter_types includes ice_type → keeps the resource', async () => {
    h.assetDiscover.mockResolvedValueOnce({
      resources: [makeResource({ kind: 'compute#instance' })],
      errors: [],
      warnings: [],
    });
    const result = await import_gcp({ project: 'p1', filter_types: ['Compute.Container'] });
    expect(result.resources).toHaveLength(1);
  });

  it('filter_types excludes ice_type → drops the resource', async () => {
    h.assetDiscover.mockResolvedValueOnce({
      resources: [makeResource({ kind: 'compute#instance' })],
      errors: [],
      warnings: [],
    });
    const result = await import_gcp({ project: 'p1', filter_types: ['Storage.Bucket'] });
    expect(result.resources).toHaveLength(0);
  });

  it('exclude_types drops the matching ice_type', async () => {
    h.assetDiscover.mockResolvedValueOnce({
      resources: [
        makeResource({ kind: 'compute#instance', name: 'i' }),
        makeResource({ kind: 'storage#bucket', name: 'b' }),
      ],
      errors: [],
      warnings: [],
    });
    const result = await import_gcp({ project: 'p1', exclude_types: ['Compute.Container'] });
    expect(result.resources.map((r) => r.name)).toEqual(['b']);
  });

  it('filter_labels drops resources missing the label, keeps matches', async () => {
    h.assetDiscover.mockResolvedValueOnce({
      resources: [
        makeResource({ name: 'a', labels: { env: 'prod' } }),
        makeResource({ name: 'b', labels: { env: 'dev' } }),
        makeResource({ name: 'c' }),
      ],
      errors: [],
      warnings: [],
    });
    const result = await import_gcp({ project: 'p1', filter_labels: { env: 'prod' } });
    expect(result.resources.map((r) => r.name)).toEqual(['a']);
  });

  it('filter_labels with a missing label key drops the resource (labels?.[k] is undefined)', async () => {
    h.assetDiscover.mockResolvedValueOnce({
      resources: [makeResource({ name: 'no-labels' })],
      errors: [],
      warnings: [],
    });
    const result = await import_gcp({ project: 'p1', filter_labels: { env: 'prod' } });
    expect(result.resources).toHaveLength(0);
  });
});

describe('import_gcp — name prefix and location suffix', () => {
  it('appends -<location> to "default" subnetworks/networks/firewalls/routes when zone or region is set', async () => {
    h.assetDiscover.mockResolvedValueOnce({
      resources: [
        makeResource({ kind: 'compute#subnetwork', name: 'default', region: 'us-central1' }),
        makeResource({ kind: 'compute#network', name: 'default', region: 'us-east1' }),
        makeResource({ kind: 'compute#firewall', name: 'default', region: 'eu-west1' }),
        makeResource({ kind: 'compute#route', name: 'default', zone: 'us-central1-a' }),
        // Non-default name does NOT get the suffix even if kind matches
        makeResource({ kind: 'compute#network', name: 'custom', region: 'us-east1' }),
        // Non-target kind does NOT get the suffix even if named "default" + region present
        makeResource({ kind: 'compute#instance', name: 'default', region: 'us-east1' }),
      ],
      errors: [],
      warnings: [],
    });
    const result = await import_gcp({ project: 'p1' });
    const names = result.resources.map((r) => r.name).sort();
    expect(names).toContain('default-us-central1');
    expect(names).toContain('default-us-east1');
    expect(names).toContain('default-eu-west1');
    expect(names).toContain('default-us-central1-a');
    expect(names).toContain('custom');
    expect(names).toContain('default'); // for the compute#instance — no rename
  });

  it('does not touch name when neither zone nor region is set', async () => {
    h.assetDiscover.mockResolvedValueOnce({
      resources: [makeResource({ kind: 'compute#subnetwork', name: 'default' })],
      errors: [],
      warnings: [],
    });
    const result = await import_gcp({ project: 'p1' });
    expect(result.resources[0]!.name).toBe('default');
  });

  it('applies name_prefix to every resource name (including suffixed ones)', async () => {
    h.assetDiscover.mockResolvedValueOnce({
      resources: [
        makeResource({ kind: 'compute#network', name: 'default', region: 'us-central1' }),
        makeResource({ kind: 'compute#instance', name: 'foo' }),
      ],
      errors: [],
      warnings: [],
    });
    const result = await import_gcp({ project: 'p1', name_prefix: 'imp_' });
    const names = result.resources.map((r) => r.name).sort();
    expect(names).toEqual(['imp_default-us-central1', 'imp_foo']);
  });

  it('skips dependency inference when infer_dependencies is false', async () => {
    h.assetDiscover.mockResolvedValueOnce({
      resources: [
        makeResource({
          kind: 'compute#instance',
          self_link: 'https://compute.googleapis.com/compute/v1/projects/p/zones/z/instances/i',
          properties: {
            networkInterfaces: [
              { network: 'https://compute.googleapis.com/compute/v1/projects/p/global/networks/default' },
            ],
          },
        }),
        makeResource({
          kind: 'compute#network',
          name: 'default',
          self_link: 'https://compute.googleapis.com/compute/v1/projects/p/global/networks/default',
        }),
      ],
      errors: [],
      warnings: [],
    });
    const result = await import_gcp({ project: 'p1', infer_dependencies: false });
    expect(result.resources.every((r) => r.dependencies.length === 0)).toBe(true);
  });

  it('runs dependency inference by default and populates dependencies', async () => {
    h.assetDiscover.mockResolvedValueOnce({
      resources: [
        makeResource({
          kind: 'compute#instance',
          name: 'i',
          self_link: 'https://compute.googleapis.com/compute/v1/projects/p/zones/z/instances/i',
          properties: {
            networkInterfaces: [
              { network: 'https://compute.googleapis.com/compute/v1/projects/p/global/networks/default' },
            ],
          },
        }),
        makeResource({
          kind: 'compute#network',
          name: 'default',
          self_link: 'https://compute.googleapis.com/compute/v1/projects/p/global/networks/default',
        }),
      ],
      errors: [],
      warnings: [],
    });
    const result = await import_gcp({ project: 'p1' });
    const inst = result.resources.find((r) => r.gcp_kind === 'compute#instance');
    expect(inst?.dependencies.length).toBeGreaterThan(0);
  });
});

describe('import_gcp — metadata and zone fallback to region', () => {
  it('produces full metadata with duration_ms, imported_at, resource_count', async () => {
    h.assetDiscover.mockResolvedValueOnce({
      resources: [makeResource({})],
      errors: [],
      warnings: [],
    });
    const result = await import_gcp({ project: 'p1' });
    expect(result.metadata.project).toBe('p1');
    expect(result.metadata.resource_count).toBe(1);
    expect(typeof result.metadata.duration_ms).toBe('number');
    expect(typeof result.metadata.imported_at).toBe('string');
    expect(Number.isFinite(Date.parse(result.metadata.imported_at))).toBe(true);
  });

  it('uses zone over region for the location suffix when both are present', async () => {
    h.assetDiscover.mockResolvedValueOnce({
      resources: [
        makeResource({
          kind: 'compute#network',
          name: 'default',
          zone: 'us-central1-a',
          region: 'us-central1',
        }),
      ],
      errors: [],
      warnings: [],
    });
    const result = await import_gcp({ project: 'p1' });
    expect(result.resources[0]!.name).toBe('default-us-central1-a');
  });

  it('preserves labels into imported resource (or empty object when absent)', async () => {
    h.assetDiscover.mockResolvedValueOnce({
      resources: [makeResource({ labels: { team: 'core' } }), makeResource({ name: 'no-lab' })],
      errors: [],
      warnings: [],
    });
    const result = await import_gcp({ project: 'p1' });
    expect(result.resources[0]!.labels).toEqual({ team: 'core' });
    expect(result.resources[1]!.labels).toEqual({});
  });
});

// =========================================================================
// gcp_result_to_graph + import_gcp_to_graph
// =========================================================================

describe('gcp_result_to_graph', () => {
  it('creates one node per resource, with provider/gcp_kind/project labels', async () => {
    h.assetDiscover.mockResolvedValueOnce({
      resources: [
        makeResource({
          self_link: 'sl-net',
          name: 'vpc',
          kind: 'compute#network',
          project: 'proj',
          region: 'us-central1',
          labels: { tier: 'core' },
        }),
      ],
      errors: [],
      warnings: [],
    });
    const result = await import_gcp({ project: 'proj' });
    const graph = gcp_result_to_graph(result, 'g');
    expect(graph.node_count).toBe(1);
    const n = graph.get_node_by_name('vpc')!;
    expect(n.metadata.labels.provider).toBe('gcp');
    expect(n.metadata.labels.gcp_kind).toBe('compute#network');
    expect(n.metadata.labels.project).toBe('proj');
    expect(n.metadata.labels.tier).toBe('core');
    expect(n.metadata.labels.region).toBe('us-central1');
    expect(n.metadata.labels.zone).toBeUndefined();
    expect((n.properties as any)._gcp_self_link).toBe('sl-net');
    expect((n.properties as any)._gcp_kind).toBe('compute#network');
    expect((n.properties as any).region).toBe('us-central1');
  });

  it('adds zone label and zone property when resource has a zone', async () => {
    h.assetDiscover.mockResolvedValueOnce({
      resources: [
        makeResource({
          kind: 'compute#instance',
          name: 'inst',
          zone: 'us-central1-a',
        }),
      ],
      errors: [],
      warnings: [],
    });
    const result = await import_gcp({ project: 'proj' });
    const graph = gcp_result_to_graph(result, 'g');
    const n = graph.get_node_by_name('inst')!;
    expect(n.metadata.labels.zone).toBe('us-central1-a');
    expect((n.properties as any).zone).toBe('us-central1-a');
  });

  it('uses default graph_name when not supplied', async () => {
    const graph = gcp_result_to_graph({
      success: true,
      resources: [],
      errors: [],
      warnings: [],
      metadata: { project: 'p', regions: [], zones: [], services_scanned: [], resource_count: 0, imported_at: '', duration_ms: 0 },
    });
    expect(graph.name).toBe('gcp-import');
  });

  it('skips dependencies that are self-referencing or that point to unknown self_links', async () => {
    const result = {
      success: true,
      resources: [
        {
          gcp_self_link: 'sl-1',
          gcp_kind: 'compute#instance',
          ice_type: 'Compute.Container',
          name: 'i1',
          id: 'i1',
          properties: {},
          dependencies: ['sl-1', 'sl-unknown'], // self-ref + miss
          provider: 'gcp' as const,
          project: 'proj',
          labels: {},
        },
      ],
      errors: [],
      warnings: [],
      metadata: {
        project: 'proj',
        regions: [],
        zones: [],
        services_scanned: [],
        resource_count: 1,
        imported_at: '',
        duration_ms: 0,
      },
    };
    const graph = gcp_result_to_graph(result);
    expect(graph.edge_count).toBe(0);
  });

  it('creates edges for valid dependencies', async () => {
    const result = {
      success: true,
      resources: [
        {
          gcp_self_link: 'sl-net',
          gcp_kind: 'compute#network',
          ice_type: 'Network.VPC',
          name: 'vpc',
          id: 'vpc',
          properties: {},
          dependencies: [],
          provider: 'gcp' as const,
          project: 'p',
          labels: {},
        },
        {
          gcp_self_link: 'sl-i',
          gcp_kind: 'compute#instance',
          ice_type: 'Compute.Container',
          name: 'i',
          id: 'i',
          properties: {},
          dependencies: ['sl-net'],
          provider: 'gcp' as const,
          project: 'p',
          labels: {},
        },
      ],
      errors: [],
      warnings: [],
      metadata: {
        project: 'p',
        regions: [],
        zones: [],
        services_scanned: [],
        resource_count: 2,
        imported_at: '',
        duration_ms: 0,
      },
    };
    const graph = gcp_result_to_graph(result);
    expect(graph.edge_count).toBe(1);
    const inst = graph.get_node_by_name('i')!;
    const outgoing = graph.get_outgoing_edges(inst.id);
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0]!.relationship).toBe('depends_on');
    expect(outgoing[0]!.metadata.labels.inferred).toBe('true');
  });

  it('skips an edge whose source is not in the node map (add_node failed via duplicate name)', async () => {
    // Two resources with the same name + type produce the same node ID.
    // The second add_node returns success=false, so its self_link is NEVER
    // recorded in self_link_to_node_id — when we then iterate dependencies
    // for the second resource, source_id is undefined, the `!source_id`
    // branch fires, and we skip.
    const result = {
      success: true,
      resources: [
        {
          gcp_self_link: 'sl-A',
          gcp_kind: 'compute#network',
          ice_type: 'Network.VPC',
          name: 'dup',
          id: 'a',
          properties: {},
          dependencies: [],
          provider: 'gcp' as const,
          project: 'p',
          labels: {},
        },
        {
          gcp_self_link: 'sl-B',
          gcp_kind: 'compute#network',
          ice_type: 'Network.VPC',
          name: 'dup', // collides → add_node fails
          id: 'b',
          properties: {},
          dependencies: ['sl-A'], // would be a valid edge if 'sl-B' had a node
          provider: 'gcp' as const,
          project: 'p',
          labels: {},
        },
      ],
      errors: [],
      warnings: [],
      metadata: {
        project: 'p',
        regions: [],
        zones: [],
        services_scanned: [],
        resource_count: 2,
        imported_at: '',
        duration_ms: 0,
      },
    };
    const graph = gcp_result_to_graph(result);
    expect(graph.node_count).toBe(1);
    expect(graph.edge_count).toBe(0);
  });
});

describe('import_gcp_to_graph', () => {
  it('returns both the graph and the underlying result', async () => {
    h.assetDiscover.mockResolvedValueOnce({
      resources: [makeResource({ kind: 'compute#instance', self_link: 'sl-i' })],
      errors: [],
      warnings: [],
    });
    const { graph, result } = await import_gcp_to_graph({ project: 'p' }, 'my-graph');
    expect(graph.name).toBe('my-graph');
    expect(result.resources).toHaveLength(1);
  });

  it('uses default name when not supplied', async () => {
    const { graph } = await import_gcp_to_graph({ project: 'p' });
    expect(graph.name).toBe('gcp-import');
  });
});
