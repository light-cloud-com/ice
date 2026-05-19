/**
 * Tests for `pulumi/types.ts` (rf-pulumi-1).
 *
 * The shapes are typecheck-only (interfaces, no runtime presence),
 * so this suite exercises a tiny set of structural assignments to
 * guarantee the type surface stays compatible with the original
 * `pulumi-exporter.ts` exports. `pnpm typecheck` is the primary
 * line of defense; these runtime checks document the structural
 * contract for future readers.
 */
import { describe, expect, it } from 'vitest';
import type {
  PulumiExportOptions,
  PulumiExportResult,
  PulumiProgram,
  PulumiResource,
  PulumiResourceOptions,
} from '../types';

describe('PulumiExportOptions shape', () => {
  it('accepts the minimal required field (provider) with all options absent', () => {
    const opts: PulumiExportOptions = { provider: 'gcp' };
    expect(opts.provider).toBe('gcp');
    expect(opts.format).toBeUndefined();
  });

  it('accepts the full option surface', () => {
    const opts: PulumiExportOptions = {
      provider: 'aws',
      format: 'typescript',
      project_name: 'my-app',
      stack_name: 'prod',
      runtime: 'nodejs',
      include_comments: true,
      config: { region: 'us-east-1' },
    };
    expect(opts.format).toBe('typescript');
    expect(opts.config).toEqual({ region: 'us-east-1' });
  });
});

describe('PulumiResource / PulumiResourceOptions shape', () => {
  it('accepts a resource without options', () => {
    const r: PulumiResource = {
      type: 'gcp:compute/instance:Instance',
      name: 'web',
      properties: { machineType: 'e2-medium' },
    };
    expect(r.options).toBeUndefined();
  });

  it('accepts the full resource-options surface', () => {
    const opts: PulumiResourceOptions = {
      depends_on: ['vpc'],
      protect: true,
      provider: 'gcp',
      parent: 'stack',
      delete_before_replace: false,
      ignore_changes: ['tags'],
    };
    const r: PulumiResource = {
      type: 'gcp:compute/instance:Instance',
      name: 'web',
      properties: {},
      options: opts,
    };
    expect(r.options?.depends_on).toEqual(['vpc']);
  });
});

describe('PulumiProgram shape', () => {
  it('requires name + runtime + resources, allows everything else absent', () => {
    const p: PulumiProgram = { name: 'app', runtime: 'nodejs', resources: [] };
    expect(p.description).toBeUndefined();
    expect(p.outputs).toBeUndefined();
  });

  it('accepts the full program surface', () => {
    const p: PulumiProgram = {
      name: 'app',
      runtime: 'nodejs',
      description: 'Test app',
      config: { region: 'us' },
      resources: [{ type: 't', name: 'n', properties: {} }],
      outputs: { url: '${web.url}' },
    };
    expect(p.outputs?.url).toBe('${web.url}');
  });
});

describe('PulumiExportResult shape', () => {
  it('accepts the minimal success-shape', () => {
    const r: PulumiExportResult = {
      success: true,
      program: { name: 'app', runtime: 'nodejs', resources: [] },
      warnings: [],
      errors: [],
      unmapped_types: [],
    };
    expect(r.yaml).toBeUndefined();
    expect(r.typescript).toBeUndefined();
  });

  it('accepts both yaml and typescript fields populated', () => {
    const r: PulumiExportResult = {
      success: true,
      program: { name: 'app', runtime: 'nodejs', resources: [] },
      yaml: 'name: app',
      typescript: '// noop',
      warnings: ['w'],
      errors: [],
      unmapped_types: ['x.y.z'],
    };
    expect(r.unmapped_types).toEqual(['x.y.z']);
  });
});
