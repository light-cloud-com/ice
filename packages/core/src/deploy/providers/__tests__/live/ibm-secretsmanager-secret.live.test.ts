/**
 * IBM Secrets Manager secret live test — requires a Secrets Manager
 * instance and the IBMCLOUD_SECRETS_MANAGER_URL env var (the
 * instance's API endpoint).
 *
 * Run: pnpm test:live:ibm secretsmanager-secret
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { IBMLiveContext, JsonlLogger, createIBMDeployer, ibmLive, uniqueIbmName } from './_live-helpers';

ibmLive('ibm.secretsmanager.secret — create + delete', () => {
  let ctx: IBMLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createIBMDeployer();
    logger = new JsonlLogger('ibm-secretsmanager-secret');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Secret then deletes it',
    async () => {
      const name = uniqueIbmName('sec', 63);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'ibm.secretsmanager.secret',
          name,
          { secret_type: 'arbitrary', value: 'hunter2' },
          {},
        );
        logger.log({ kind: 'create', handler: 'ibm-secretsmanager-secret', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('ibm.secretsmanager.secret', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'ibm-secretsmanager-secret', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
