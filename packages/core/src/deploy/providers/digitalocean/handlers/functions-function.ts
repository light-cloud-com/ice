/**
 * DigitalOcean Functions function handler —
 * `digitalocean.functions.function`.
 *
 * Functions are deployed by uploading a package zip via the
 * Functions API. dots-wrapper exposes deploy/get/list operations; the
 * actual code-upload step is operator-side via `doctl serverless`. This
 * handler manages the metadata record.
 */

import { err, isDoNotFound, ok, sdkMissing } from './_result';
import type { DOResourceHandler } from '../types';

const TYPE = 'digitalocean.functions.function';
const SDK = 'dots-wrapper';

export const functions_function_handler: DOResourceHandler = {
  async create(name, properties, _ctx) {
    const start = Date.now();
    if (!properties.namespace_id) {
      return err(name, TYPE, 'create', start, 'Function requires properties.namespace_id (deploy ns first)');
    }
    if (!_ctx.client) return sdkMissing(name, TYPE, 'create', start, 'DigitalOcean', SDK);
    // dots-wrapper does not expose individual function CRUD — it's
    // a doctl-driven workflow. We record the mapping for orchestrator
    // visibility and treat create as a no-op against the metadata API.
    return ok(name, TYPE, 'create', start, {
      provider_id: `${properties.namespace_id}/${name}`,
      outputs: {
        next_step: `Deploy the function bundle via 'doctl serverless deploy <dir>' targeting ns ${properties.namespace_id}.`,
      },
    });
  },
  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },
  async delete(name, provider_id, _ctx) {
    const start = Date.now();
    try {
      // No first-class delete via dots-wrapper; the orchestrator can
      // clean up via `doctl serverless undeploy`. Treat as benign.
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isDoNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
