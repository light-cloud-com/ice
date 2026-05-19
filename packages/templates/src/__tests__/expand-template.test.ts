/**
 * `expandComposedTemplate` coverage.
 *
 * The function takes a ComposedTemplate and produces a flat
 * { nodes, edges } graph. Branches under test:
 *
 *   - groups present vs absent
 *   - per-group: explicit `iceType` override vs the default `Group.<subtype>` form
 *   - parentGroupIndex (VPC → Subnet nesting)
 *   - blueprint missing → fallback minimal resource node
 *   - blueprint present → expandBlueprint() result threaded through with name override + data merge
 *   - provider explicit vs falling back to template.provider
 *   - providerUnsupported stamping when the blueprint's providers list lacks the resolved provider
 *   - parentId from group containment vs from expandBlueprint output
 *   - inter-block connection wiring with optional protocol/port
 *   - connection out-of-bounds is silently skipped (no edge emitted)
 *   - empty template (no blocks, no groups, no connections) → empty arrays
 *
 * `@ice/blocks` is mocked. Real imports would require the entire registry to
 * load (~hundreds of blueprints) and obscure the branch we're trying to drive.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComposedTemplate } from '../types';

const h = vi.hoisted(() => ({
  blueprints: new Map<string, any>(),
  expandCalls: [] as Array<{ blueprint: any; options: any }>,
}));

vi.mock('@ice/blocks', () => ({
  getBlueprint: (iceType: string, _provider?: string) => h.blueprints.get(iceType),
  expandBlueprint: (blueprint: any, options: any) => {
    h.expandCalls.push({ blueprint, options });
    // The mocked blueprint may carry a `__expandedParentId` hint that drives
    // the SUT's `expanded.node.parentId ? ...` branch. parentContainerId from
    // options wins when present (group containment).
    const parentId = options.parentContainerId || blueprint.__expandedParentId;
    return {
      node: {
        id: `expanded-${blueprint.iceType}-${h.expandCalls.length}`,
        type: 'resource',
        position: options.position,
        width: 220,
        height: 56,
        data: {
          name: blueprint.name,
          iceType: blueprint.iceType,
          provider: options.provider,
        },
        ...(parentId ? { parentId } : {}),
      },
    };
  },
}));

// Now import the SUT — the mock factory above is hoisted ahead of this.
import { expandComposedTemplate } from '../expand-template';

beforeEach(() => {
  h.blueprints.clear();
  h.expandCalls.length = 0;
});

function setBlueprint(
  iceType: string,
  partial: Partial<{ name: string; providers: string[] }> = {},
) {
  h.blueprints.set(iceType, {
    iceType,
    name: partial.name ?? iceType,
    providers: partial.providers ?? ['gcp', 'aws', 'azure'],
  });
}

function makeTemplate(overrides: Partial<ComposedTemplate> = {}): ComposedTemplate {
  return {
    id: 'tpl-test',
    name: 'Test',
    description: 'd',
    icon: 'I',
    estimatedCost: '$0',
    category: 'quick-start',
    tags: [],
    securityLevel: 'basic',
    environmentPresets: [{ type: 'production', name: 'p', region: 'r', securityLevel: 'basic' }],
    blocks: [],
    connections: [],
    ...overrides,
  };
}

describe('expandComposedTemplate — empty template', () => {
  it('returns empty nodes/edges for a template with no blocks, groups, or connections', () => {
    const result = expandComposedTemplate(makeTemplate());
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});

describe('expandComposedTemplate — block expansion', () => {
  it('expands a registered blueprint via expandBlueprint and threads label/data into the resource node', () => {
    setBlueprint('Compute.Foo');
    const tpl = makeTemplate({
      blocks: [
        {
          iceType: 'Compute.Foo',
          label: 'My Foo',
          position: { x: 100, y: 200 },
          data: { custom: 'value' },
        },
      ],
    });

    const { nodes, edges } = expandComposedTemplate(tpl);
    expect(nodes.length).toBe(1);
    const n = nodes[0];
    expect(n.type).toBe('resource');
    expect(n.data.name).toBe('My Foo'); // label override applied
    expect(n.data.custom).toBe('value'); // template-block data merged
    expect(edges).toEqual([]);
    expect(h.expandCalls.length).toBe(1);
  });

  it('uses minimal resource node when no blueprint exists for the iceType', () => {
    const tpl = makeTemplate({
      blocks: [
        {
          iceType: 'Unknown.Block',
          label: 'Unknown',
          position: { x: 50, y: 60 },
          data: { foo: 'bar' },
        },
      ],
    });

    const { nodes } = expandComposedTemplate(tpl);
    expect(nodes.length).toBe(1);
    const n = nodes[0];
    expect(n.id).toMatch(/^tpl-tpl-test-/);
    expect(n.type).toBe('resource');
    expect(n.width).toBe(220);
    expect(n.height).toBe(56);
    expect(n.data).toMatchObject({
      name: 'Unknown',
      iceType: 'Unknown.Block',
      behavior: 'singleton',
      foo: 'bar',
    });
    expect(h.expandCalls.length).toBe(0);
  });

  it('keeps blueprint name when label is empty (truthy-only override)', () => {
    setBlueprint('Compute.Bar', { name: 'Default Name' });
    const tpl = makeTemplate({
      blocks: [
        { iceType: 'Compute.Bar', label: '', position: { x: 0, y: 0 } },
      ],
    });

    const { nodes } = expandComposedTemplate(tpl);
    expect(nodes[0].data.name).toBe('Default Name');
  });

  it('does not merge data when block.data is missing', () => {
    setBlueprint('Compute.Baz');
    const tpl = makeTemplate({
      blocks: [
        { iceType: 'Compute.Baz', label: 'Baz', position: { x: 0, y: 0 } },
      ],
    });

    const { nodes } = expandComposedTemplate(tpl);
    const data = nodes[0].data;
    expect(data.name).toBe('Baz');
    // Default mock data only has name, iceType, provider; nothing extra merged.
    expect(Object.keys(data)).not.toContain('custom');
  });
});

describe('expandComposedTemplate — provider resolution', () => {
  it('uses the explicit provider arg when supplied', () => {
    setBlueprint('Compute.X');
    const tpl = makeTemplate({
      provider: 'aws',
      blocks: [{ iceType: 'Compute.X', label: 'X', position: { x: 0, y: 0 } }],
    });

    expandComposedTemplate(tpl, 'gcp');
    expect(h.expandCalls[0].options.provider).toBe('gcp');
  });

  it('falls back to template.provider when no provider arg is passed', () => {
    setBlueprint('Compute.X');
    const tpl = makeTemplate({
      provider: 'aws',
      blocks: [{ iceType: 'Compute.X', label: 'X', position: { x: 0, y: 0 } }],
    });

    expandComposedTemplate(tpl);
    expect(h.expandCalls[0].options.provider).toBe('aws');
  });

  it('passes undefined provider when neither arg nor template.provider is set', () => {
    setBlueprint('Compute.X');
    const tpl = makeTemplate({
      blocks: [{ iceType: 'Compute.X', label: 'X', position: { x: 0, y: 0 } }],
    });

    expandComposedTemplate(tpl);
    expect(h.expandCalls[0].options.provider).toBeUndefined();
  });

  it('stamps providerUnsupported on nodes whose blueprint does not list the resolved provider', () => {
    setBlueprint('Compute.GcpOnly', { providers: ['gcp'] });
    const tpl = makeTemplate({
      blocks: [{ iceType: 'Compute.GcpOnly', label: 'X', position: { x: 0, y: 0 } }],
    });

    const { nodes } = expandComposedTemplate(tpl, 'aws');
    expect(nodes[0].data.providerUnsupported).toBe(true);
  });

  it('does not stamp providerUnsupported when the blueprint supports the resolved provider', () => {
    setBlueprint('Compute.Cross', { providers: ['gcp', 'aws'] });
    const tpl = makeTemplate({
      blocks: [{ iceType: 'Compute.Cross', label: 'X', position: { x: 0, y: 0 } }],
    });

    const { nodes } = expandComposedTemplate(tpl, 'aws');
    expect(nodes[0].data.providerUnsupported).toBeUndefined();
  });

  it('does not stamp providerUnsupported when no provider was resolved', () => {
    setBlueprint('Compute.NoProv', { providers: ['gcp'] });
    const tpl = makeTemplate({
      blocks: [{ iceType: 'Compute.NoProv', label: 'X', position: { x: 0, y: 0 } }],
    });

    const { nodes } = expandComposedTemplate(tpl);
    expect(nodes[0].data.providerUnsupported).toBeUndefined();
  });
});

describe('expandComposedTemplate — groups', () => {
  it('emits a container node per group with default Group.<subtype> iceType when group.iceType is absent', () => {
    setBlueprint('Compute.Inside');
    const tpl = makeTemplate({
      blocks: [{ iceType: 'Compute.Inside', label: 'Inside', position: { x: 100, y: 100 } }],
      groups: [
        {
          subtype: 'Frontend',
          label: 'UI',
          position: { x: 0, y: 0 },
          width: 300,
          height: 200,
          blockIndices: [0],
        },
      ],
    });

    const { nodes } = expandComposedTemplate(tpl);
    const container = nodes.find((n) => n.type === 'container');
    expect(container).toBeDefined();
    expect((container as any).data.iceType).toBe('Group.Frontend');
    expect((container as any).data.groupColor).toBe('#3b82f6');
    expect((container as any).data.folded).toBe(false);
  });

  it('uses explicit group.iceType when present (e.g. Network.VPC)', () => {
    const tpl = makeTemplate({
      groups: [
        {
          subtype: 'Network',
          iceType: 'Network.VPC',
          label: 'My VPC',
          position: { x: 0, y: 0 },
          width: 400,
          height: 300,
          blockIndices: [],
        },
      ],
    });

    const { nodes } = expandComposedTemplate(tpl);
    const vpc = nodes.find((n) => n.type === 'container');
    expect((vpc as any).data.iceType).toBe('Network.VPC');
  });

  it('uses explicit color when supplied; falls back to default otherwise', () => {
    const tpl = makeTemplate({
      groups: [
        {
          subtype: 'Data',
          label: 'Custom Color',
          position: { x: 0, y: 0 },
          width: 300,
          height: 200,
          blockIndices: [],
          color: '#abcdef',
        },
        {
          subtype: 'Default',
          label: 'Default Color',
          position: { x: 0, y: 0 },
          width: 300,
          height: 200,
          blockIndices: [],
        },
      ],
    });

    const { nodes } = expandComposedTemplate(tpl);
    const containers = nodes.filter((n) => n.type === 'container');
    expect((containers[0] as any).data.groupColor).toBe('#abcdef');
    expect((containers[1] as any).data.groupColor).toBe('#3b82f6');
  });

  it('threads parentId on a child group when parentGroupIndex is set', () => {
    const tpl = makeTemplate({
      groups: [
        {
          subtype: 'VPC',
          iceType: 'Network.VPC',
          label: 'VPC',
          position: { x: 0, y: 0 },
          width: 600,
          height: 400,
          blockIndices: [],
        },
        {
          subtype: 'Subnet',
          iceType: 'Network.Subnet',
          label: 'Subnet',
          position: { x: 50, y: 50 },
          width: 200,
          height: 200,
          blockIndices: [],
          parentGroupIndex: 0,
        },
      ],
    });

    const { nodes, edges } = expandComposedTemplate(tpl);
    const containers = nodes.filter((n) => n.type === 'container');
    expect(containers.length).toBe(2);
    const [vpc, subnet] = containers;
    expect((subnet as any).parentId).toBe(vpc.id);
    // VPC → Subnet contain-edge expected
    const containEdge = edges.find(
      (e) => e.source === vpc.id && e.target === subnet.id,
    );
    expect(containEdge?.data?.relationship).toBe('contains');
  });

  it('emits group → block containment edges for blocks inside the group', () => {
    setBlueprint('Compute.A');
    const tpl = makeTemplate({
      blocks: [{ iceType: 'Compute.A', label: 'A', position: { x: 100, y: 100 } }],
      groups: [
        {
          subtype: 'Stack',
          label: 'Stack',
          position: { x: 0, y: 0 },
          width: 300,
          height: 300,
          blockIndices: [0],
        },
      ],
    });

    const { nodes, edges } = expandComposedTemplate(tpl);
    const container = nodes.find((n) => n.type === 'container')!;
    const block = nodes.find((n) => n.type === 'resource')!;
    const edge = edges.find((e) => e.source === container.id && e.target === block.id);
    expect(edge?.data?.relationship).toBe('contains');
  });

  it('threads parentId on the resource node when block belongs to a group', () => {
    setBlueprint('Compute.A');
    const tpl = makeTemplate({
      blocks: [{ iceType: 'Compute.A', label: 'A', position: { x: 100, y: 100 } }],
      groups: [
        {
          subtype: 'Stack',
          label: 'Stack',
          position: { x: 0, y: 0 },
          width: 300,
          height: 300,
          blockIndices: [0],
        },
      ],
    });

    const { nodes } = expandComposedTemplate(tpl);
    const block = nodes.find((n) => n.type === 'resource')!;
    const container = nodes.find((n) => n.type === 'container')!;
    expect((block as any).parentId).toBe(container.id);
  });

  it('threads parentId on the no-blueprint fallback resource node when block is in a group', () => {
    const tpl = makeTemplate({
      blocks: [{ iceType: 'Unknown.Block', label: 'X', position: { x: 100, y: 100 } }],
      groups: [
        {
          subtype: 'Stack',
          label: 'Stack',
          position: { x: 0, y: 0 },
          width: 300,
          height: 300,
          blockIndices: [0],
        },
      ],
    });

    const { nodes } = expandComposedTemplate(tpl);
    const block = nodes.find((n) => n.type === 'resource')!;
    const container = nodes.find((n) => n.type === 'container')!;
    expect((block as any).parentId).toBe(container.id);
  });
});

describe('expandComposedTemplate — connections', () => {
  it('wires inter-block edges referencing block resource nodes by index', () => {
    setBlueprint('Compute.A');
    setBlueprint('Compute.B');
    const tpl = makeTemplate({
      blocks: [
        { iceType: 'Compute.A', label: 'A', position: { x: 0, y: 0 } },
        { iceType: 'Compute.B', label: 'B', position: { x: 100, y: 0 } },
      ],
      connections: [
        { fromBlock: 0, toBlock: 1, relationship: 'connects_to' },
      ],
    });

    const { nodes, edges } = expandComposedTemplate(tpl);
    expect(edges.length).toBe(1);
    const e = edges[0];
    expect(e.source).toBe(nodes[0].id);
    expect(e.target).toBe(nodes[1].id);
    expect(e.data?.relationship).toBe('connects_to');
  });

  it('includes protocol and port on the edge when supplied', () => {
    setBlueprint('Compute.A');
    setBlueprint('Compute.B');
    const tpl = makeTemplate({
      blocks: [
        { iceType: 'Compute.A', label: 'A', position: { x: 0, y: 0 } },
        { iceType: 'Compute.B', label: 'B', position: { x: 100, y: 0 } },
      ],
      connections: [
        { fromBlock: 0, toBlock: 1, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
      ],
    });

    const { edges } = expandComposedTemplate(tpl);
    expect(edges[0].data?.protocol).toBe('TCP');
    expect(edges[0].data?.port).toBe(5432);
  });

  it('omits protocol when not supplied', () => {
    setBlueprint('Compute.A');
    setBlueprint('Compute.B');
    const tpl = makeTemplate({
      blocks: [
        { iceType: 'Compute.A', label: 'A', position: { x: 0, y: 0 } },
        { iceType: 'Compute.B', label: 'B', position: { x: 100, y: 0 } },
      ],
      connections: [
        { fromBlock: 0, toBlock: 1, relationship: 'connects_to' },
      ],
    });

    const { edges } = expandComposedTemplate(tpl);
    expect(edges[0].data?.protocol).toBeUndefined();
    expect(edges[0].data?.port).toBeUndefined();
  });

  it('emits an edge when port is 0 (port != null check, not truthy)', () => {
    setBlueprint('Compute.A');
    setBlueprint('Compute.B');
    const tpl = makeTemplate({
      blocks: [
        { iceType: 'Compute.A', label: 'A', position: { x: 0, y: 0 } },
        { iceType: 'Compute.B', label: 'B', position: { x: 100, y: 0 } },
      ],
      connections: [
        { fromBlock: 0, toBlock: 1, relationship: 'connects_to', port: 0 },
      ],
    });

    const { edges } = expandComposedTemplate(tpl);
    expect(edges[0].data?.port).toBe(0);
  });

  it('silently skips edges whose fromBlock or toBlock is out of bounds', () => {
    setBlueprint('Compute.A');
    const tpl = makeTemplate({
      blocks: [{ iceType: 'Compute.A', label: 'A', position: { x: 0, y: 0 } }],
      connections: [
        { fromBlock: 0, toBlock: 5, relationship: 'connects_to' }, // toBlock OOB
        { fromBlock: 5, toBlock: 0, relationship: 'connects_to' }, // fromBlock OOB
      ],
    });

    const { edges } = expandComposedTemplate(tpl);
    expect(edges).toEqual([]);
  });

  it('skips group → block containment edges when blockIndices contains out-of-bounds index', () => {
    // Drives the `if (blockId && groupNodeId)` falsy branch: blockId is
    // undefined because blockIndices references an index past the blocks array.
    setBlueprint('Compute.A');
    const tpl = makeTemplate({
      blocks: [{ iceType: 'Compute.A', label: 'A', position: { x: 100, y: 100 } }],
      groups: [
        {
          subtype: 'Stack',
          label: 'Stack',
          position: { x: 0, y: 0 },
          width: 600,
          height: 600,
          blockIndices: [0, 99], // 99 is OOB
        },
      ],
    });

    const { edges } = expandComposedTemplate(tpl);
    // Exactly one containment edge — for index 0, none for 99.
    const contain = edges.filter((e) => e.data?.relationship === 'contains');
    expect(contain.length).toBe(1);
  });

  it('skips group → child-group containment when parentGroupIndex points OOB', () => {
    // The `if (parentGroupNodeId && groupNodeId)` falsy branch: parent index
    // is past the groups array, so parentGroupNodeId is undefined.
    const tpl = makeTemplate({
      groups: [
        {
          subtype: 'Subnet',
          iceType: 'Network.Subnet',
          label: 'Subnet',
          position: { x: 0, y: 0 },
          width: 200,
          height: 200,
          blockIndices: [],
          parentGroupIndex: 99, // OOB — no parent in groupIds[99]
        },
      ],
    });

    const { edges } = expandComposedTemplate(tpl);
    expect(edges).toEqual([]);
  });
});

describe('expandComposedTemplate — parentId fall-through', () => {
  it('omits parentId on a resource node when block is in no group AND expandBlueprint returns no parentId', () => {
    setBlueprint('Compute.NoParent');
    const tpl = makeTemplate({
      blocks: [{ iceType: 'Compute.NoParent', label: 'X', position: { x: 0, y: 0 } }],
    });
    const { nodes } = expandComposedTemplate(tpl);
    expect((nodes[0] as any).parentId).toBeUndefined();
  });

  it('threads expanded.node.parentId onto the resource node when block has no group', () => {
    // Drive the `expanded.node.parentId ? { parentId: expanded.node.parentId } : {}` branch.
    // The mock honors a `__expandedParentId` hint on the blueprint to populate
    // expanded.node.parentId.
    h.blueprints.set('Compute.HasParent', {
      iceType: 'Compute.HasParent',
      name: 'HasParent',
      providers: ['gcp'],
      __expandedParentId: 'pre-existing-parent',
    });
    const tpl = makeTemplate({
      blocks: [{ iceType: 'Compute.HasParent', label: 'X', position: { x: 0, y: 0 } }],
    });
    const { nodes } = expandComposedTemplate(tpl);
    const resource = nodes.find((n) => n.type === 'resource')!;
    expect((resource as any).parentId).toBe('pre-existing-parent');
  });
});
