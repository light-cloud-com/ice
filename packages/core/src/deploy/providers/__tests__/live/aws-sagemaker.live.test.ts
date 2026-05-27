/**
 * AWS SageMaker Endpoint live test.
 *
 * Expected runtime: 3–8 min.
 * Expected cost:    ~$0.01 per run (ml.t2.medium for a few minutes).
 *
 * One-time setup:
 *   - Register a SageMaker model (CreateModel) ahead of time. The
 *     simplest is the public XGBoost built-in container with a
 *     pre-trained model from S3.
 *   - export AWS_TEST_SAGEMAKER_MODEL_NAME=<model-name>
 *
 * Run: AWS_REGION=us-east-1 AWS_TEST_SAGEMAKER_MODEL_NAME=<m> pnpm test:live:aws sagemaker
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

awsLive('aws.sagemaker.endpoint — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;
  const modelName = process.env.AWS_TEST_SAGEMAKER_MODEL_NAME;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-sagemaker');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  if (!modelName) {
    describe.skip('skipped — set AWS_TEST_SAGEMAKER_MODEL_NAME to a pre-registered SageMaker model', () => {
      it('skipped', () => {});
    });
    return;
  }

  it(
    'creates an endpoint then deletes it',
    async () => {
      const name = uniqueAwsName('smep', 63);
      let providerId: string | undefined;
      try {
        const r = await deployer.create(
          'aws.sagemaker.endpoint',
          name,
          {
            model_name: modelName,
            instance_type: 'ml.t2.medium',
            initial_instance_count: 1,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'aws-sagemaker', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await deployer.delete('aws.sagemaker.endpoint', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'aws-sagemaker', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    15 * 60_000,
  );
});
