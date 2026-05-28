/**
 * IBM Code Engine job handler — `ibm.codeengine.job`.
 */

import { resolveClient } from './_client';
import { err, isIbmAlreadyExists, isIbmNotFound, ok, sdkMissing } from './_result';
import type { IBMResourceHandler } from '../types';

const TYPE = 'ibm.codeengine.job';
const SDK = 'ibm-code-engine-sdk';

export const codeengine_job_handler: IBMResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const ce = await resolveClient(ctx, 'codeengine');
    if (!ce) return sdkMissing(name, TYPE, 'create', start, 'IBM Code Engine', SDK);
    if (!properties.project_id || !properties.image)
      return err(name, TYPE, 'create', start, 'Job requires project_id and image');
    try {
      await ce.createJob({
        projectId: properties.project_id as string,
        name,
        imageReference: properties.image as string,
        scaleCpuLimit: (properties.cpu_cores as string) || '1',
        scaleMemoryLimit: (properties.memory as string) || '2G',
        scaleArraySpec: (properties.array_spec as string) || '0',
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
      const [projectId, jobName] = provider_id.split('/');
      await ce.deleteJob({ projectId, name: jobName });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isIbmNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
