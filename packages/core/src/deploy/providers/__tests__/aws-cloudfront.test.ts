import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup(opts: { withAcm?: boolean } = {}) {
  const cf = makeSdkMock({
    client_class_name: 'CloudFrontClient',
    command_class_names: ['CreateDistributionCommand', 'DeleteDistributionCommand'],
    sendImpl: (cmd) =>
      cmd.__cmd === 'CreateDistribution' ? { Distribution: { ARN: 'arn:aws:cloudfront::111:distribution/E123' } } : {},
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
});
