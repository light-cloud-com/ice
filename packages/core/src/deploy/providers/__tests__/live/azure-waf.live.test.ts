/**
 * Azure WAF Policy live test.
 * Expected runtime: ~30 sec. Cost: ~$5/month (deleted at end → fractions of a cent).
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure waf
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

azureLive('azure.network.webApplicationFirewallPolicy — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-waf');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Detection-mode policy then deletes it',
    async () => {
      const name = uniqueAzureName('icewaf', 80);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.network.webApplicationFirewallPolicy',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            mode: 'Detection',
            managed_rules: [{ ruleSetType: 'OWASP', ruleSetVersion: '3.2' }],
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-waf', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) await ctx.deployer.delete('azure.network.webApplicationFirewallPolicy', name, providerId, {});
      }
    },
    10 * 60_000,
  );
});
