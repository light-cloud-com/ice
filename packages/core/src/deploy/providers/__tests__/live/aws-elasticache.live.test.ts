/**
 * AWS ElastiCache (Redis) live test.
 *
 * Expected runtime: 5–10 min.
 * Expected cost:    ~$0.003 per run (cache.t3.micro for a few minutes).
 *
 * One-time setup:
 *   - Default VPC accounts: AWS auto-creates a 'default' cache subnet
 *     group. Most modern accounts don't have EC2-Classic — you need
 *     an explicit subnet group.
 *   - Create one: `aws elasticache create-cache-subnet-group ...`
 *   - export AWS_TEST_CACHE_SUBNET_GROUP=<group-name>
 *
 * Run: AWS_REGION=us-east-1 AWS_TEST_CACHE_SUBNET_GROUP=<group> pnpm test:live:aws elasticache
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

awsLive('aws.elasticache.cluster — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;
  const subnetGroup = process.env.AWS_TEST_CACHE_SUBNET_GROUP;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-elasticache');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  if (!subnetGroup) {
    describe.skip('skipped — set AWS_TEST_CACHE_SUBNET_GROUP to an existing ElastiCache subnet group', () => {
      it('skipped', () => {});
    });
    return;
  }

  it(
    'creates a Redis cluster then deletes it',
    async () => {
      const name = uniqueAwsName('ec', 40);
      let providerId: string | undefined;
      try {
        const r = await deployer.create(
          'aws.elasticache.cluster',
          name,
          {
            cache_node_type: 'cache.t3.micro',
            num_cache_nodes: 1,
            engine: 'redis',
            engine_version: '7.0',
            port: 6379,
            cache_subnet_group_name: subnetGroup,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'aws-elasticache', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await deployer.delete('aws.elasticache.cluster', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'aws-elasticache', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    15 * 60_000,
  );
});
