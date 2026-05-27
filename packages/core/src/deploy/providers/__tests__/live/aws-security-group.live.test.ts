/**
 * AWS Security Group live test.
 *
 * Expected runtime: < 60s (VPC + SG round-trip).
 * Expected cost:    free.
 *
 * Self-contained — creates an ICE-managed VPC alongside the SG so no
 * existing AWS_TEST_VPC_ID is needed.
 *
 * Run: AWS_REGION=us-east-1 pnpm test:live:aws security-group
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

awsLive('aws.ec2.securityGroup — create + delete inside an ICE-managed VPC', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-security-group');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  it(
    'creates VPC → SG with HTTPS ingress → tears down',
    async () => {
      const vpcName = uniqueAwsName('vpc-for-sg', 64);
      const sgName = uniqueAwsName('sg', 64);
      let vpcId: string | undefined;
      let sgId: string | undefined;
      try {
        const vpc = await deployer.create(
          'aws.ec2.vpc',
          vpcName,
          { cidr_block: '10.44.0.0/16', tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() } },
          {},
        );
        logger.log({ kind: 'create', handler: 'aws-vpc', result: vpc });
        expect(vpc.success).toBe(true);
        vpcId = vpc.provider_id;

        const sg = await deployer.create(
          'aws.ec2.securityGroup',
          sgName,
          {
            vpc_id: vpcId,
            description: 'ICE live test',
            ingress: [{ protocol: 'tcp', from_port: 443, to_port: 443, cidr_blocks: ['0.0.0.0/0'] }],
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'aws-security-group', result: sg });
        expect(sg.success).toBe(true);
        expect(sg.provider_id).toMatch(/^sg-[0-9a-f]+$/);
        sgId = sg.provider_id;
      } finally {
        if (sgId) {
          const d = await deployer.delete('aws.ec2.securityGroup', sgName, sgId, {});
          logger.log({ kind: 'delete', handler: 'aws-security-group', result: d });
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
