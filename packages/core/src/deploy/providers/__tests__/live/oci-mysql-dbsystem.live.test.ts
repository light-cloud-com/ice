/**
 * OCI MySQL HeatWave DB system live test.
 *
 * Run: pnpm test:live:oci mysql-dbsystem
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { JsonlLogger, OCILiveContext, createOCIDeployer, ociLive, uniqueOciName } from './_live-helpers';

ociLive('oci.mysql.dbsystem — create + delete', () => {
  let ctx: OCILiveContext;
  let logger: JsonlLogger;
  let vcnId: string | undefined;
  let snId: string | undefined;
  let vcnName: string, snName: string;

  beforeAll(async () => {
    ctx = await createOCIDeployer();
    logger = new JsonlLogger('oci-mysql-dbsystem');
    vcnName = uniqueOciName('vcn-my', 64);
    const vcnR = await ctx.deployer.create('oci.core.vcn', vcnName, { cidr: '10.90.0.0/16' }, {});
    vcnId = vcnR.provider_id;
    snName = uniqueOciName('sn-my', 64);
    const snR = await ctx.deployer.create('oci.core.subnet', snName, { vcn_id: vcnId, cidr: '10.90.1.0/24' }, {});
    snId = snR.provider_id;
  });
  afterAll(async () => {
    if (snId) await ctx.deployer.delete('oci.core.subnet', snName, snId, {});
    if (vcnId) await ctx.deployer.delete('oci.core.vcn', vcnName, vcnId, {});
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a MySQL HeatWave DB system then deletes it',
    async () => {
      const name = uniqueOciName('mysql', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'oci.mysql.dbsystem',
          name,
          { shape: 'MySQL.VM.Standard.E4.1.8GB', admin_password: 'IceTestAdmin_2026!', subnet_id: snId },
          {},
        );
        logger.log({ kind: 'create', handler: 'oci-mysql-dbsystem', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('oci.mysql.dbsystem', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'oci-mysql-dbsystem', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    15 * 60_000,
  );
});
