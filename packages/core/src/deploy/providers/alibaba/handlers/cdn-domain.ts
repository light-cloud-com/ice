/**
 * Alibaba CDN domain handler — `alibaba.cdn.domain`.
 *
 * Backs Compute.StaticSite / Compute.SSRSite (with OSS static-website
 * upstream) blocks. Mirrors AWS CloudFront / GCP Cloud CDN role.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.cdn.domain';
const SDK = '@alicloud/cdn20180510';

export const cdn_domain_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const cdn = await resolveClient(ctx, 'cdn');
    if (!cdn) return sdkMissing(name, TYPE, 'create', start, 'Alibaba CDN', SDK);
    if (!properties.origin) return err(name, TYPE, 'create', start, 'CDN domain requires properties.origin');
    try {
      await cdn.addCdnDomain({
        domainName: name,
        cdnType: (properties.cdn_type as string) || 'web',
        sources: JSON.stringify([{ type: 'oss', content: properties.origin as string, port: 80, priority: 20 }]),
        scope: (properties.scope as string) || 'overseas',
      });
      return ok(name, TYPE, 'create', start, { provider_id: name });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const cdn = await resolveClient(ctx, 'cdn');
    if (!cdn) return err(name, TYPE, 'update', start, 'Alibaba CDN SDK not available');
    try {
      if (properties.origin) {
        await cdn.modifyCdnDomain({
          domainName: provider_id,
          sources: JSON.stringify([{ type: 'oss', content: properties.origin as string, port: 80, priority: 20 }]),
        });
      }
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const cdn = await resolveClient(ctx, 'cdn');
    if (!cdn) return err(name, TYPE, 'delete', start, 'Alibaba CDN SDK not available');
    try {
      await cdn.deleteCdnDomain({ domainName: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
