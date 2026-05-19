/**
 * Tests for `unified-type-resolver.ts`.
 *
 * The resolver composes the EmbeddedSchemaProvider into its own type
 * registry. We mock EmbeddedSchemaProvider at the module boundary so we
 * can drive the schema discovery loop without a real DB. We exercise:
 *  - constructor (default vs injected provider)
 *  - initialize: idempotent; populates native_to_ice + ice_to_native from
 *    the legacy `{ data: { schemas: [...] } }` shape; non-conforming result
 *    swallowed; provider.query() throwing is swallowed
 *  - resolveToICE: exact-match (after normalization) and fallback per source
 *  - resolveToNative: mapped vs unmapped
 *  - getImplementation: forwards to schema_provider
 *  - hasMapping: true/false based on populated map
 *  - getSupportedNativeTypes filters by source prefix
 *  - normalizeNativeType per source: every branch shape covered
 *  - fallbackMapping per source: every branch shape covered
 *  - mapTerraformProvider / mapPulumiProvider known + unknown providers
 *  - get_type_resolver singleton + initialize_type_resolver + create_type_resolver
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const providerSpy = vi.hoisted(() => ({
  initialize: vi.fn(async () => ({ ok: true, value: undefined })),
  query: vi.fn(async () => ({})),
  get_implementation: vi.fn(() => undefined),
}));

const EmbeddedCtor = vi.hoisted(() => vi.fn());

vi.mock('../embedded-schema-provider', () => {
  // Reset spies-on-instance per construction, but share the same identity
  // so tests can poke at them.
  EmbeddedCtor.mockImplementation(function (this: unknown) {
    Object.assign(this as object, {
      initialize: providerSpy.initialize,
      query: providerSpy.query,
      get_implementation: providerSpy.get_implementation,
    });
  });
  return { EmbeddedSchemaProvider: EmbeddedCtor };
});

import {
  UnifiedTypeResolver,
  create_type_resolver,
  get_type_resolver,
  initialize_type_resolver,
} from '../unified-type-resolver';
import type { IceType } from '../schema-provider';

beforeEach(() => {
  vi.clearAllMocks();
  providerSpy.initialize.mockResolvedValue({ ok: true, value: undefined });
  providerSpy.query.mockResolvedValue({});
  providerSpy.get_implementation.mockReturnValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// constructor + initialize
// ---------------------------------------------------------------------------

describe('UnifiedTypeResolver constructor', () => {
  it('builds its own EmbeddedSchemaProvider when none is supplied', () => {
    new UnifiedTypeResolver();
    expect(EmbeddedCtor).toHaveBeenCalled();
  });

  it('uses the injected EmbeddedSchemaProvider when supplied', () => {
    EmbeddedCtor.mockClear();
    const supplied = { initialize: vi.fn(async () => ({})), query: vi.fn(async () => ({})), get_implementation: vi.fn() };
    // @ts-expect-error simplified shape good enough for the consumer
    new UnifiedTypeResolver(supplied);
    expect(EmbeddedCtor).not.toHaveBeenCalled();
  });
});

describe('UnifiedTypeResolver.initialize', () => {
  it('calls schema_provider.initialize and is idempotent', async () => {
    const r = new UnifiedTypeResolver();
    await r.initialize();
    await r.initialize();
    expect(providerSpy.initialize).toHaveBeenCalledTimes(1);
  });

  it('builds native_to_ice + ice_to_native maps from a legacy `{ data.schemas }` payload', async () => {
    providerSpy.query.mockResolvedValue({
      data: {
        schemas: [
          {
            ice_type: 'compute.instance',
            implementations: [
              { source: 'gcp', provider: 'google', native_type: 'compute#instance' },
              { source: 'terraform', provider: 'google', native_type: 'google_compute_instance' },
            ],
          },
        ],
      },
    });

    const r = new UnifiedTypeResolver();
    await r.initialize();

    // Native -> ICE: GCP normalization -> "gcp:compute.instance"
    const result = r.resolveToICE('compute#instance', 'gcp');
    expect(result.ice_type).toBe('compute.instance');
    expect(result.is_exact_match).toBe(true);
    expect(result.resolution_source).toBe('schema');

    // Native -> ICE for the second impl
    const tfResult = r.resolveToICE('google_compute_instance', 'terraform');
    expect(tfResult.ice_type).toBe('compute.instance');
    expect(tfResult.is_exact_match).toBe(true);

    // ICE -> native (the `ice_to_native` map should also have populated)
    expect(r.resolveToNative('compute.instance' as IceType, 'terraform', 'google')).toBe(
      'google_compute_instance',
    );
  });

  it('extends an existing ICE entry when a second schema reuses the same ice_type', async () => {
    providerSpy.query.mockResolvedValue({
      data: {
        schemas: [
          {
            ice_type: 'compute.instance',
            implementations: [
              { source: 'gcp', provider: 'google', native_type: 'compute#instance' },
            ],
          },
          {
            ice_type: 'compute.instance',
            implementations: [
              { source: 'aws', provider: 'aws', native_type: 'AWS::EC2::Instance' },
            ],
          },
        ],
      },
    });
    const r = new UnifiedTypeResolver();
    await r.initialize();
    expect(r.resolveToNative('compute.instance' as IceType, 'terraform', 'google')).toBeUndefined();
    // Both implementations should be searchable
    expect(r.resolveToICE('compute#instance', 'gcp').is_exact_match).toBe(true);
    expect(r.resolveToICE('AWS::EC2::Instance', 'aws').is_exact_match).toBe(true);
  });

  it('builds native_to_ice + ice_to_native maps from the Result shape (findings #9)', async () => {
    // The previous code only matched the legacy `{ data: { schemas } }`
    // envelope, but EmbeddedSchemaProvider.query actually returns a
    // canonical `Result<SchemaQueryResult, …>` (`{ ok: true, value: ... }`).
    // Once the provider migrated to Result the resolver silently no-op'd
    // and every importer fell back to a derived ICE name. Both shapes
    // now build the maps.
    providerSpy.query.mockResolvedValue({
      ok: true,
      value: {
        schemas: [
          {
            ice_type: 'compute.instance',
            implementations: [
              { source: 'gcp', provider: 'google', native_type: 'compute#instance' },
              { source: 'terraform', provider: 'google', native_type: 'google_compute_instance' },
            ],
          },
        ],
        total: 1,
        has_more: false,
      },
    });

    const r = new UnifiedTypeResolver();
    await r.initialize();

    const result = r.resolveToICE('compute#instance', 'gcp');
    expect(result.ice_type).toBe('compute.instance');
    expect(result.is_exact_match).toBe(true);
    expect(result.resolution_source).toBe('schema');
    expect(r.resolveToNative('compute.instance' as IceType, 'terraform', 'google')).toBe(
      'google_compute_instance',
    );
  });

  it('handles an empty Result-shape payload without crashing', async () => {
    providerSpy.query.mockResolvedValue({ ok: true, value: { schemas: [], total: 0, has_more: false } });
    const r = new UnifiedTypeResolver();
    await expect(r.initialize()).resolves.toBeUndefined();
    // No schemas registered -> exact match fails, fallback used
    const out = r.resolveToICE('compute#instance', 'gcp');
    expect(out.is_exact_match).toBe(false);
    expect(out.resolution_source).toBe('fallback');
  });

  it('swallows a Failure-shape Result (ok: false) without crashing', async () => {
    providerSpy.query.mockResolvedValue({ ok: false, error: { code: 'X', message: 'no' } });
    const r = new UnifiedTypeResolver();
    await expect(r.initialize()).resolves.toBeUndefined();
    expect(r.resolveToICE('compute#instance', 'gcp').is_exact_match).toBe(false);
  });

  it('swallows query results where data.schemas is not an array', async () => {
    providerSpy.query.mockResolvedValue({ data: { schemas: 'oops' } });
    const r = new UnifiedTypeResolver();
    await expect(r.initialize()).resolves.toBeUndefined();
  });

  it('swallows null/undefined query results', async () => {
    providerSpy.query.mockResolvedValue(null);
    await expect(new UnifiedTypeResolver().initialize()).resolves.toBeUndefined();
  });

  it('swallows query() throwing', async () => {
    providerSpy.query.mockRejectedValue(new Error('db down'));
    const r = new UnifiedTypeResolver();
    await expect(r.initialize()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveToICE / fallbacks
// ---------------------------------------------------------------------------

async function buildLoadedResolver(extra: { ice_type: string; implementations: { source: string; provider: string; native_type: string }[] }[] = []) {
  providerSpy.query.mockResolvedValue({
    data: {
      schemas: [
        {
          ice_type: 'compute.instance',
          implementations: [
            { source: 'gcp', provider: 'google', native_type: 'compute#instance' },
            { source: 'aws', provider: 'aws', native_type: 'AWS::EC2::Instance' },
            { source: 'azure', provider: 'azure', native_type: 'Microsoft.Compute/virtualMachines' },
            { source: 'terraform', provider: 'google', native_type: 'google_compute_instance' },
            { source: 'pulumi', provider: 'gcp', native_type: 'gcp:compute/instance:Instance' },
          ],
        },
        ...extra,
      ],
    },
  });
  const r = new UnifiedTypeResolver();
  await r.initialize();
  return r;
}

describe('UnifiedTypeResolver.resolveToICE — exact-match per source', () => {
  it('GCP compute#instance -> exact', async () => {
    const r = await buildLoadedResolver();
    expect(r.resolveToICE('compute#instance', 'gcp').is_exact_match).toBe(true);
  });

  it('AWS AWS::EC2::Instance -> exact', async () => {
    const r = await buildLoadedResolver();
    expect(r.resolveToICE('AWS::EC2::Instance', 'aws').is_exact_match).toBe(true);
  });

  it('Azure Microsoft.Compute/virtualMachines -> exact', async () => {
    const r = await buildLoadedResolver();
    expect(r.resolveToICE('Microsoft.Compute/virtualMachines', 'azure').is_exact_match).toBe(true);
  });

  it('Terraform google_compute_instance -> exact', async () => {
    const r = await buildLoadedResolver();
    expect(r.resolveToICE('google_compute_instance', 'terraform').is_exact_match).toBe(true);
  });

  it('Pulumi gcp:compute/instance:Instance -> exact', async () => {
    const r = await buildLoadedResolver();
    expect(r.resolveToICE('gcp:compute/instance:Instance', 'pulumi').is_exact_match).toBe(true);
  });
});

describe('UnifiedTypeResolver.resolveToICE — fallback per source', () => {
  it('GCP compute#instance with no schema -> gcp.compute.instance fallback', async () => {
    const r = new UnifiedTypeResolver();
    await r.initialize();
    const out = r.resolveToICE('compute#instance', 'gcp');
    expect(out.ice_type).toBe('gcp.compute.instance');
    expect(out.resolution_source).toBe('fallback');
  });

  it('GCP googleapis.com/Resource fallback', async () => {
    const r = new UnifiedTypeResolver();
    await r.initialize();
    expect(r.resolveToICE('compute.googleapis.com/Instance', 'gcp').ice_type).toBe(
      'gcp.compute.instance',
    );
  });

  it('GCP plain string fallback', async () => {
    const r = new UnifiedTypeResolver();
    await r.initialize();
    expect(r.resolveToICE('plain_value', 'gcp').ice_type).toBe('gcp.plain_value');
  });

  it('GCP googleapis.com URL with extra dot prefix takes the lowercase fallback path', async () => {
    // Regex `^([^.]+)\.googleapis\.com\/(.+)$` rejects when the leading chunk
    // contains a dot — the surrounding else branch lowercases the native type.
    const r = new UnifiedTypeResolver();
    await r.initialize();
    const out = r.resolveToICE('a.b.googleapis.com/Inst', 'gcp');
    // Falls back to: gcp.a.b.googleapis.com/inst -> normalizes "a.b.googleapis.com/inst"
    // then fallback path returns "gcp." + "a.b.googleapis.com/inst" verbatim
    // (the "#" replace doesn't apply, no further transform).
    expect(out.ice_type).toBe('gcp.a.b.googleapis.com/inst');
  });

  it('AWS AWS::EC2::Instance fallback', async () => {
    const r = new UnifiedTypeResolver();
    await r.initialize();
    expect(r.resolveToICE('AWS::EC2::Instance', 'aws').ice_type).toBe('aws.ec2.instance');
  });

  it('AWS aws_instance fallback', async () => {
    const r = new UnifiedTypeResolver();
    await r.initialize();
    expect(r.resolveToICE('aws_security_group', 'aws').ice_type).toBe('aws.security.group');
  });

  it('AWS plain fallback', async () => {
    const r = new UnifiedTypeResolver();
    await r.initialize();
    expect(r.resolveToICE('Ec2', 'aws').ice_type).toBe('aws.ec2');
  });

  it('Azure Microsoft.X/Y fallback', async () => {
    const r = new UnifiedTypeResolver();
    await r.initialize();
    expect(r.resolveToICE('Microsoft.Network/virtualNetworks', 'azure').ice_type).toBe(
      'azure.network.virtualnetworks',
    );
  });

  it('Azure plain fallback', async () => {
    const r = new UnifiedTypeResolver();
    await r.initialize();
    expect(r.resolveToICE('SomeService/SomeRes', 'azure').ice_type).toBe('azure.someservice.someres');
  });

  it('Terraform google_compute_instance -> gcp.compute.instance fallback', async () => {
    const r = new UnifiedTypeResolver();
    await r.initialize();
    expect(r.resolveToICE('google_compute_instance', 'terraform').ice_type).toBe(
      'gcp.compute.instance',
    );
  });

  it('Terraform azurerm_virtual_machine -> azure.virtual.machine fallback', async () => {
    const r = new UnifiedTypeResolver();
    await r.initialize();
    expect(r.resolveToICE('azurerm_virtual_machine', 'terraform').ice_type).toBe(
      'azure.virtual.machine',
    );
  });

  it('Terraform single-part token -> identity fallback', async () => {
    const r = new UnifiedTypeResolver();
    await r.initialize();
    expect(r.resolveToICE('singleword', 'terraform').ice_type).toBe('singleword');
  });

  it('Pulumi gcp:compute/instance:Instance fallback', async () => {
    const r = new UnifiedTypeResolver();
    await r.initialize();
    expect(r.resolveToICE('gcp:compute/instance:Instance', 'pulumi').ice_type).toBe(
      'gcp.compute.instance',
    );
  });

  it('Pulumi azure-native:compute/virtualMachine:VirtualMachine fallback', async () => {
    const r = new UnifiedTypeResolver();
    await r.initialize();
    expect(r.resolveToICE('azure-native:compute/virtualMachine:VirtualMachine', 'pulumi').ice_type)
      .toBe('azure.compute.virtualmachine');
  });

  it('Pulumi unknown shape fallback', async () => {
    const r = new UnifiedTypeResolver();
    await r.initialize();
    expect(r.resolveToICE('weird:shape', 'pulumi').ice_type).toBe('weird.shape');
  });

  it('default branch (unknown source) returns native_type unchanged', async () => {
    const r = new UnifiedTypeResolver();
    await r.initialize();
    // @ts-expect-error -- intentionally feed a source not in the union
    const out = r.resolveToICE('Unknown::Type', 'unknown');
    expect(out.ice_type).toBe('Unknown::Type');
  });
});

// ---------------------------------------------------------------------------
// resolveToNative / hasMapping / getImplementation / getSupportedNativeTypes
// ---------------------------------------------------------------------------

describe('UnifiedTypeResolver.resolveToNative', () => {
  it('returns the native type when an ICE entry exists', async () => {
    const r = await buildLoadedResolver();
    expect(r.resolveToNative('compute.instance' as IceType, 'terraform', 'google')).toBe(
      'google_compute_instance',
    );
  });

  it('returns undefined when no ICE entry exists', async () => {
    const r = await buildLoadedResolver();
    expect(r.resolveToNative('unknown.type' as IceType, 'terraform', 'google')).toBeUndefined();
  });

  it('returns undefined when the source/provider key is missing', async () => {
    const r = await buildLoadedResolver();
    expect(r.resolveToNative('compute.instance' as IceType, 'terraform', 'aws')).toBeUndefined();
  });
});

describe('UnifiedTypeResolver.hasMapping', () => {
  it('returns true when the normalized native type is registered', async () => {
    const r = await buildLoadedResolver();
    expect(r.hasMapping('compute#instance', 'gcp')).toBe(true);
  });

  it('returns false when the type is not registered', async () => {
    const r = await buildLoadedResolver();
    expect(r.hasMapping('compute#unknown', 'gcp')).toBe(false);
  });
});

describe('UnifiedTypeResolver.getImplementation', () => {
  it('forwards to schema_provider.get_implementation', () => {
    const r = new UnifiedTypeResolver();
    providerSpy.get_implementation.mockReturnValue({ source: 'terraform', provider: 'aws', native_type: 'aws_instance' });
    const out = r.getImplementation('aws.ec2.instance' as IceType, 'terraform', 'aws');
    expect(out?.native_type).toBe('aws_instance');
    expect(providerSpy.get_implementation).toHaveBeenCalledWith('aws.ec2.instance', 'terraform', 'aws');
  });
});

describe('UnifiedTypeResolver.getSupportedNativeTypes', () => {
  it('lists only the natives matching the source prefix', async () => {
    const r = await buildLoadedResolver();
    const aws = r.getSupportedNativeTypes('aws');
    // Internally keyed as "aws:ec2.instance"
    expect(aws).toContain('ec2.instance');
    // Different source not listed
    const gcp = r.getSupportedNativeTypes('gcp');
    expect(gcp).toContain('compute.instance');
    expect(gcp).not.toContain('ec2.instance');
  });

  it('returns an empty array for a source with no entries', async () => {
    const r = new UnifiedTypeResolver();
    await r.initialize();
    expect(r.getSupportedNativeTypes('gcp')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// terraform / pulumi provider mapping (covered indirectly via fallback tests
// but also worth pinning the table of overrides explicitly)
// ---------------------------------------------------------------------------

describe('terraform provider mapping', () => {
  it.each([
    ['google_compute_instance', 'gcp.compute.instance'],
    ['aws_lambda_function', 'aws.lambda.function'],
    ['azurerm_resource_group', 'azure.resource.group'],
    ['azure_key_vault', 'azure.key.vault'],
    ['kubernetes_deployment', 'kubernetes.deployment'],
    ['k8s_deployment', 'kubernetes.deployment'],
    ['helm_release', 'kubernetes.release'],
    ['custom_provider_thing', 'custom.provider.thing'],
  ])('terraform "%s" maps to "%s"', async (input, expected) => {
    const r = new UnifiedTypeResolver();
    await r.initialize();
    expect(r.resolveToICE(input, 'terraform').ice_type).toBe(expected);
  });
});

describe('pulumi provider mapping', () => {
  it.each([
    ['gcp:compute/instance:Instance', 'gcp.compute.instance'],
    ['google-native:compute/v1:Instance', 'gcp.compute.instance'],
    ['aws:ec2/instance:Instance', 'aws.ec2.instance'],
    // No 4-part match -> fallback path: lowercase + ":/"->"."
    ['aws-native:ec2:Instance', 'aws-native.ec2.instance'],
    ['azure:compute/virtualMachine:VirtualMachine', 'azure.compute.virtualmachine'],
    ['azure-native:compute/virtualMachine:VirtualMachine', 'azure.compute.virtualmachine'],
    ['kubernetes:core/v1:Pod', 'kubernetes.core.pod'],
    ['unknown:foo/bar:Baz', 'unknown.foo.baz'],
  ])('pulumi "%s" maps to "%s"', async (input, expected) => {
    const r = new UnifiedTypeResolver();
    await r.initialize();
    expect(r.resolveToICE(input, 'pulumi').ice_type).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// singleton + factories
// ---------------------------------------------------------------------------

describe('singleton + factories', () => {
  it('get_type_resolver returns a cached instance across calls', () => {
    const a = get_type_resolver();
    const b = get_type_resolver();
    expect(a).toBe(b);
  });

  it('initialize_type_resolver initializes and returns the singleton', async () => {
    const a = await initialize_type_resolver();
    const b = get_type_resolver();
    expect(a).toBe(b);
  });

  it('create_type_resolver returns a fresh resolver', () => {
    const a = create_type_resolver();
    const b = create_type_resolver();
    expect(a).not.toBe(b);
  });
});
