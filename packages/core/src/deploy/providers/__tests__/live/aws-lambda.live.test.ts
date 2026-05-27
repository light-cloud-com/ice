/**
 * AWS Lambda live test.
 *
 * Expected runtime: < 30s.
 * Expected cost:    free (function lives <1 min).
 *
 * One-time setup:
 *   1. Create an IAM role with `AWSLambdaBasicExecutionRole`:
 *        aws iam create-role --role-name ice-test-lambda \
 *          --assume-role-policy-document '{"Version":"2012-10-17",
 *            "Statement":[{"Effect":"Allow",
 *            "Principal":{"Service":"lambda.amazonaws.com"},
 *            "Action":"sts:AssumeRole"}]}'
 *        aws iam attach-role-policy --role-name ice-test-lambda \
 *          --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
 *   2. export AWS_TEST_LAMBDA_ROLE=arn:aws:iam::<acct>:role/ice-test-lambda
 *
 * Skips with a clear banner if AWS_TEST_LAMBDA_ROLE is missing.
 *
 * Run: AWS_REGION=us-east-1 AWS_TEST_LAMBDA_ROLE=<arn> pnpm test:live:aws lambda
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

// Pre-built base64 of a minimal Node.js 20 Lambda zip containing
// `export const handler = async () => ({ statusCode: 200, body: 'ok' });`
const MINIMAL_ZIP_BASE64 =
  'UEsDBAoAAgAAAP2eu1yXQSiORgAAAEYAAAAJAAAAaW5kZXgubWpzZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoKSA9PiAoeyBzdGF0dXNDb2RlOiAyMDAsIGJvZHk6ICdvaycgfSk7ClBLAQIeAwoAAgAAAP2eu1yXQSiORgAAAEYAAAAJAAAAAAAAAAEAAACkgQAAAABpbmRleC5tanNQSwUGAAAAAAEAAQA3AAAAbQAAAAAA';

awsLive('aws.lambda.function — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;
  const role = process.env.AWS_TEST_LAMBDA_ROLE;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-lambda');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  if (!role) {
    describe.skip('skipped — set AWS_TEST_LAMBDA_ROLE to an IAM role ARN with AWSLambdaBasicExecutionRole', () => {
      it('skipped', () => {});
    });
    return;
  }

  it('creates a function then deletes it', async () => {
    const name = uniqueAwsName('lambda', 64);
    let providerId: string | undefined;
    try {
      const r = await deployer.create(
        'aws.lambda.function',
        name,
        {
          runtime: 'nodejs20.x',
          handler: 'index.handler',
          role,
          zip_file: MINIMAL_ZIP_BASE64,
          memory_size: 128,
          timeout: 5,
          tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
        },
        {},
      );
      logger.log({ kind: 'create', handler: 'aws-lambda', result: r });
      expect(r.success).toBe(true);
      expect(r.provider_id).toMatch(/^arn:aws:lambda:.+:function:/);
      providerId = r.provider_id;
    } finally {
      if (providerId) {
        const d = await deployer.delete('aws.lambda.function', name, providerId, {});
        logger.log({ kind: 'delete', handler: 'aws-lambda', result: d });
        expect(d.success).toBe(true);
      }
    }
  }, 60_000);
});
