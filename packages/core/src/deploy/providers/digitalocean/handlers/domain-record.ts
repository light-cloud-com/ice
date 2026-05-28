/**
 * DigitalOcean DNS record handler — `digitalocean.domain.record`.
 */

import { err, isDoAlreadyExists, isDoNotFound, ok, sdkMissing } from './_result';
import type { DOResourceHandler } from '../types';

const TYPE = 'digitalocean.domain.record';
const SDK = 'dots-wrapper';

export const domain_record_handler: DOResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    if (!ctx.client) return sdkMissing(name, TYPE, 'create', start, 'DigitalOcean', SDK);
    if (!properties.domain) return err(name, TYPE, 'create', start, 'DNS record requires properties.domain');
    try {
      const result = await ctx.client.domain.createDomainRecord({
        domain_name: properties.domain as string,
        type: (properties.record_type as string) || 'A',
        name: (properties.subdomain as string) || '@',
        data: (properties.value as string) || '127.0.0.1',
        ttl: (properties.ttl_sec as number) ?? 1800,
      });
      const id = result?.data?.domain_record?.id as number | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createDomainRecord returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: `${properties.domain}/${id}` });
    } catch (error) {
      if (isDoAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    if (!ctx.client) return err(name, TYPE, 'update', start, 'DO SDK not available');
    try {
      const [domain, idStr] = provider_id.split('/');
      await ctx.client.domain.updateDomainRecord({
        domain_name: domain,
        domain_record_id: Number(idStr),
        data: properties.value as string | undefined,
        ttl: properties.ttl_sec as number | undefined,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    if (!ctx.client) return err(name, TYPE, 'delete', start, 'DO SDK not available');
    try {
      const [domain, idStr] = provider_id.split('/');
      await ctx.client.domain.deleteDomainRecord({ domain_name: domain, domain_record_id: Number(idStr) });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isDoNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
