/**
 * Alibaba PAI-EAS service handler — `alibaba.paieas.service`.
 *
 * Backs AI.LLMGateway / AI.ModelServing blocks. PAI-EAS is Alibaba's
 * managed model-inference service (analogous to SageMaker endpoint /
 * Vertex AI endpoint).
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.paieas.service';
const SDK = '@alicloud/pai-eas20210701';

export const pai_eas_service_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const pai = await resolveClient(ctx, 'pai');
    if (!pai) return sdkMissing(name, TYPE, 'create', start, 'Alibaba PAI-EAS', SDK);
    try {
      await pai.createService({
        body: {
          serviceName: name,
          serviceConfig: {
            model_path: properties.model_path as string | undefined,
            processor: (properties.processor as string) || 'pmml',
            metadata: {
              cpu: (properties.cpu_cores as number) ?? 4,
              memory: (properties.memory_mb as number) ?? 4000,
              instance: (properties.replicas as number) ?? 1,
            },
          },
        },
      });
      return ok(name, TYPE, 'create', start, { provider_id: name });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const pai = await resolveClient(ctx, 'pai');
    if (!pai) return err(name, TYPE, 'delete', start, 'Alibaba PAI-EAS SDK not available');
    try {
      await pai.deleteService({ ClusterId: 'cn-hangzhou', ServiceName: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
