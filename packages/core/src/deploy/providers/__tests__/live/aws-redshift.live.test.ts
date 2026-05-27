/**
 * AWS Redshift live test.
 *
 * Expected runtime: 10–20 min (cluster provisioning dominates).
 * Expected cost:    ~$0.08 per run (dc2.large for ~20 min).
 * Quirks: handler is create-only today; A4 ships ModifyCluster.
 *
 * Run: AWS_REGION=us-east-1 pnpm test:live:aws redshift
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

awsLive('aws.redshift.cluster — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-redshift');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  it(
    'creates a single-node cluster then deletes it',
    async () => {
      // Redshift cluster identifier: 63 chars, lowercase letters/digits/hyphens.
      const name = uniqueAwsName('rs', 60)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      const password = `Ice${randomBytes(8).toString('hex')}`;
      let providerId: string | undefined;
      try {
        const r = await deployer.create(
          'aws.redshift.cluster',
          name,
          {
            node_type: 'dc2.large',
            cluster_type: 'single-node',
            number_of_nodes: 1,
            db_name: 'icetestdb',
            master_username: 'iceadmin',
            master_user_password: password,
            port: 5439,
            publicly_accessible: false,
            encrypted: true,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'aws-redshift', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await deployer.delete('aws.redshift.cluster', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'aws-redshift', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    25 * 60_000,
  );
});
