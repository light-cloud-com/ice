/**
 * OCI WAF policy handler — `oci.waf.policy`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.waf.policy';
const SDK = 'oci-waf';

export const waf_policy_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const waf = await resolveClient(ctx, 'waf');
    if (!waf) return sdkMissing(name, TYPE, 'create', start, 'OCI WAF', SDK);
    try {
      const result = await waf.createWebAppFirewallPolicy({
        createWebAppFirewallPolicyDetails: {
          compartmentId: ctx.compartment_id,
          displayName: name,
          actions: (properties.actions as unknown[]) ?? [
            { name: 'block_action', type: 'RETURN_HTTP_RESPONSE', code: 403 },
          ],
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
    const waf = await resolveClient(ctx, 'waf');
    if (!waf) return err(name, TYPE, 'delete', start, 'OCI WAF SDK not available');
    try {
      await waf.deleteWebAppFirewallPolicy({ webAppFirewallPolicyId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
