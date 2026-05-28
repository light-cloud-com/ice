/**
 * OCI Cache (Redis) cluster live test.
 *
 * Run: pnpm test:live:oci redis-cluster
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { JsonlLogger, OCILiveContext, createOCIDeployer, ociLive, uniqueOciName } from './_live-helpers';

ociLive('oci.redis.cluster — create + delete', () => {
  let ctx: OCILiveContext;
  let logger: JsonlLogger;
  let vcnId: string | undefined;
  let snId: string | undefined;
  let vcnName: string, snName: string;

  beforeAll(async () => {
    ctx = await createOCIDeployer();
    logger = new JsonlLogger('oci-redis-cluster');
    vcnName = uniqueOciName('vcn-r', 64);
    const vcnR = await ctx.deployer.create('oci.core.vcn', vcnName, { cidr: '10.96.0.0/16' }, {});
    vcnId = vcnR.provider_id;
    snName = uniqueOciName('sn-r', 64);
    const snR = await ctx.deployer.create('oci.core.subnet', snName, { vcn_id: vcnId, cidr: '10.96.1.0/24' }, {});
    snId = snR.provider_id;
  });
  afterAll(async () => {
    if (snId) await ctx.deployer.delete('oci.core.subnet', snName, snId, {});
    if (vcnId) await ctx.deployer.delete('oci.core.vcn', vcnName, vcnId, {});
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Redis cluster then deletes it',
    async () => {
      const name = uniqueOciName('redis', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'oci.redis.cluster',
          name,
          { version: 'REDIS_7_0', subnet_id: snId, node_count: 1, memory_gb: 1 },
          {},
        );
        logger.log({ kind: 'create', handler: 'oci-redis-cluster', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('oci.redis.cluster', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'oci-redis-cluster', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    10 * 60_000,
  );
});
