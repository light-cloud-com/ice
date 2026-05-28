/**
 * IBM Code Engine application handler — `ibm.codeengine.application`.
 *
 * Code Engine groups applications into Projects. The handler requires
 * `properties.project_id` (canvas wiring or env override). It deploys
 * a container image as a managed app.
 */

import { resolveClient } from './_client';
import { err, isIbmAlreadyExists, isIbmNotFound, ok, sdkMissing } from './_result';
import type { IBMResourceHandler } from '../types';

const TYPE = 'ibm.codeengine.application';
const SDK = '@ibm-cloud/code-engine';

export const codeengine_application_handler: IBMResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const ce = await resolveClient(ctx, 'codeengine');
    if (!ce) return sdkMissing(name, TYPE, 'create', start, 'IBM Code Engine', SDK);
    if (!properties.project_id || !properties.image)
      return err(name, TYPE, 'create', start, 'Code Engine application requires project_id and image');
    try {
      const result = await ce.createApp({
        projectId: properties.project_id as string,
        name,
        imageReference: properties.image as string,
        scaleMinInstances: (properties.min_instances as number) ?? 0,
        scaleMaxInstances: (properties.max_instances as number) ?? 10,
        scaleCpuLimit: (properties.cpu_cores as string) || '1',
        scaleMemoryLimit: (properties.memory as string) || '2G',
        runEnvVariables: (properties.env_vars as Array<{ name: string; value: string }>) ?? [],
      });
      const id = result?.result?.id ?? name;
      return ok(name, TYPE, 'create', start, { provider_id: `${properties.project_id}/${id}` });
    } catch (error) {
      if (isIbmAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const ce = await resolveClient(ctx, 'codeengine');
    if (!ce) return err(name, TYPE, 'update', start, 'IBM Code Engine SDK not available');
    try {
      const [projectId] = provider_id.split('/');
      await ce.updateApp({
        projectId,
        name,
        app: { image_reference: properties.image as string | undefined },
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const ce = await resolveClient(ctx, 'codeengine');
    if (!ce) return err(name, TYPE, 'delete', start, 'IBM Code Engine SDK not available');
    try {
      const [projectId, appName] = provider_id.split('/');
      await ce.deleteApp({ projectId, name: appName });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isIbmNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
