/**
 * AWS ECS Fargate service live test.
 *
 * Expected runtime: 1–3 min.
 * Expected cost:    ~$0.002 per run (Fargate task lives <3 min).
 *
 * One-time setup:
 *   - Identify subnets + security group(s) for the Fargate task.
 *   - export AWS_TEST_SUBNET_IDS=subnet-aaa,subnet-bbb
 *   - export AWS_TEST_SECURITY_GROUP_IDS=sg-xxx
 *
 * Handler auto-creates the ECS execution role + default cluster on
 * first run (idempotent). Once A1 ships canvas VPC/Subnet/SG blocks,
 * those env vars become optional.
 *
 * Run: AWS_REGION=us-east-1 AWS_TEST_SUBNET_IDS=... AWS_TEST_SECURITY_GROUP_IDS=... pnpm test:live:aws ecs
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

awsLive('aws.ecs.service — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;
  const subnets = (process.env.AWS_TEST_SUBNET_IDS ?? '').split(',').filter(Boolean);
  const securityGroups = (process.env.AWS_TEST_SECURITY_GROUP_IDS ?? '').split(',').filter(Boolean);

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-ecs');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  if (subnets.length === 0 || securityGroups.length === 0) {
    describe.skip('skipped — set AWS_TEST_SUBNET_IDS and AWS_TEST_SECURITY_GROUP_IDS (canvas VPC blocks land in A1)', () => {
      it('skipped', () => {});
    });
    return;
  }

  it(
    'creates a Fargate service then deletes it',
    async () => {
      const name = uniqueAwsName('ecs', 60);
      let providerId: string | undefined;
      try {
        const r = await deployer.create(
          'aws.ecs.service',
          name,
          {
            image: 'public.ecr.aws/nginx/nginx:latest',
            cpu: '256',
            memory: '512',
            desired_count: 1,
            subnets,
            security_groups: securityGroups,
            assign_public_ip: true,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'aws-ecs', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await deployer.delete('aws.ecs.service', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'aws-ecs', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    10 * 60_000,
  );
});
