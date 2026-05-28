/**
 * IBM Code Engine application live test — requires
 * properties.project_id (operator-supplied) and a public container
 * image.
 *
 * Run: pnpm test:live:ibm codeengine-application
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { IBMLiveContext, JsonlLogger, createIBMDeployer, ibmLive, uniqueIbmName } from './_live-helpers';

ibmLive('ibm.codeengine.application — create + delete', () => {
  let ctx: IBMLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createIBMDeployer();
    logger = new JsonlLogger('ibm-codeengine-application');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Code Engine app then deletes it',
    async () => {
      const name = uniqueIbmName('ce-app', 63);
      const projectId = process.env.IBMCLOUD_CE_PROJECT_ID ?? '';
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'ibm.codeengine.application',
          name,
          { project_id: projectId, image: 'icr.io/codeengine/helloworld', cpu_cores: '1', memory: '2G' },
          {},
        );
        logger.log({ kind: 'create', handler: 'ibm-codeengine-application', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('ibm.codeengine.application', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'ibm-codeengine-application', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
