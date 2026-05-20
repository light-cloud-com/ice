/**
 * pulumi-exporter — orchestration shell.
 *
 * The class is a thin wrapper over `./pulumi/converter.export_graph` plus an
 * `EmbeddedSchemaProvider`. Behaviour pinned here:
 *
 *  - Default-constructed provider is created when none is passed.
 *  - `initialize` calls schema_provider.initialize once; the second call
 *    is a no-op (initialized flag).
 *  - `exportGraph` awaits `initialize` first, then forwards to the
 *    standalone `export_graph` helper with (provider, graph, options).
 *  - `create_pulumi_exporter` returns an instance of `PulumiExporter`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const ProviderConstructorCalls: Array<unknown[]> = [];
  const initialize = vi.fn(async () => {});
  class FakeProvider {
    constructor(...args: unknown[]) {
      ProviderConstructorCalls.push(args);
    }
    initialize = initialize;
  }
  const export_graph = vi.fn(async () => ({
    success: true,
    program: { name: 'p', runtime: 'nodejs', resources: [] },
    warnings: [],
    errors: [],
    unmapped_types: [],
  }));
  return { ProviderConstructorCalls, initialize, FakeProvider, export_graph };
});

vi.mock('../../schema/embedded-schema-provider', () => ({
  EmbeddedSchemaProvider: mocks.FakeProvider,
}));

vi.mock('../pulumi/converter', () => ({
  export_graph: mocks.export_graph,
}));

import { PulumiExporter, create_pulumi_exporter } from '../pulumi-exporter';
import type { MutableGraph } from '../../graph/mutable-graph';
import type { PulumiExportOptions } from '../pulumi/types';

beforeEach(() => {
  mocks.ProviderConstructorCalls.length = 0;
  mocks.initialize.mockClear();
  mocks.export_graph.mockClear();
});

describe('PulumiExporter — construction', () => {
  it('creates a default EmbeddedSchemaProvider when none is passed', () => {
    new PulumiExporter();
    expect(mocks.ProviderConstructorCalls).toHaveLength(1);
  });

  it('uses the supplied schema provider verbatim and does NOT instantiate a default', () => {
    const externalProvider = new mocks.FakeProvider('external') as unknown as ConstructorParameters<
      typeof PulumiExporter
    >[0];
    // Reset count after the manual construction.
    mocks.ProviderConstructorCalls.length = 0;
    new PulumiExporter(externalProvider);
    expect(mocks.ProviderConstructorCalls).toHaveLength(0);
  });
});

describe('PulumiExporter.initialize', () => {
  it('calls schema_provider.initialize on the first invocation', async () => {
    const exp = new PulumiExporter();
    await exp.initialize();
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — second call is a no-op', async () => {
    const exp = new PulumiExporter();
    await exp.initialize();
    await exp.initialize();
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
  });
});

describe('PulumiExporter.exportGraph', () => {
  it('initializes lazily, then forwards (provider, graph, options) to export_graph', async () => {
    const exp = new PulumiExporter();
    const graph = { nodes: new Map(), edges: new Map() } as unknown as MutableGraph;
    const options: PulumiExportOptions = { format: 'typescript' };
    await exp.exportGraph(graph, options);

    expect(mocks.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.export_graph).toHaveBeenCalledTimes(1);
    const callArgs = mocks.export_graph.mock.calls[0];
    expect(callArgs[1]).toBe(graph);
    expect(callArgs[2]).toBe(options);
  });

  it('returns the result produced by export_graph', async () => {
    mocks.export_graph.mockResolvedValueOnce({
      success: false,
      program: { name: 'failed', runtime: 'nodejs', resources: [] },
      warnings: ['warn'],
      errors: ['err'],
      unmapped_types: ['Foo'],
    });
    const exp = new PulumiExporter();
    const result = await exp.exportGraph({} as unknown as MutableGraph, { format: 'yaml' } as PulumiExportOptions);
    expect(result.success).toBe(false);
    expect(result.errors).toEqual(['err']);
  });

  it('does NOT re-initialize on a second exportGraph call', async () => {
    const exp = new PulumiExporter();
    await exp.exportGraph({} as unknown as MutableGraph, { format: 'yaml' } as PulumiExportOptions);
    await exp.exportGraph({} as unknown as MutableGraph, { format: 'yaml' } as PulumiExportOptions);
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.export_graph).toHaveBeenCalledTimes(2);
  });
});

describe('create_pulumi_exporter', () => {
  it('returns a PulumiExporter instance', () => {
    const exp = create_pulumi_exporter();
    expect(exp).toBeInstanceOf(PulumiExporter);
  });

  it('threads the supplied provider through to the new instance', () => {
    const externalProvider = new mocks.FakeProvider('shared') as unknown as ConstructorParameters<
      typeof PulumiExporter
    >[0];
    mocks.ProviderConstructorCalls.length = 0;
    const exp = create_pulumi_exporter(externalProvider);
    // No additional default-provider construction happened.
    expect(mocks.ProviderConstructorCalls).toHaveLength(0);
    expect(exp).toBeInstanceOf(PulumiExporter);
  });
});
