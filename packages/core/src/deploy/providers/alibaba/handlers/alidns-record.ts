/**
 * Alibaba Cloud DNS record handler — `alibaba.alidns.domainRecord`.
 *
 * Backs Network.CustomDomain blocks. CNAME / A / AAAA records.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.alidns.domainRecord';
const SDK = '@alicloud/alidns20150109';

export const alidns_record_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const alidns = await resolveClient(ctx, 'alidns');
    if (!alidns) return sdkMissing(name, TYPE, 'create', start, 'Alibaba Cloud DNS', SDK);
    if (!properties.domain) return err(name, TYPE, 'create', start, 'Domain record requires properties.domain');
    try {
      const result = await alidns.addDomainRecord({
        domainName: properties.domain as string,
        RR: (properties.subdomain as string) || '@',
        type: (properties.record_type as string) || 'A',
        value: (properties.value as string) || '127.0.0.1',
        TTL: (properties.ttl_sec as number) || 600,
      });
      const recordId = (result?.body?.recordId ?? result?.body?.RecordId) as string | undefined;
      if (!recordId) return err(name, TYPE, 'create', start, 'AddDomainRecord returned no RecordId');
      return ok(name, TYPE, 'create', start, { provider_id: recordId });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const alidns = await resolveClient(ctx, 'alidns');
    if (!alidns) return err(name, TYPE, 'update', start, 'Alibaba Cloud DNS SDK not available');
    try {
      await alidns.updateDomainRecord({
        recordId: provider_id,
        RR: (properties.subdomain as string) || '@',
        type: (properties.record_type as string) || 'A',
        value: properties.value as string,
        TTL: properties.ttl_sec as number | undefined,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const alidns = await resolveClient(ctx, 'alidns');
    if (!alidns) return err(name, TYPE, 'delete', start, 'Alibaba Cloud DNS SDK not available');
    try {
      await alidns.deleteDomainRecord({ recordId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
