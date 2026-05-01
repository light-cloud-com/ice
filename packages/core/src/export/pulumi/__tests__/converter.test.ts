/**
 * Tests for `pulumi/converter.ts` (rf-pulumi-7).
 *
 * Behaviour pinned (preserved verbatim from pre-extraction L135-189
 * + L194-205 + L211-251 of `pulumi-exporter.ts`):
 *  - build_dependency_map only walks 'depends_on' edges.
 *  - node_to_resource hits the schema provider first; on miss,
 *    falls back to `fallback_type_mapping`; on second miss, returns
 *    `{ success: false, unmapped: true, error }`.
 *  - export_graph accumulates warnings (unmapped) vs errors (other),
 *    and dedupes only `unmapped_types` (not warnings).
 *  - Output `program.name` defaults to 'ice-export' when no
 *    project_name is set; `program.runtime` defaults to 'nodejs'.
 *  - Format selection: 'typescript' -> typescript field; anything
 *    else (including undefined / 'yaml') -> yaml field.
 *
 * The tests use a fake schema provider (only the
 * `get_implementation` method is consulted). The MutableGraph is
 * a real instance; nodes / edges are added via the public API to
 * mirror real consumer setups.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  build_dependency_map,
  export_graph,
  node_to_resource,
} from '../converter.js';
import { MutableGraph } from '../../../graph/mutable-graph.js';
import type { EmbeddedSchemaProvider } from '../../../schema/embedded-schema-provider.js';

/**
 * Build a minimal fake schema provider that only implements the
 * single method consulted by the converter (`get_implementation`).
 * The other class members are typed-only — never invoked here.
 */
function makeSchemaProvider(
  implMap: Record<string, { native_type: string }> = {},
): EmbeddedSchemaProvider {
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
      'gcp.compute.instance': { native_type: 'gcp:compute/instance:Instance' },
    });
    const a = g.add_node({ type: 'gcp.compute.instance', name: 'web', properties: { machineType: 'e2-medium' } });
    if (!a.success) throw new Error('node add failed');

    const result = await node_to_resource(provider, a.node, { provider: 'gcp' }, new Map());
    expect(result.success).toBe(true);
    expect(result.resource?.type).toBe('gcp:compute/instance:Instance');
    expect(result.resource?.properties).toEqual({ machineType: 'e2-medium' });
  });

  it('falls back to fallback_type_mapping when schema-provider has no impl', async () => {
    const provider = makeSchemaProvider({});
    const a = g.add_node({ type: 'gcp.compute.instance', name: 'web', properties: {} });
    if (!a.success) throw new Error('node add failed');

    const result = await node_to_resource(provider, a.node, { provider: 'gcp' }, new Map());
    expect(result.success).toBe(true);
    expect(result.resource?.type).toBe('gcp:compute/instance:Instance');
  });

  it('returns unmapped error when both schema and fallback miss', async () => {
    const provider = makeSchemaProvider({});
    const a = g.add_node({ type: 'unknown', name: 'x', properties: {} });
    if (!a.success) throw new Error('node add failed');

    const result = await node_to_resource(provider, a.node, { provider: 'gcp' }, new Map());
    expect(result.success).toBe(false);
    expect(result.unmapped).toBe(true);
    expect(result.error).toBe('No Pulumi mapping for unknown with provider gcp');
  });

  it('sanitizes resource name', async () => {
    const provider = makeSchemaProvider({
      't': { native_type: 't:m/r:C' },
    });
    const a = g.add_node({ type: 't', name: 'My Resource!', properties: {} });
    if (!a.success) throw new Error('node add failed');

    const result = await node_to_resource(provider, a.node, { provider: 'gcp' }, new Map());
    expect(result.resource?.name).toBe('My-Resource-');
  });

  it('camelCases properties via map_properties', async () => {
    const provider = makeSchemaProvider({
      't': { native_type: 't:m/r:C' },
    });
    const a = g.add_node({ type: 't', name: 'x', properties: { snake_key: 1 } });
    if (!a.success) throw new Error('node add failed');

    const result = await node_to_resource(provider, a.node, { provider: 'gcp' }, new Map());
    expect(result.resource?.properties).toEqual({ snakeKey: 1 });
  });

  it('builds options from the dependency_map', async () => {
    const provider = makeSchemaProvider({
      't': { native_type: 't:m/r:C' },
    });
    const a = g.add_node({ type: 't', name: 'x', properties: {} });
    if (!a.success) throw new Error('node add failed');
    const dep_map = new Map([[a.node.id, ['vpc-id']]]);

    const result = await node_to_resource(provider, a.node, { provider: 'gcp' }, dep_map);
    expect(result.resource?.options?.depends_on).toEqual(['vpc-id']);
  });

  it('omits options when there are no dependencies', async () => {
    const provider = makeSchemaProvider({
      't': { native_type: 't:m/r:C' },
    });
    const a = g.add_node({ type: 't', name: 'x', properties: {} });
    if (!a.success) throw new Error('node add failed');

    const result = await node_to_resource(provider, a.node, { provider: 'gcp' }, new Map());
    expect(result.resource?.options).toBeUndefined();
  });
});

