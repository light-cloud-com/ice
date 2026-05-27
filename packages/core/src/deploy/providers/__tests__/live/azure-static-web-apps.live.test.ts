/**
 * Azure Static Web Apps live test.
 *
 * Expected runtime: 1–2 min.
 * Expected cost:    free (Free SKU; deleted at the end).
 *
 * Site name constraints: 2-60 chars, alphanumeric + hyphens.
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus2 pnpm test:live:azure static-web-apps
 * Note: Static Web Apps are only available in a handful of regions
 * (eastus2, westus2, centralus, westeurope, eastasia). Override
 * AZURE_LOCATION accordingly if your default is unsupported.
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

azureLive('azure.web.staticSite — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-static-web-apps');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a site (BYOC mode — no repo) then deletes it',
    async () => {
      const name = uniqueAzureName('swa', 60)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.web.staticSite',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            sku_name: 'Free',
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-static-web-apps', result: r });
        expect(r.success).toBe(true);
        expect(r.provider_id).toMatch(/\/providers\/Microsoft\.Web\/staticSites\//);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('azure.web.staticSite', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'azure-static-web-apps', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
