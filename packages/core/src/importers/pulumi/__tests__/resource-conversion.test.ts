/**
 * Tests for Pulumi resource conversion (rf-pimp-2 extraction).
 */

import { describe, it, expect } from 'vitest';
import { import_resource, process_properties } from '../resource-conversion.js';
import type { PulumiResource, PulumiImportWarning } from '../types.js';
import type { PulumiImportOptions } from '../state-importer.js';

const SECRET_WRAPPER = {
  '4dabf18193072939515e22aab3b80af9': '1b47061264138c4ac30d75fd1eb44270',
  plaintext: 'shh',
};

const default_opts: Required<Omit<PulumiImportOptions, 'target_graph'>> = {
  include_providers: false,
  include_stack: false,
  include_secrets: false,
  filter_types: [],
  exclude_types: [],
  name_prefix: '',
  resolve_references: true,
};

describe('process_properties', () => {
  it('passes primitives through unchanged', () => {
    const result = process_properties({ a: 1, b: 'x', c: true, d: null }, default_opts);
    expect(result).toEqual({ a: 1, b: 'x', c: true, d: null });
  });

  it('preserves arrays without descending into their secret elements', () => {
    // Arrays-of-secrets aren't descended (only plain objects are).
    const result = process_properties({ list: [1, SECRET_WRAPPER] }, default_opts);
    expect(result.list).toEqual([1, SECRET_WRAPPER]);
  });

  it('masks secret values when include_secrets=false', () => {
    const result = process_properties({ pwd: SECRET_WRAPPER }, default_opts);
    expect(result.pwd).toBe('***SECRET***');
  });

  it('unwraps secret values when include_secrets=true', () => {
    const result = process_properties(
      { pwd: SECRET_WRAPPER },
      { ...default_opts, include_secrets: true },
    );
    expect(result.pwd).toBe('shh');
  });

  it('recurses into nested objects', () => {
    const result = process_properties(
      { db: { host: 'h', creds: { token: SECRET_WRAPPER } } },
      default_opts,
    );
    expect(result).toEqual({ db: { host: 'h', creds: { token: '***SECRET***' } } });
  });
});

describe('import_resource', () => {
  function make_resource(overrides: Partial<PulumiResource> = {}): PulumiResource {
    return {
      urn: 'urn:pulumi:dev::p::aws:ec2/vpc:Vpc::main',
      type: 'aws:ec2/vpc:Vpc',
      ...overrides,
    };
  }

  it('parses URN to derive name and provider/ice_type', () => {
    const warnings: PulumiImportWarning[] = [];
    const result = import_resource(make_resource(), default_opts, warnings);
    expect(result.name).toBe('main');
    expect(result.pulumi_type).toBe('aws:ec2/vpc:Vpc');
    expect(result.provider).toBe('aws');
  });

  it('falls back to extract_name_from_urn when parse_urn returns null', () => {
    const warnings: PulumiImportWarning[] = [];
    const result = import_resource(
      make_resource({ urn: 'malformed::but::trailing' }),
      default_opts,
      warnings,
    );
    expect(result.name).toBe('trailing');
  });

  it('applies name_prefix when configured', () => {
    const warnings: PulumiImportWarning[] = [];
    const result = import_resource(
      make_resource(),
      { ...default_opts, name_prefix: 'imp_' },
      warnings,
    );
    expect(result.name).toBe('imp_main');
  });

  it('prefers outputs over inputs for properties', () => {
    const warnings: PulumiImportWarning[] = [];
    const result = import_resource(
      make_resource({
        inputs: { cidrBlock: 'a' },
        outputs: { cidrBlock: 'b' },
      }),
      default_opts,
      warnings,
    );
    expect(result.properties).toEqual({ cidrBlock: 'b' });
    expect(warnings).toHaveLength(0);
  });

  it('falls back to inputs and emits NO_OUTPUTS warning when outputs missing', () => {
    const warnings: PulumiImportWarning[] = [];
    const result = import_resource(
      make_resource({ inputs: { cidrBlock: 'a' } }),
      default_opts,
      warnings,
    );
    expect(result.properties).toEqual({ cidrBlock: 'a' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe('NO_OUTPUTS');
    expect(warnings[0]?.resource).toBe('urn:pulumi:dev::p::aws:ec2/vpc:Vpc::main');
  });

  it('returns empty properties object when both outputs and inputs missing', () => {
    const warnings: PulumiImportWarning[] = [];
    const result = import_resource(make_resource(), default_opts, warnings);
    expect(result.properties).toEqual({});
    expect(warnings).toHaveLength(0);
  });

  it('aggregates dependencies from explicit deps and parent (parent appended last)', () => {
    const warnings: PulumiImportWarning[] = [];
    const result = import_resource(
      make_resource({ dependencies: ['urn:dep:a', 'urn:dep:b'], parent: 'urn:parent:p' }),
      default_opts,
      warnings,
    );
    expect(result.dependencies).toEqual(['urn:dep:a', 'urn:dep:b', 'urn:parent:p']);
    expect(result.parent).toBe('urn:parent:p');
  });

  it('returns empty dependencies array when no deps and no parent', () => {
    const warnings: PulumiImportWarning[] = [];
    const result = import_resource(make_resource(), default_opts, warnings);
    expect(result.dependencies).toEqual([]);
    expect(result.parent).toBeUndefined();
  });

  it('mirrors additional_secret_outputs into secret_outputs', () => {
    const warnings: PulumiImportWarning[] = [];
    const result = import_resource(
      make_resource({ additional_secret_outputs: ['k1', 'k2'] }),
      default_opts,
      warnings,
    );
    expect(result.secret_outputs).toEqual(['k1', 'k2']);
  });

  it('defaults protect/external to false', () => {
    const warnings: PulumiImportWarning[] = [];
    const result = import_resource(make_resource(), default_opts, warnings);
    expect(result.protect).toBe(false);
    expect(result.external).toBe(false);
  });

  it('preserves protect=true and external=true when set', () => {
    const warnings: PulumiImportWarning[] = [];
    const result = import_resource(
      make_resource({ protect: true, external: true }),
      default_opts,
      warnings,
    );
    expect(result.protect).toBe(true);
    expect(result.external).toBe(true);
  });

  it('passes id through verbatim', () => {
    const warnings: PulumiImportWarning[] = [];
    const result = import_resource(
      make_resource({ id: 'vpc-12345678' }),
      default_opts,
      warnings,
    );
    expect(result.id).toBe('vpc-12345678');
  });

  it('masks secrets in nested output properties', () => {
    const warnings: PulumiImportWarning[] = [];
    const result = import_resource(
      make_resource({ outputs: { token: SECRET_WRAPPER } }),
      default_opts,
      warnings,
    );
    expect(result.properties).toEqual({ token: '***SECRET***' });
  });
});
