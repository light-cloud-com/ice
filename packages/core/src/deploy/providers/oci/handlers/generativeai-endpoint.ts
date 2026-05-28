/**
 * OCI Generative AI inference endpoint handler —
 * `oci.generativeai.endpoint`.
 *
 * Note: the SDK is split across `oci-generativeai` (admin / models)
 * and `oci-generativeaiinference` (runtime). This handler uses the
 * admin client to register an Endpoint that fronts a model.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.generativeai.endpoint';
const SDK = 'oci-generativeai';

export const generativeai_endpoint_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const ga = await resolveClient(ctx, 'generativeai');
    if (!ga) return sdkMissing(name, TYPE, 'create', start, 'OCI Generative AI', SDK);
    if (!properties.model_id || !properties.dedicated_ai_cluster_id) {
      return err(name, TYPE, 'create', start, 'Endpoint requires model_id and dedicated_ai_cluster_id');
    }
    try {
      const result = await ga.createEndpoint({
        createEndpointDetails: {
          compartmentId: ctx.compartment_id,
          displayName: name,
          modelId: properties.model_id as string,
          dedicatedAiClusterId: properties.dedicated_ai_cluster_id as string,
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
    const ga = await resolveClient(ctx, 'generativeai');
    if (!ga) return err(name, TYPE, 'delete', start, 'OCI Generative AI SDK not available');
    try {
      await ga.deleteEndpoint({ endpointId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
