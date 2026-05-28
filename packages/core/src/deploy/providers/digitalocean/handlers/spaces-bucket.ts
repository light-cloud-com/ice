/**
 * DigitalOcean Spaces bucket handler — `digitalocean.spaces.bucket`.
 *
 * Spaces is S3-compatible — we reuse `@aws-sdk/client-s3` against the
 * `<region>.digitaloceanspaces.com` endpoint via `ctx.spaces_client`.
 */

import { err, isDoNotFound, ok, sdkMissing } from './_result';
import type { DOResourceHandler } from '../types';

const TYPE = 'digitalocean.spaces.bucket';
const SDK = '@aws-sdk/client-s3 (Spaces)';

export const spaces_bucket_handler: DOResourceHandler = {
  async create(name, _properties, ctx) {
    const start = Date.now();
    if (!ctx.spaces_client) return sdkMissing(name, TYPE, 'create', start, 'DO Spaces', SDK);
    try {
      const s3 = await load_s3_commands();
      if (!s3) return err(name, TYPE, 'create', start, '@aws-sdk/client-s3 not available');
      await ctx.spaces_client.send(new s3.CreateBucketCommand({ Bucket: name }));
      return ok(name, TYPE, 'create', start, { provider_id: name });
    } catch (error) {
      const e = error as { name?: string; Code?: string };
      if (e.name === 'BucketAlreadyOwnedByYou' || e.Code === 'BucketAlreadyOwnedByYou') {
        return ok(name, TYPE, 'create', start, { provider_id: name });
      }
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    if (!ctx.spaces_client) return err(name, TYPE, 'delete', start, 'DO Spaces client not available');
    try {
      const s3 = await load_s3_commands();
      if (!s3) return err(name, TYPE, 'delete', start, '@aws-sdk/client-s3 not available');
      await ctx.spaces_client.send(new s3.DeleteBucketCommand({ Bucket: provider_id }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isDoNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

async function load_s3_commands(): Promise<any | null> {
  try {
    return await Function('m', 'return import(m)')('@aws-sdk/client-s3');
  } catch {
    return null;
  }
}
