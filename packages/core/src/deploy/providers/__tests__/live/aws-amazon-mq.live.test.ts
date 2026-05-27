/**
 * AWS Amazon MQ broker live test.
 *
 * Expected runtime: 10–15 min (broker provisioning is slow).
 * Expected cost:    ~$0.03 per run (mq.t3.micro for ~15 min).
 *
 * Run: AWS_REGION=us-east-1 pnpm test:live:aws amazon-mq
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  JsonlLogger,
  TEST_RUN_TAG_KEY,
  awsLive,
  createAwsDeployer,
  testRunTagValue,
  uniqueAwsName,
} from './_live-helpers';
import { AWSDeployer } from '../../aws-deployer';

awsLive('aws.mq.broker — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-amazon-mq');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  it(
    'creates a RabbitMQ broker then deletes it',
    async () => {
      const name = uniqueAwsName('mq', 50)
        .replace(/[^a-zA-Z0-9-]/g, '')
        .slice(0, 50);
      const password = `Ice${randomBytes(8).toString('hex')}`;
      let providerId: string | undefined;
      try {
        const r = await deployer.create(
          'aws.mq.broker',
          name,
          {
            engine_type: 'RABBITMQ',
            host_instance_type: 'mq.t3.micro',
            deployment_mode: 'SINGLE_INSTANCE',
            admin_username: 'iceadmin',
            admin_password: password,
            publicly_accessible: true,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'aws-amazon-mq', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await deployer.delete('aws.mq.broker', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'aws-amazon-mq', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    25 * 60_000,
  );
});
