/**
 * Tests for `pulumi/type-mapping.ts` (rf-pulumi-3).
 *
 * Pure-function helpers, hit 100% with explicit pinning of every
 * branch. Behaviour preserved verbatim from pre-extraction L257-316,
 * L577-590, L591-612 of `pulumi-exporter.ts`.
 *
 * The provider-table fallthroughs are subtle:
 *  - `fallback_type_mapping` checks `ice_type.startsWith(...)` BEFORE
 *    the generic `[prov, module, ...rest]` branch. That order matters
 *    when `provider !== ice_type.prefix` — e.g. `provider: 'gcp'` +
 *    `ice_type: 'aws.ec2.instance'` still hits the aws branch (the
 *    branch is keyed on the type, not on the option).
 *  - The provider_map override only takes effect inside the gcp
 *    branch (where the output uses `${pulumi_provider}:...`); the
 *    aws / azure branches hard-code their pulumi-provider prefix.
 *  - `parse_resource_type` discards the third regex group (the
 *    resource segment). `gcp:compute/instance:Instance` -> class
 *    path `gcp.compute.Instance` (NOT `gcp.compute.instance.Instance`).
 */
import { describe, expect, it } from 'vitest';
import {
  fallback_type_mapping,
  get_package_name,
  parse_resource_type,
} from '../type-mapping';

describe('fallback_type_mapping — provider table', () => {
  it("maps 'google' to 'gcp' inside the gcp branch", () => {
    // gcp branch reads pulumi_provider from provider_map; 'google' ->
    // 'gcp', so output prefix is 'gcp:...'.
    expect(fallback_type_mapping('gcp.compute.instance', 'google')).toBe(
      'gcp:compute/instance:Instance',
    );
  });

  it("maps 'azurerm' to 'azure-native' but only in the (generic) branch where it's read", () => {
    // The azure branch is keyed on `ice_type.startsWith('azure.')`,
    // not on the provider arg — so a `azure.storage.account` type
    // always emits the 'azure-native' prefix regardless of provider.
    expect(fallback_type_mapping('azure.storage.account', 'azurerm')).toBe(
      'azure-native:storage/account:Account',
    );
  });

  it('passes through unknown providers (identity)', () => {
    // pulumi_provider for 'k8s' is 'k8s' (not in the map)
    expect(fallback_type_mapping('k8s.apps.deployment', 'k8s')).toBe(
      'k8s:apps/deployment:Deployment',
    );
  });
});

describe('fallback_type_mapping — gcp branch', () => {
  it('converts gcp.compute.instance', () => {
    expect(fallback_type_mapping('gcp.compute.instance', 'gcp')).toBe(
      'gcp:compute/instance:Instance',
    );
  });

  it('joins multi-segment resources with /', () => {
    expect(fallback_type_mapping('gcp.compute.firewall.rule', 'gcp')).toBe(
      'gcp:compute/firewall/rule:Rule',
    );
  });

  it('uses to_pascal_case on the LAST segment for className', () => {
    expect(fallback_type_mapping('gcp.compute.snake_case_name', 'gcp')).toBe(
      'gcp:compute/snake_case_name:SnakeCaseName',
    );
  });

  it('returns null when the gcp branch has fewer than 2 segments after the prefix', () => {
    // 'gcp.compute' → parts after substring(4) = ['compute'] → len 1
    // No gcp branch fires; falls through to generic fallback (only 2 dots so generic also fails)
    expect(fallback_type_mapping('gcp.compute', 'gcp')).toBeNull();
  });

  it('respects provider_map override: provider="google" still uses gcp branch', () => {
    // The branch is keyed on ice_type prefix. provider_map maps 'google' to 'gcp'.
    expect(fallback_type_mapping('gcp.compute.instance', 'google')).toBe(
      'gcp:compute/instance:Instance',
    );
  });
});

describe('fallback_type_mapping — aws branch', () => {
  it('converts aws.ec2.instance', () => {
    expect(fallback_type_mapping('aws.ec2.instance', 'aws')).toBe('aws:ec2/instance:Instance');
  });

  it('joins multi-segment resources with /', () => {
    expect(fallback_type_mapping('aws.ec2.security.group', 'aws')).toBe(
      'aws:ec2/security/group:Group',
    );
  });

  it('hard-codes the aws prefix even when provider differs', () => {
    // The aws branch outputs 'aws:...' regardless of provider arg
    expect(fallback_type_mapping('aws.ec2.instance', 'gcp')).toBe('aws:ec2/instance:Instance');
  });
});

