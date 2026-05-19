/**
 * AWS Resource Discovery
 *
 * Two strategies for enumerating live AWS resources:
 *   - Resource Explorer (preferred — single-call, all-region)
 *   - AWS Config        (fallback when Resource Explorer isn't enabled)
 *
 * Both functions paginate via the AWS-standard `NextToken` cursor and
 * return the same `AWSResource[]` shape so the import_aws orchestrator
 * can treat them interchangeably.
 *
 * The dynamic-import via `Function('m', 'return import(m)')` pattern is
 * load-bearing — same reason as in `sdk-init.ts`.
 */

import {
  extract_name_from_arn,
  extract_account_from_arn,
  extract_region_from_arn,
  parse_tags,
} from './arn-helpers';
import type { AWSSdk } from './sdk-init';
import type { AWSImportOptions, AWSResource } from './types';

type ResolvedOptions = Required<Omit<AWSImportOptions, 'profile'>>;

/**
 * Map a Resource Explorer search hit to an `AWSResource`.
 *
 * Pure function broken out for testability — the surrounding
 * `discover_with_resource_explorer` is gated by a dynamic SDK import
 * which is not stubbable in tests.
 */
export function map_resource_explorer_hit(resource: {
  Arn?: string;
  ResourceType?: string;
  Region?: string;
  Properties?: unknown;
}): AWSResource {
  return {
    arn: resource.Arn || '',
    name: extract_name_from_arn(resource.Arn || ''),
    resource_type: resource.ResourceType || '',
    region: resource.Region || 'global',
    account_id: extract_account_from_arn(resource.Arn || ''),
    properties: (resource.Properties as Record<string, unknown>) || {},
    tags: parse_tags(resource.Properties),
  };
}

/**
 * Map an AWS Config result-string into an `AWSResource`.
 *
 * Pure function broken out for testability — the result is a
 * JSON-encoded string from Config's advanced-query DSL.  Returns
 * `null` when JSON.parse fails (legitimate — Config sometimes ships
 * malformed entries for partially-tagged resources, which the caller
 * skips).
 */
export function map_config_result(result: string): AWSResource | null {
  try {
    const resource_data = JSON.parse(result);
    return {
      arn: resource_data.arn || '',
      name: resource_data.resourceId || extract_name_from_arn(resource_data.arn || ''),
      resource_type: resource_data.resourceType || '',
      region: extract_region_from_arn(resource_data.arn || ''),
      account_id: extract_account_from_arn(resource_data.arn || ''),
      properties: resource_data.configuration || {},
      tags: resource_data.tags || {},
    };
  } catch {
    return null;
  }
}

/**
 * Discover resources via AWS Resource Explorer.
 *
 * Issues a paginated `SearchCommand({ QueryString: '*' })` against the
 * caller's Resource Explorer index.  Each result is mapped via
 * `map_resource_explorer_hit`.
 *
 * Throws if Resource Explorer isn't enabled in the account; the caller
 * (in `aws-importer.ts`) catches that and falls back to Config.
 */
export async function discover_with_resource_explorer(
  sdk: AWSSdk,
  _opts: ResolvedOptions,
): Promise<AWSResource[]> {
  const resources: AWSResource[] = [];

  const re_module_name = '@aws-sdk/client-resource-explorer-2';
  const re_mod = await Function('m', 'return import(m)')(re_module_name);

  // Search for all resources
  let next_token: string | undefined;

  do {
    const command = new re_mod.SearchCommand({
      QueryString: '*', // Search all resources
      MaxResults: 100,
      NextToken: next_token,
    });

    const response = await sdk.ResourceExplorer.send(command);

    for (const resource of response.Resources || []) {
      resources.push(map_resource_explorer_hit(resource));
    }

    next_token = response.NextToken;
  } while (next_token);

  return resources;
}

/**
 * Discover resources via AWS Config (fallback path).
 *
 * Uses Config's `SelectResourceConfigCommand` with the SQL-flavored
 * advanced-query DSL: `SELECT ... WHERE resourceType LIKE '%'`.  Each
 * result is mapped via `map_config_result`; null returns (JSON parse
 * failures) are silently skipped.
 */
export async function discover_with_config(
  sdk: AWSSdk,
  _opts: ResolvedOptions,
): Promise<AWSResource[]> {
  const resources: AWSResource[] = [];

  const config_module_name = '@aws-sdk/client-config-service';
  const config_mod = await Function('m', 'return import(m)')(config_module_name);

  // Query all resources using AWS Config's advanced query
  let next_token: string | undefined;

  do {
    const command = new config_mod.SelectResourceConfigCommand({
      Expression: "SELECT resourceId, resourceType, arn, configuration, tags WHERE resourceType LIKE '%'",
      Limit: 100,
      NextToken: next_token,
    });

    const response = await sdk.ConfigService.send(command);

    for (const result of response.Results || []) {
      const mapped = map_config_result(result);
      if (mapped) {
        resources.push(mapped);
      }
    }

    next_token = response.NextToken;
  } while (next_token);

  return resources;
}
