/**
 * AWS API Gateway live test.
 *
 * Expected runtime: < 30s.
 * Expected cost:    free under 1M calls/month.
 *
 * Run: AWS_REGION=us-east-1 pnpm test:live:aws api-gateway
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

awsLive('aws.apigateway.restApi — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-api-gateway');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  it('creates a REST API then deletes it', async () => {
    const name = uniqueAwsName('apigw', 128);
    let providerId: string | undefined;
    try {
      const r = await deployer.create(
        'aws.apigateway.restApi',
        name,
        {
          description: 'ICE live test',
          endpoint_type: 'REGIONAL',
          stage_name: 'test',
          tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
        },
        {},
      );
      logger.log({ kind: 'create', handler: 'aws-api-gateway', result: r });
      expect(r.success).toBe(true);
      expect(r.provider_id).toBeTruthy();
      providerId = r.provider_id;
    } finally {
      if (providerId) {
        const d = await deployer.delete('aws.apigateway.restApi', name, providerId, {});
        logger.log({ kind: 'delete', handler: 'aws-api-gateway', result: d });
        expect(d.success).toBe(true);
      }
    }
  }, 60_000);
});
