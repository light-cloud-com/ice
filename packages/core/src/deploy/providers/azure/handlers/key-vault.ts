/**
 * Azure Key Vault handler — `azure.keyvault.vault`.
 *
 * Backs the canvas `Security.Secret` (and `Security.Certificate`)
 * blocks. The vault itself is provisioned here; individual secret
 * values stay operator-supplied — ICE never writes secret values
 * (mirrors the AWS Secrets Manager + GCP Secret Manager contract).
 *
 * Vault name constraints: 3-24 chars, alphanumeric + hyphens,
 * globally unique. Extractor / live-test caller should sanitise.
 *
 * Certificate provisioning path: `properties.certificates` (array of
 * `{ name, contentType, policy? }`) is reserved for a follow-on
 * implementation that uses `@azure/keyvault-certificates` (data
 * plane) rather than the management plane SDK. Today the handler
 * accepts the array and logs each entry for visibility; actual
 * certificate creation requires either an operator-supplied PFX or
 * a self-signed policy invocation against the vault URL, which lands
 * in a separate handler so the management/data plane split stays
 * clean.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.keyvault.vault';
const SDK = '@azure/arm-keyvault';

export const key_vault_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('keyvault') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Key Vault', SDK);

    const tenant_id = (properties.tenant_id as string) || ctx.tenant_id;
    if (!tenant_id) {
      return err(name, TYPE, 'create', start, 'Key Vault requires properties.tenant_id (Azure AD tenant)');
    }

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const location = (properties.location as string) || ctx.location;

      const result = await client.vaults.beginCreateOrUpdateAndWait(resource_group, name, {
        location,
        properties: {
          tenantId: tenant_id,
          sku: { family: 'A', name: (properties.sku as string) || 'standard' },
          accessPolicies: (properties.access_policies as unknown[]) ?? [],
          enableRbacAuthorization: properties.enable_rbac_authorization !== false,
          enabledForDeployment: properties.enabled_for_deployment === true,
          enabledForDiskEncryption: properties.enabled_for_disk_encryption === true,
          enabledForTemplateDeployment: properties.enabled_for_template_deployment === true,
          enableSoftDelete: properties.enable_soft_delete !== false,
          softDeleteRetentionInDays: (properties.soft_delete_retention_days as number) ?? 7,
          enablePurgeProtection: properties.enable_purge_protection === true ? true : undefined,
        },
        tags: properties.tags as Record<string, string>,
      });
      // Surface each certificate canvas entry so the operator can see
      // what the data-plane provisioning step will eventually
      // consume. Actual creation deferred (see file docstring).
      const certificates = (properties.certificates as Array<{ name?: string }> | undefined) ?? [];
      for (const cert of certificates) {
        if (cert?.name) {
          ctx.on_log?.(`Key Vault certificate "${cert.name}" wired (provision via data plane after vault is ready).`);
        }
      }

      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('keyvault') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Key Vault SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.vaults.update(resource_group, name, {
        properties: {
          enableRbacAuthorization: properties.enable_rbac_authorization,
          enableSoftDelete: properties.enable_soft_delete,
          softDeleteRetentionInDays: properties.soft_delete_retention_days,
        },
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('keyvault') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Key Vault SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.vaults.delete(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
