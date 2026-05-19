/**
 * Tests for `terraform/converter.ts` (rf-tfexp-6).
 *
 * Behaviour pinned (preserved verbatim from pre-extraction L189-262
 * + L267-279 + L284-330 of `terraform-exporter.ts`):
 *  - build_dependency_map only walks 'depends_on' edges; iterates
 *    in edge-id (insertion) order; never dedupes.
 *  - node_to_resource hits the schema provider first; on miss,
 *    falls back to `fallback_type_mapping`; on second miss, returns
 *    `{ success: false, unmapped: true, error }`.
 *  - export_graph accumulates warnings (unmapped) vs errors (other),
 *    and dedupes only `unmapped_types` (not warnings).
 *  - Output `config.terraform` is `undefined` when there is no
 *    required_providers config; populated otherwise.
 *  - Provider block only emitted when `options.provider_config` is
 *    truthy.
 *  - Format selection: 'json' -> json field; anything else
 *    (including undefined / 'hcl') -> hcl field.
 *
 * The tests use a fake schema provider (only the
 * `get_implementation` method is consulted). The MutableGraph is
 * a real instance; nodes / edges are added via the public API to
 * mirror real consumer setups.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MutableGraph } from '../../../graph/mutable-graph';
import { build_dependency_map, export_graph, node_to_resource } from '../converter';
import type { EmbeddedSchemaProvider } from '../../../schema/embedded-schema-provider';

/**
 * Build a minimal fake schema provider that only implements the
 * single method consulted by the converter (`get_implementation`).
 * The other class members are typed-only — never invoked here.
 */
function makeSchemaProvider(implMap: Record<string, { native_type: string }> = {}): EmbeddedSchemaProvider {
  return {
    get_implementation: vi.fn((ice_type: string) => implMap[ice_type] ?? null),
  } as unknown as EmbeddedSchemaProvider;
}

describe('build_dependency_map', () => {
  it('returns an empty map for a graph with no edges', () => {
    const g = new MutableGraph('test');
    expect(build_dependency_map(g).size).toBe(0);
  });

  it('only includes depends_on edges', () => {
    const g = new MutableGraph('test');
    const a = g.add_node({ type: 't', name: 'a', properties: {} });
    const b = g.add_node({ type: 't', name: 'b', properties: {} });
    if (!a.success || !b.success) throw new Error('node add failed');
    g.add_edge({ source: a.node.id, target: b.node.id, relationship: 'depends_on' });
    g.add_edge({ source: a.node.id, target: b.node.id, relationship: 'contains' });

    const deps = build_dependency_map(g);
    expect(deps.get(a.node.id)).toEqual([b.node.id]);
  });

  it('appends multiple targets for the same source', () => {
    const g = new MutableGraph('test');
    const a = g.add_node({ type: 't', name: 'a', properties: {} });
    const b = g.add_node({ type: 't', name: 'b', properties: {} });
    const c = g.add_node({ type: 't', name: 'c', properties: {} });
    if (!a.success || !b.success || !c.success) throw new Error('node add failed');
    g.add_edge({ source: a.node.id, target: b.node.id, relationship: 'depends_on' });
    g.add_edge({ source: a.node.id, target: c.node.id, relationship: 'depends_on' });

    const deps = build_dependency_map(g);
    expect(deps.get(a.node.id)).toEqual([b.node.id, c.node.id]);
  });

  it('keys deps by source node id (not by edge id)', () => {
    const g = new MutableGraph('test');
    const a = g.add_node({ type: 't', name: 'a', properties: {} });
    const b = g.add_node({ type: 't', name: 'b', properties: {} });
    const c = g.add_node({ type: 't', name: 'c', properties: {} });
    if (!a.success || !b.success || !c.success) throw new Error('node add failed');
    g.add_edge({ source: a.node.id, target: c.node.id, relationship: 'depends_on' });
    g.add_edge({ source: b.node.id, target: c.node.id, relationship: 'depends_on' });

    const deps = build_dependency_map(g);
    expect(deps.get(a.node.id)).toEqual([c.node.id]);
    expect(deps.get(b.node.id)).toEqual([c.node.id]);
    expect(deps.get(c.node.id)).toBeUndefined();
  });
});

