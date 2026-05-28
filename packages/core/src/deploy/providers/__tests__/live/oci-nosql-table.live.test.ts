/**
 * OCI NoSQL table live test — on-demand mode, free tier eligible.
 *
 * Run: pnpm test:live:oci nosql-table
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { JsonlLogger, OCILiveContext, createOCIDeployer, ociLive, uniqueOciName } from './_live-helpers';

ociLive('oci.nosql.table — create + delete', () => {
  let ctx: OCILiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createOCIDeployer();
    logger = new JsonlLogger('oci-nosql-table');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a NoSQL table then deletes it',
    async () => {
      const name = uniqueOciName('tbl', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'oci.nosql.table',
          name,
          { read_units: 10, write_units: 10, storage_gb: 1 },
          {},
        );
        logger.log({ kind: 'create', handler: 'oci-nosql-table', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('oci.nosql.table', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'oci-nosql-table', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
