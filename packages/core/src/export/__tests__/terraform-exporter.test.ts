/**
 * terraform-exporter — orchestration shell.
 *
 * Mirrors the pulumi-exporter test pattern: the class is a thin wrapper
 * over `./terraform/converter.export_graph` plus an `EmbeddedSchemaProvider`.
 *
 * Behaviour pinned:
 *  - Default-constructed provider is created when none is passed.
 *  - `initialize` calls schema_provider.initialize once; the second call
 *    is a no-op (initialized flag).
 *  - `exportGraph` awaits `initialize` first, then forwards to the
 *    standalone `export_graph` helper with (provider, graph, options).
 *  - `create_terraform_exporter` returns an instance of `TerraformExporter`.
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
    config: { resource: {}, output: {}, variable: {}, provider: {}, terraform: {} },
    hcl: '',
    warnings: [],
    errors: [],
    unmapped_types: [],
  }));
  return { ProviderConstructorCalls, initialize, FakeProvider, export_graph };
});

vi.mock('../../schema/embedded-schema-provider.js', () => ({
  EmbeddedSchemaProvider: mocks.FakeProvider,
}));

vi.mock('../terraform/converter.js', () => ({
  export_graph: mocks.export_graph,
}));

import { TerraformExporter, create_terraform_exporter } from '../terraform-exporter.js';
import type { MutableGraph } from '../../graph/mutable-graph.js';
import type { TerraformExportOptions } from '../terraform/types.js';

beforeEach(() => {
  mocks.ProviderConstructorCalls.length = 0;
  mocks.initialize.mockClear();
  mocks.export_graph.mockClear();
});

describe('TerraformExporter — construction', () => {
  it('creates a default EmbeddedSchemaProvider when none is passed', () => {
    new TerraformExporter();
    expect(mocks.ProviderConstructorCalls).toHaveLength(1);
  });

  it('uses the supplied schema provider verbatim and does NOT instantiate a default', () => {
    const externalProvider = new mocks.FakeProvider('external') as unknown as ConstructorParameters<typeof TerraformExporter>[0];
    mocks.ProviderConstructorCalls.length = 0;
    new TerraformExporter(externalProvider);
    expect(mocks.ProviderConstructorCalls).toHaveLength(0);
  });
});

describe('TerraformExporter.initialize', () => {
  it('calls schema_provider.initialize on the first invocation', async () => {
    const exp = new TerraformExporter();
    await exp.initialize();
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — second call is a no-op', async () => {
    const exp = new TerraformExporter();
    await exp.initialize();
    await exp.initialize();
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
  });
});

describe('TerraformExporter.exportGraph', () => {
  it('initializes lazily, then forwards (provider, graph, options) to export_graph', async () => {
    const exp = new TerraformExporter();
    const graph = { nodes: new Map(), edges: new Map() } as unknown as MutableGraph;
    const options: TerraformExportOptions = { provider: 'aws' };
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
      config: { resource: {}, output: {}, variable: {}, provider: {}, terraform: {} },
      hcl: '',
      warnings: ['warn'],
      errors: ['err'],
      unmapped_types: ['Foo'],
    });
    const exp = new TerraformExporter();
    const result = await exp.exportGraph(
      {} as unknown as MutableGraph,
      { provider: 'aws' } as TerraformExportOptions,
    );
    expect(result.success).toBe(false);
    expect(result.errors).toEqual(['err']);
  });

  it('does NOT re-initialize on a second exportGraph call', async () => {
    const exp = new TerraformExporter();
    await exp.exportGraph({} as unknown as MutableGraph, { provider: 'aws' } as TerraformExportOptions);
    await exp.exportGraph({} as unknown as MutableGraph, { provider: 'aws' } as TerraformExportOptions);
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.export_graph).toHaveBeenCalledTimes(2);
  });
});

describe('create_terraform_exporter', () => {
  it('returns a TerraformExporter instance', () => {
    const exp = create_terraform_exporter();
    expect(exp).toBeInstanceOf(TerraformExporter);
  });

  it('threads the supplied provider through to the new instance', () => {
    const externalProvider = new mocks.FakeProvider('shared') as unknown as ConstructorParameters<typeof TerraformExporter>[0];
    mocks.ProviderConstructorCalls.length = 0;
    const exp = create_terraform_exporter(externalProvider);
    expect(mocks.ProviderConstructorCalls).toHaveLength(0);
    expect(exp).toBeInstanceOf(TerraformExporter);
  });
});
