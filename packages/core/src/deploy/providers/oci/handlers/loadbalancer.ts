/**
 * OCI Load Balancer handler — `oci.loadbalancer.loadbalancer`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.loadbalancer.loadbalancer';
const SDK = 'oci-loadbalancer';

export const loadbalancer_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const lb = await resolveClient(ctx, 'loadbalancer');
    if (!lb) return sdkMissing(name, TYPE, 'create', start, 'OCI Load Balancer', SDK);
    try {
      const result = await lb.createLoadBalancer({
        createLoadBalancerDetails: {
          compartmentId: ctx.compartment_id,
          displayName: name,
          shapeName: (properties.shape as string) || 'flexible',
          shapeDetails: { minimumBandwidthInMbps: 10, maximumBandwidthInMbps: 100 },
          isPrivate: (properties.is_private as boolean) ?? false,
          subnetIds: (properties.subnet_ids as string[]) ?? [],
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
    const lb = await resolveClient(ctx, 'loadbalancer');
    if (!lb) return err(name, TYPE, 'update', start, 'OCI Load Balancer SDK not available');
    try {
      await lb.updateLoadBalancer({
        loadBalancerId: provider_id,
        updateLoadBalancerDetails: { displayName: name },
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const lb = await resolveClient(ctx, 'loadbalancer');
    if (!lb) return err(name, TYPE, 'delete', start, 'OCI Load Balancer SDK not available');
    try {
      await lb.deleteLoadBalancer({ loadBalancerId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