describe('fallback_type_mapping — azure branch', () => {
  it('converts azure.storage.account', () => {
    expect(fallback_type_mapping('azure.storage.account', 'azure')).toBe(
      'azure-native:storage/account:Account',
    );
  });

  it('hard-codes azure-native prefix even when provider differs', () => {
    expect(fallback_type_mapping('azure.storage.account', 'aws')).toBe(
      'azure-native:storage/account:Account',
    );
  });

  it('uses substring(6) — strips "azure." (6 chars) NOT "azure" (5 chars)', () => {
    // Pre-extraction L292: ice_type.substring(6) — the leading "azure." is 6 chars.
    expect(fallback_type_mapping('azure.compute.virtual_machine', 'azure')).toBe(
      'azure-native:compute/virtual_machine:VirtualMachine',
    );
  });
});

describe('fallback_type_mapping — generic branch', () => {
  it('handles 3+ segment types not matching any prefix', () => {
    expect(fallback_type_mapping('cloudflare.dns.record', 'cloudflare')).toBe(
      'cloudflare:dns/record:Record',
    );
  });

  it('joins all-but-first-two segments with /', () => {
    expect(fallback_type_mapping('cloudflare.dns.zone.record', 'cloudflare')).toBe(
      'cloudflare:dns/zone/record:Record',
    );
  });

  it('returns null for fewer than 3 segments', () => {
    expect(fallback_type_mapping('foo.bar', 'foo')).toBeNull();
    expect(fallback_type_mapping('foo', 'foo')).toBeNull();
    expect(fallback_type_mapping('', 'foo')).toBeNull();
  });
});

describe('get_package_name', () => {
  it("maps 'gcp' to 'gcp'", () => {
    expect(get_package_name('gcp')).toBe('gcp');
  });

  it("maps 'aws' to 'aws'", () => {
    expect(get_package_name('aws')).toBe('aws');
  });

  it("maps 'azure-native' to 'azure-native'", () => {
    expect(get_package_name('azure-native')).toBe('azure-native');
  });

  it("maps 'azure' to 'azure-native' (alias)", () => {
    expect(get_package_name('azure')).toBe('azure-native');
  });

  it("maps 'kubernetes' to 'kubernetes'", () => {
    expect(get_package_name('kubernetes')).toBe('kubernetes');
  });

  it('passes through unknown providers (identity)', () => {
    expect(get_package_name('cloudflare')).toBe('cloudflare');
    expect(get_package_name('digitalocean')).toBe('digitalocean');
  });

  it('handles empty string (identity)', () => {
    expect(get_package_name('')).toBe('');
  });
});

describe('parse_resource_type', () => {
  it('parses gcp:compute/instance:Instance', () => {
    expect(parse_resource_type('gcp:compute/instance:Instance')).toEqual({
      provider_alias: 'gcp',
      class_path: 'gcp.compute.Instance',
    });
  });

  it('parses aws:ec2/instance:Instance', () => {
    expect(parse_resource_type('aws:ec2/instance:Instance')).toEqual({
      provider_alias: 'aws',
      class_path: 'aws.ec2.Instance',
    });
  });

  it('substitutes hyphens with underscores in provider_alias and class_path', () => {
    expect(parse_resource_type('azure-native:storage/account:Account')).toEqual({
      provider_alias: 'azure_native',
      class_path: 'azure_native.storage.Account',
    });
  });

  it('discards the resource segment (uses module + className only)', () => {
    // Input has resource segment 'instance' but class_path is module.className
    expect(parse_resource_type('gcp:compute/instance:Instance').class_path).toBe(
      'gcp.compute.Instance',
    );
    expect(parse_resource_type('gcp:compute/firewall:Firewall').class_path).toBe(
      'gcp.compute.Firewall',
    );
  });

  it('returns unknown / type for malformed inputs (no colon)', () => {
    expect(parse_resource_type('not-a-type')).toEqual({
      provider_alias: 'unknown',
      class_path: 'not-a-type',
    });
  });

  it('returns unknown / type for inputs missing slash', () => {
    expect(parse_resource_type('gcp:compute:Instance')).toEqual({
      provider_alias: 'unknown',
      class_path: 'gcp:compute:Instance',
    });
  });

  it('returns unknown / type for empty string', () => {
    expect(parse_resource_type('')).toEqual({
      provider_alias: 'unknown',
      class_path: '',
    });
  });
});
