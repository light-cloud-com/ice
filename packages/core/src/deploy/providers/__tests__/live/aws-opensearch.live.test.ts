/**
 * AWS OpenSearch live test.
 *
 * Expected runtime: 10–15 min (domain create is slow).
 * Expected cost:    ~$0.01 per run (t3.small.search for ~15 min).
 *
 * Public-access mode (no VPC). For VPC mode, A1 ships canvas-driven
 * VPC blocks and this test can be extended.
 *
 * Run: AWS_REGION=us-east-1 pnpm test:live:aws opensearch
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

awsLive('aws.opensearch.domain — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-opensearch');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  it(
    'creates a small domain then deletes it',
    async () => {
      // OpenSearch domain name: lowercase letters/digits/hyphens, 3-28 chars.
      const name = uniqueAwsName('os', 28)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 28);
      let providerId: string | undefined;
      try {
        const r = await deployer.create(
          'aws.opensearch.domain',
          name,
          {
            engine_version: 'OpenSearch_2.13',
            instance_type: 't3.small.search',
            instance_count: 1,
            dedicated_master_enabled: false,
            ebs_enabled: true,
            ebs_volume_type: 'gp3',
            ebs_volume_size_gb: 10,
            encryption_at_rest: true,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'aws-opensearch', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await deployer.delete('aws.opensearch.domain', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'aws-opensearch', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    25 * 60_000,
  );
});
