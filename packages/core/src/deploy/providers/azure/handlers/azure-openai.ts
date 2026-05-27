/**
 * Azure OpenAI handler — `azure.cognitiveservices.account`.
 *
 * Backs AI.LLMGateway on Azure (parallel to AWS Bedrock and GCP Vertex
 * AI). Creates a Cognitive Services account with `kind: 'OpenAI'`,
 * which provisions the underlying capacity. Model deployments inside
 * the account (e.g. `gpt-4o-mini`) are provisioned separately via
 * canvas sub-blocks in Phase B4.
 *
 * Standard S0 SKU — the only tier that supports OpenAI today.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.cognitiveservices.account';
const SDK = '@azure/arm-cognitiveservices';

export const azure_openai_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('cognitiveservices') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Azure OpenAI', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const result = await client.accounts.beginCreateAndWait(resource_group, name, {
        location: (properties.location as string) || ctx.location,
        kind: (properties.kind as string) || 'OpenAI',
        sku: { name: (properties.sku_name as string) || 'S0' },
        properties: {
          customSubDomainName: (properties.custom_subdomain as string) || name,
          publicNetworkAccess: (properties.public_network_access as string) || 'Enabled',
        },
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('cognitiveservices') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Azure OpenAI SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.accounts.beginUpdateAndWait(resource_group, name, {
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('cognitiveservices') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Azure OpenAI SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.accounts.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
