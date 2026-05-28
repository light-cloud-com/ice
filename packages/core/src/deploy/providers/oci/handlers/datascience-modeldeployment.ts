/**
 * OCI Data Science model deployment handler —
 * `oci.datascience.modeldeployment`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.datascience.modeldeployment';
const SDK = 'oci-datascience';

export const datascience_modeldeployment_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const ds = await resolveClient(ctx, 'datascience');
    if (!ds) return sdkMissing(name, TYPE, 'create', start, 'OCI Data Science', SDK);
    if (!properties.model_id || !properties.project_id) {
      return err(name, TYPE, 'create', start, 'ModelDeployment requires model_id and project_id');
    }
    try {
      const result = await ds.createModelDeployment({
        createModelDeploymentDetails: {
          compartmentId: ctx.compartment_id,
          projectId: properties.project_id as string,
          displayName: name,
          modelDeploymentConfigurationDetails: {
            deploymentType: 'SINGLE_MODEL',
            modelConfigurationDetails: {
              modelId: properties.model_id as string,
              instanceConfiguration: {
                instanceShapeName: (properties.shape as string) || 'VM.Standard.E4.Flex',
              },
              scalingPolicy: { policyType: 'FIXED_SIZE', instanceCount: (properties.replicas as number) ?? 1 },
              bandwidthMbps: (properties.bandwidth_mbps as number) ?? 10,
            },
          },
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
  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const ds = await resolveClient(ctx, 'datascience');
    if (!ds) return err(name, TYPE, 'delete', start, 'OCI Data Science SDK not available');
    try {
      await ds.deleteModelDeployment({ modelDeploymentId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
