/**
 * AWS DocumentDB live test.
 *
 * Expected runtime: 5–10 min.
 * Expected cost:    ~$0.01 per run (t3.medium for ~10 min).
 * Quirks: handler is create-only today (no update path); test exercises
 * create + delete only.
 *
 * One-time setup:
 *   - Create a DocDB subnet group via the DocDB API.
 *   - export AWS_TEST_DOCDB_SUBNET_GROUP=<name>
 *
 * Run: AWS_REGION=us-east-1 AWS_TEST_DOCDB_SUBNET_GROUP=<g> pnpm test:live:aws docdb
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

awsLive('aws.docdb.cluster — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;
  const subnetGroup = process.env.AWS_TEST_DOCDB_SUBNET_GROUP;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-docdb');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  if (!subnetGroup) {
    describe.skip('skipped — set AWS_TEST_DOCDB_SUBNET_GROUP to a DocDB subnet group', () => {
      it('skipped', () => {});
    });
    return;
  }

  it(
    'creates a single-instance cluster then deletes it',
    async () => {
      const name = uniqueAwsName('docdb', 60)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      const password = `Ice${randomBytes(8).toString('hex')}`;
      let providerId: string | undefined;
      try {
        const r = await deployer.create(
          'aws.docdb.cluster',
          name,
          {
            master_username: 'iceadmin',
            master_user_password: password,
            db_subnet_group_name: subnetGroup,
            instance_count: 1,
            instance_class: 'db.t3.medium',
            backup_retention_period: 1,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'aws-docdb', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await deployer.delete('aws.docdb.cluster', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'aws-docdb', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    20 * 60_000,
  );
});
