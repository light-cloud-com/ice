/**
 * IBM Secrets Manager secret handler — `ibm.secretsmanager.secret`.
 */

import { resolveClient } from './_client';
import { err, isIbmAlreadyExists, isIbmNotFound, ok, sdkMissing } from './_result';
import type { IBMResourceHandler } from '../types';

const TYPE = 'ibm.secretsmanager.secret';
const SDK = '@ibm-cloud/secrets-manager';

export const secretsmanager_secret_handler: IBMResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const sm = await resolveClient(ctx, 'secretsmanager');
    if (!sm) return sdkMissing(name, TYPE, 'create', start, 'IBM Secrets Manager', SDK);
    try {
      const result = await sm.createSecret({
        secretPrototype: {
          secret_type: (properties.secret_type as string) || 'arbitrary',
          name,
          payload: (properties.value as string) ?? '',
          secret_group_id: (properties.secret_group_id as string) || 'default',
          description: (properties.description as string) || 'Managed by ice',
        },
      });
      const id = result?.result?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createSecret returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isIbmAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const sm = await resolveClient(ctx, 'secretsmanager');
    if (!sm) return err(name, TYPE, 'update', start, 'IBM Secrets Manager SDK not available');
    try {
      if (properties.value !== undefined) {
        await sm.createSecretVersion({
          secretId: provider_id,
          secretVersionPrototype: { payload: properties.value as string },
        });
      }
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const sm = await resolveClient(ctx, 'secretsmanager');
    if (!sm) return err(name, TYPE, 'delete', start, 'IBM Secrets Manager SDK not available');
    try {
      await sm.deleteSecret({ id: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isIbmNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
