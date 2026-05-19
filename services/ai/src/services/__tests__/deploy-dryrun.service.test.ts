/**
 * Unit tests for `services/ai/src/services/deploy-dryrun.service.ts`.
 *
 * The SUT lazy-imports `@ice/core` to call `translate_card_to_graph`. We
 * mock the package so each scenario can shape the translation result and
 * so the catch arm (fallback analysis) is reachable. Vitest globals are
 * imported explicitly, mocks reset per `beforeEach`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@ice/core', () => ({
  translate_card_to_graph: vi.fn(),
}));

import { dryRunDeploy } from '../deploy-dryrun.service';
// @ts-ignore — workspace-resolved at runtime; mocked above
import * as core from '@ice/core';

const translateMock = (core as any).translate_card_to_graph as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: a successful translation with empty graph
  translateMock.mockReturnValue({
    deployable_count: 0,
    skipped: [],
    warnings: [],
    graph: { nodes: [], edges: [] },
  });
});

describe('dryRunDeploy', () => {
  it('returns success=true with zero counts for an empty card', async () => {
    const result = await dryRunDeploy([], []);

    expect(result.success).toBe(true);
    expect(result.translationSucceeded).toBe(true);
    expect(result.deployableCount).toBe(0);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.graphSummary).toEqual({ nodes: 0, edges: 0 });
    expect(result.error).toBeUndefined();
  });

  it('forwards default options (provider=gcp, projectName=dryrun, env=development, region=us-central1) to the translator', async () => {
    await dryRunDeploy([], []);

    expect(translateMock).toHaveBeenCalledTimes(1);
    const arg = translateMock.mock.calls[0]![0];
    expect(arg.provider).toBe('gcp');
    expect(arg.projectName).toBe('dryrun');
    expect(arg.environment).toBe('development');
    expect(arg.region).toBe('us-central1');
  });

  it('forwards user-supplied options (provider, projectName, environment, region) to the translator', async () => {
    await dryRunDeploy([], [], {
      provider: 'aws',
      projectName: 'my-app',
      environment: 'production',
      region: 'eu-west-1',
    });

    const arg = translateMock.mock.calls[0]![0];
    expect(arg.provider).toBe('aws');
    expect(arg.projectName).toBe('my-app');
    expect(arg.environment).toBe('production');
    expect(arg.region).toBe('eu-west-1');
  });

  it('maps node + edge shapes (id/type/data) to the translator input', async () => {
    const nodes = [
      { id: 'n1', type: 'resource', data: { provider: 'gcp', label: 'DB' } },
      { id: 'n2', data: undefined }, // type defaults to 'block'
    ];
    const edges = [{ id: 'e1', source: 'n1', target: 'n2', data: { kind: 'wire' } }];

    await dryRunDeploy(nodes, edges);

    const arg = translateMock.mock.calls[0]![0];
    expect(arg.nodes).toEqual([
      { id: 'n1', type: 'resource', data: { provider: 'gcp', label: 'DB' } },
      { id: 'n2', type: 'block', data: {} },
    ]);
    expect(arg.edges).toEqual([{ id: 'e1', source: 'n1', target: 'n2', data: { kind: 'wire' } }]);
  });

  it('returns deployable_count, skipped (mapped), and warnings from translation result', async () => {
    translateMock.mockReturnValue({
      deployable_count: 3,
      skipped: [
        { nodeId: 'a', label: 'Cache', reason: 'unsupported on gcp' },
        { node_id: 'b', name: 'Queue', reason: 'no provider' },
        { id: 'c' }, // bare — defaults flow through
      ],
      warnings: ['provider mismatch on n5'],
      graph: { nodes: [], edges: [] },
    });

    const result = await dryRunDeploy([], []);

    expect(result.deployableCount).toBe(3);
    expect(result.skipped).toEqual([
      { nodeId: 'a', label: 'Cache', reason: 'unsupported on gcp' },
      { nodeId: 'b', label: 'Queue', reason: 'no provider' },
      { nodeId: 'c', label: 'unknown', reason: 'Skipped during translation' },
    ]);
    expect(result.warnings).toEqual(['provider mismatch on n5']);
  });

  it('counts graph nodes/edges from a Map-shaped graph', async () => {
    translateMock.mockReturnValue({
      deployable_count: 0,
      skipped: [],
      warnings: [],
      graph: { nodes: new Map([['a', {}], ['b', {}]]), edges: new Map([['e1', {}]]) },
    });

    const result = await dryRunDeploy([], []);

    expect(result.graphSummary).toEqual({ nodes: 2, edges: 1 });
  });

  it('counts graph nodes/edges from an Array-shaped graph', async () => {
    translateMock.mockReturnValue({
      deployable_count: 0,
      skipped: [],
      warnings: [],
      graph: { nodes: [{}, {}, {}], edges: [{}, {}] },
    });

    const result = await dryRunDeploy([], []);

    expect(result.graphSummary).toEqual({ nodes: 3, edges: 2 });
  });

  it('falls back to zero counts when graph nodes/edges are neither Map nor Array', async () => {
    translateMock.mockReturnValue({
      deployable_count: 0,
      skipped: [],
      warnings: [],
      graph: { nodes: { iter: () => null }, edges: { iter: () => null } },
    });

    const result = await dryRunDeploy([], []);

    expect(result.graphSummary).toEqual({ nodes: 0, edges: 0 });
  });

  it('falls back to zero counts when translation result has no graph', async () => {
    translateMock.mockReturnValue({
      deployable_count: 0,
      skipped: [],
      warnings: [],
      graph: undefined,
    });

    const result = await dryRunDeploy([], []);

    expect(result.graphSummary).toEqual({ nodes: 0, edges: 0 });
  });

  it('treats missing skipped/warnings/deployable_count as their empty defaults', async () => {
    translateMock.mockReturnValue({
      // no deployable_count, no skipped, no warnings
      graph: { nodes: [], edges: [] },
    });

    const result = await dryRunDeploy([], []);

    expect(result.deployableCount).toBe(0);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('returns the basic-analysis fallback when the translator throws, marking translationSucceeded=false', async () => {
    translateMock.mockImplementation(() => {
      throw new Error('translator boom');
    });

    const nodes = [
      { id: 'n1', type: 'resource', data: { provider: 'gcp', label: 'DB' } },
      { id: 'n2', type: 'resource', data: { provider: 'aws', label: 'Bucket' } },
      { id: 'n3', type: 'resource', data: {} }, // no provider — counted as deployable
      { id: 'n4', type: 'note', data: { provider: 'gcp' } }, // not a resource
    ];
    const edges = [{ id: 'e1', source: 'n1', target: 'n3' }];

    const result = await dryRunDeploy(nodes, edges, { provider: 'gcp' });

    expect(result.success).toBe(false);
    expect(result.translationSucceeded).toBe(false);
    // deployable: n1 (gcp), n3 (no provider) => 2
    expect(result.deployableCount).toBe(2);
    // skipped: n2 (aws != gcp) => 1
    expect(result.skipped).toEqual([
      { nodeId: 'n2', label: 'Bucket', reason: 'Provider mismatch (aws != gcp)' },
    ]);
    expect(result.warnings).toEqual([
      'Core engine translation failed: translator boom. Showing basic analysis.',
    ]);
    expect(result.graphSummary).toEqual({ nodes: 2, edges: 1 });
    expect(result.error).toBe('translator boom');
  });

  it('falls back to nodeId as label when skipped node has no data.label', async () => {
    translateMock.mockImplementation(() => {
      throw new Error('boom');
    });
    const result = await dryRunDeploy(
      [{ id: 'n2', type: 'resource', data: { provider: 'aws' } }],
      [],
      { provider: 'gcp' },
    );

    expect(result.skipped[0]?.label).toBe('n2');
  });

  it('treats translate_card_to_graph absent on @ice/core as an engine-unavailable error', async () => {
    // Replace the core export object with a module missing the function
    translateMock.mockReturnValue(undefined);
    // This time, simulate the function itself being undefined on the namespace
    // by clobbering the named import on the mocked module.
    Object.defineProperty(core, 'translate_card_to_graph', {
      value: undefined,
      configurable: true,
    });

    const result = await dryRunDeploy([], []);

    expect(result.success).toBe(false);
    expect(result.translationSucceeded).toBe(false);
    expect(result.error).toContain('translate_card_to_graph not available');

    // Restore the mock for downstream tests
    Object.defineProperty(core, 'translate_card_to_graph', {
      value: translateMock,
      configurable: true,
    });
  });
});
