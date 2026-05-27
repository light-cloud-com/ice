/**
 * AWS VPC Endpoint live test.
 *
 * Expected runtime: < 2 min (creates VPC → subnet → endpoint → tears down).
 * Expected cost:    pennies (Interface endpoint at $0.01/hr).
 *
 * Run: AWS_REGION=us-east-1 pnpm test:live:aws vpc-endpoint
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

awsLive('aws.ec2.vpcEndpoint — gateway endpoint inside an ICE-managed VPC', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-vpc-endpoint');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  it(
    'creates VPC → S3 gateway endpoint → tears down',
    async () => {
      const vpcName = uniqueAwsName('vpc-for-vpce', 64);
      const endpointName = uniqueAwsName('vpce', 64);
      let vpcId: string | undefined;
      let endpointId: string | undefined;
      try {
        const vpc = await deployer.create(
          'aws.ec2.vpc',
          vpcName,
          { cidr_block: '10.45.0.0/16', tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() } },
          {},
        );
        logger.log({ kind: 'create', handler: 'aws-vpc', result: vpc });
        expect(vpc.success).toBe(true);
        vpcId = vpc.provider_id;

        const region = process.env.AWS_REGION;
        const ep = await deployer.create(
          'aws.ec2.vpcEndpoint',
          endpointName,
          {
            vpc_id: vpcId,
            service_name: `com.amazonaws.${region}.s3`,
            endpoint_type: 'Gateway',
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'aws-vpc-endpoint', result: ep });
        expect(ep.success).toBe(true);
        expect(ep.provider_id).toMatch(/^vpce-[0-9a-f]+$/);
        endpointId = ep.provider_id;
      } finally {
        if (endpointId) {
          const d = await deployer.delete('aws.ec2.vpcEndpoint', endpointName, endpointId, {});
          logger.log({ kind: 'delete', handler: 'aws-vpc-endpoint', result: d });
          expect(d.success).toBe(true);
        }
        if (vpcId) {
          const d = await deployer.delete('aws.ec2.vpc', vpcName, vpcId, {});
          logger.log({ kind: 'delete', handler: 'aws-vpc', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    3 * 60_000,
  );
});
