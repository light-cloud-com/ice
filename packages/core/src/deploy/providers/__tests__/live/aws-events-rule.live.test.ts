/**
 * AWS EventBridge Rule live test.
 *
 * Expected runtime: < 15s.
 * Expected cost:    free.
 *
 * Tests the schedule path (rate expression). Target dispatch is exercised
 * once A3 lands the canvas-driven Compute.CronJob → ServerlessFunction
 * flow; this baseline only PutRule + DeleteRule.
 *
 * Run: AWS_REGION=us-east-1 pnpm test:live:aws events-rule
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

awsLive('aws.events.rule — create + delete', () => {
  let deployer: AWSDeployer;
  let logger: JsonlLogger;

  beforeAll(async () => {
    deployer = await createAwsDeployer();
    logger = new JsonlLogger('aws-events-rule');
  });
  afterAll(async () => {
    await deployer.cleanup();
    logger.close();
  });

  it('creates a schedule rule then deletes it', async () => {
    const name = uniqueAwsName('evr', 64);
    let providerId: string | undefined;
    try {
      const r = await deployer.create(
        'aws.events.rule',
        name,
        {
          schedule_expression: 'rate(1 hour)',
          description: 'ICE live test',
          state: 'DISABLED',
          tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
        },
        {},
      );
      logger.log({ kind: 'create', handler: 'aws-events-rule', result: r });
      expect(r.success).toBe(true);
      expect(r.provider_id).toMatch(/^arn:aws:events:.+:rule\//);
      providerId = r.provider_id;
    } finally {
      if (providerId) {
        const d = await deployer.delete('aws.events.rule', name, providerId, {});
        logger.log({ kind: 'delete', handler: 'aws-events-rule', result: d });
        expect(d.success).toBe(true);
      }
    }
  }, 30_000);
});
