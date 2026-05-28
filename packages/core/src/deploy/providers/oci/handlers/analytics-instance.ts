/**
 * OCI Analytics Cloud instance handler — `oci.analytics.instance`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.analytics.instance';
const SDK = 'oci-analytics';

export const analytics_instance_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const an = await resolveClient(ctx, 'analytics');
    if (!an) return sdkMissing(name, TYPE, 'create', start, 'OCI Analytics', SDK);
    try {
      const result = await an.createAnalyticsInstance({
        createAnalyticsInstanceDetails: {
          compartmentId: ctx.compartment_id,
          name,
          featureSet: (properties.feature_set as string) || 'ENTERPRISE_ANALYTICS',
          capacity: {
            capacityType: (properties.capacity_type as string) || 'OLPU_COUNT',
            capacityValue: (properties.capacity as number) ?? 2,
          },
          licenseType: (properties.license_type as string) || 'LICENSE_INCLUDED',
          idcsAccessToken: (properties.idcs_access_token as string) ?? '',
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
    const an = await resolveClient(ctx, 'analytics');
    if (!an) return err(name, TYPE, 'delete', start, 'OCI Analytics SDK not available');
    try {
      await an.deleteAnalyticsInstance({ analyticsInstanceId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
