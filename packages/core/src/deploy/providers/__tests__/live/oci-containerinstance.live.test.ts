/**
 * OCI Container Instance live test.
 *
 * Run: pnpm test:live:oci containerinstance
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { JsonlLogger, OCILiveContext, createOCIDeployer, ociLive, uniqueOciName } from './_live-helpers';

ociLive('oci.containerinstance.instance — create + delete', () => {
  let ctx: OCILiveContext;
  let logger: JsonlLogger;
  let vcnId: string | undefined;
  let snId: string | undefined;
  let vcnName: string, snName: string;

  beforeAll(async () => {
    ctx = await createOCIDeployer();
    logger = new JsonlLogger('oci-containerinstance');
    vcnName = uniqueOciName('vcn-ci', 64);
    const vcnR = await ctx.deployer.create('oci.core.vcn', vcnName, { cidr: '10.85.0.0/16' }, {});
    vcnId = vcnR.provider_id;
    snName = uniqueOciName('sn-ci', 64);
    const snR = await ctx.deployer.create('oci.core.subnet', snName, { vcn_id: vcnId, cidr: '10.85.1.0/24' }, {});
    snId = snR.provider_id;
  });
  afterAll(async () => {
    if (snId) await ctx.deployer.delete('oci.core.subnet', snName, snId, {});
    if (vcnId) await ctx.deployer.delete('oci.core.vcn', vcnName, vcnId, {});
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Container Instance then deletes it',
    async () => {
      const name = uniqueOciName('ci', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'oci.containerinstance.instance',
          name,
          { image: 'nginx:latest', subnet_id: snId, shape: 'CI.Standard.E4.Flex' },
          {},
        );
        logger.log({ kind: 'create', handler: 'oci-containerinstance', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('oci.containerinstance.instance', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'oci-containerinstance', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    10 * 60_000,
  );
});
