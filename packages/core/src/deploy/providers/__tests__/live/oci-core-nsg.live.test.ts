/**
 * OCI NetworkSecurityGroup live test — requires parent VCN.
 *
 * Run: pnpm test:live:oci core-nsg
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { JsonlLogger, OCILiveContext, createOCIDeployer, ociLive, uniqueOciName } from './_live-helpers';

ociLive('oci.core.networksecuritygroup — create + delete', () => {
  let ctx: OCILiveContext;
  let logger: JsonlLogger;
  let vcnId: string | undefined;
  let vcnName: string;

  beforeAll(async () => {
    ctx = await createOCIDeployer();
    logger = new JsonlLogger('oci-core-nsg');
    vcnName = uniqueOciName('vcn-nsg', 64);
    const r = await ctx.deployer.create('oci.core.vcn', vcnName, { cidr: '10.70.0.0/16' }, {});
    vcnId = r.provider_id;
  });
  afterAll(async () => {
    if (vcnId) await ctx.deployer.delete('oci.core.vcn', vcnName, vcnId, {});
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates an NSG then deletes it',
    async () => {
      const name = uniqueOciName('nsg', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create('oci.core.networksecuritygroup', name, { vcn_id: vcnId }, {});
        logger.log({ kind: 'create', handler: 'oci-core-nsg', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('oci.core.networksecuritygroup', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'oci-core-nsg', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
