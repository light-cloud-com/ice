/**
 * OCI Vault secret handler — `oci.vault.secret`.
 *
 * Requires both a vault OCID and a KMS key OCID for encryption. The
 * canvas wiring typically links a sibling Security.Vault block.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.vault.secret';
const SDK = 'oci-vault';

export const vault_secret_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const vault = await resolveClient(ctx, 'vault');
    if (!vault) return sdkMissing(name, TYPE, 'create', start, 'OCI Vault', SDK);
    if (!properties.vault_id || !properties.kms_key_id) {
      return err(name, TYPE, 'create', start, 'Vault secret requires properties.vault_id and properties.kms_key_id');
    }
    try {
      const value = (properties.value as string) ?? '';
      const result = await vault.createSecret({
        createSecretDetails: {
          compartmentId: ctx.compartment_id,
          secretName: name,
          vaultId: properties.vault_id as string,
          keyId: properties.kms_key_id as string,
          secretContent: { contentType: 'BASE64', content: Buffer.from(value).toString('base64') },
          description: (properties.description as string) || 'Managed by ice',
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const id = result?.secret?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createSecret returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isOciAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const vault = await resolveClient(ctx, 'vault');
    if (!vault) return err(name, TYPE, 'update', start, 'OCI Vault SDK not available');
    try {
      if (properties.value !== undefined) {
        await vault.updateSecret({
          secretId: provider_id,
          updateSecretDetails: {
            secretContent: {
              contentType: 'BASE64',
              content: Buffer.from(properties.value as string).toString('base64'),
            },
          },
        });
      }
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const vault = await resolveClient(ctx, 'vault');
    if (!vault) return err(name, TYPE, 'delete', start, 'OCI Vault SDK not available');
    try {
      const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString();
      await vault.scheduleSecretDeletion({
        secretId: provider_id,
        scheduleSecretDeletionDetails: { timeOfDeletion: tomorrow },
      });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
