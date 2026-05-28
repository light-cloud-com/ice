/**
 * Alibaba Elastic Container Instance (ECI) handler —
 * `alibaba.eci.containerGroup`.
 *
 * Backs Compute.Container blocks (serverless container variant).
 * No node management — one ECI per canvas container.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.eci.containerGroup';
const SDK = '@alicloud/eci20180808';

export const eci_container_group_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const eci = await resolveClient(ctx, 'eci');
    if (!eci) return sdkMissing(name, TYPE, 'create', start, 'Alibaba ECI', SDK);
    try {
      const result = await eci.createContainerGroup({
        regionId: ctx.region,
        containerGroupName: name,
        securityGroupId: properties.security_group_id as string | undefined,
        vSwitchId: properties.vswitch_id as string | undefined,
        cpu: (properties.cpu_cores as number) || 1,
        memory: (properties.memory_gb as number) || 2,
        container: [
          {
            name: 'app',
            image: (properties.image as string) || '',
            cpu: (properties.cpu_cores as number) || 1,
            memory: (properties.memory_gb as number) || 2,
          },
        ],
      });
      const id = (result?.body?.containerGroupId ?? result?.body?.ContainerGroupId) as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'CreateContainerGroup returned no ContainerGroupId');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const eci = await resolveClient(ctx, 'eci');
    if (!eci) return err(name, TYPE, 'update', start, 'Alibaba ECI SDK not available');
    try {
      await eci.updateContainerGroup({
        regionId: ctx.region,
        containerGroupId: provider_id,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const eci = await resolveClient(ctx, 'eci');
    if (!eci) return err(name, TYPE, 'delete', start, 'Alibaba ECI SDK not available');
    try {
      await eci.deleteContainerGroup({ regionId: ctx.region, containerGroupId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
