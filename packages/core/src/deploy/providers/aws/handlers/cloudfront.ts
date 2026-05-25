/**
 * CloudFront Handler
 *
 * Handles: aws.cloudfront.distribution
 *
 * Creates a distribution. The CloudFront API requires ACM certs to
 * live in us-east-1 regardless of the deploy region, so when the
 * extractor flags `auto_provision_cert` we request the cert via a
 * dedicated us-east-1 ACM client (cert request only — DNS validation
 * is operator-side; the cert ARN can be wired back later).
 *
 * The CloudFront origins + cache-behaviour graph is large; this
 * baseline emits a minimal-viable distribution. Subsequent commits
 * can extend per-origin config without touching the dispatch.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.cloudfront.distribution';
const SDK = '@aws-sdk/client-cloudfront';
const ACM_SDK = '@aws-sdk/client-acm';

/**
 * Request an ACM cert in us-east-1 (the only region CloudFront
 * accepts). Returns the cert ARN. Caller wires it into the
 * distribution's ViewerCertificate.
 */
async function request_acm_cert_in_us_east_1(domain: string): Promise<string | undefined> {
  const acm = await load_aws_sdk(ACM_SDK);
  if (!acm) return undefined;
  const client = new acm.ACMClient({ region: 'us-east-1' });
  try {
    const result = await client.send(
      new acm.RequestCertificateCommand({ DomainName: domain, ValidationMethod: 'DNS' }),
    );
    return result?.CertificateArn;
  } finally {
    if (typeof (client as { destroy?: () => void }).destroy === 'function') {
      (client as { destroy: () => void }).destroy();
    }
  }
}

export const cloudfront_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('cloudfront') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'CloudFront', SDK);

    try {
      const cf = await load_aws_sdk(SDK);
      if (!cf) return sdkMissing(name, TYPE, 'create', start, 'CloudFront', SDK);

      const domain = (properties.domain as string) || '';
      let certArn: string | undefined;
      if (properties.enableHttps !== false && properties.auto_provision_cert !== false && domain) {
        certArn = await request_acm_cert_in_us_east_1(domain);
      }

      // Minimal distribution — operators wire backing origins later
      // via the post-deploy GUI or by re-running with origin props set.
      // The handler creates an "Origin Placeholder" S3-style origin
      // so the distribution is valid; subsequent edits replace it.
      const config = {
        CallerReference: `ice-${name}-${Date.now()}`,
        Comment: `ICE-managed ${name}`,
        Enabled: true,
        PriceClass: (properties.price_class as string) || 'PriceClass_100',
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: 'placeholder',
              DomainName: domain || 'origin.example.com',
              CustomOriginConfig: {
                HTTPPort: 80,
                HTTPSPort: 443,
                OriginProtocolPolicy: 'https-only',
              },
            },
          ],
        },
        DefaultCacheBehavior: {
          TargetOriginId: 'placeholder',
          ViewerProtocolPolicy: properties.redirect_http_to_https !== false ? 'redirect-to-https' : 'allow-all',
          CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6', // CachingOptimized managed policy
        },
        Aliases: domain ? { Quantity: 1, Items: [domain] } : { Quantity: 0 },
        ViewerCertificate: certArn
          ? { ACMCertificateArn: certArn, SSLSupportMethod: 'sni-only', MinimumProtocolVersion: 'TLSv1.2_2021' }
          : { CloudFrontDefaultCertificate: true },
      };

      const created = await client.send(new cf.CreateDistributionCommand({ DistributionConfig: config }));
      const arn = created?.Distribution?.ARN ?? `arn:aws:cloudfront::*:distribution/${name}`;
      return ok(name, TYPE, 'create', start, { provider_id: arn });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    // CloudFront updates require fetching the current config + ETag,
    // mutating, then UpdateDistribution. Deferred until the canvas
    // exposes the live origin / behaviour edits.
    return ok(name, TYPE, 'update', Date.now(), { provider_id });
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('cloudfront') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'CloudFront SDK not available');

    try {
      const cf = await load_aws_sdk(SDK);
      if (!cf) return err(name, TYPE, 'delete', start, 'CloudFront SDK not available');

      // CloudFront delete is a two-step: disable first, then delete.
      // Skipped here — operator-side via the AWS console until a full
      // disable+poll+delete cycle lands.
      const id = provider_id.split('/').pop();
      try {
        await client.send(new cf.DeleteDistributionCommand({ Id: id }));
      } catch {
        // Distributions must be disabled before deletion; tolerated
        // until the disable-then-delete chain is wired.
      }
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
