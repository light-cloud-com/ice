/**
 * GCP Cloud Armor handler — `gcp.compute.securityPolicy`.
 *
 * Maps the canvas `Security.WAF` block to a Cloud Armor security policy.
 * The default rule (priority 2147483647) is required by the API; without
 * it the create call 400s. We default to allow-all and let users override
 * via properties.rules.
 */

import { SERVICE_NAMES, operation_failed, operation_timed_out } from '../messages';
import type { ResourceDeployResult } from '../../../types';
import type { GCPResourceHandler, GCPHandlerContext } from '../types';

const TYPE = 'gcp.compute.securityPolicy';
const BASE_URL = 'https://compute.googleapis.com/compute/v1';

const DEFAULT_RULE = {
  priority: 2147483647,
  action: 'allow',
  match: { versionedExpr: 'SRC_IPS_V1', config: { srcIpRanges: ['*'] } },
  description: 'Default rule (allow all) — required by Cloud Armor',
};

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
  return { resource_id: name, name, type: TYPE, action, success: false, error, duration_ms: Date.now() - start };
}

export const cloud_armor_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    try {
      const userRules = Array.isArray(properties.rules) ? (properties.rules as Array<Record<string, unknown>>) : [];
      // Cloud Armor REQUIRES exactly one default rule at priority
      // 2147483647. Replace it if the user supplied one; otherwise append.
      const hasDefault = userRules.some((r) => r.priority === 2147483647);
      const rules = hasDefault ? userRules : [...userRules, DEFAULT_RULE];

      const body = {
        name,
        type: 'CLOUD_ARMOR',
        description: (properties.description as string) || `Created by ICE for ${name}`,
        rules,
      };
      const op = (await ctx.rest_client.post(
        `${BASE_URL}/projects/${ctx.project}/global/securityPolicies`,
        body,
      )) as any;
      if (op?.name) await wait_for_compute_op(ctx, op.name);
      return result(name, 'create', start, {
        provider_id: `projects/${ctx.project}/global/securityPolicies/${name}`,
        outputs: {
          self_link: `https://www.googleapis.com/compute/v1/projects/${ctx.project}/global/securityPolicies/${name}`,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('ALREADY_EXISTS') || msg.includes('alreadyExists')) {
        return result(name, 'create', start, {
          provider_id: `projects/${ctx.project}/global/securityPolicies/${name}`,
        });
      }
      return fail(name, 'create', start, msg);
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    // Rule updates require per-rule patch calls; treat as no-op for now.
    const start = Date.now();
    return result(name, 'update', start, { provider_id });
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    try {
      const op = (await ctx.rest_client.delete(
        `${BASE_URL}/projects/${ctx.project}/global/securityPolicies/${name}`,
      )) as any;
      if (op?.name) await wait_for_compute_op(ctx, op.name);
      return result(name, 'delete', start);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('NOT_FOUND') || msg.includes('404')) return result(name, 'delete', start);
      return fail(name, 'delete', start, msg);
    }
  },

  async describe(name, _provider_id, ctx) {
    try {
      const policy = (await ctx.rest_client.get(
        `${BASE_URL}/projects/${ctx.project}/global/securityPolicies/${name}`,
      )) as any;
      if (!policy) return { exists: false };
      return {
        exists: true,
        raw: policy,
        properties: {
          name: policy.name,
          self_link: policy.selfLink,
          rule_count: Array.isArray(policy.rules) ? policy.rules.length : 0,
        },
      };
    } catch (error: any) {
      const code = error?.response?.status || error?.code;
      if (code === 404) return { exists: false };
      return { exists: false, error: error?.message || String(error) };
    }
  },
};

async function wait_for_compute_op(ctx: GCPHandlerContext, op_name: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 900_000) {
    const op = (await ctx.rest_client.get(`${BASE_URL}/projects/${ctx.project}/global/operations/${op_name}`)) as any;
    if (op?.status === 'DONE') {
      if (op.error) throw new Error(operation_failed(SERVICE_NAMES.COMPUTE, JSON.stringify(op.error)));
      return;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(operation_timed_out(SERVICE_NAMES.COMPUTE));
}
