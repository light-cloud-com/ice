/**
 * Azure Key Vault live test.
 *
 * Expected runtime: 1–2 min.
 * Expected cost:    pennies (Standard tier; $0.03 per 10k operations).
 *
 * Vault name constraints: 3-24 chars, alphanumeric + hyphens.
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus AZURE_TENANT_ID=... pnpm test:live:azure key-vault
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AzureLiveContext,
  JsonlLogger,
  TEST_RUN_TAG_KEY,
  azureLive,
  createAzureDeployer,
  testRunTagValue,
  uniqueAzureName,
} from './_live-helpers';

azureLive('azure.keyvault.vault — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;
  const tenant = process.env.AZURE_TENANT_ID;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-key-vault');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  if (!tenant) {
    describe.skip('skipped — set AZURE_TENANT_ID (or rely on az login session) to provision a Key Vault', () => {
      it('skipped', () => {});
    });
    return;
  }

  it(
    'creates a vault then deletes it',
    async () => {
      const name = uniqueAzureName('kv', 24)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 24);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.keyvault.vault',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            tenant_id: tenant,
            sku: 'standard',
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-key-vault', result: r });
        expect(r.success).toBe(true);
        expect(r.provider_id).toMatch(/\/providers\/Microsoft\.KeyVault\/vaults\//);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('azure.keyvault.vault', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'azure-key-vault', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
