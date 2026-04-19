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

  async update(name, provider_id, properties, current, _ctx) {
    const start = Date.now();
    // Firestore `locationId` and `type` are immutable after creation —
    // silently returning success would leave the cloud state mismatched
    // with the canvas forever. Refuse the update so the user sees what
    // actually needs to happen (delete + recreate) instead of being lied
    // to about a successful deploy. Anything non-immutable here is a
    // legit no-op (Firestore exposes almost nothing else via the API).
    const desiredLocation = String(properties.location_id || '').trim();
    const currentLocation = String(current.location_id || current.locationId || '').trim();
    const desiredType = String(properties.type || 'FIRESTORE_NATIVE').trim();
    const currentType = String(current.type || 'FIRESTORE_NATIVE').trim();
    const diffs: string[] = [];
    if (desiredLocation && currentLocation && desiredLocation !== currentLocation) {
      diffs.push(`location_id (${currentLocation} → ${desiredLocation})`);
    }
    if (desiredType && currentType && desiredType !== currentType) {
      diffs.push(`type (${currentType} → ${desiredType})`);
    }
    if (diffs.length > 0) {
      return fail(
        name,
        'update',
        start,
        `Firestore database ${name} has immutable field changes (${diffs.join(', ')}). ` +
          `Delete the Firestore block and redeploy to apply, or revert the change on the canvas. ` +
          `NOTE: deleting destroys all data in the database.`,
      );
    }
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
