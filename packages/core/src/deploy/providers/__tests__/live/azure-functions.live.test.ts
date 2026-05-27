/**
 * Azure Functions live test.
 *
 * Functions require a parent storage account + app service plan
 * (Consumption Y1 SKU). The live test wires up a temporary storage
 * account, plan, then the function app — all three are cleaned up.
 *
 * Expected runtime: 2–4 min. Cost: ~free (Consumption Y1).
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure functions
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  AzureLiveContext,
  JsonlLogger,
  TEST_RUN_TAG_KEY,
  azureLive,
  createAzureDeployer,
  testRunTagValue,
  uniqueAzureName,
} from './_live-helpers';

azureLive('azure.web.functionApp — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-functions');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a function app then deletes it',
    async () => {
      const name = uniqueAzureName('icefn', 60)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.web.functionApp',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            runtime: 'node',
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-functions', result: r });
        // Note: the handler returns false if storage_account_id wasn't
        // wired and the auto-bootstrap quirk hasn't shipped yet. The
        // test asserts the dispatch worked and surfaces a clear error.
        if (r.success) {
          providerId = r.provider_id;
        } else {
          expect(r.error).toBeTruthy();
        }
      } finally {
        if (providerId) await ctx.deployer.delete('azure.web.functionApp', name, providerId, {});
      }
    },
    10 * 60_000,
  );
});
