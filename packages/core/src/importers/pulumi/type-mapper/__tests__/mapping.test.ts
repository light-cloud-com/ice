/**
 * Tests for `type-mapper/mapping.ts` (rf-pmap-3).
 *
 * Pure-function helpers, hit 100% with input/output pinning.
 * Behaviour preserved verbatim from pre-extraction L422-527 of
 * `type-mapper.ts`.
 */
import { describe, expect, it } from 'vitest';
import { TYPE_MAP } from '../data';
import {
  get_ice_provider,
  get_ice_type,
  get_name_from_urn,
  get_provider_from_type,
  get_supported_ice_types,
  get_supported_types,
  is_provider_resource,
  is_stack_resource,
  is_type_supported,
} from '../mapping';

describe('get_ice_type', () => {
  it('returns direct TYPE_MAP hit when present', () => {
    expect(get_ice_type('aws:s3/bucket:Bucket')).toBe('aws.s3.bucket');
    expect(get_ice_type('gcp:compute/instance:Instance')).toBe('gcp.compute.instance');
  });

  it('synthesises from parse_type when not in TYPE_MAP', () => {
    // Not in TYPE_MAP: synthesise from provider/module/snake(class).
    expect(get_ice_type('aws:foo/bar:NewResource')).toBe('aws.foo.new_resource');
  });

  it('uses ICE-mapped provider name from PROVIDER_MAP', () => {
    // azure-native is mapped to azure in PROVIDER_MAP.
    expect(get_ice_type('azure-native:custom/thing:NewThing')).toBe('azure.custom.new_thing');
  });

  it('falls through to lowercase dotted form for malformed input', () => {
    expect(get_ice_type('foo:bar')).toBe('foo.bar');
    expect(get_ice_type('FOO')).toBe('foo');
  });

  it('preserves case fall-through for input without colons', () => {
    expect(get_ice_type('Random')).toBe('random');
  });
});

describe('get_ice_provider', () => {
  it('parses URN', () => {
    expect(get_ice_provider('urn:pulumi:dev::myproject::aws:s3/bucket:Bucket::my-bucket')).toBe('aws');
  });

  it('parses raw type string', () => {
    expect(get_ice_provider('aws:s3/bucket:Bucket')).toBe('aws');
    expect(get_ice_provider('gcp:compute/instance:Instance')).toBe('gcp');
  });

  it('uses PROVIDER_MAP to collapse aws-native -> aws', () => {
    expect(get_ice_provider('aws-native:s3:Bucket')).toBe('aws');
  });

  it('uses PROVIDER_MAP to collapse azure-native -> azure', () => {
    expect(get_ice_provider('azure-native:compute:VirtualMachine')).toBe('azure');
  });

  it('falls back to simple-name match for plain provider tokens', () => {
    expect(get_ice_provider('aws')).toBe('aws');
    expect(get_ice_provider('gcp')).toBe('gcp');
  });

  it('returns simple-name match unchanged for unknown providers', () => {
    expect(get_ice_provider('newprovider')).toBe('newprovider');
  });
});

describe('get_provider_from_type', () => {
  it('parses provider from standard form', () => {
    expect(get_provider_from_type('aws:s3/bucket:Bucket')).toBe('aws');
  });

  it('uses PROVIDER_MAP', () => {
    expect(get_provider_from_type('aws-native:s3:Bucket')).toBe('aws');
    expect(get_provider_from_type('azure-native:compute:VirtualMachine')).toBe('azure');
  });

  it('returns unknown for malformed input', () => {
    expect(get_provider_from_type('foo')).toBe('unknown');
    expect(get_provider_from_type('')).toBe('unknown');
  });
});

describe('is_type_supported', () => {
  it('returns true for direct TYPE_MAP entries', () => {
    expect(is_type_supported('aws:ec2/instance:Instance')).toBe(true);
    expect(is_type_supported('gcp:compute/instance:Instance')).toBe(true);
  });

  it('returns false for types not in TYPE_MAP', () => {
    expect(is_type_supported('aws:custom/thing:NewThing')).toBe(false);
    expect(is_type_supported('foo')).toBe(false);
    expect(is_type_supported('')).toBe(false);
  });

  it('does NOT consider synthesised paths supported', () => {
    // get_ice_type would synthesise this, but is_type_supported
    // requires explicit table entry.
    expect(is_type_supported('aws:notreal/thing:Thing')).toBe(false);
  });
});

describe('get_supported_types', () => {
  it('returns all keys of TYPE_MAP', () => {
    const supported = get_supported_types();
    expect(supported.length).toBe(Object.keys(TYPE_MAP).length);
    expect(supported).toContain('aws:s3/bucket:Bucket');
    expect(supported).toContain('gcp:compute/instance:Instance');
  });
});

describe('get_supported_ice_types', () => {
  it('returns deduped values of TYPE_MAP', () => {
    const ice_types = get_supported_ice_types();
    const all_values = Object.values(TYPE_MAP);
    expect(ice_types.length).toBe(new Set(all_values).size);
    expect(ice_types.length).toBeLessThan(all_values.length); // dedup happened
  });

  it('contains expected ICE types', () => {
    const ice_types = get_supported_ice_types();
    expect(ice_types).toContain('aws.s3.bucket');
    expect(ice_types).toContain('gcp.compute.instance');
  });
});

describe('get_name_from_urn', () => {
  it('extracts name from standard URN', () => {
    expect(get_name_from_urn('urn:pulumi:dev::myproject::aws:s3/bucket:Bucket::my-bucket')).toBe('my-bucket');
  });

  it('falls back to last :: segment for malformed URN', () => {
    // Wrong shape but has ::-separated segments.
    expect(get_name_from_urn('foo::bar::baz')).toBe('baz');
  });

  it('returns input verbatim when no fallback applies', () => {
    expect(get_name_from_urn('plain-string')).toBe('plain-string');
  });
});

describe('is_provider_resource', () => {
  it('returns true for pulumi:providers: prefix', () => {
    expect(is_provider_resource('pulumi:providers:aws')).toBe(true);
    expect(is_provider_resource('pulumi:providers:gcp')).toBe(true);
  });

  it('returns false for everything else', () => {
    expect(is_provider_resource('pulumi:pulumi:Stack')).toBe(false);
    expect(is_provider_resource('aws:s3/bucket:Bucket')).toBe(false);
    expect(is_provider_resource('')).toBe(false);
  });
});

describe('is_stack_resource', () => {
  it('returns true for pulumi:pulumi:Stack', () => {
    expect(is_stack_resource('pulumi:pulumi:Stack')).toBe(true);
  });

  it('returns false for everything else', () => {
    expect(is_stack_resource('pulumi:providers:aws')).toBe(false);
    expect(is_stack_resource('aws:s3/bucket:Bucket')).toBe(false);
    expect(is_stack_resource('')).toBe(false);
  });
});
