/**
 * OCI Compute instance handler — `oci.core.instance`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.core.instance';
const SDK = 'oci-core';

export const core_instance_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const compute = await resolveClient(ctx, 'core');
    if (!compute) return sdkMissing(name, TYPE, 'create', start, 'OCI Compute', SDK);
    try {
      const result = await compute.launchInstance({
        launchInstanceDetails: {
          compartmentId: ctx.compartment_id,
          displayName: name,
          availabilityDomain: properties.availability_domain as string | undefined,
          shape: (properties.shape as string) || 'VM.Standard.E4.Flex',
          shapeConfig: { ocpus: (properties.ocpus as number) ?? 1, memoryInGBs: (properties.memory_gb as number) ?? 4 },
          imageId: properties.image_id as string | undefined,
          subnetId: properties.subnet_id as string | undefined,
          metadata: properties.metadata as Record<string, string> | undefined,
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const id = result?.instance?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'launchInstance returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isOciAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const compute = await resolveClient(ctx, 'core');
    if (!compute) return err(name, TYPE, 'update', start, 'OCI Compute SDK not available');
    try {
      await compute.updateInstance({ instanceId: provider_id, updateInstanceDetails: { displayName: name } });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const compute = await resolveClient(ctx, 'core');
    if (!compute) return err(name, TYPE, 'delete', start, 'OCI Compute SDK not available');
    try {
      await compute.terminateInstance({ instanceId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
