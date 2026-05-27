/**
 * Azure Container Apps live test.
 *
 * The handler auto-bootstraps a `ice-default-env` Managed Environment
 * on first deploy. Both the environment and the container app are
 * deleted at the end. Expected runtime: 5–10 min.
 *
 * Cost: scale-to-zero with no traffic (~$0).
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure container-apps
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

azureLive('azure.containerapps.app — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-container-apps');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a container app (auto-bootstraps env) then deletes it',
    async () => {
      const name = uniqueAzureName('iceca', 32)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.containerapps.app',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            image: 'mcr.microsoft.com/azuredocs/aci-helloworld',
            port: 80,
            cpu: 0.5,
            memory: '1Gi',
            min_replicas: 0,
            max_replicas: 1,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-container-apps', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) await ctx.deployer.delete('azure.containerapps.app', name, providerId, {});
      }
    },
    20 * 60_000,
  );
});
