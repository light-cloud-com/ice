/**
 * AWS Amplify Hosting live test.
 *
 * Expected runtime: < 60s (app + branch create + delete; no build run).
 * Expected cost:    free (no build executed).
 *
 * One-time setup:
 *   - export AWS_TEST_AMPLIFY_REPO=https://github.com/<you>/<repo>
 *     (public repo or one your AWS account already trusts).
 *
 * Run: AWS_REGION=us-east-1 AWS_TEST_AMPLIFY_REPO=https://github.com/... pnpm test:live:aws amplify
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

awsLive('aws.amplify.app — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;
  const repo = process.env.AWS_TEST_AMPLIFY_REPO;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-amplify');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  if (!repo) {
    describe.skip('skipped — set AWS_TEST_AMPLIFY_REPO to a GitHub repo URL', () => {
      it('skipped', () => {});
    });
    return;
  }

  it('creates an app + branch then deletes', async () => {
    const name = uniqueAwsName('amp', 60);
    let providerId: string | undefined;
    try {
      const r = await deployer.create(
        'aws.amplify.app',
        name,
        { repository: repo, branch: 'main', tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() } },
        {},
      );
      logger.log({ kind: 'create', handler: 'aws-amplify', result: r });
      expect(r.success).toBe(true);
      expect(r.provider_id).toMatch(/^arn:aws:amplify:/);
      providerId = r.provider_id;
    } finally {
      if (providerId) {
        const d = await deployer.delete('aws.amplify.app', name, providerId, {});
        logger.log({ kind: 'delete', handler: 'aws-amplify', result: d });
        expect(d.success).toBe(true);
      }
    }
  }, 90_000);
});
