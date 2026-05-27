/**
 * AWS WAFv2 handler — `aws.wafv2.webAcl`.
 *
 * Backs the `Security.WAF` block. Web ACLs attach to ALBs, API Gateways,
 * AppSync APIs (REGIONAL scope) or CloudFront (CLOUDFRONT scope, must
 * be created in us-east-1). The handler chooses the scope from
 * `properties.scope` and pins to us-east-1 when scope=CLOUDFRONT.
 *
 * Provider id encodes scope + name + id so update/delete can pick the
 * right region client. Default-action defaults to ALLOW (with
 * managed rules blocking) — operators flip to BLOCK for deny-by-default.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok } from './_result';
import type { AWSHandlerContext, AWSResourceHandler } from '../types';

const TYPE = 'aws.wafv2.webAcl';
const SDK = '@aws-sdk/client-wafv2';

interface ScopedClient {
  wafv2: any;
  client: any;
  scope: 'REGIONAL' | 'CLOUDFRONT';
}

async function scoped_client(ctx: AWSHandlerContext, scope: 'REGIONAL' | 'CLOUDFRONT'): Promise<ScopedClient> {
  const wafv2 = await load_aws_sdk(SDK);
  if (!wafv2) throw new Error('WAFv2 SDK not available. Install @aws-sdk/client-wafv2');

  // CLOUDFRONT-scoped Web ACLs MUST be created in us-east-1.
  const region = scope === 'CLOUDFRONT' ? 'us-east-1' : ctx.region;
  if (region === ctx.region) {
    const shared = ctx.clients.get('wafv2');
    if (shared) return { wafv2, client: shared, scope };
  }
  return { wafv2, client: new wafv2.WAFV2Client({ region }), scope };
}

export const wafv2_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const scope = (properties.scope as 'REGIONAL' | 'CLOUDFRONT') || 'REGIONAL';

    try {
      const { wafv2, client } = await scoped_client(ctx, scope);

      const defaultAction = (properties.default_action as string) === 'BLOCK' ? { Block: {} } : { Allow: {} };
      const rules = (properties.rules as Array<Record<string, unknown>>) || [];

      const created = await client.send(
        new wafv2.CreateWebACLCommand({
          Name: name,
          Scope: scope,
          DefaultAction: defaultAction,
          Description: (properties.description as string) || `ICE-managed ${name}`,
          VisibilityConfig: {
            CloudWatchMetricsEnabled: true,
            MetricName: name,
            SampledRequestsEnabled: true,
          },
          Rules: rules,
          Tags: properties.tags
            ? Object.entries(properties.tags as Record<string, string>).map(([Key, Value]) => ({ Key, Value }))
            : undefined,
        }),
      );
      const aclId = created?.Summary?.Id ?? name;
      const lockToken = created?.Summary?.LockToken;
      const arn =
        created?.Summary?.ARN ??
        `arn:aws:wafv2:${scope === 'CLOUDFRONT' ? 'global' : ctx.region}:*:webacl/${name}/${aclId}`;
      return ok(name, TYPE, 'create', start, {
        provider_id: arn,
        outputs: { lock_token: lockToken, scope, id: aclId },
      });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const scope = (properties.scope as 'REGIONAL' | 'CLOUDFRONT') || 'REGIONAL';

    try {
      const { wafv2, client } = await scoped_client(ctx, scope);

      // WAFv2 UpdateWebACL needs a LockToken; fetch it first via GetWebACL.
      const aclId = provider_id.split('/').pop()!;
      const cur = await client.send(new wafv2.GetWebACLCommand({ Name: name, Scope: scope, Id: aclId }));
      const lockToken = cur?.LockToken;
      if (!lockToken) return err(name, TYPE, 'update', start, 'GetWebACL returned no LockToken');

      const defaultAction = (properties.default_action as string) === 'BLOCK' ? { Block: {} } : { Allow: {} };
      const rules = (properties.rules as Array<Record<string, unknown>>) || [];

      await client.send(
        new wafv2.UpdateWebACLCommand({
          Name: name,
          Scope: scope,
          Id: aclId,
          LockToken: lockToken,
          DefaultAction: defaultAction,
          Description: properties.description as string | undefined,
          VisibilityConfig: {
            CloudWatchMetricsEnabled: true,
            MetricName: name,
            SampledRequestsEnabled: true,
          },
          Rules: rules,
        }),
      );
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    // Infer scope from the ARN — CLOUDFRONT region is "global", regional is the actual region.
    const scope: 'REGIONAL' | 'CLOUDFRONT' = provider_id.includes(':global:') ? 'CLOUDFRONT' : 'REGIONAL';
    try {
      const { wafv2, client } = await scoped_client(ctx, scope);
      const aclId = provider_id.split('/').pop()!;
      const cur = await client.send(new wafv2.GetWebACLCommand({ Name: name, Scope: scope, Id: aclId }));
      const lockToken = cur?.LockToken;
      await client.send(new wafv2.DeleteWebACLCommand({ Name: name, Scope: scope, Id: aclId, LockToken: lockToken }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
