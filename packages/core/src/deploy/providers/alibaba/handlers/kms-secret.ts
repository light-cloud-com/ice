/**
 * Alibaba KMS secret handler — `alibaba.kms.secret`.
 *
 * Backs Security.Secret blocks. Stores opaque text or JSON in KMS;
 * mirrors AWS Secrets Manager / GCP Secret Manager / Azure Key Vault
 * conventions.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.kms.secret';
const SDK = '@alicloud/kms20160120';

export const kms_secret_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const kms = await resolveClient(ctx, 'kms');
    if (!kms) return sdkMissing(name, TYPE, 'create', start, 'Alibaba KMS', SDK);
    try {
      await kms.createSecret({
        secretName: name,
        secretData: (properties.value as string) ?? '',
        versionId: 'v1',
        description: (properties.description as string) || `Secret managed by ice`,
      });
      return ok(name, TYPE, 'create', start, { provider_id: name });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const kms = await resolveClient(ctx, 'kms');
    if (!kms) return err(name, TYPE, 'update', start, 'Alibaba KMS SDK not available');
    try {
      if (properties.value !== undefined) {
        await kms.putSecretValue({
          secretName: provider_id,
          secretData: properties.value as string,
          versionId: `v${Date.now()}`,
        });
      }
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const kms = await resolveClient(ctx, 'kms');
    if (!kms) return err(name, TYPE, 'delete', start, 'Alibaba KMS SDK not available');
    try {
      await kms.deleteSecret({ secretName: provider_id, forceDeleteWithoutRecovery: true });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
