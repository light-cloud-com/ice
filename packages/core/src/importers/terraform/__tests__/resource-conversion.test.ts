/**
 * Tests for Terraform resource conversion + dependency inference
 * (rf-timp-2 extraction).
 */

import { describe, it, expect } from 'vitest';
import { import_resource_instance, infer_dependencies, scan_for_references } from '../resource-conversion';
import type { TerraformImportOptions } from '../state-importer';
import type { TerraformResource, TerraformResourceInstance, ImportedResource, ImportWarning } from '../types';

const default_opts: Required<Omit<TerraformImportOptions, 'target_graph'>> = {
  include_data_sources: false,
  include_sensitive: false,
  filter_types: [],
  exclude_types: [],
  filter_modules: [],
  name_prefix: '',
  infer_dependencies: true,
};

function make_resource(overrides: Partial<TerraformResource> = {}): TerraformResource {
  return {
    mode: 'managed',
    type: 'aws_vpc',
    name: 'main',
    provider: 'provider["registry.terraform.io/hashicorp/aws"]',
    instances: [],
    ...overrides,
  };
}

function make_instance(overrides: Partial<TerraformResourceInstance> = {}): TerraformResourceInstance {
  return {
    schema_version: 1,
    attributes: {},
    ...overrides,
  };
}

describe('import_resource_instance', () => {
  it('builds the address from type.name', () => {
    const warnings: ImportWarning[] = [];
    const result = import_resource_instance(make_resource(), make_instance(), default_opts, warnings);
    expect(result.terraform_address).toBe('aws_vpc.main');
  });

  it('prefixes the address with the module path', () => {
    const warnings: ImportWarning[] = [];
    const result = import_resource_instance(
      make_resource({ module: 'module.network' }),
      make_instance(),
      default_opts,
      warnings,
    );
    expect(result.terraform_address).toBe('module.network.aws_vpc.main');
  });

  it('appends the JSON-encoded index_key to the address', () => {
    const warnings: ImportWarning[] = [];
    const result = import_resource_instance(make_resource(), make_instance({ index_key: 0 }), default_opts, warnings);
    expect(result.terraform_address).toBe('aws_vpc.main[0]');
  });

  it('JSON-encodes a string index_key in the address', () => {
    const warnings: ImportWarning[] = [];
    const result = import_resource_instance(make_resource(), make_instance({ index_key: 'a' }), default_opts, warnings);
    expect(result.terraform_address).toBe('aws_vpc.main["a"]');
  });

  it('applies name_prefix to the ICE name', () => {
    const warnings: ImportWarning[] = [];
    const result = import_resource_instance(
      make_resource(),
      make_instance(),
      { ...default_opts, name_prefix: 'imp_' },
      warnings,
    );
    expect(result.name).toBe('imp_main');
  });

  it('appends index_key to the ICE name when present', () => {
    const warnings: ImportWarning[] = [];
    const result = import_resource_instance(make_resource(), make_instance({ index_key: 0 }), default_opts, warnings);
    expect(result.name).toBe('main_0');
  });

  it('runs map_properties on attributes (verbatim type pass-through)', () => {
    const warnings: ImportWarning[] = [];
    const result = import_resource_instance(
      make_resource(),
      make_instance({ attributes: { id: 'vpc-1', cidr_block: '10.0.0.0/16' } }),
      default_opts,
      warnings,
    );
    expect(result.properties.id).toBe('vpc-1');
    expect(result.properties.cidr_block).toBe('10.0.0.0/16');
  });

  it('masks sensitive attributes and emits SENSITIVE_MASKED warning', () => {
    const warnings: ImportWarning[] = [];
    const result = import_resource_instance(
      make_resource(),
      make_instance({
        attributes: { id: 'vpc-1', password: 'secret' },
        sensitive_attributes: ['password'],
      }),
      default_opts,
      warnings,
    );
    expect(result.properties.password).toBe('***SENSITIVE***');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe('SENSITIVE_MASKED');
    expect(warnings[0]?.resource).toBe('aws_vpc.main');
  });

  it('does not mask when include_sensitive=true', () => {
    const warnings: ImportWarning[] = [];
    const result = import_resource_instance(
      make_resource(),
      make_instance({
        attributes: { password: 'secret' },
        sensitive_attributes: ['password'],
      }),
      { ...default_opts, include_sensitive: true },
      warnings,
    );
    expect(result.properties.password).toBe('secret');
    expect(warnings).toHaveLength(0);
  });

  it('passes explicit instance.dependencies through verbatim', () => {
    const warnings: ImportWarning[] = [];
    const result = import_resource_instance(
      make_resource(),
      make_instance({ dependencies: ['aws_vpc.other', 'aws_subnet.s'] }),
      default_opts,
      warnings,
    );
    expect(result.dependencies).toEqual(['aws_vpc.other', 'aws_subnet.s']);
  });

  it('returns empty dependencies array when none supplied', () => {
    const warnings: ImportWarning[] = [];
    const result = import_resource_instance(make_resource(), make_instance(), default_opts, warnings);
    expect(result.dependencies).toEqual([]);
  });

  it('mirrors module + index_key + sensitive_attributes onto the result', () => {
    const warnings: ImportWarning[] = [];
    const result = import_resource_instance(
      make_resource({ module: 'module.x' }),
      make_instance({ index_key: 'a', sensitive_attributes: ['p'] }),
      default_opts,
      warnings,
    );
    expect(result.module).toBe('module.x');
    expect(result.index_key).toBe('a');
    expect(result.sensitive_attributes).toEqual(['p']);
  });
});

