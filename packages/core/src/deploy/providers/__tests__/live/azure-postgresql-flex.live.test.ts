/**
 * Azure PostgreSQL Flexible Server live test.
 *
 * Expected runtime: 3–5 min.
 * Expected cost:    ~$0.30 (Burstable B1ms; deleted at the end).
 *
 * Server name constraints: 3-63 chars, lowercase alphanumeric + hyphens.
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure postgresql-flex
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

azureLive('azure.postgresqlflex.server — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;
  const password = process.env.AZURE_PG_PASSWORD ?? 'IceTest!P@ss123';

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-postgresql-flex');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a server then deletes it',
    async () => {
      const name = uniqueAzureName('pg', 63)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.postgresqlflex.server',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            administrator_login: 'iceadmin',
            administrator_login_password: password,
            sku_name: 'Standard_B1ms',
            sku_tier: 'Burstable',
            storage_size_gb: 32,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-postgresql-flex', result: r });
        expect(r.success).toBe(true);
        expect(r.provider_id).toMatch(/\/providers\/Microsoft\.DBforPostgreSQL\/flexibleServers\//);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('azure.postgresqlflex.server', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'azure-postgresql-flex', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    15 * 60_000,
  );
});
