/**
 * Alibaba OpenSearch app handler — `alibaba.opensearch.app`.
 *
 * Backs Analytics.Search blocks. OpenSearch on Alibaba is a managed
 * search engine (separate product from Elasticsearch Service).
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.opensearch.app';
const SDK = '@alicloud/opensearch20171225';

export const opensearch_app_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const os = await resolveClient(ctx, 'opensearch');
    if (!os) return sdkMissing(name, TYPE, 'create', start, 'Alibaba OpenSearch', SDK);
    try {
      const result = await os.createApp((properties.group_id as string) || name, {
        description: (properties.description as string) || `Search app managed by ice`,
        domain: properties.schema as unknown as Record<string, unknown> | undefined,
      });
      const id = (result?.body?.result?.id ?? result?.body?.id) as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'CreateApp returned no Id');
      return ok(name, TYPE, 'create', start, { provider_id: String(id) });
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
    const os = await resolveClient(ctx, 'opensearch');
    if (!os) return err(name, TYPE, 'delete', start, 'Alibaba OpenSearch SDK not available');
    try {
      await os.removeApp(name, provider_id);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
