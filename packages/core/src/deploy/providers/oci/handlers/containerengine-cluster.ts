/**
 * OCI Kubernetes Engine (OKE) cluster handler —
 * `oci.containerengine.cluster`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.containerengine.cluster';
const SDK = 'oci-containerengine';

export const containerengine_cluster_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const ce = await resolveClient(ctx, 'containerengine');
    if (!ce) return sdkMissing(name, TYPE, 'create', start, 'OCI Container Engine', SDK);
    if (!properties.vcn_id) return err(name, TYPE, 'create', start, 'OKE cluster requires properties.vcn_id');
    try {
      const result = await ce.createCluster({
        createClusterDetails: {
          compartmentId: ctx.compartment_id,
          name,
          vcnId: properties.vcn_id as string,
          kubernetesVersion: (properties.version as string) || 'v1.30.1',
          type: (properties.cluster_type as string) || 'BASIC_CLUSTER',
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
    const ce = await resolveClient(ctx, 'containerengine');
    if (!ce) return err(name, TYPE, 'delete', start, 'OCI Container Engine SDK not available');
    try {
      await ce.deleteCluster({ clusterId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
