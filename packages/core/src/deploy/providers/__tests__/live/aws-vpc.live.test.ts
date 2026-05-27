/**
 * AWS VPC live test.
 *
 * Expected runtime: < 30s.
 * Expected cost:    free (VPCs cost nothing on their own).
 *
 * Run: AWS_REGION=us-east-1 pnpm test:live:aws vpc
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

awsLive('aws.ec2.vpc — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-vpc');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  it('creates a VPC then deletes it', async () => {
    const name = uniqueAwsName('vpc', 64);
    let providerId: string | undefined;
    try {
      const r = await deployer.create(
        'aws.ec2.vpc',
        name,
        {
          cidr_block: '10.42.0.0/16',
          enable_dns_support: true,
          enable_dns_hostnames: true,
          tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
        },
        {},
      );
      logger.log({ kind: 'create', handler: 'aws-vpc', result: r });
      expect(r.success).toBe(true);
      expect(r.provider_id).toMatch(/^vpc-[0-9a-f]+$/);
      providerId = r.provider_id;
    } finally {
      if (providerId) {
        const d = await deployer.delete('aws.ec2.vpc', name, providerId, {});
        logger.log({ kind: 'delete', handler: 'aws-vpc', result: d });
        expect(d.success).toBe(true);
      }
    }
  }, 60_000);
});
