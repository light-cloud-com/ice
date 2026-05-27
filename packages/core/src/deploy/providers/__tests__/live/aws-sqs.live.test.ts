/**
 * AWS SQS live test.
 *
 * Expected runtime: < 15s (SQS delete is eventually-consistent).
 * Expected cost:    free.
 * Quirks: FIFO queues get the `.fifo` suffix from the handler. This test
 * exercises the Standard path.
 *
 * Run: AWS_REGION=us-east-1 pnpm test:live:aws sqs
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

awsLive('aws.sqs.queue — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-sqs');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  it('creates a standard queue then deletes it', async () => {
    const name = uniqueAwsName('sqs', 80);
    let providerId: string | undefined;
    try {
      const r = await deployer.create(
        'aws.sqs.queue',
        name,
        {
          fifo: false,
          message_retention_seconds: 60,
          visibility_timeout_seconds: 30,
          delay_seconds: 0,
          tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
        },
        {},
      );
      logger.log({ kind: 'create', handler: 'aws-sqs', result: r });
      expect(r.success).toBe(true);
      expect(r.provider_id).toMatch(/^https:\/\/sqs\..+\.amazonaws\.com\//);
      providerId = r.provider_id;
    } finally {
      if (providerId) {
        const d = await deployer.delete('aws.sqs.queue', name, providerId, {});
        logger.log({ kind: 'delete', handler: 'aws-sqs', result: d });
        expect(d.success).toBe(true);
      }
    }
  }, 30_000);
});
