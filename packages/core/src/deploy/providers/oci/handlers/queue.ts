/**
 * OCI Queue handler — `oci.queue.queue`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.queue.queue';
const SDK = 'oci-queue';

export const queue_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const q = await resolveClient(ctx, 'queue');
    if (!q) return sdkMissing(name, TYPE, 'create', start, 'OCI Queue', SDK);
    try {
      const result = await q.createQueue({
        createQueueDetails: {
          compartmentId: ctx.compartment_id,
          displayName: name,
          retentionInSeconds: (properties.retention_sec as number) ?? 604800,
          visibilityInSeconds: (properties.visibility_sec as number) ?? 30,
          timeoutInSeconds: (properties.poll_timeout_sec as number) ?? 30,
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const wrId = result?.opcWorkRequestId as string | undefined;
      return ok(name, TYPE, 'create', start, { provider_id: wrId ?? name });
    } catch (error) {
      if (isOciAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const q = await resolveClient(ctx, 'queue');
    if (!q) return err(name, TYPE, 'delete', start, 'OCI Queue SDK not available');
    try {
      await q.deleteQueue({ queueId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