describe('export_graph', () => {
  it('returns a successful empty-graph result with default name and runtime', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');

    const result = await export_graph(provider, g, { provider: 'gcp' });
    expect(result.success).toBe(true);
    expect(result.program.name).toBe('ice-export');
    expect(result.program.runtime).toBe('nodejs');
    expect(result.program.resources).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.unmapped_types).toEqual([]);
  });

  it('uses options.project_name when set', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');

    const result = await export_graph(provider, g, {
      provider: 'gcp',
      project_name: 'my-app',
    });
    expect(result.program.name).toBe('my-app');
  });

  it('uses options.runtime when set', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');

    const result = await export_graph(provider, g, {
      provider: 'gcp',
      runtime: 'python',
    });
    expect(result.program.runtime).toBe('python');
  });

  it('emits yaml by default', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');

    const result = await export_graph(provider, g, { provider: 'gcp' });
    expect(result.yaml).toBeDefined();
    expect(result.typescript).toBeUndefined();
  });

  it('emits typescript when format is typescript', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');

    const result = await export_graph(provider, g, { provider: 'gcp', format: 'typescript' });
    expect(result.yaml).toBeUndefined();
    expect(result.typescript).toBeDefined();
  });

  it('emits yaml for explicit yaml format too', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');

    const result = await export_graph(provider, g, { provider: 'gcp', format: 'yaml' });
    expect(result.yaml).toBeDefined();
    expect(result.typescript).toBeUndefined();
  });

  it('walks all nodes and produces resources', async () => {
    const provider = makeSchemaProvider({
      'gcp.compute.instance': { native_type: 'gcp:compute/instance:Instance' },
      'gcp.compute.network': { native_type: 'gcp:compute/network:Network' },
    });
    const g = new MutableGraph('test');
    g.add_node({ type: 'gcp.compute.instance', name: 'web', properties: {} });
    g.add_node({ type: 'gcp.compute.network', name: 'vpc', properties: {} });

    const result = await export_graph(provider, g, { provider: 'gcp' });
    expect(result.success).toBe(true);
    expect(result.program.resources).toHaveLength(2);
  });

  it('records unmapped types in warnings + unmapped_types', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');
    // Type with too few segments to fall back; goes unmapped.
    g.add_node({ type: 'foo', name: 'x', properties: {} });

    const result = await export_graph(provider, g, { provider: 'gcp' });
    expect(result.success).toBe(true); // unmapped is a warning, not an error
    expect(result.warnings).toContain('No Pulumi mapping for ICE type: foo');
    expect(result.unmapped_types).toEqual(['foo']);
  });

  it('dedupes unmapped_types but keeps duplicate warnings', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');
    // Two nodes of same unmapped type → 2 warnings, 1 unmapped_types entry
    g.add_node({ type: 'foo', name: 'x', properties: {} });
    g.add_node({ type: 'foo', name: 'y', properties: {} });

    const result = await export_graph(provider, g, { provider: 'gcp' });
    expect(result.unmapped_types).toEqual(['foo']);
    expect(result.warnings.filter((w) => w.includes('foo'))).toHaveLength(2);
  });

  it('description includes the graph name', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('my-graph');

    const result = await export_graph(provider, g, { provider: 'gcp' });
    expect(result.program.description).toBe('Exported from ICE graph: my-graph');
  });

  it('resources reference the dependency map (depends_on)', async () => {
    const provider = makeSchemaProvider({
      't': { native_type: 't:m/r:C' },
    });
    const g = new MutableGraph('test');
    const a = g.add_node({ type: 't', name: 'a', properties: {} });
    const b = g.add_node({ type: 't', name: 'b', properties: {} });
    if (!a.success || !b.success) throw new Error('node add failed');
    g.add_edge({ source: a.node.id, target: b.node.id, relationship: 'depends_on' });

    const result = await export_graph(provider, g, { provider: 'gcp' });
    const aResource = result.program.resources.find((r) => r.name === 'a');
    expect(aResource?.options?.depends_on).toEqual([b.node.id]);
    const bResource = result.program.resources.find((r) => r.name === 'b');
    expect(bResource?.options).toBeUndefined();
  });

  it('passes options.config through to the program', async () => {
    const provider = makeSchemaProvider();
    const g = new MutableGraph('test');

    const result = await export_graph(provider, g, {
      provider: 'gcp',
      config: { region: 'us' },
    });
    expect(result.program.config).toEqual({ region: 'us' });
  });
});
