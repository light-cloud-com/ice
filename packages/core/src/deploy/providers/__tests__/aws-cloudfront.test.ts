import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup(opts: { withAcm?: boolean } = {}) {
  const cf = makeSdkMock({
    client_class_name: 'CloudFrontClient',
    command_class_names: [
      'CreateDistributionCommand',
      'DeleteDistributionCommand',
      'GetDistributionConfigCommand',
      'UpdateDistributionCommand',
    ],
    sendImpl: (cmd) => {
      if (cmd.__cmd === 'CreateDistribution')
        return { Distribution: { ARN: 'arn:aws:cloudfront::111:distribution/E123' } };
      if (cmd.__cmd === 'GetDistributionConfig')
        return { DistributionConfig: { PriceClass: 'PriceClass_100', Enabled: true, Comment: 'old' }, ETag: 'etag-1' };
      return {};
    },
  });
  const acm = makeSdkMock({
    client_class_name: 'ACMClient',
    command_class_names: ['RequestCertificateCommand'],
    sendImpl: () => ({ CertificateArn: 'arn:aws:acm:us-east-1:111:certificate/abc' }),
  });
  const registry: Record<string, unknown> = { '@aws-sdk/client-cloudfront': cf.module };
  if (opts.withAcm) registry['@aws-sdk/client-acm'] = acm.module;
  install_dynamic_import_stub(registry);
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, cf, acm };
}

describe('aws.cloudfront.distribution handler', () => {
  it('creates a distribution with the default CF cert when ACM is absent', async () => {
    const { d, cf } = await setup();
    const out = await d.create('aws.cloudfront.distribution', 'cdn', { domain: 'example.com' }, {});
    expect(out.success).toBe(true);
    const cfg = cf.sendCalls[0].input.DistributionConfig;
    expect(cfg.ViewerCertificate.CloudFrontDefaultCertificate).toBe(true);
  });

  it('requests an ACM cert in us-east-1 when auto_provision_cert and domain set', async () => {
    const { d, cf } = await setup({ withAcm: true });
    const out = await d.create(
      'aws.cloudfront.distribution',
      'cdn',
      { domain: 'example.com', enableHttps: true, auto_provision_cert: true },
      {},
    );
    expect(out.success).toBe(true);
    const cfg = cf.sendCalls[0].input.DistributionConfig;
    expect(cfg.ViewerCertificate.ACMCertificateArn).toBe('arn:aws:acm:us-east-1:111:certificate/abc');
    expect(cfg.ViewerCertificate.SSLSupportMethod).toBe('sni-only');
  });

  it('uses a canvas-wired certificate_arn instead of requesting ACM (A2 cert wiring)', async () => {
    const { d, cf, acm } = await setup({ withAcm: true });
    const out = await d.create(
      'aws.cloudfront.distribution',
      'cdn',
      {
        domain: 'example.com',
        enableHttps: true,
        certificate_arn: 'arn:aws:acm:us-east-1:111:certificate/canvas-wired',
      },
      {},
    );
    expect(out.success).toBe(true);
    // The wired arn takes precedence — no RequestCertificate call.
    expect(acm.sendCalls.find((c: any) => c.__cmd === 'RequestCertificate')).toBeUndefined();
    const cfg = cf.sendCalls[0].input.DistributionConfig;
    expect(cfg.ViewerCertificate.ACMCertificateArn).toBe('arn:aws:acm:us-east-1:111:certificate/canvas-wired');
  });

  it('updates a distribution via Get + Update with operator-mutable fields (A4 update path)', async () => {
    const { d, cf } = await setup();
    const out = await d.update(
      'aws.cloudfront.distribution',
      'cdn',
      'arn:aws:cloudfront::111:distribution/E123',
      { price_class: 'PriceClass_200', comment: 'updated' },
      {},
      {},
    );
    expect(out.success).toBe(true);
    const update_call = cf.sendCalls.find((c: any) => c.__cmd === 'UpdateDistribution');
    expect(update_call).toBeDefined();
    expect(update_call?.input.IfMatch).toBe('etag-1');
    expect(update_call?.input.DistributionConfig.PriceClass).toBe('PriceClass_200');
    expect(update_call?.input.DistributionConfig.Comment).toBe('updated');
  });
});
