/**
 * OCI Functions function live test — requires an Application OCID
 * and a container image OCID in a registry the tenancy can pull.
 *
 * Run: pnpm test:live:oci functions-function
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { JsonlLogger, OCILiveContext, createOCIDeployer, ociLive, uniqueOciName } from './_live-helpers';

ociLive('oci.functions.function — create + delete', () => {
  let ctx: OCILiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createOCIDeployer();
    logger = new JsonlLogger('oci-functions-function');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates an OCI Function then deletes it',
    async () => {
      const name = uniqueOciName('fn', 64);
      const applicationId = process.env.OCI_FUNCTIONS_APPLICATION_OCID ?? '';
      const image = process.env.OCI_FUNCTIONS_IMAGE ?? '';
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'oci.functions.function',
          name,
          { application_id: applicationId, image, memory_mb: 128, timeout_sec: 30 },
          {},
        );
        logger.log({ kind: 'create', handler: 'oci-functions-function', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('oci.functions.function', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'oci-functions-function', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
