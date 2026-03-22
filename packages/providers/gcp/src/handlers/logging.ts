/**
 * Cloud Logging Handler
 *
 * Handles: gcp.logging.sink
 */

import type { ResourceDeployResult } from '../../../types.js';
import type { GCPResourceHandler, GCPHandlerContext } from '../types.js';
import { SERVICE_NAMES, sdk_not_available, sdk_not_available_short } from '../messages.js';

const TYPE = 'gcp.logging.sink';

function result(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  overrides: Partial<ResourceDeployResult> = {}
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type: TYPE,
    action,
    success: true,
    duration_ms: Date.now() - start,
    ...overrides,
  };
}

function fail(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  error: string
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type: TYPE,
    action,
    success: false,
    error,
    duration_ms: Date.now() - start,
  };
}

export const logging_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();

    try {
      const logging = ctx.clients.get('logging') as any;
      if (!logging)
        return fail(name, 'create', start, sdk_not_available(SERVICE_NAMES.LOGGING, 'logging'));

      const sink = logging.sink(name);
      await sink.create({
        destination:
          properties.destination || `logging.googleapis.com/projects/${ctx.project}/logs/${name}`,
        filter: properties.filter || '',
      });

      return result(name, 'create', start, {
        provider_id: `projects/${ctx.project}/sinks/${name}`,
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();

    try {
      const logging = ctx.clients.get('logging') as any;
      if (!logging)
        return fail(name, 'update', start, sdk_not_available_short(SERVICE_NAMES.LOGGING));

      const sink = logging.sink(name);
      const metadata: any = {};
      if (properties.filter !== undefined) metadata.filter = properties.filter;
      if (properties.destination) metadata.destination = properties.destination;

      if (Object.keys(metadata).length > 0) {
        await sink.setMetadata(metadata);
      }

      return result(name, 'update', start, { provider_id });
    } catch (error) {
      return fail(name, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();

    try {
      const logging = ctx.clients.get('logging') as any;
      if (!logging)
        return fail(name, 'delete', start, sdk_not_available_short(SERVICE_NAMES.LOGGING));

      const sink = logging.sink(name);
      await sink.delete();

      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