describe('node_to_resource', () => {
  let g: MutableGraph;

  beforeEach(() => {
    g = new MutableGraph('test');
  });

  it('uses schema-provider implementation when available', async () => {
    const provider = makeSchemaProvider({
      'gcp.compute.instance': { native_type: 'google_compute_instance' },
    });
    const a = g.add_node({
      type: 'gcp.compute.instance',
      name: 'web',
      properties: { machine_type: 'e2-medium' },
    });
    if (!a.success) throw new Error('node add failed');

    const result = await node_to_resource(provider, a.node, { provider: 'gcp' }, new Map());
    expect(result.success).toBe(true);
    expect(result.resource?.type).toBe('google_compute_instance');
    expect(result.resource?.properties).toEqual({ machine_type: 'e2-medium' });
  });

  it('falls back to fallback_type_mapping when schema-provider has no impl', async () => {
    const provider = makeSchemaProvider({});
    const a = g.add_node({ type: 'gcp.compute.instance', name: 'web', properties: {} });
    if (!a.success) throw new Error('node add failed');

    const result = await node_to_resource(provider, a.node, { provider: 'gcp' }, new Map());
    expect(result.success).toBe(true);
    // fallback maps 'gcp.compute.instance' with provider 'gcp' -> 'google_compute_instance'
    expect(result.resource?.type).toBe('google_compute_instance');
  });

  it('returns success+resource for a generic-fallback ice type (never null)', async () => {
    // The Terraform fallback mapping ALWAYS returns a string (no null
    // case), so even an "unknown" ice_type with non-AWS/azure/gcp
    // prefix becomes a generic `${tf_prefix}_${type}`. Documents the
    // pre-extraction behaviour: there is currently no path to the
    // unmapped error branch via fallback.
    const provider = makeSchemaProvider({});
    const a = g.add_node({ type: 'unknown', name: 'x', properties: {} });
    if (!a.success) throw new Error('node add failed');

    const result = await node_to_resource(provider, a.node, { provider: 'gcp' }, new Map());
    expect(result.success).toBe(true);
    expect(result.resource?.type).toBe('google_unknown');
  });

  it('sanitizes resource name', async () => {
    const provider = makeSchemaProvider({
      t: { native_type: 'google_thing' },
    });
    const a = g.add_node({ type: 't', name: 'My Resource!', properties: {} });
    if (!a.success) throw new Error('node add failed');

    const result = await node_to_resource(provider, a.node, { provider: 'gcp' }, new Map());
    // Replaces non-[A-Za-z0-9_-] with `_`
    expect(result.resource?.name).toBe('My_Resource_');
  });

  it('drops underscore-prefixed (internal) properties', async () => {
    const provider = makeSchemaProvider({
      t: { native_type: 'google_thing' },
    });
    const a = g.add_node({
      type: 't',
      name: 'x',
      properties: { name: 'web', _internal: 'hide-me' },
    });
    if (!a.success) throw new Error('node add failed');

    const result = await node_to_resource(provider, a.node, { provider: 'gcp' }, new Map());
    expect(result.resource?.properties).toEqual({ name: 'web' });
    expect(result.resource?.properties._internal).toBeUndefined();
  });

  it('emits depends_on placeholders from the dependency_map', async () => {
    const provider = makeSchemaProvider({
      t: { native_type: 'google_thing' },
    });
    const a = g.add_node({ type: 't', name: 'x', properties: {} });
    if (!a.success) throw new Error('node add failed');
    const dep_map = new Map([[a.node.id, ['vpc-id']]]);

    const result = await node_to_resource(provider, a.node, { provider: 'gcp' }, dep_map);
    // Pre-extraction behaviour preserves the `# ${dep}` placeholder
    expect(result.resource?.depends_on).toEqual(['# vpc-id']);
  });

  it('omits depends_on when there are no dependencies', async () => {
    const provider = makeSchemaProvider({
      t: { native_type: 'google_thing' },
    });
    const a = g.add_node({ type: 't', name: 'x', properties: {} });
    if (!a.success) throw new Error('node add failed');

    const result = await node_to_resource(provider, a.node, { provider: 'gcp' }, new Map());
    expect(result.resource?.depends_on).toBeUndefined();
  });

  it('uses {} when node.properties is missing', async () => {
    const provider = makeSchemaProvider({
      t: { native_type: 'google_thing' },
    });
    const a = g.add_node({ type: 't', name: 'x', properties: {} });
    if (!a.success) throw new Error('node add failed');
    // Simulate a node with undefined properties (defensive `|| {}`)
    const node = { ...a.node, properties: undefined as unknown as Record<string, unknown> };

    const result = await node_to_resource(provider, node, { provider: 'gcp' }, new Map());
    expect(result.success).toBe(true);
    expect(result.resource?.properties).toEqual({});
  });

  it('uses native_type from schema-provider impl', async () => {
    // Distinguish schema-provider hit (native_type) from fallback
    // (computed). The schema-provider should win.
    const provider = makeSchemaProvider({
      'gcp.compute.instance': { native_type: 'CUSTOM_OVERRIDE' },
    });
    const a = g.add_node({
      type: 'gcp.compute.instance',
      name: 'web',
      properties: {},
    });
    if (!a.success) throw new Error('node add failed');

    const result = await node_to_resource(provider, a.node, { provider: 'gcp' }, new Map());
    expect(result.resource?.type).toBe('CUSTOM_OVERRIDE');
  });
});

