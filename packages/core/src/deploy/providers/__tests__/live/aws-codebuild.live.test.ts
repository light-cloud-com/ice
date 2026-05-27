/**
 * AWS CodeBuild project live test.
 *
 * Expected runtime: < 30s (project is created + deleted; no build run).
 * Expected cost:    free (no build executed).
 *
 * One-time setup:
 *   - Create an IAM role with codebuild + S3 + lambda + cloudwatch-logs
 *     permissions:
 *       aws iam create-role --role-name ice-test-codebuild ...
 *   - export AWS_TEST_CODEBUILD_ROLE_ARN=arn:aws:iam::<acct>:role/ice-test-codebuild
 *
 * Skips with banner if AWS_TEST_CODEBUILD_ROLE_ARN is missing.
 *
 * Run: AWS_REGION=us-east-1 AWS_TEST_CODEBUILD_ROLE_ARN=<arn> pnpm test:live:aws codebuild
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

awsLive('aws.codebuild.project — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;
  const roleArn = process.env.AWS_TEST_CODEBUILD_ROLE_ARN;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-codebuild');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  if (!roleArn) {
    describe.skip('skipped — set AWS_TEST_CODEBUILD_ROLE_ARN to an IAM role with codebuild perms', () => {
      it('skipped', () => {});
    });
    return;
  }

  it('creates a project then deletes it', async () => {
    const name = uniqueAwsName('cb', 60);
    let providerId: string | undefined;
    try {
      const r = await deployer.create(
        'aws.codebuild.project',
        name,
        {
          source_location: 'https://github.com/aws-samples/aws-codebuild-samples.git',
          source_type: 'GITHUB',
          service_role_arn: roleArn,
          tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
        },
        {},
      );
      logger.log({ kind: 'create', handler: 'aws-codebuild', result: r });
      expect(r.success).toBe(true);
      expect(r.provider_id).toMatch(/^arn:aws:codebuild:.+:project\//);
      providerId = r.provider_id;
    } finally {
      if (providerId) {
        const d = await deployer.delete('aws.codebuild.project', name, providerId, {});
        logger.log({ kind: 'delete', handler: 'aws-codebuild', result: d });
        expect(d.success).toBe(true);
      }
    }
  }, 60_000);
});
