/**
 * AWS EC2 live test.
 *
 * Expected runtime: 1–2 min.
 * Expected cost:    pennies (t3.nano ~$0.005/hr, instance lives <1 min).
 *
 * One-time setup:
 *   - Set AWS_TEST_AMI_ID to an AMI id valid in your region (e.g. an
 *     Amazon Linux 2023 AMI: see SSM parameter
 *     `/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64`).
 *   - Optionally set AWS_TEST_SUBNET_ID; otherwise EC2 launches into the
 *     default VPC's default subnet (if your account has one).
 *
 * Skips with a clear banner if AWS_TEST_AMI_ID is missing.
 *
 * Run: AWS_REGION=us-east-1 AWS_TEST_AMI_ID=ami-... pnpm test:live:aws ec2
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

awsLive('aws.ec2.instance — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;
  const amiId = process.env.AWS_TEST_AMI_ID;
  const subnetId = process.env.AWS_TEST_SUBNET_ID;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-ec2');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  if (!amiId) {
    describe.skip('skipped — set AWS_TEST_AMI_ID to a valid AMI id in your region', () => {
      it('skipped', () => {});
    });
    return;
  }

  it(
    'launches a t3.nano then terminates it',
    async () => {
      const name = uniqueAwsName('ec2', 64);
      let providerId: string | undefined;
      try {
        const props: Record<string, unknown> = {
          image_id: amiId,
          instance_type: 't3.nano',
          tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
        };
        if (subnetId) props.subnet_id = subnetId;
        const r = await deployer.create('aws.ec2.instance', name, props, {});
        logger.log({ kind: 'create', handler: 'aws-ec2', result: r });
        expect(r.success).toBe(true);
        expect(r.provider_id).toMatch(/^i-[0-9a-f]+$/);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await deployer.delete('aws.ec2.instance', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'aws-ec2', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
