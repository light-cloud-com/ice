/**
 * Alibaba MaxCompute project handler — `alibaba.maxcompute.project`.
 *
 * Backs Database.DataWarehouse blocks. MaxCompute is Alibaba's
 * BigQuery / Redshift equivalent.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.maxcompute.project';
const SDK = '@alicloud/maxcompute20220104';

export const maxcompute_project_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const mc = await resolveClient(ctx, 'maxcompute');
    if (!mc) return sdkMissing(name, TYPE, 'create', start, 'Alibaba MaxCompute', SDK);
    try {
      await mc.createProject({
        body: {
          name,
          comment: (properties.description as string) || `Project managed by ice`,
          type: 'managed',
          properties: { allowFullScan: 'true' },
          productType: 'PAYASYOUGO',
          defaultQuota: properties.default_quota as string | undefined,
        },
      });
      return ok(name, TYPE, 'create', start, { provider_id: name });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const mc = await resolveClient(ctx, 'maxcompute');
    if (!mc) return err(name, TYPE, 'delete', start, 'Alibaba MaxCompute SDK not available');
    try {
      await mc.deleteProject(provider_id, {});
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
