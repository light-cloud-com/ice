/**
 * Alibaba WAF v3 policy handler — `alibaba.waf.policy`.
 *
 * Backs Security.WAF blocks. Creates a defense template (policy);
 * binding to an SLB / ALB / API Gateway is a separate canvas wiring.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.waf.policy';
const SDK = '@alicloud/waf-openapi20211001';

export const waf_policy_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const waf = await resolveClient(ctx, 'waf');
    if (!waf) return sdkMissing(name, TYPE, 'create', start, 'Alibaba WAF', SDK);
    try {
      const result = await waf.createDefenseTemplate({
        regionId: ctx.region,
        instanceId: properties.instance_id as string | undefined,
        templateName: name,
        defenseScene: (properties.scene as string) || 'antiscan',
        templateOrigin: 'custom',
        templateType: 'user_default',
      });
      const id = (result?.body?.templateId ?? result?.body?.TemplateId) as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'CreateDefenseTemplate returned no TemplateId');
      return ok(name, TYPE, 'create', start, { provider_id: String(id) });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const waf = await resolveClient(ctx, 'waf');
    if (!waf) return err(name, TYPE, 'update', start, 'Alibaba WAF SDK not available');
    try {
      await waf.modifyDefenseTemplate({
        regionId: ctx.region,
        instanceId: properties.instance_id as string | undefined,
        templateId: provider_id,
        templateName: name,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const waf = await resolveClient(ctx, 'waf');
    if (!waf) return err(name, TYPE, 'delete', start, 'Alibaba WAF SDK not available');
    try {
      await waf.deleteDefenseTemplate({ regionId: ctx.region, templateId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
