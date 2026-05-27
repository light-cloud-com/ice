/**
 * AWS CloudFront live test.
 *
 * Expected runtime: 15–45 min (distribution propagation is the bottleneck).
 * Expected cost:    free tier; only delete waits cost time.
 * Quirks:
 *   - Handler is create-only today; A4 ships UpdateDistribution.
 *   - Cert auto-provisioning is disabled here (enableHttps: false) so
 *     the test runs without a DNS / Route53 dependency.
 *
 * Run: AWS_REGION=us-east-1 pnpm test:live:aws cloudfront
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  JsonlLogger,
  TEST_RUN_TAG_KEY,
  awsLive,
  createAwsDeployer,
  testRunTagValue,
  uniqueAwsName,
} from './_live-helpers';
import { AWSDeployer } from '../../aws-deployer';

awsLive('aws.cloudfront.distribution — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-cloudfront');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  it(
    'creates a placeholder distribution then deletes it',
    async () => {
      const name = uniqueAwsName('cf', 60);
      let providerId: string | undefined;
      try {
        const r = await deployer.create(
          'aws.cloudfront.distribution',
          name,
          {
            enableHttps: false,
            auto_provision_cert: false,
            price_class: 'PriceClass_100',
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'aws-cloudfront', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await deployer.delete('aws.cloudfront.distribution', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'aws-cloudfront', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    50 * 60_000,
  );
});
