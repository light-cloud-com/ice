/**
 * Azure OpenAI live test.
 *
 * Requires quota approval — Azure OpenAI is gated behind an opt-in
 * process. The test will fail with "Quota exceeded" or "Service not
 * available in this region" until your subscription is approved.
 *
 * Expected runtime: 2–4 min. Cost: free until model deployments (this
 * test only creates the account).
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure openai
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

azureLive('azure.cognitiveservices.account (OpenAI) — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-openai');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates an OpenAI account then deletes it',
    async () => {
      const name = uniqueAzureName('iceoai', 64)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.cognitiveservices.account',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            kind: 'OpenAI',
            sku_name: 'S0',
            custom_subdomain: name,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-openai', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) await ctx.deployer.delete('azure.cognitiveservices.account', name, providerId, {});
      }
    },
    10 * 60_000,
  );
});
