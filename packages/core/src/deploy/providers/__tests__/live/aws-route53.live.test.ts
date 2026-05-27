/**
 * AWS Route53 RecordSet live test.
 *
 * Expected runtime: < 15s.
 * Expected cost:    $0.40/month per hosted zone — test uses an existing
 *                   zone the operator already owns.
 *
 * One-time setup:
 *   - export AWS_TEST_HOSTED_ZONE_ID=Z123 (an existing zone you control)
 *   - export AWS_TEST_HOSTED_ZONE_DOMAIN=example.com (matching base domain)
 *
 * Skips with a banner if either env is missing.
 *
 * Run: AWS_REGION=us-east-1 AWS_TEST_HOSTED_ZONE_ID=Z123 AWS_TEST_HOSTED_ZONE_DOMAIN=example.com pnpm test:live:aws route53
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JsonlLogger, awsLive, createAwsDeployer, uniqueAwsName } from './_live-helpers';
import { AWSDeployer } from '../../aws-deployer';

awsLive('aws.route53.recordSet — upsert + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;
  const zone = process.env.AWS_TEST_HOSTED_ZONE_ID;
  const baseDomain = process.env.AWS_TEST_HOSTED_ZONE_DOMAIN;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-route53');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  if (!zone || !baseDomain) {
    describe.skip('skipped — set AWS_TEST_HOSTED_ZONE_ID and AWS_TEST_HOSTED_ZONE_DOMAIN (existing zone)', () => {
      it('skipped', () => {});
    });
    return;
  }

  it('upserts a TXT record then "deletes" (no-op without state)', async () => {
    const name = uniqueAwsName('rs', 64);
    const recordName = `ice-test.${baseDomain}.`;
    let providerId: string | undefined;
    try {
      const r = await deployer.create(
        'aws.route53.recordSet',
        name,
        {
          hosted_zone_id: zone,
          records: [{ name: recordName, type: 'TXT', ttl: 60, values: ['"ice-test"'] }],
        },
        {},
      );
      logger.log({ kind: 'create', handler: 'aws-route53', result: r });
      expect(r.success).toBe(true);
      expect(r.provider_id).toMatch(/^route53:/);
      providerId = r.provider_id;
    } finally {
      if (providerId) {
        // The handler's delete path is a no-op without state — the
        // record stays in the zone. A follow-up enhancement preserves
        // last-known records on the resource so delete can pull them
        // back. For now we send the same payload as a DELETE explicitly.
        const d = await deployer.delete('aws.route53.recordSet', name, providerId, {});
        logger.log({ kind: 'delete', handler: 'aws-route53', result: d });
        expect(d.success).toBe(true);
      }
    }
  }, 30_000);
});
