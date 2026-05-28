/**
 * OCI Subnet live test — requires parent VCN.
 *
 * Run: pnpm test:live:oci core-subnet
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { JsonlLogger, OCILiveContext, createOCIDeployer, ociLive, uniqueOciName } from './_live-helpers';

ociLive('oci.core.subnet — create + delete', () => {
  let ctx: OCILiveContext;
  let logger: JsonlLogger;
  let vcnId: string | undefined;
  let vcnName: string;

  beforeAll(async () => {
    ctx = await createOCIDeployer();
    logger = new JsonlLogger('oci-core-subnet');
    vcnName = uniqueOciName('vcn-sn', 64);
    const r = await ctx.deployer.create('oci.core.vcn', vcnName, { cidr: '10.60.0.0/16' }, {});
    vcnId = r.provider_id;
  });
  afterAll(async () => {
    if (vcnId) await ctx.deployer.delete('oci.core.vcn', vcnName, vcnId, {});
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Subnet then deletes it',
    async () => {
      const name = uniqueOciName('sn', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create('oci.core.subnet', name, { vcn_id: vcnId, cidr: '10.60.1.0/24' }, {});
        logger.log({ kind: 'create', handler: 'oci-core-subnet', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('oci.core.subnet', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'oci-core-subnet', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
