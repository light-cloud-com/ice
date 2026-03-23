/**
 * Cloud Storage Handler
 *
 * Handles: gcp.storage.bucket
 */

import { SERVICE_NAMES, sdk_not_available, sdk_not_available_short } from '../messages.js';
import type { ResourceDeployResult } from '../../../types.js';
import type { GCPResourceHandler } from '../types.js';

function result(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  overrides: Partial<ResourceDeployResult> = {},
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type: 'gcp.storage.bucket',
    action,
    success: true,
    duration_ms: Date.now() - start,
    ...overrides,
  };
}

function fail(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  error: string,
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type: 'gcp.storage.bucket',
    action,
    success: false,
    error,
    duration_ms: Date.now() - start,
  };
}

export const cloud_storage_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();

    try {
      const storage = ctx.clients.get('storage') as any;
      if (!storage) return fail(name, 'create', start, sdk_not_available(SERVICE_NAMES.CLOUD_STORAGE, 'storage'));

      const location = (properties.location as string) || 'US';
      const storage_class = (properties.storage_class as string) || 'STANDARD';

      await storage.createBucket(name, {
        location,
        storageClass: storage_class,
        labels: properties.labels || {},
        versioning: properties.versioning ? { enabled: true } : undefined,
      });

      return result(name, 'create', start, { provider_id: `gs://${name}` });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();

    try {
      const storage = ctx.clients.get('storage') as any;
      if (!storage) return fail(name, 'update', start, sdk_not_available_short(SERVICE_NAMES.CLOUD_STORAGE));

      const bucket = storage.bucket(name);

      if (properties.labels) {
        await bucket.setLabels(properties.labels);
      }
      if (properties.lifecycle) {
        await bucket.setMetadata({ lifecycle: properties.lifecycle });
      }
      if (properties.versioning !== undefined) {
        await bucket.setMetadata({ versioning: { enabled: !!properties.versioning } });
      }

      return result(name, 'update', start, { provider_id });
    } catch (error) {
      return fail(name, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();

    try {
      const storage = ctx.clients.get('storage') as any;
      if (!storage) return fail(name, 'delete', start, sdk_not_available_short(SERVICE_NAMES.CLOUD_STORAGE));

      const bucket = storage.bucket(name);
      await bucket.deleteFiles({ force: true });
      await bucket.delete();

      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
