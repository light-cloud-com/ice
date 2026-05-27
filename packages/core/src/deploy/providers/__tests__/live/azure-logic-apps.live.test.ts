/**
 * Azure Logic Apps Consumption workflow live test.
 * Expected runtime: ~1 min. Cost: free (consumption tier, no triggers).
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure logic-apps
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

azureLive('azure.logic.workflow — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-logic-apps');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a workflow then deletes it',
    async () => {
      const name = uniqueAzureName('lw', 80);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.logic.workflow',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            definition: {
              $schema:
                'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
              contentVersion: '1.0.0.0',
              triggers: {},
              actions: {},
            },
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-logic-apps', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) await ctx.deployer.delete('azure.logic.workflow', name, providerId, {});
      }
    },
    5 * 60_000,
  );
});
