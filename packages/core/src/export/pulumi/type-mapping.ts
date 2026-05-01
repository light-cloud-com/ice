/**
 * Pulumi Exporter — type-mapping helpers (rf-pulumi-3).
 *
 * Three resource-type helpers extracted from `pulumi-exporter.ts`
 * (pre-extraction L257-316, L577-590, L591-612). All three are pure
 * string transforms with no class-state dependency.
 *
 * The `fallback_type_mapping` provider+module table is preserved
 * VERBATIM — every key, every value, every fallthrough order. The
 * order of the three explicit branches (gcp / aws / azure) and the
 * generic fallback matters: a type starting with `gcp.` always hits
 * the gcp branch even if `provider_map[provider]` would map it
 * elsewhere. Similarly the `provider_map` for `'azurerm'` and
 * `'azure'` both map to `'azure-native'` — same behaviour as the
 * pre-extraction class.
 *
 * The `parse_resource_type` regex `^([^:]+):([^/]+)\/([^:]+):(.+)$`
 * is preserved verbatim and the underscore-substitution pattern
 * (`provider!.replace(/-/g, '_')`) is also preserved — `azure-native`
 * becomes `azure_native` for both the alias and the class path.
 *
 * The `get_package_name` table maps Pulumi provider aliases to npm
 * packages. `'azure'` and `'azure-native'` both resolve to
 * `'azure-native'`; everything else is identity unless on the table.
 */

import { to_pascal_case } from './case-utils.js';

/**
 * Fallback type mapping for common types.
 *
 * Mechanical "ICE dotted type -> Pulumi colon-and-slash type"
 * conversion when the schema-provider has no explicit mapping for
 * the (ice_type, provider) pair. The provider table maps the
 * caller's `provider` token to the canonical Pulumi provider name
 * (e.g. `'azurerm' -> 'azure-native'`).
 *
 * Returns `null` when the input is too short to map (fewer than
 * three dot-separated segments AND not in the gcp/aws/azure
 * shortcuts).
 */
export function fallback_type_mapping(ice_type: string, provider: string): string | null {
  // Map ICE provider prefixes to Pulumi providers
  const provider_map: Record<string, string> = {
    google: 'gcp',
    gcp: 'gcp',
    aws: 'aws',
    azure: 'azure-native',
    azurerm: 'azure-native',
  };

  const pulumi_provider = provider_map[provider] || provider;

  // Convert ICE type to Pulumi type
  // e.g., gcp.compute.instance -> gcp:compute/instance:Instance
  // e.g., aws.ec2.instance -> aws:ec2/instance:Instance
  if (ice_type.startsWith('gcp.')) {
    const parts = ice_type.substring(4).split('.');
    if (parts.length >= 2) {
      const module = parts[0];
      const resource = parts.slice(1).join('/');
      const className = to_pascal_case(parts[parts.length - 1] || '');
      return `${pulumi_provider}:${module}/${resource}:${className}`;
    }
  }

  if (ice_type.startsWith('aws.')) {
    const parts = ice_type.substring(4).split('.');
    if (parts.length >= 2) {
      const module = parts[0];
      const resource = parts.slice(1).join('/');
      const className = to_pascal_case(parts[parts.length - 1] || '');
      return `aws:${module}/${resource}:${className}`;
    }
  }

  if (ice_type.startsWith('azure.')) {
    const parts = ice_type.substring(6).split('.');
    if (parts.length >= 2) {
      const module = parts[0];
      const resource = parts.slice(1).join('/');
      const className = to_pascal_case(parts[parts.length - 1] || '');
      return `azure-native:${module}/${resource}:${className}`;
    }
  }

  // Generic fallback
  const parts = ice_type.split('.');
  if (parts.length >= 3) {
    const [prov, module, ...rest] = parts;
    const resource = rest.join('/');
    const className = to_pascal_case(rest[rest.length - 1] || '');
    return `${prov}:${module}/${resource}:${className}`;
  }

  return null;
}

/**
 * Get the npm package name for a Pulumi provider alias.
 *
 * Pre-extraction L577-590. `azure` and `azure-native` both resolve
 * to `'azure-native'`; unknown providers return identity (e.g.
 * `'k8s' -> 'k8s'`). Used by the TypeScript formatter to emit
 * import statements: `import * as gcp from "@pulumi/gcp";`.
 */
export function get_package_name(provider: string): string {
  const package_map: Record<string, string> = {
    gcp: 'gcp',
    aws: 'aws',
    'azure-native': 'azure-native',
    azure: 'azure-native',
    kubernetes: 'kubernetes',
  };
  return package_map[provider] || provider;
}

/**
 * Parse a Pulumi resource type into provider alias + class path.
 *
 * Format: `provider:module/resource:Class` — e.g.
 * `gcp:compute/instance:Instance` -> alias `gcp`, class_path
 * `gcp.compute.Instance`. The hyphen-to-underscore substitution
 * preserves `azure-native:storage/account:Account` ->
 * `azure_native.storage.Account` (both alias and class path
 * use the underscored form).
 *
 * The regex match peels three groups but discards the third
 * (`resource`) — the class path uses `module.className`, not
 * `module.resource.className`. This is verbatim pre-extraction
 * behaviour (L591-612); the resource segment is reconstructible
 * from the input but unused in the class-path output.
 *
 * Falls through to `{ provider_alias: 'unknown', class_path: type }`
 * for any input that doesn't match the four-group regex.
 */
export function parse_resource_type(type: string): {
  provider_alias: string;
  class_path: string;
} {
  // Format: provider:module/resource:Class
  const match = type.match(/^([^:]+):([^/]+)\/([^:]+):(.+)$/);
  if (match) {
    const [, provider, module, , className] = match;
    const provider_alias = provider!.replace(/-/g, '_');
    return {
      provider_alias,
      class_path: `${provider_alias}.${module}.${className}`,
    };
  }

  // Fallback
  return {
    provider_alias: 'unknown',
    class_path: type,
  };
}
