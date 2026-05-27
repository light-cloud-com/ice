/**
 * Azure Resource Group bootstrap.
 *
 * Every Azure resource lives inside a resource group. Most ICE
 * canvases don't model the resource group as a separate block — the
 * deploy engine creates an `ice-{appName}-rg` on the fly via this
 * helper. Operator-supplied `resource_group` on the deploy options
 * wins.
 *
 * The helper is idempotent: GetByName first, CreateOrUpdate only
 * when the group is absent.
 */

import { load_azure_sdk } from './sdk-loader';
import type { AzureHandlerContext } from './types';

export async function ensure_resource_group(ctx: AzureHandlerContext): Promise<string> {
  const client = ctx.clients.get('resources') as any;
  if (!client) {
    throw new Error('Azure Resources SDK not available — install @azure/arm-resources');
  }
  const sdk = await load_azure_sdk('@azure/arm-resources');
  if (!sdk) {
    throw new Error('Azure Resources SDK not available — install @azure/arm-resources');
  }

  const name = ctx.resource_group;
  try {
    const exists = await client.resourceGroups.checkExistence(name);
    if (exists?.body === true || exists === true) return name;
  } catch {
    // Some SDK versions throw on missing — fall through to create.
  }

  await client.resourceGroups.createOrUpdate(name, { location: ctx.location });
  ctx.on_log?.(`Created resource group ${name} in ${ctx.location}`);
  return name;
}

/**
 * Extract the resource group name out of an Azure resource id.
 * Resource ids follow the shape:
 *   /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.<rp>/<type>/<name>
 */
export function extract_resource_group_from_id(provider_id: string, fallback: string): string {
  const match = provider_id.match(/resourceGroups\/([^/]+)/i);
  return match && match[1] ? match[1] : fallback;
}
