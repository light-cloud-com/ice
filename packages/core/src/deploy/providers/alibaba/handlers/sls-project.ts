/**
 * Alibaba Log Service (SLS) project + logstore handler —
 * `alibaba.sls.project`.
 *
 * Backs Monitoring.Log blocks. Each project contains 1+ logstores.
 * The single-block model creates a project with a default logstore;
 * `properties.logstore_name` overrides the default name.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.sls.project';
const SDK = '@alicloud/sls20201230';

export const sls_project_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const sls = await resolveClient(ctx, 'sls');
    if (!sls) return sdkMissing(name, TYPE, 'create', start, 'Alibaba SLS', SDK);
    try {
      await sls.createProject({
        projectName: name,
        description: (properties.description as string) || `Log project managed by ice`,
      });
      const logstoreName = (properties.logstore_name as string) || `${name}-default`;
      try {
        await sls.createLogStore(name, {
          logstoreName,
          ttl: (properties.retention_days as number) ?? 30,
          shardCount: (properties.shards as number) ?? 2,
        });
      } catch (e) {
        if (!isAlibabaAlreadyExists(e)) throw e;
      }
      return ok(name, TYPE, 'create', start, { provider_id: `${name}/${logstoreName}` });
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
    const sls = await resolveClient(ctx, 'sls');
    if (!sls) return err(name, TYPE, 'delete', start, 'Alibaba SLS SDK not available');
    try {
      const [project] = provider_id.split('/');
      await sls.deleteProject(project, {});
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
