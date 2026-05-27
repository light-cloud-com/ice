/**
 * AWS DynamoDB live test.
 *
 * Expected runtime: < 30s.
 * Expected cost:    pennies (on-demand, table lifetime <1 min).
 *
 * Run: AWS_REGION=us-east-1 pnpm test:live:aws dynamodb
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

awsLive('aws.dynamodb.table — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-dynamodb');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  it('creates a table then deletes it', async () => {
    const name = uniqueAwsName('ddb', 255);
    let providerId: string | undefined;
    try {
      const r = await deployer.create(
        'aws.dynamodb.table',
        name,
        {
          partition_key: 'id',
          partition_key_type: 'S',
          billing_mode: 'PAY_PER_REQUEST',
          tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
        },
        {},
      );
      logger.log({ kind: 'create', handler: 'aws-dynamodb', result: r });
      expect(r.success).toBe(true);
      expect(r.provider_id).toMatch(/^arn:aws:dynamodb:.+:table\//);
      providerId = r.provider_id;
    } finally {
      if (providerId) {
        const d = await deployer.delete('aws.dynamodb.table', name, providerId, {});
        logger.log({ kind: 'delete', handler: 'aws-dynamodb', result: d });
        expect(d.success).toBe(true);
      }
    }
  }, 60_000);
});
