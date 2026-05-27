/**
 * Azure WAF Policy handler — `azure.network.webApplicationFirewallPolicy`.
 *
 * Backs Security.WAF on Azure (parallel to AWS WAFv2 and GCP Cloud
 * Armor). WAF policies attach to either an Application Gateway
 * (regional) or a Front Door (global) — the canvas wires the target
 * via a properties.target_resource_id reference.
 *
 * Detection mode by default — passes traffic through and only logs hits
 * so the operator can tune rules before flipping to Prevention.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.network.webApplicationFirewallPolicy';
const SDK = '@azure/arm-network';

export const azure_waf_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('network') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'WAF Policy', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const result = await client.webApplicationFirewallPolicies.createOrUpdate(resource_group, name, {
        location: (properties.location as string) || ctx.location,
        policySettings: {
          state: 'Enabled',
          mode: (properties.mode as string) || 'Detection',
        },
        managedRules: {
          managedRuleSets: ((properties.managed_rules as unknown[]) || [
            { ruleSetType: 'OWASP', ruleSetVersion: '3.2' },
          ]) as Array<{ ruleSetType: string; ruleSetVersion: string }>,
        },
        customRules: (properties.custom_rules as unknown[]) || [],
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('network') as any;
    if (!client) return err(name, TYPE, 'update', start, 'WAF Policy SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.webApplicationFirewallPolicies.createOrUpdate(resource_group, name, {
        location: (properties.location as string) || ctx.location,
        policySettings: { state: 'Enabled', mode: (properties.mode as string) || 'Detection' },
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('network') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'WAF Policy SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.webApplicationFirewallPolicies.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
