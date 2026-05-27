/**
 * AWS ACM Certificate handler — `aws.acm.certificate`.
 *
 * Replaces the inline `request_acm_cert_in_us_east_1` helper in
 * cloudfront.ts. Canvas `Security.Certificate` blocks deploy through
 * here; CloudFront / Front Door / load balancers read the resulting
 * cert ARN from the connected block.
 *
 * Two regions matter:
 *   - CloudFront requires us-east-1. The extractor sets
 *     `properties.region = 'us-east-1'` for any cert wired to
 *     CloudFront. The handler honours `properties.region` and creates
 *     a region-pinned ACM client when it differs from `ctx.region`.
 *   - Application Load Balancers (ELBv2) need the cert in the same
 *     region as the LB. Default = ctx.region.
 *
 * Validation:
 *   - DNS validation is the only supported method. The handler returns
 *     the cert ARN immediately after RequestCertificate. The follow-up
 *     poll (DescribeCertificate → ISSUED) lives in a separate
 *     `wait_for_acm_validation` step the consuming handler invokes if
 *     it needs the cert in the ISSUED state. Standalone deploys (cert
 *     only) skip the wait — operators add the validation CNAMEs at
 *     their pace.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok } from './_result';
import type { AWSHandlerContext, AWSResourceHandler } from '../types';

const TYPE = 'aws.acm.certificate';
const SDK = '@aws-sdk/client-acm';

async function client_for_region(ctx: AWSHandlerContext, region: string): Promise<{ acm: any; client: any }> {
  const acm = await load_aws_sdk(SDK);
  if (!acm) throw new Error('ACM SDK not available. Install @aws-sdk/client-acm');

  if (region === ctx.region) {
    const shared = ctx.clients.get('acm');
    if (shared) return { acm, client: shared };
  }
  // Spin up a region-pinned client (CloudFront wiring uses us-east-1
  // regardless of operator's deploy region).
  return { acm, client: new acm.ACMClient({ region }) };
}

export const acm_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const domain = properties.domain_name as string | undefined;
    if (!domain) {
      return err(name, TYPE, 'create', start, 'ACM certificate requires properties.domain_name.');
    }

    try {
      const region = (properties.region as string) || ctx.region;
      const { acm, client } = await client_for_region(ctx, region);
      const result = await client.send(
        new acm.RequestCertificateCommand({
          DomainName: domain,
          SubjectAlternativeNames: properties.subject_alternative_names as string[] | undefined,
          ValidationMethod: 'DNS',
          Tags: properties.tags
            ? Object.entries(properties.tags as Record<string, string>).map(([Key, Value]) => ({ Key, Value }))
            : undefined,
        }),
      );
      const arn = result?.CertificateArn;
      if (!arn) return err(name, TYPE, 'create', start, 'RequestCertificate returned no CertificateArn');

      // Surface the DNS validation records the operator must add (or
      // that a connected route53 handler picks up downstream).
      let validationRecords: Array<{ name: string; type: string; value: string }> = [];
      try {
        const desc = await client.send(new acm.DescribeCertificateCommand({ CertificateArn: arn }));
        validationRecords = (desc?.Certificate?.DomainValidationOptions ?? [])
          .filter((d: any) => d.ResourceRecord)
          .map((d: any) => ({
            name: d.ResourceRecord.Name,
            type: d.ResourceRecord.Type,
            value: d.ResourceRecord.Value,
          }));
      } catch {
        // DescribeCertificate can race the create; fall through with
        // an empty record set — operators see the cert without records,
        // re-deploys + the route53 handler fill them in.
      }

      return ok(name, TYPE, 'create', start, { provider_id: arn, outputs: { validation_records: validationRecords } });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    try {
      const region = (properties.region as string) || ctx.region;
      const { acm, client } = await client_for_region(ctx, region);
      if (properties.tags) {
        await client.send(
          new acm.AddTagsToCertificateCommand({
            CertificateArn: provider_id,
            Tags: Object.entries(properties.tags as Record<string, string>).map(([Key, Value]) => ({ Key, Value })),
          }),
        );
      }
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    try {
      const region = inferRegionFromArn(provider_id) ?? ctx.region;
      const { acm, client } = await client_for_region(ctx, region);
      await client.send(new acm.DeleteCertificateCommand({ CertificateArn: provider_id }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

function inferRegionFromArn(arn: string): string | undefined {
  // arn:aws:acm:<region>:<account>:certificate/<id>
  const parts = arn.split(':');
  return parts[3] || undefined;
}
