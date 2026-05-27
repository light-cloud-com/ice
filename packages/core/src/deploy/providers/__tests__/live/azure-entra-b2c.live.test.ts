/**
 * Azure Entra External ID (B2C) live test.
 *
 * Creating a B2C tenant requires tenant administrator privileges on
 * the target subscription and a globally-unique `.onmicrosoft.com`
 * domain. Skip-with-banner when AZURE_TEST_B2C_DOMAIN isn't set.
 *
 * Expected runtime: 2–5 min. Cost: free until users sign in.
 *
 * Run: AZURE_TEST_B2C_DOMAIN=icetest123.onmicrosoft.com pnpm test:live:azure entra-b2c
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AzureLiveContext,
  JsonlLogger,
  TEST_RUN_TAG_KEY,
  azureLive,
  createAzureDeployer,
  testRunTagValue,
} from './_live-helpers';

azureLive('azure.aadb2c.directory — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;
  const tenant_domain = process.env.AZURE_TEST_B2C_DOMAIN;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-entra-b2c');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  if (!tenant_domain) {
    describe.skip('skipped — set AZURE_TEST_B2C_DOMAIN to a unique .onmicrosoft.com domain', () => {
      it('skipped', () => {});
    });
    return;
  }

  it(
    'creates a B2C tenant then deletes it',
    async () => {
      const display = tenant_domain.split('.')[0];
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.aadb2c.directory',
          display,
          {
            location: ctx.location || 'United States',
            resource_group: ctx.resourceGroup,
            tenant_name: tenant_domain,
            display_name: display,
            country_code: 'US',
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-entra-b2c', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) await ctx.deployer.delete('azure.aadb2c.directory', display, providerId, {});
      }
    },
    15 * 60_000,
  );
});
