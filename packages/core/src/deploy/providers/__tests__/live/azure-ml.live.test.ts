/**
 * Azure ML Workspace live test.
 *
 * Workspace creation requires a storage account, key vault, and app
 * insights component. Wire those resource IDs via env vars:
 *   AZURE_TEST_ML_STORAGE_ID
 *   AZURE_TEST_ML_KEYVAULT_ID
 *   AZURE_TEST_ML_APPINSIGHTS_ID
 *
 * Skip-with-banner when any is missing.
 *
 * Expected runtime: 5–10 min. Cost: ~free for empty workspace.
 *
 * Run: AZURE_TEST_ML_STORAGE_ID=... AZURE_TEST_ML_KEYVAULT_ID=... \
 *      AZURE_TEST_ML_APPINSIGHTS_ID=... pnpm test:live:azure ml
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

azureLive('azure.machinelearning.workspace — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;
  const storage_id = process.env.AZURE_TEST_ML_STORAGE_ID;
  const keyvault_id = process.env.AZURE_TEST_ML_KEYVAULT_ID;
  const appinsights_id = process.env.AZURE_TEST_ML_APPINSIGHTS_ID;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-ml');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  if (!storage_id || !keyvault_id || !appinsights_id) {
    describe.skip('skipped — set AZURE_TEST_ML_STORAGE_ID + AZURE_TEST_ML_KEYVAULT_ID + AZURE_TEST_ML_APPINSIGHTS_ID', () => {
      it('skipped', () => {});
    });
    return;
  }

  it(
    'creates an ML workspace then deletes it',
    async () => {
      const name = uniqueAzureName('iceml', 33)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.machinelearning.workspace',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            storage_account_id: storage_id,
            key_vault_id: keyvault_id,
            app_insights_id: appinsights_id,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-ml', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) await ctx.deployer.delete('azure.machinelearning.workspace', name, providerId, {});
      }
    },
    20 * 60_000,
  );
});
