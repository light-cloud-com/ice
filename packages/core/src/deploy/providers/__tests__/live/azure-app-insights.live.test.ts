/**
 * Azure Application Insights component live test.
 *
 * App Insights now requires a parent Log Analytics workspace. The test
 * creates a workspace, the component, then tears down both.
 * Expected runtime: ~1 min. Cost: free with 0 traffic.
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure app-insights
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

azureLive('azure.insights.appInsights — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-app-insights');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates workspace + component then tears both down',
    async () => {
      const ws_name = uniqueAzureName('aila', 63);
      const ai_name = uniqueAzureName('aiapp', 63);
      let ws_id: string | undefined;
      let ai_id: string | undefined;
      try {
        const ws = await ctx.deployer.create(
          'azure.monitor.logAnalytics',
          ws_name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            sku: 'PerGB2018',
            retention_days: 30,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        expect(ws.success).toBe(true);
        ws_id = ws.provider_id;

        const r = await ctx.deployer.create(
          'azure.insights.appInsights',
          ai_name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            application_type: 'web',
            workspace_resource_id: ws_id,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-app-insights', result: r });
        expect(r.success).toBe(true);
        ai_id = r.provider_id;
      } finally {
        if (ai_id) await ctx.deployer.delete('azure.insights.appInsights', ai_name, ai_id, {});
        if (ws_id) await ctx.deployer.delete('azure.monitor.logAnalytics', ws_name, ws_id, {});
      }
    },
    10 * 60_000,
  );
});
