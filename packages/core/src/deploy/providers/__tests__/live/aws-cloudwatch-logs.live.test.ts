/**
 * AWS CloudWatch Logs live test.
 *
 * Expected runtime: < 10s.
 * Expected cost:    free.
 *
 * Run: AWS_REGION=us-east-1 pnpm test:live:aws cloudwatch-logs
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

awsLive('aws.cloudwatch.logGroup — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-cloudwatch-logs');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  it('creates a log group then deletes it', async () => {
    const name = uniqueAwsName('cwl', 512);
    let providerId: string | undefined;
    try {
      const r = await deployer.create(
        'aws.cloudwatch.logGroup',
        name,
        {
          retention_in_days: 1,
          tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
        },
        {},
      );
      logger.log({ kind: 'create', handler: 'aws-cloudwatch-logs', result: r });
      expect(r.success).toBe(true);
      expect(r.provider_id).toMatch(/^arn:aws:logs:.+:log-group:/);
      providerId = r.provider_id;
    } finally {
      if (providerId) {
        const d = await deployer.delete('aws.cloudwatch.logGroup', name, providerId, {});
        logger.log({ kind: 'delete', handler: 'aws-cloudwatch-logs', result: d });
        expect(d.success).toBe(true);
      }
    }
  }, 30_000);
});
