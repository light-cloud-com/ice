/**
 * Alibaba OSS bucket handler — `alibaba.oss.bucket`.
 *
 * Backs Storage.Bucket blocks. OSS bucket names are global; on
 * conflict the handler appends a deterministic suffix derived from
 * the canvas name (mirrors the AWS S3 quirk).
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.oss.bucket';
const SDK = '@alicloud/oss20190517';

export const oss_bucket_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const oss = await resolveClient(ctx, 'oss');
    if (!oss) return sdkMissing(name, TYPE, 'create', start, 'Alibaba OSS', SDK);
    try {
      const acl = (properties.acl as string) || 'private';
      await oss.putBucket({
        bucket: name,
        xOssAcl: acl,
        storageClass: (properties.storage_class as string) || 'Standard',
      });
      return ok(name, TYPE, 'create', start, { provider_id: name });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const oss = await resolveClient(ctx, 'oss');
    if (!oss) return err(name, TYPE, 'update', start, 'Alibaba OSS SDK not available');
    try {
      if (properties.acl) {
        await oss.putBucketAcl({ bucket: provider_id, xOssAcl: properties.acl as string });
      }
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const oss = await resolveClient(ctx, 'oss');
    if (!oss) return err(name, TYPE, 'delete', start, 'Alibaba OSS SDK not available');
    try {
      await oss.deleteBucket({ bucket: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
