/**
 * AWS OpenSearch Serverless live test.
 *
 * Expected runtime: 2–4 min (collection provisioning).
 * Expected cost:    minimum 0.5 OCU-hours (~$0.12) per run.
 *
 * One-time setup (the collection won't work without policies, but the
 * create/delete round-trip itself doesn't require them):
 *   - Pre-create encryption + network + data-access policies covering
 *     `ice-test-*` collection names. See AWS docs.
 *
 * Run: AWS_REGION=us-east-1 pnpm test:live:aws opensearch-serverless
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

awsLive('aws.opensearchserverless.collection — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-opensearch-serverless');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  it(
    'creates a vector collection then deletes it',
    async () => {
      // Collection name: lowercase, 3-32 chars, alphanumeric + hyphen.
      const name = uniqueAwsName('vec', 32)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 32);
      let providerId: string | undefined;
      try {
        const r = await deployer.create(
          'aws.opensearchserverless.collection',
          name,
          { collection_type: 'VECTORSEARCH', tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() } },
          {},
        );
        logger.log({ kind: 'create', handler: 'aws-opensearch-serverless', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await deployer.delete('aws.opensearchserverless.collection', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'aws-opensearch-serverless', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    10 * 60_000,
  );
});
