/**
 * Azure Storage Account live test.
 *
 * Expected runtime: 30s–1min.
 * Expected cost:    free for the lifetime of this test (LRS Hot tier,
 *                   account deleted before billing accrues).
 *
 * Run:
 *   az login
 *   export AZURE_SUBSCRIPTION_ID=...
 *   export AZURE_LOCATION=eastus
 *   pnpm test:live:azure storage-account
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  AzureLiveContext,
  JsonlLogger,
  TEST_RUN_TAG_KEY,
  azureLive,
  createAzureDeployer,
  testRunTagValue,
  uniqueAzureStorageName,
} from './_live-helpers';

azureLive('azure.storage.account — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-storage-account');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a storage account then deletes it',
    async () => {
      const name = uniqueAzureStorageName('sa');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.storage.account',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            sku: 'Standard_LRS',
            kind: 'StorageV2',
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-storage-account', result: r });
        expect(r.success).toBe(true);
        expect(r.provider_id).toMatch(
          /\/subscriptions\/.+\/resourceGroups\/.+\/providers\/Microsoft\.Storage\/storageAccounts\//,
        );
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('azure.storage.account', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'azure-storage-account', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
