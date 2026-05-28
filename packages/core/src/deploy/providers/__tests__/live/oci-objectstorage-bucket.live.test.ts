/**
 * OCI Object Storage bucket live test — create + delete round-trip.
 *
 * Expected runtime: ~10 sec. Cost: free (first 10 GB are free; tests
 * delete on completion).
 *
 * Run: pnpm test:live:oci objectstorage-bucket
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { JsonlLogger, OCILiveContext, createOCIDeployer, ociLive, uniqueOciName } from './_live-helpers';

ociLive('oci.objectstorage.bucket — create + delete', () => {
  let ctx: OCILiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createOCIDeployer();
    logger = new JsonlLogger('oci-objectstorage-bucket');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates an Object Storage bucket then deletes it',
    async () => {
      const name = uniqueOciName('bucket', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'oci.objectstorage.bucket',
          name,
          { public_access: 'NoPublicAccess', storage_tier: 'Standard' },
          {},
        );
        logger.log({ kind: 'create', handler: 'oci-objectstorage-bucket', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('oci.objectstorage.bucket', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'oci-objectstorage-bucket', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
