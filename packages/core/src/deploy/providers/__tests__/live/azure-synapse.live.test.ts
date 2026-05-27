/**
 * Azure Synapse Analytics workspace live test.
 *
 * Workspace creation requires:
 *   - SQL admin login + password (set AZURE_SYNAPSE_PASSWORD)
 *   - A Data Lake Gen2 filesystem (set AZURE_TEST_SYNAPSE_STORAGE_URL + AZURE_TEST_SYNAPSE_FILESYSTEM)
 *
 * Skip-with-banner when either Data Lake env var is missing.
 *
 * Expected runtime: 5–15 min. Cost: ~$5–10/hour for SQL pool when on
 * (the workspace itself is free until provisioning a pool).
 *
 * Run: AZURE_TEST_SYNAPSE_STORAGE_URL=https://x.dfs.core.windows.net \
 *      AZURE_TEST_SYNAPSE_FILESYSTEM=synapse pnpm test:live:azure synapse
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AzureLiveContext,
  JsonlLogger,
  TEST_RUN_TAG_KEY,
  azureLive,
  createAzureDeployer,
  testRunTagValue,
  uniqueAzureName,
} from './_live-helpers';

azureLive('azure.synapse.workspace — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;
  const password = process.env.AZURE_SYNAPSE_PASSWORD ?? 'IceTest!P@ss123';
  const storage_url = process.env.AZURE_TEST_SYNAPSE_STORAGE_URL;
  const filesystem = process.env.AZURE_TEST_SYNAPSE_FILESYSTEM;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-synapse');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  if (!storage_url || !filesystem) {
    describe.skip('skipped — set AZURE_TEST_SYNAPSE_STORAGE_URL + AZURE_TEST_SYNAPSE_FILESYSTEM', () => {
      it('skipped', () => {});
    });
    return;
  }

  it(
    'creates a workspace then deletes it',
    async () => {
      const name = uniqueAzureName('icesyn', 50)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.synapse.workspace',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            sql_administrator_login: 'iceadmin',
            sql_administrator_login_password: password,
            storage_account_url: storage_url,
            filesystem_name: filesystem,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-synapse', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) await ctx.deployer.delete('azure.synapse.workspace', name, providerId, {});
      }
    },
    30 * 60_000,
  );
});
