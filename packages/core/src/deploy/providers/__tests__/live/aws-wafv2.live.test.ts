/**
 * AWS WAFv2 Web ACL live test.
 *
 * Expected runtime: < 60s.
 * Expected cost:    ~$1/month per Web ACL (prorated; pennies per test run).
 *
 * Run: AWS_REGION=us-east-1 pnpm test:live:aws wafv2
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

awsLive('aws.wafv2.webAcl — REGIONAL create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-wafv2');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Web ACL then deletes it',
    async () => {
      const name = uniqueAwsName('waf', 60);
      let providerId: string | undefined;
      try {
        const r = await deployer.create(
          'aws.wafv2.webAcl',
          name,
          {
            scope: 'REGIONAL',
            default_action: 'ALLOW',
            rules: [],
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'aws-wafv2', result: r });
        expect(r.success).toBe(true);
        expect(r.provider_id).toMatch(/^arn:aws:wafv2:/);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await deployer.delete('aws.wafv2.webAcl', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'aws-wafv2', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    2 * 60_000,
  );
});
