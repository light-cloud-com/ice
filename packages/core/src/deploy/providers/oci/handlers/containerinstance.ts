/**
 * OCI Container Instance handler — `oci.containerinstance.instance`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.containerinstance.instance';
const SDK = 'oci-containerinstances';

export const containerinstance_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const ci = await resolveClient(ctx, 'containerinstance');
    if (!ci) return sdkMissing(name, TYPE, 'create', start, 'OCI Container Instance', SDK);
    if (!properties.image) return err(name, TYPE, 'create', start, 'Container instance requires properties.image');
    try {
      const result = await ci.createContainerInstance({
        createContainerInstanceDetails: {
          compartmentId: ctx.compartment_id,
          displayName: name,
          availabilityDomain: properties.availability_domain as string | undefined,
          shape: (properties.shape as string) || 'CI.Standard.E4.Flex',
          shapeConfig: { ocpus: (properties.ocpus as number) ?? 1, memoryInGBs: (properties.memory_gb as number) ?? 4 },
          containers: [
            {
              displayName: 'app',
              imageUrl: properties.image as string,
              environmentVariables: (properties.env_vars as Record<string, string>) ?? {},
            },
          ],
          vnics: [{ subnetId: properties.subnet_id as string | undefined }],
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const id = result?.containerInstance?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createContainerInstance returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isOciAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, _properties, _current, ctx) {
    const start = Date.now();
    const ci = await resolveClient(ctx, 'containerinstance');
    if (!ci) return err(name, TYPE, 'update', start, 'OCI Container Instance SDK not available');
    try {
      await ci.updateContainerInstance({
        containerInstanceId: provider_id,
        updateContainerInstanceDetails: { displayName: name },
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const ci = await resolveClient(ctx, 'containerinstance');
    if (!ci) return err(name, TYPE, 'delete', start, 'OCI Container Instance SDK not available');
    try {
      await ci.deleteContainerInstance({ containerInstanceId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
