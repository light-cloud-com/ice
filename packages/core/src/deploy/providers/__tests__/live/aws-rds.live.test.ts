/**
 * AWS RDS live test.
 *
 * Expected runtime: 5–10 min (DescribeDBInstances poll dominates).
 * Expected cost:    ~$0.003 per run (db.t3.micro for ~10 min).
 *
 * One-time setup:
 *   - Create a DB subnet group across two AZs:
 *       aws rds create-db-subnet-group ...
 *   - Note its name + a security-group id that allows your VPC traffic.
 *   - export AWS_TEST_DB_SUBNET_GROUP=<name>
 *   - export AWS_TEST_DB_SECURITY_GROUP=<sg-id>  (optional but recommended)
 *
 * Run: AWS_REGION=us-east-1 AWS_TEST_DB_SUBNET_GROUP=<g> pnpm test:live:aws rds
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

awsLive('aws.rds.dbInstance — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;
  const subnetGroup = process.env.AWS_TEST_DB_SUBNET_GROUP;
  const securityGroup = process.env.AWS_TEST_DB_SECURITY_GROUP;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-rds');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  if (!subnetGroup) {
    describe.skip('skipped — set AWS_TEST_DB_SUBNET_GROUP to a DB subnet group spanning ≥2 AZs', () => {
      it('skipped', () => {});
    });
    return;
  }

  it(
    'creates a PostgreSQL instance then deletes it',
    async () => {
      // RDS DBInstanceIdentifier: 63 chars max, lowercase letters/digits/hyphens,
      // must start with a letter, cannot end with hyphen or have consecutive hyphens.
      const name = uniqueAwsName('rds', 60)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-');
      const password = `Ice${randomBytes(8).toString('hex')}`;
      let providerId: string | undefined;
      try {
        const props: Record<string, unknown> = {
          engine: 'postgres',
          engine_version: '16',
          db_instance_class: 'db.t3.micro',
          allocated_storage: 20,
          master_username: 'iceadmin',
          master_user_password: password,
          db_subnet_group_name: subnetGroup,
          publicly_accessible: false,
          skip_final_snapshot: true,
          tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
        };
        if (securityGroup) props.vpc_security_group_ids = [securityGroup];

        const r = await deployer.create('aws.rds.dbInstance', name, props, {});
        logger.log({ kind: 'create', handler: 'aws-rds', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await deployer.delete('aws.rds.dbInstance', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'aws-rds', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    25 * 60_000,
  );
});
