/**
 * AWS SNS live test.
 *
 * Expected runtime: < 10s.
 * Expected cost:    free.
 * Quirks: FIFO topics get the `.fifo` suffix. Standard tested here.
 *
 * Run: AWS_REGION=us-east-1 pnpm test:live:aws sns
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

awsLive('aws.sns.topic — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-sns');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  it('creates a topic then deletes it', async () => {
    const name = uniqueAwsName('sns', 256);
    let providerId: string | undefined;
    try {
      const r = await deployer.create(
        'aws.sns.topic',
        name,
        {
          fifo: false,
          display_name: 'ICE live test',
          tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
        },
        {},
      );
      logger.log({ kind: 'create', handler: 'aws-sns', result: r });
      expect(r.success).toBe(true);
      expect(r.provider_id).toMatch(/^arn:aws:sns:/);
      providerId = r.provider_id;
    } finally {
      if (providerId) {
        const d = await deployer.delete('aws.sns.topic', name, providerId, {});
        logger.log({ kind: 'delete', handler: 'aws-sns', result: d });
        expect(d.success).toBe(true);
      }
    }
  }, 30_000);
});
