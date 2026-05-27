/**
 * Azure Kubernetes Service live test.
 *
 * Expected runtime: 5–10 min. Cost: ~$1 (one D2s_v3 node, deleted at end).
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure aks
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

azureLive('azure.containerservice.managedCluster — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-aks');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a 1-node AKS then deletes it',
    async () => {
      const name = uniqueAzureName('aks', 63)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.containerservice.managedCluster',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            node_count: 1,
            vm_size: 'Standard_D2s_v3',
            dns_prefix: 'iceaks',
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-aks', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) await ctx.deployer.delete('azure.containerservice.managedCluster', name, providerId, {});
      }
    },
    30 * 60_000,
  );
});
