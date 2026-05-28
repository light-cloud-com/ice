/**
 * OCI Service Gateway handler (PrivateLink-equivalent) —
 * `oci.core.privateaccessgateway`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.core.privateaccessgateway';
const SDK = 'oci-core';

export const core_privateaccessgateway_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const vn = await resolveClient(ctx, 'vnclient');
    if (!vn) return sdkMissing(name, TYPE, 'create', start, 'OCI VirtualNetwork', SDK);
    if (!properties.vcn_id) return err(name, TYPE, 'create', start, 'ServiceGateway requires properties.vcn_id');
    try {
      const result = await vn.createServiceGateway({
        createServiceGatewayDetails: {
          compartmentId: ctx.compartment_id,
          displayName: name,
          vcnId: properties.vcn_id as string,
          services: (properties.services as { serviceId: string }[]) ?? [],
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const id = result?.serviceGateway?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createServiceGateway returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isOciAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, _properties, _current, ctx) {
    const start = Date.now();
    const vn = await resolveClient(ctx, 'vnclient');
    if (!vn) return err(name, TYPE, 'update', start, 'OCI VirtualNetwork SDK not available');
    try {
      await vn.updateServiceGateway({
        serviceGatewayId: provider_id,
        updateServiceGatewayDetails: { displayName: name },
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const vn = await resolveClient(ctx, 'vnclient');
    if (!vn) return err(name, TYPE, 'delete', start, 'OCI VirtualNetwork SDK not available');
    try {
      await vn.deleteServiceGateway({ serviceGatewayId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
