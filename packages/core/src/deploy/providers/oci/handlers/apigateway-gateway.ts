/**
 * OCI API Gateway handler — `oci.apigateway.gateway`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.apigateway.gateway';
const SDK = 'oci-apigateway';

export const apigateway_gateway_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const ag = await resolveClient(ctx, 'apigateway');
    if (!ag) return sdkMissing(name, TYPE, 'create', start, 'OCI API Gateway', SDK);
    if (!properties.subnet_id) return err(name, TYPE, 'create', start, 'Gateway requires properties.subnet_id');
    try {
      const result = await ag.createGateway({
        createGatewayDetails: {
          compartmentId: ctx.compartment_id,
          displayName: name,
          endpointType: (properties.endpoint_type as string) || 'PUBLIC',
          subnetId: properties.subnet_id as string,
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
    const ag = await resolveClient(ctx, 'apigateway');
    if (!ag) return err(name, TYPE, 'update', start, 'OCI API Gateway SDK not available');
    try {
      await ag.updateGateway({ gatewayId: provider_id, updateGatewayDetails: { displayName: name } });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const ag = await resolveClient(ctx, 'apigateway');
    if (!ag) return err(name, TYPE, 'delete', start, 'OCI API Gateway SDK not available');
    try {
      await ag.deleteGateway({ gatewayId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
