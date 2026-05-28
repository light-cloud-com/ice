/**
 * OCI Streaming stream handler — `oci.streaming.stream`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.streaming.stream';
const SDK = 'oci-streaming';

export const streaming_stream_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const s = await resolveClient(ctx, 'streaming');
    if (!s) return sdkMissing(name, TYPE, 'create', start, 'OCI Streaming', SDK);
    try {
      const result = await s.createStream({
        createStreamDetails: {
          compartmentId: ctx.compartment_id,
          name,
          partitions: (properties.partitions as number) ?? 1,
          retentionInHours: (properties.retention_hours as number) ?? 24,
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const id = result?.stream?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createStream returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: id });
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
    const s = await resolveClient(ctx, 'streaming');
    if (!s) return err(name, TYPE, 'delete', start, 'OCI Streaming SDK not available');
    try {
      await s.deleteStream({ streamId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
