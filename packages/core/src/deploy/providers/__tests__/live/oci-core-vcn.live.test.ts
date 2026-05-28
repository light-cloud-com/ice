/**
 * OCI VCN live test — VCN control plane is free.
 *
 * Run: pnpm test:live:oci core-vcn
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { JsonlLogger, OCILiveContext, createOCIDeployer, ociLive, uniqueOciName } from './_live-helpers';

ociLive('oci.core.vcn — create + delete', () => {
  let ctx: OCILiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createOCIDeployer();
    logger = new JsonlLogger('oci-core-vcn');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a VCN then deletes it',
    async () => {
      const name = uniqueOciName('vcn', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create('oci.core.vcn', name, { cidr: '10.50.0.0/16' }, {});
        logger.log({ kind: 'create', handler: 'oci-core-vcn', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('oci.core.vcn', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'oci-core-vcn', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
