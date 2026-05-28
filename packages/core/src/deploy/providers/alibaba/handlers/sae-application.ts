/**
 * Alibaba SAE (Serverless App Engine) handler — `alibaba.sae.application`.
 *
 * Backs Compute.Container blocks. SAE manages the underlying compute
 * (Spring Boot / Tomcat / Docker image) without exposing nodes.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.sae.application';
const SDK = '@alicloud/sae20190506';

export const sae_application_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const sae = await resolveClient(ctx, 'sae');
    if (!sae) return sdkMissing(name, TYPE, 'create', start, 'Alibaba SAE', SDK);
    try {
      const result = await sae.createApplication({
        AppName: name,
        NamespaceId: (properties.namespace_id as string) || `${ctx.region}:default`,
        VSwitchId: properties.vswitch_id as string | undefined,
        VpcId: properties.vpc_id as string | undefined,
        PackageType: 'Image',
        ImageUrl: (properties.image as string) || '',
        Replicas: (properties.replicas as number) ?? 1,
        Cpu: (properties.cpu_milli as number) ?? 1000,
        Memory: (properties.memory_mb as number) ?? 2048,
      });
      const appId = (result?.body?.Data?.AppId ?? result?.body?.appId) as string | undefined;
      if (!appId) return err(name, TYPE, 'create', start, 'CreateApplication returned no AppId');
      return ok(name, TYPE, 'create', start, { provider_id: appId });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const sae = await resolveClient(ctx, 'sae');
    if (!sae) return err(name, TYPE, 'update', start, 'Alibaba SAE SDK not available');
    try {
      await sae.deployApplication({
        AppId: provider_id,
        ImageUrl: properties.image as string | undefined,
        Replicas: properties.replicas as number | undefined,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const sae = await resolveClient(ctx, 'sae');
    if (!sae) return err(name, TYPE, 'delete', start, 'Alibaba SAE SDK not available');
    try {
      await sae.deleteApplication({ AppId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
