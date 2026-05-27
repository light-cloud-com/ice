/**
 * Azure Machine Learning workspace handler — `azure.machinelearning.workspace`.
 *
 * Backs AI.ModelServing on Azure (parallel to AWS SageMaker and GCP
 * Vertex AI). The workspace is the top-level container; individual
 * deployments + endpoints + compute clusters land under it via canvas
 * sub-blocks in Phase B4.
 *
 * Workspace creation requires a storage account, key vault, app
 * insights, and container registry. The handler accepts them via
 * properties; auto-bootstrap is a Phase B4 quirk so dev environments
 * can stand up a workspace with one click.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.machinelearning.workspace';
const SDK = '@azure/arm-machinelearning';

export const azure_ml_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ml') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Azure ML', SDK);

    const storage_id = properties.storage_account_id as string | undefined;
    const keyvault_id = properties.key_vault_id as string | undefined;
    const appinsights_id = properties.app_insights_id as string | undefined;
    if (!storage_id || !keyvault_id || !appinsights_id) {
      return err(
        name,
        TYPE,
        'create',
        start,
        'Azure ML workspace requires storage_account_id, key_vault_id, and app_insights_id (wire those blocks on canvas).',
      );
    }

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const result = await client.workspaces.beginCreateOrUpdateAndWait(resource_group, name, {
        location: (properties.location as string) || ctx.location,
        identity: { type: 'SystemAssigned' },
        storageAccount: storage_id,
        keyVault: keyvault_id,
        applicationInsights: appinsights_id,
        containerRegistry: (properties.container_registry_id as string) || undefined,
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ml') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Azure ML SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.workspaces.beginUpdateAndWait(resource_group, name, {
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ml') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Azure ML SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.workspaces.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
