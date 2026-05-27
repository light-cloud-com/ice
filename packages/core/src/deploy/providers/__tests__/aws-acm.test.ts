/**
 * Tests for the aws.acm.certificate handler.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const acm = makeSdkMock({
    client_class_name: 'ACMClient',
    command_class_names: [
      'RequestCertificateCommand',
      'DescribeCertificateCommand',
      'AddTagsToCertificateCommand',
      'DeleteCertificateCommand',
    ],
    sendImpl: (cmd) => {
      if (cmd.__cmd === 'RequestCertificate') {
        return { CertificateArn: 'arn:aws:acm:us-east-1:111:certificate/abc-123' };
      }
      if (cmd.__cmd === 'DescribeCertificate') {
        return {
          Certificate: {
            DomainValidationOptions: [
              {
                ResourceRecord: { Name: '_x.example.com.', Type: 'CNAME', Value: 'token.acm-validations.aws.' },
              },
            ],
          },
        };
      }
      return {};
    },
  });
  install_dynamic_import_stub({ '@aws-sdk/client-acm': acm.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, acm };
}

describe('aws.acm.certificate handler', () => {
  it('requests a DNS-validated cert and surfaces validation records', async () => {
    const { d, acm } = await setup();
    const out = await d.create(
      'aws.acm.certificate',
      'site-cert',
      { domain_name: 'example.com', region: 'us-east-1' },
      {},
    );
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('arn:aws:acm:us-east-1:111:certificate/abc-123');
    expect(out.outputs?.validation_records).toEqual([
      { name: '_x.example.com.', type: 'CNAME', value: 'token.acm-validations.aws.' },
    ]);
    const req = acm.sendCalls.find((c: any) => c.__cmd === 'RequestCertificate')!;
    expect(req.input.DomainName).toBe('example.com');
    expect(req.input.ValidationMethod).toBe('DNS');
  });

  it('refuses to create without domain_name', async () => {
    const { d } = await setup();
    const out = await d.create('aws.acm.certificate', 'site-cert', {}, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/domain_name/);
  });

  it('deletes via DeleteCertificate', async () => {
    const { d, acm } = await setup();
    const out = await d.delete('aws.acm.certificate', 'site-cert', 'arn:aws:acm:us-east-1:111:certificate/abc-123', {});
    expect(out.success).toBe(true);
    expect(acm.sendCalls.find((c: any) => c.__cmd === 'DeleteCertificate')!.input.CertificateArn).toBe(
      'arn:aws:acm:us-east-1:111:certificate/abc-123',
    );
  });
});
