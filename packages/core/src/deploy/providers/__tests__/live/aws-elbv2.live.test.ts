/**
 * AWS ELBv2 (Application Load Balancer) live test.
 *
 * Expected runtime: 1–3 min.
 * Expected cost:    ~$0.001 per run (LB lives <2 min at ~$0.025/hr).
 *
 * One-time setup:
 *   - Identify subnets in ≥2 AZs to attach the LB to.
 *   - export AWS_TEST_SUBNET_IDS=subnet-aaa,subnet-bbb
 *   - export AWS_TEST_VPC_ID=vpc-...
 *
 * Run: AWS_REGION=us-east-1 AWS_TEST_SUBNET_IDS=... AWS_TEST_VPC_ID=... pnpm test:live:aws elbv2
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

awsLive('aws.elbv2.loadBalancer — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;
  const subnets = (process.env.AWS_TEST_SUBNET_IDS ?? '').split(',').filter(Boolean);
  const vpcId = process.env.AWS_TEST_VPC_ID;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-elbv2');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  if (subnets.length < 2 || !vpcId) {
    describe.skip('skipped — set AWS_TEST_SUBNET_IDS=<csv of ≥2 subnets> and AWS_TEST_VPC_ID', () => {
      it('skipped', () => {});
    });
    return;
  }

  it(
    'creates an ALB then deletes it',
    async () => {
      const name = uniqueAwsName('elb', 32)
        .replace(/[^a-zA-Z0-9-]/g, '')
        .slice(0, 32);
      let providerId: string | undefined;
      try {
        const r = await deployer.create(
          'aws.elbv2.loadBalancer',
          name,
          {
            scheme: 'internet-facing',
            type: 'application',
            ip_address_type: 'ipv4',
            subnets,
            vpc_id: vpcId,
            target_group_port: 80,
            target_group_protocol: 'HTTP',
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'aws-elbv2', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await deployer.delete('aws.elbv2.loadBalancer', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'aws-elbv2', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
