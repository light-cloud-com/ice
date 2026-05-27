/**
 * AWS Secrets Manager live test.
 *
 * Expected runtime: < 15s (delete uses force-immediate; default would be 7-day recovery).
 * Expected cost:    < $0.01 per run.
 *
 * Run: AWS_REGION=us-east-1 pnpm test:live:aws secrets-manager
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

awsLive('aws.secretsmanager.secret — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-secrets-manager');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  it('creates a secret resource then deletes it', async () => {
    const name = uniqueAwsName('secret', 512);
    let providerId: string | undefined;
    try {
      const r = await deployer.create(
        'aws.secretsmanager.secret',
        name,
        {
          description: 'ICE live test',
          tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
        },
        {},
      );
      logger.log({ kind: 'create', handler: 'aws-secrets-manager', result: r });
      expect(r.success).toBe(true);
      expect(r.provider_id).toMatch(/^arn:aws:secretsmanager:/);
      providerId = r.provider_id;
    } finally {
      if (providerId) {
        const d = await deployer.delete('aws.secretsmanager.secret', name, providerId, {});
        logger.log({ kind: 'delete', handler: 'aws-secrets-manager', result: d });
        expect(d.success).toBe(true);
      }
    }
  }, 30_000);
});
