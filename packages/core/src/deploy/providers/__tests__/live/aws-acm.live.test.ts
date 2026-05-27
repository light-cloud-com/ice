/**
 * AWS ACM certificate live test.
 *
 * Expected runtime: < 30s (cert request is sync; we skip the issuance
 * wait — that requires real DNS validation).
 * Expected cost:    free (cert deleted immediately).
 *
 * One-time setup:
 *   - export AWS_TEST_CERT_DOMAIN=test.<your-domain> (a domain you
 *     own; the test requests a cert for it but does not wait for
 *     issuance).
 *
 * Skips with a clear banner if AWS_TEST_CERT_DOMAIN is missing.
 *
 * Run: AWS_REGION=us-east-1 AWS_TEST_CERT_DOMAIN=test.example.com pnpm test:live:aws acm
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  JsonlLogger,
  TEST_RUN_TAG_KEY,
  awsLive,
  createAwsDeployer,
  testRunTagValue,
  uniqueAwsName,
} from './_live-helpers';
import { AWSDeployer } from '../../aws-deployer';

awsLive('aws.acm.certificate — request + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;
  const domain = process.env.AWS_TEST_CERT_DOMAIN;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-acm');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  if (!domain) {
    describe.skip('skipped — set AWS_TEST_CERT_DOMAIN to a domain you own (e.g. test.example.com)', () => {
      it('skipped', () => {});
    });
    return;
  }

  it('requests a cert then deletes it', async () => {
    const name = uniqueAwsName('cert', 64);
    let providerId: string | undefined;
    try {
      const r = await deployer.create(
        'aws.acm.certificate',
        name,
        { domain_name: domain, region: 'us-east-1', tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() } },
        {},
      );
      logger.log({ kind: 'create', handler: 'aws-acm', result: r });
      expect(r.success).toBe(true);
      expect(r.provider_id).toMatch(/^arn:aws:acm:us-east-1:.+:certificate\//);
      providerId = r.provider_id;
    } finally {
      if (providerId) {
        const d = await deployer.delete('aws.acm.certificate', name, providerId, {});
        logger.log({ kind: 'delete', handler: 'aws-acm', result: d });
        expect(d.success).toBe(true);
      }
    }
  }, 60_000);
});
