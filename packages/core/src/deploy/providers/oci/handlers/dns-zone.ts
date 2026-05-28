/**
 * OCI DNS Zone handler — `oci.dns.zone`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.dns.zone';
const SDK = 'oci-dns';

export const dns_zone_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const dns = await resolveClient(ctx, 'dns');
    if (!dns) return sdkMissing(name, TYPE, 'create', start, 'OCI DNS', SDK);
    try {
      const result = await dns.createZone({
        createZoneDetails: {
          compartmentId: ctx.compartment_id,
          name,
          zoneType: (properties.zone_type as string) || 'PRIMARY',
          scope: (properties.scope as string) || 'GLOBAL',
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const id = result?.zone?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createZone returned no id');
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
    const dns = await resolveClient(ctx, 'dns');
    if (!dns) return err(name, TYPE, 'delete', start, 'OCI DNS SDK not available');
    try {
      await dns.deleteZone({ zoneNameOrId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
