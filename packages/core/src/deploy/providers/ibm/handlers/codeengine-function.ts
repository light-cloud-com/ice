/**
 * IBM Code Engine function handler — `ibm.codeengine.function`.
 */

import { resolveClient } from './_client';
import { err, isIbmAlreadyExists, isIbmNotFound, ok, sdkMissing } from './_result';
import type { IBMResourceHandler } from '../types';

const TYPE = 'ibm.codeengine.function';
const SDK = '@ibm-cloud/code-engine';

export const codeengine_function_handler: IBMResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const ce = await resolveClient(ctx, 'codeengine');
    if (!ce) return sdkMissing(name, TYPE, 'create', start, 'IBM Code Engine', SDK);
    if (!properties.project_id) return err(name, TYPE, 'create', start, 'Function requires project_id');
    try {
      await ce.createFunction({
        projectId: properties.project_id as string,
        name,
        codeMain: (properties.handler as string) || 'main',
        runtime: (properties.runtime as string) || 'nodejs-20',
        codeRuntime: (properties.runtime as string) || 'nodejs-20',
        scaleCpuLimit: (properties.cpu_cores as string) || '1',
        scaleMemoryLimit: (properties.memory as string) || '512M',
      });
      return ok(name, TYPE, 'create', start, { provider_id: `${properties.project_id}/${name}` });
    } catch (error) {
      if (isIbmAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const ce = await resolveClient(ctx, 'codeengine');
    if (!ce) return err(name, TYPE, 'delete', start, 'IBM Code Engine SDK not available');
    try {
      const [projectId, fnName] = provider_id.split('/');
      await ce.deleteFunction({ projectId, name: fnName });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isIbmNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
