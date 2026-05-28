/**
 * IBM Cloud Object Storage bucket live test — requires a parent COS
 * instance (CRN supplied via IBMCLOUD_COS_INSTANCE_CRN env var).
 *
 * Run: pnpm test:live:ibm cos-bucket
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { IBMLiveContext, JsonlLogger, createIBMDeployer, ibmLive, uniqueIbmName } from './_live-helpers';

ibmLive('ibm.cos.bucket — create + delete', () => {
  let ctx: IBMLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createIBMDeployer();
    logger = new JsonlLogger('ibm-cos-bucket');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a COS bucket then deletes it',
    async () => {
      const name = uniqueIbmName('bucket', 63).toLowerCase();
      const cosCrn = process.env.IBMCLOUD_COS_INSTANCE_CRN ?? '';
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create('ibm.cos.bucket', name, { cos_instance_crn: cosCrn }, {});
        logger.log({ kind: 'create', handler: 'ibm-cos-bucket', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('ibm.cos.bucket', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'ibm-cos-bucket', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
