/**
 * AWS S3 live test (developer tool, NOT CI).
 *
 * Expected runtime: < 30s.
 * Expected cost:    free (bucket lives <1 min).
 * Quirks:
 *   - S3 handler appends `-<accountId>` to the bucket name; the
 *     provider_id ARN carries the post-suffix name.
 *   - Bucket names must be globally unique and ≤ 63 chars; uniqueAwsName
 *     trims to 63.
 *
 * Run:
 *   AWS_REGION=us-east-1 pnpm test:live:aws s3
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

awsLive('aws.s3.bucket — create + delete round-trip', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-s3');
    logger.log({
      kind: 'run-start',
      provider: 'aws',
      region: process.env.AWS_REGION,
    });
  });

  afterAll(async () => {
    await deployer.cleanup();
    logger.log({
      kind: 'run-end',
      stats: { created: 0, updated: 0, deleted: 0, failed: 0 },
    });
    logger.close();
  });

  it('creates a bucket then deletes it', async () => {
    const name = uniqueAwsName('s3', 63);
    let providerId: string | undefined;
    try {
      const createResult = await deployer.create(
        'aws.s3.bucket',
        name,
        {
          tags: {
            [TEST_RUN_TAG_KEY]: testRunTagValue(),
          },
        },
        {},
      );
      logger.log({ kind: 'create', handler: 'aws-s3', result: createResult });
      expect(createResult.success).toBe(true);
      expect(createResult.provider_id).toMatch(/^arn:aws:s3:::.+$/);
      providerId = createResult.provider_id;
    } finally {
      if (providerId) {
        const deleteResult = await deployer.delete('aws.s3.bucket', name, providerId, {});
        logger.log({ kind: 'delete', handler: 'aws-s3', result: deleteResult });
        expect(deleteResult.success).toBe(true);
      }
    }
  }, 60_000);
});
