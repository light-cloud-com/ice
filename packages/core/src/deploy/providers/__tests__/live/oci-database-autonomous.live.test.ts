/**
 * OCI Autonomous Database live test.
 *
 * Free-tier ATP (1 OCPU + 1 TB) = $0/hr if your tenancy has free tier
 * available; paid shapes are hourly. Provisioning ~5-10 min.
 *
 * Run: pnpm test:live:oci database-autonomous
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { JsonlLogger, OCILiveContext, createOCIDeployer, ociLive, uniqueOciName } from './_live-helpers';

ociLive('oci.database.autonomousdatabase — create + delete', () => {
  let ctx: OCILiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createOCIDeployer();
    logger = new JsonlLogger('oci-database-autonomous');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates an Autonomous DB then deletes it',
    async () => {
      const name = uniqueOciName('adb', 14);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'oci.database.autonomousdatabase',
          name,
          { cpu_cores: 1, storage_tb: 1, admin_password: 'IceTestAdmin_2026!', free_tier: true },
          {},
        );
        logger.log({ kind: 'create', handler: 'oci-database-autonomous', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('oci.database.autonomousdatabase', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'oci-database-autonomous', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    15 * 60_000,
  );
});
