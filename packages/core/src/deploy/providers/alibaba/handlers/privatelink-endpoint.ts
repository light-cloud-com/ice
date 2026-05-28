/**
 * Alibaba PrivateLink endpoint handler — `alibaba.privatelink.endpoint`.
 *
 * Backs Network.PrivateNetwork blocks. Connects a VPC to a service
 * (RDS, OSS, ack, …) over the Alibaba backbone with no Internet hop.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.privatelink.endpoint';
const SDK = '@alicloud/privatelink20200415';

export const privatelink_endpoint_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const pl = await resolveClient(ctx, 'privatelink');
    if (!pl) return sdkMissing(name, TYPE, 'create', start, 'Alibaba PrivateLink', SDK);
    try {
      const result = await pl.createVpcEndpoint({
        regionId: ctx.region,
        endpointName: name,
        vpcId: properties.vpc_id as string | undefined,
        serviceId: properties.service_id as string | undefined,
        serviceName: properties.service_name as string | undefined,
      });
      const id = (result?.body?.endpointId ?? result?.body?.EndpointId) as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'CreateVpcEndpoint returned no EndpointId');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, ctx) {
    const start = Date.now();
    const pl = await resolveClient(ctx, 'privatelink');
    if (!pl) return err(name, TYPE, 'update', start, 'Alibaba PrivateLink SDK not available');
    try {
      await pl.updateVpcEndpointAttribute({ endpointId: provider_id, endpointName: name });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const pl = await resolveClient(ctx, 'privatelink');
    if (!pl) return err(name, TYPE, 'delete', start, 'Alibaba PrivateLink SDK not available');
    try {
      await pl.deleteVpcEndpoint({ endpointId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
