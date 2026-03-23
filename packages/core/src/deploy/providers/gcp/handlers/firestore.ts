/**
 * Firestore Handler
 *
 * Handles: gcp.firestore.database
 * Uses REST API for database-level operations.
 */

import type { ResourceDeployResult } from '../../../types.js';
import type { GCPResourceHandler } from '../types.js';

const TYPE = 'gcp.firestore.database';
const BASE_URL = 'https://firestore.googleapis.com/v1';

function result(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  overrides: Partial<ResourceDeployResult> = {},
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
  error: string,
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

export const firestore_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();

    try {
      const op = (await ctx.rest_client.post(`${BASE_URL}/projects/${ctx.project}/databases?databaseId=${name}`, {
        locationId: properties.location_id || ctx.region,
        type: properties.type || 'FIRESTORE_NATIVE',
      })) as any;

      if (op?.name) {
        // Poll for completion
        const poll_start = Date.now();
        while (Date.now() - poll_start < 120_000) {
          const status = (await ctx.rest_client.get(`https://firestore.googleapis.com/v1/${op.name}`)) as any;
          if (status?.done) break;
          await new Promise((r) => setTimeout(r, 3000));
        }
      }

      return result(name, 'create', start, {
        provider_id: `projects/${ctx.project}/databases/${name}`,
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    // Firestore databases have very limited update options
    return result(name, 'update', start, { provider_id });
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();

    try {
      await ctx.rest_client.delete(`${BASE_URL}/projects/${ctx.project}/databases/${name}`);

      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
