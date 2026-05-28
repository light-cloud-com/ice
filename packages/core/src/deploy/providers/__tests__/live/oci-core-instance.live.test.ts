/**
 * OCI Compute instance live test.
 *
 * VM.Standard.E2.1.Micro (free tier) = $0/hr if available; flex
 * shapes ~$0.01/hr. Requires VCN + Subnet + image OCID for the
 * region.
 *
 * Run: pnpm test:live:oci core-instance
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { JsonlLogger, OCILiveContext, createOCIDeployer, ociLive, uniqueOciName } from './_live-helpers';

ociLive('oci.core.instance — create + delete', () => {
  let ctx: OCILiveContext;
  let logger: JsonlLogger;
  let vcnId: string | undefined;
  let snId: string | undefined;
  let vcnName: string, snName: string;

  beforeAll(async () => {
    ctx = await createOCIDeployer();
    logger = new JsonlLogger('oci-core-instance');
    vcnName = uniqueOciName('vcn-i', 64);
    const vcnR = await ctx.deployer.create('oci.core.vcn', vcnName, { cidr: '10.80.0.0/16' }, {});
    vcnId = vcnR.provider_id;
    snName = uniqueOciName('sn-i', 64);
    const snR = await ctx.deployer.create('oci.core.subnet', snName, { vcn_id: vcnId, cidr: '10.80.1.0/24' }, {});
    snId = snR.provider_id;
  });
  afterAll(async () => {
    if (snId) await ctx.deployer.delete('oci.core.subnet', snName, snId, {});
    if (vcnId) await ctx.deployer.delete('oci.core.vcn', vcnName, vcnId, {});
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Compute instance then deletes it',
    async () => {
      const name = uniqueOciName('inst', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'oci.core.instance',
          name,
          {
            shape: 'VM.Standard.E4.Flex',
            ocpus: 1,
            memory_gb: 4,
            subnet_id: snId,
            // image_id must be set per-region — operator picks a current Ubuntu image OCID.
            image_id: process.env.OCI_IMAGE_ID ?? '',
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'oci-core-instance', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('oci.core.instance', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'oci-core-instance', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    10 * 60_000,
  );
});