describe('export_graph', () => {
  it('returns a successful empty-graph result with no resources', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');

    const result = await export_graph(provider, g, { provider: 'gcp' });
    expect(result.success).toBe(true);
    expect(result.config.resources).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.unmapped_types).toEqual([]);
  });

  it('emits hcl by default (no format)', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');

    const result = await export_graph(provider, g, { provider: 'gcp' });
    expect(result.hcl).toBeDefined();
    expect(result.json).toBeUndefined();
  });

  it('emits hcl for explicit hcl format too', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');

    const result = await export_graph(provider, g, { provider: 'gcp', format: 'hcl' });
    expect(result.hcl).toBeDefined();
    expect(result.json).toBeUndefined();
  });

  it('emits json when format is json', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');

    const result = await export_graph(provider, g, { provider: 'gcp', format: 'json' });
    expect(result.hcl).toBeUndefined();
    expect(result.json).toBeDefined();
  });

  it('walks all nodes and produces resources', async () => {
    const provider = makeSchemaProvider({
      'gcp.compute.instance': { native_type: 'google_compute_instance' },
      'gcp.compute.network': { native_type: 'google_compute_network' },
    });
    const g = new MutableGraph('test');
    g.add_node({ type: 'gcp.compute.instance', name: 'web', properties: {} });
    g.add_node({ type: 'gcp.compute.network', name: 'vpc', properties: {} });

    const result = await export_graph(provider, g, { provider: 'gcp' });
    expect(result.success).toBe(true);
    expect(result.config.resources).toHaveLength(2);
  });

  it('omits the terraform block when no required_providers supplied', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');

    const result = await export_graph(provider, g, { provider: 'gcp' });
    expect(result.config.terraform).toBeUndefined();
  });

  it('emits the terraform block with required_providers when supplied', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');

    const result = await export_graph(provider, g, {
      provider: 'gcp',
      required_providers: [{ name: 'google', source: 'hashicorp/google', version: '~> 4.0' }],
    });
    expect(result.config.terraform).toBeDefined();
    expect(result.config.terraform?.required_providers).toEqual({
      google: { source: 'hashicorp/google', version: '~> 4.0' },
    });
  });

  it('omits the terraform block when required_providers is an empty array', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');

    const result = await export_graph(provider, g, {
      provider: 'gcp',
      required_providers: [],
    });
    expect(result.config.terraform).toBeUndefined();
  });

  it('emits multiple required_providers entries', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');

    const result = await export_graph(provider, g, {
      provider: 'gcp',
      required_providers: [
        { name: 'google', source: 'hashicorp/google', version: '~> 4.0' },
        { name: 'aws', source: 'hashicorp/aws' },
      ],
    });
    expect(result.config.terraform?.required_providers).toEqual({
      google: { source: 'hashicorp/google', version: '~> 4.0' },
      aws: { source: 'hashicorp/aws', version: undefined },
    });
  });

  it('emits a provider entry only when provider_config is set', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');

    const result = await export_graph(provider, g, {
      provider: 'google',
      provider_config: { project: 'my-project', region: 'us-east1' },
    });
    expect(result.config.providers).toHaveLength(1);
    expect(result.config.providers[0]).toEqual({
      name: 'google',
      config: { project: 'my-project', region: 'us-east1' },
    });
  });

  it('omits provider entry when provider_config is undefined', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');

    const result = await export_graph(provider, g, { provider: 'google' });
    expect(result.config.providers).toEqual([]);
  });

  it('resources reference the dependency map (depends_on)', async () => {
    const provider = makeSchemaProvider({
      t: { native_type: 'google_thing' },
    });
    const g = new MutableGraph('test');
    const a = g.add_node({ type: 't', name: 'a', properties: {} });
    const b = g.add_node({ type: 't', name: 'b', properties: {} });
    if (!a.success || !b.success) throw new Error('node add failed');
    g.add_edge({ source: a.node.id, target: b.node.id, relationship: 'depends_on' });

    const result = await export_graph(provider, g, { provider: 'gcp' });
    const aResource = result.config.resources.find((r) => r.name === 'a');
    expect(aResource?.depends_on).toEqual([`# ${b.node.id}`]);
    const bResource = result.config.resources.find((r) => r.name === 'b');
    expect(bResource?.depends_on).toBeUndefined();
  });

  it('config is always populated even when no resources', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');

    const result = await export_graph(provider, g, { provider: 'gcp' });
    expect(result.config).toBeDefined();
    expect(result.config.providers).toEqual([]);
    expect(result.config.resources).toEqual([]);
  });

  it('json output round-trips the config through JSON.parse', async () => {
    const provider = makeSchemaProvider({
      'gcp.compute.instance': { native_type: 'google_compute_instance' },
    });
    const g = new MutableGraph('test');
    g.add_node({ type: 'gcp.compute.instance', name: 'web', properties: {} });

    const result = await export_graph(provider, g, { provider: 'gcp', format: 'json' });
    expect(result.json).toBeDefined();
    const parsed = JSON.parse(result.json!);
    expect(parsed.resources).toHaveLength(1);
    expect(parsed.resources[0].type).toBe('google_compute_instance');
  });

  it('hcl output contains the resource block', async () => {
    const provider = makeSchemaProvider({
      'gcp.compute.instance': { native_type: 'google_compute_instance' },
    });
    const g = new MutableGraph('test');
    g.add_node({ type: 'gcp.compute.instance', name: 'web', properties: { name: 'web' } });

    const result = await export_graph(provider, g, { provider: 'gcp' });
    expect(result.hcl).toContain('resource "google_compute_instance" "web"');
    expect(result.hcl).toContain('name = "web"');
  });
});

