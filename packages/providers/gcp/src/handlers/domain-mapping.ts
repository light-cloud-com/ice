/**
 * Domain Mapping Handler
 *
 * Handles: gcp.run.domainMapping
 * Uses Cloud Run Admin API v1 (REST) for domain mapping operations.
 *
 * Domain mappings cannot be updated in-place — update deletes and recreates.
 */

import type { GCPResourceHandler } from '../types.js';
import type { ResourceDeployResult } from '@ice/core';

const TYPE = 'gcp.run.domainMapping';
const BASE_URL = 'https://run.googleapis.com/apis/domains.cloudrun.com/v1';

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

/**
 * Resolve the target Cloud Run service name from properties.
 * Checks target_service, route_name, then falls back to the resource name.
 */
function resolve_route_name(name: string, properties: Record<string, unknown>): string {
  return (properties.target_service as string) || (properties.route_name as string) || name;
}

export const domain_mapping_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const domain = (properties.domain as string) || name;
    const route_name = resolve_route_name(name, properties);
    const certificate_mode = (properties.ssl_mode as string) || 'AUTOMATIC';
    const labels = (properties.labels as Record<string, string>) || {};

    try {
      const response = (await ctx.rest_client.post(`${BASE_URL}/namespaces/${ctx.project}/domainmappings`, {
        apiVersion: 'domains.cloudrun.com/v1',
        kind: 'DomainMapping',
        metadata: {
          name: domain,
          namespace: ctx.project,
          labels,
        },
        spec: {
          routeName: route_name,
          certificateMode: certificate_mode,
        },
      })) as any;

      // Domain mappings may return a status with resource records for DNS verification
      const resource_records = response?.status?.resourceRecords || [];
      const provider_id = `namespaces/${ctx.project}/domainmappings/${domain}`;

      return result(name, 'create', start, {
        provider_id,
        outputs: {
          domain,
          route_name,
          certificate_mode,
          resource_records,
        },
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const domain = (properties.domain as string) || name;

    try {
      // Domain mappings cannot be updated in-place — delete and recreate
      ctx.on_log?.('Domain mappings cannot be updated in-place. Deleting and recreating...');

      // Delete existing mapping
      try {
        await ctx.rest_client.delete(`${BASE_URL}/namespaces/${ctx.project}/domainmappings/${domain}`);
        // Brief pause to allow deletion to propagate
        await new Promise((r) => setTimeout(r, 2000));
      } catch (deleteErr: any) {
        // Ignore 404 (already deleted) — re-throw everything else
        const msg = deleteErr?.message || String(deleteErr);
        if (!msg.includes('404') && !msg.includes('NOT_FOUND')) {
          throw deleteErr;
        }
      }

      // Recreate with new properties
      const route_name = resolve_route_name(name, properties);
      const certificate_mode = (properties.ssl_mode as string) || 'AUTOMATIC';
      const labels = (properties.labels as Record<string, string>) || {};

      const response = (await ctx.rest_client.post(`${BASE_URL}/namespaces/${ctx.project}/domainmappings`, {
        apiVersion: 'domains.cloudrun.com/v1',
        kind: 'DomainMapping',
        metadata: {
          name: domain,
          namespace: ctx.project,
          labels,
        },
        spec: {
          routeName: route_name,
          certificateMode: certificate_mode,
        },
      })) as any;

      const resource_records = response?.status?.resourceRecords || [];
      const new_provider_id = `namespaces/${ctx.project}/domainmappings/${domain}`;

      return result(name, 'update', start, {
        provider_id: new_provider_id,
        outputs: {
          domain,
          route_name,
          certificate_mode,
          resource_records,
        },
      });
    } catch (error) {
      return fail(name, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();

    // Extract the domain from provider_id or fall back to name
    const domain = provider_id.includes('/domainmappings/') ? provider_id.split('/domainmappings/')[1] : name;

    try {
      await ctx.rest_client.delete(`${BASE_URL}/namespaces/${ctx.project}/domainmappings/${domain}`);

      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
