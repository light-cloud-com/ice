/**
 * OCI Vault secret live test — requires a Vault + KMS Key OCID.
 *
 * Run: pnpm test:live:oci vault-secret
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { JsonlLogger, OCILiveContext, createOCIDeployer, ociLive, uniqueOciName } from './_live-helpers';

ociLive('oci.vault.secret — create + delete', () => {
  let ctx: OCILiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createOCIDeployer();
    logger = new JsonlLogger('oci-vault-secret');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Vault secret then schedules delete',
    async () => {
      const name = uniqueOciName('sec', 64);
      const vaultId = process.env.OCI_VAULT_OCID ?? '';
      const kmsKeyId = process.env.OCI_KMS_KEY_OCID ?? '';
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'oci.vault.secret',
          name,
          { vault_id: vaultId, kms_key_id: kmsKeyId, value: 'hunter2' },
          {},
        );
        logger.log({ kind: 'create', handler: 'oci-vault-secret', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('oci.vault.secret', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'oci-vault-secret', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