describe('export_graph — error and unmapped paths', () => {
  /**
   * The Terraform converter's `nodeToResource` returns the unmapped
   * error branch only when both the schema-provider AND the fallback
   * mapping miss. In the current pre-extraction behaviour, the
   * fallback is always a string (the Terraform mapping never returns
   * `null` — every input flows through the generic fallback). To
   * exercise the unmapped/warning branch, we force `fallback_type_mapping`
   * to return null via a vitest module mock; this is the cleanest way
   * to drive the branch without modifying source.
   */
  beforeEach(() => {
    vi.resetModules();
  });

  it('records unmapped types in warnings + unmapped_types when fallback is null', async () => {
    vi.doMock('../type-mapping.js', () => ({
      fallback_type_mapping: () => null,
    }));
    const { export_graph: exg } = await import('../converter');
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');
    g.add_node({ type: 'foo', name: 'x', properties: {} });

    const result = await exg(provider, g, { provider: 'gcp' });
    expect(result.success).toBe(true); // unmapped is a warning, not an error
    expect(result.warnings).toContain('No Terraform mapping for ICE type: foo');
    expect(result.unmapped_types).toEqual(['foo']);
    vi.doUnmock('../type-mapping.js');
  });

  it('dedupes unmapped_types but keeps duplicate warnings', async () => {
    vi.doMock('../type-mapping.js', () => ({
      fallback_type_mapping: () => null,
    }));
    const { export_graph: exg } = await import('../converter');
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');
    g.add_node({ type: 'foo', name: 'x', properties: {} });
    g.add_node({ type: 'foo', name: 'y', properties: {} });

    const result = await exg(provider, g, { provider: 'gcp' });
    expect(result.unmapped_types).toEqual(['foo']);
    expect(result.warnings.filter((w) => w.includes('foo'))).toHaveLength(2);
    vi.doUnmock('../type-mapping.js');
  });

  it('node_to_resource returns the unmapped error shape when fallback is null', async () => {
    vi.doMock('../type-mapping.js', () => ({
      fallback_type_mapping: () => null,
    }));
    const { node_to_resource: ntr } = await import('../converter');
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');
    const a = g.add_node({ type: 'foo', name: 'x', properties: {} });
    if (!a.success) throw new Error('node add failed');

    const result = await ntr(provider, a.node, { provider: 'gcp' }, new Map());
    expect(result.success).toBe(false);
    expect(result.unmapped).toBe(true);
    expect(result.error).toBe('No Terraform mapping for foo with provider gcp');
    vi.doUnmock('../type-mapping.js');
  });
});