describe('scan_for_references', () => {
  it('matches a string leaf against id_lookup', () => {
    const lookup = new Map([['vpc-1', 'aws_vpc.main']]);
    const deps = new Set<string>();
    scan_for_references('vpc-1', lookup, deps);
    expect(deps.has('aws_vpc.main')).toBe(true);
  });

  it('descends into nested objects', () => {
    const lookup = new Map([['arn:x', 'aws_x.y']]);
    const deps = new Set<string>();
    scan_for_references({ a: { b: 'arn:x' } }, lookup, deps);
    expect(deps.has('aws_x.y')).toBe(true);
  });

  it('descends into arrays', () => {
    const lookup = new Map([['arn:x', 'aws_x.y']]);
    const deps = new Set<string>();
    scan_for_references([1, 'arn:x'], lookup, deps);
    expect(deps.has('aws_x.y')).toBe(true);
  });

  it('returns no-op for null/undefined/non-string primitives', () => {
    const lookup = new Map<string, string>();
    const deps = new Set<string>();
    scan_for_references(null, lookup, deps);
    scan_for_references(undefined, lookup, deps);
    scan_for_references(42, lookup, deps);
    scan_for_references(true, lookup, deps);
    expect(deps.size).toBe(0);
  });
});

describe('infer_dependencies', () => {
  function make_imported(overrides: Partial<ImportedResource> = {}): ImportedResource {
    return {
      terraform_address: 'aws_vpc.main',
      terraform_type: 'aws_vpc',
      ice_type: 'Network.VPC',
      name: 'main',
      properties: {},
      dependencies: [],
      provider: 'aws',
      sensitive_attributes: [],
      ...overrides,
    };
  }

  it('infers a dependency when one resource references another by ID', () => {
    const a = make_imported({
      terraform_address: 'aws_vpc.main',
      properties: { id: 'vpc-1' },
    });
    const b = make_imported({
      terraform_address: 'aws_subnet.public',
      name: 'public',
      properties: { vpc_id: 'vpc-1' },
    });
    infer_dependencies([a, b], []);
    expect(b.dependencies).toContain('aws_vpc.main');
  });

  it('infers a dependency when references go via ARN', () => {
    const a = make_imported({
      terraform_address: 'aws_vpc.main',
      properties: { arn: 'arn:aws:ec2:vpc:1' },
    });
    const b = make_imported({
      terraform_address: 'aws_subnet.public',
      properties: { source_arn: 'arn:aws:ec2:vpc:1' },
    });
    infer_dependencies([a, b], []);
    expect(b.dependencies).toContain('aws_vpc.main');
  });

  it('preserves explicit dependencies through the dedup pass', () => {
    const a = make_imported({ properties: { id: 'vpc-1' } });
    const b = make_imported({
      terraform_address: 'aws_subnet.public',
      properties: { vpc_id: 'vpc-1' },
      dependencies: ['aws_vpc.main'], // already explicit
    });
    infer_dependencies([a, b], []);
    expect(b.dependencies).toEqual(['aws_vpc.main']);
  });

  it('does nothing when no IDs match', () => {
    const a = make_imported({ properties: { id: 'vpc-1' } });
    const b = make_imported({
      terraform_address: 'aws_subnet.public',
      properties: { vpc_id: 'vpc-99' },
    });
    infer_dependencies([a, b], []);
    expect(b.dependencies).toEqual([]);
  });
});
