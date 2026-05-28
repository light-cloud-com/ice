/**
 * Cloud DNS Managed Zone Handler
 *
 * Handles: gcp.dns.managedZone — backs Network.CustomDomain on GCP
 * (parallel to AWS Route53 hosted zone and Azure DNS zone).
 */

import { SERVICE_NAMES, sdk_not_available, sdk_not_available_short } from '../messages';
import type { ResourceDeployResult } from '../../../types';
import type { GCPResourceHandler } from '../types';

const TYPE = 'gcp.dns.managedZone';

function result(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  overrides: Partial<ResourceDeployResult> = {},
): ResourceDeployResult {
  return { resource_id: name, name, type: TYPE, action, success: true, duration_ms: Date.now() - start, ...overrides };
}

function fail(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  error: string,
): ResourceDeployResult {
  return { resource_id: name, name, type: TYPE, action, success: false, error, duration_ms: Date.now() - start };
}

export const cloud_dns_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    try {
      const client = ctx.clients.get('dns') as any;
      if (!client) return fail(name, 'create', start, sdk_not_available(SERVICE_NAMES.CLOUD_DNS, 'dns'));
      const created = await client.managedZone(name).create({
        dnsName: ((properties.dns_name as string) || (properties.domain as string) || '').replace(/\.?$/, '.'),
        description: (properties.description as string) || 'Created by ICE',
      });
      return result(name, 'create', start, {
        provider_id: created?.[0]?.id ?? `projects/${ctx.project}/managedZones/${name}`,
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    return result(name, 'update', Date.now(), { provider_id });
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    try {
      const client = ctx.clients.get('dns') as any;
      if (!client) return fail(name, 'delete', start, sdk_not_available_short(SERVICE_NAMES.CLOUD_DNS));
      await client.managedZone(name).delete();
      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
