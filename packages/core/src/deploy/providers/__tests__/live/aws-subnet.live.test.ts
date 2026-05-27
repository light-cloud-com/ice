/**
 * AWS Subnet live test.
 *
 * Expected runtime: < 60s (VPC create + subnet create + delete + VPC delete).
 * Expected cost:    free.
 *
 * Self-contained: the test creates a parent VPC, then a subnet inside
 * it, then tears both down. No AWS_TEST_VPC_ID env var needed.
 *
 * Run: AWS_REGION=us-east-1 pnpm test:live:aws subnet
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

awsLive('aws.ec2.subnet — create + delete inside an ICE-managed VPC', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-subnet');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  it(
    'creates VPC → subnet → deletes subnet → deletes VPC',
    async () => {
      const vpcName = uniqueAwsName('vpc-for-subnet', 64);
      const subnetName = uniqueAwsName('subnet', 64);
      let vpcId: string | undefined;
      let subnetId: string | undefined;
      try {
        const vpcResult = await deployer.create(
          'aws.ec2.vpc',
          vpcName,
          { cidr_block: '10.43.0.0/16', tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() } },
          {},
        );
        expect(vpcResult.success).toBe(true);
        vpcId = vpcResult.provider_id;
        logger.log({ kind: 'create', handler: 'aws-vpc', result: vpcResult });

        const subnetResult = await deployer.create(
          'aws.ec2.subnet',
          subnetName,
          {
            vpc_id: vpcId,
            cidr_block: '10.43.1.0/24',
            availability_zone: `${process.env.AWS_REGION}a`,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'aws-subnet', result: subnetResult });
        expect(subnetResult.success).toBe(true);
        expect(subnetResult.provider_id).toMatch(/^subnet-[0-9a-f]+$/);
        subnetId = subnetResult.provider_id;
      } finally {
        if (subnetId) {
          const d = await deployer.delete('aws.ec2.subnet', subnetName, subnetId, {});
          logger.log({ kind: 'delete', handler: 'aws-subnet', result: d });
          expect(d.success).toBe(true);
        }
        if (vpcId) {
          const d = await deployer.delete('aws.ec2.vpc', vpcName, vpcId, {});
          logger.log({ kind: 'delete', handler: 'aws-vpc', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    2 * 60_000,
  );
});
