/**
 * OCI Resource Scheduler schedule live test.
 *
 * Run: pnpm test:live:oci resourcescheduler
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { JsonlLogger, OCILiveContext, createOCIDeployer, ociLive, uniqueOciName } from './_live-helpers';

ociLive('oci.resourcescheduler.schedule — create + delete', () => {
  let ctx: OCILiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createOCIDeployer();
    logger = new JsonlLogger('oci-resourcescheduler');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Schedule then deletes it',
    async () => {
      const name = uniqueOciName('sched', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'oci.resourcescheduler.schedule',
          name,
          { cron_expression: '0 0 * * *', action: 'START_RESOURCE' },
          {},
        );
        logger.log({ kind: 'create', handler: 'oci-resourcescheduler', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('oci.resourcescheduler.schedule', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'oci-resourcescheduler', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
