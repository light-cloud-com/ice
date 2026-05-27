/**
 * AWS Bedrock live test (synthetic no-op).
 *
 * Bedrock on-demand foundation-model access is account-level — nothing
 * to provision. The handler short-circuits with a synthetic ARN and
 * doesn't call the SDK. This test verifies that contract.
 *
 * To test the real CreateProvisionedModelThroughput path, set
 * `model_units > 0`. NOT recommended: provisioned throughput is
 * expensive and requires an explicit commitment_duration.
 *
 * Expected runtime: < 5s.
 * Expected cost:    free.
 *
 * Run: AWS_REGION=us-east-1 pnpm test:live:aws bedrock
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { JsonlLogger, awsLive, createAwsDeployer, uniqueAwsName } from './_live-helpers';
import { AWSDeployer } from '../../aws-deployer';

awsLive('aws.bedrock.endpoint — on-demand no-op create', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-bedrock');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  it('returns a synthetic ARN without contacting AWS', async () => {
    const name = uniqueAwsName('bedrock', 64);
    const r = await deployer.create(
      'aws.bedrock.endpoint',
      name,
      {
        model_id: 'anthropic.claude-3-haiku-20240307-v1:0',
        model_units: 0,
      },
      {},
    );
    logger.log({ kind: 'create', handler: 'aws-bedrock', result: r });
    expect(r.success).toBe(true);
    expect(r.provider_id).toMatch(/^arn:aws:bedrock:.+:model\/anthropic\.claude-3-haiku/);
  }, 10_000);
});
