/**
 * OCI Logging log group handler — `oci.logging.loggroup`.
 *
 * Backs Monitoring.Log. The Log Group is a logical grouping; per-source
 * Log resources are sibling blocks.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.logging.loggroup';
const SDK = 'oci-logging';

export const logging_loggroup_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const lg = await resolveClient(ctx, 'logging');
    if (!lg) return sdkMissing(name, TYPE, 'create', start, 'OCI Logging', SDK);
    try {
      const result = await lg.createLogGroup({
        createLogGroupDetails: {
          compartmentId: ctx.compartment_id,
          displayName: name,
          description: (properties.description as string) || `Log group managed by ice`,
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
  async update(name, provider_id, _properties, _current, ctx) {
    const start = Date.now();
    const lg = await resolveClient(ctx, 'logging');
    if (!lg) return err(name, TYPE, 'update', start, 'OCI Logging SDK not available');
    try {
      await lg.updateLogGroup({ logGroupId: provider_id, updateLogGroupDetails: { displayName: name } });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const lg = await resolveClient(ctx, 'logging');
    if (!lg) return err(name, TYPE, 'delete', start, 'OCI Logging SDK not available');
    try {
      await lg.deleteLogGroup({ logGroupId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
