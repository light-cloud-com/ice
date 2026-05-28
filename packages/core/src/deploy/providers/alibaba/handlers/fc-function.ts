/**
 * Alibaba Function Compute (FC) v3 handler — `alibaba.fc.function`.
 *
 * Backs Compute.ServerlessFunction blocks. Default runtime nodejs20;
 * a `properties.runtime` override picks any FC-supported runtime
 * (python3.10, java17, custom-container, …).
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.fc.function';
const SDK = '@alicloud/fc20230330';

export const fc_function_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const fc = await resolveClient(ctx, 'fc');
    if (!fc) return sdkMissing(name, TYPE, 'create', start, 'Alibaba FC', SDK);
    try {
      const code = (properties.code_zip_base64 as string) ?? '';
      await fc.createFunction({
        functionName: name,
        body: {
          functionName: name,
          runtime: (properties.runtime as string) || 'nodejs20',
          handler: (properties.handler as string) || 'index.handler',
          memorySize: (properties.memory_mb as number) || 512,
          timeout: (properties.timeout_sec as number) || 30,
          code: code ? { zipFile: code } : undefined,
          environmentVariables: (properties.env_vars as Record<string, string>) ?? {},
        },
      });
      return ok(name, TYPE, 'create', start, { provider_id: name });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const fc = await resolveClient(ctx, 'fc');
    if (!fc) return err(name, TYPE, 'update', start, 'Alibaba FC SDK not available');
    try {
      await fc.updateFunction({
        functionName: provider_id,
        body: {
          memorySize: properties.memory_mb as number | undefined,
          timeout: properties.timeout_sec as number | undefined,
          environmentVariables: (properties.env_vars as Record<string, string>) ?? undefined,
        },
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const fc = await resolveClient(ctx, 'fc');
    if (!fc) return err(name, TYPE, 'delete', start, 'Alibaba FC SDK not available');
    try {
      await fc.deleteFunction({ functionName: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
