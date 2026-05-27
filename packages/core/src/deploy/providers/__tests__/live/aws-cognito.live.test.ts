/**
 * AWS Cognito User Pool live test.
 *
 * Expected runtime: < 30s.
 * Expected cost:    free under 50k MAU.
 * Quirks: handler is create-only today (no update path). Delete works.
 *
 * Run: AWS_REGION=us-east-1 pnpm test:live:aws cognito
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

awsLive('aws.cognito.userPool — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-cognito');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  it('creates a user pool then deletes it', async () => {
    const name = uniqueAwsName('cog', 128);
    let providerId: string | undefined;
    try {
      const r = await deployer.create(
        'aws.cognito.userPool',
        name,
        {
          auto_verified_attributes: ['email'],
          mfa_configuration: 'OFF',
          password_policy: {
            minimum_length: 8,
            require_uppercase: true,
            require_lowercase: true,
            require_numbers: true,
            require_symbols: false,
          },
          tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
        },
        {},
      );
      logger.log({ kind: 'create', handler: 'aws-cognito', result: r });
      expect(r.success).toBe(true);
      expect(r.provider_id).toBeTruthy();
      providerId = r.provider_id;
    } finally {
      if (providerId) {
        const d = await deployer.delete('aws.cognito.userPool', name, providerId, {});
        logger.log({ kind: 'delete', handler: 'aws-cognito', result: d });
        expect(d.success).toBe(true);
      }
    }
  }, 60_000);
});
