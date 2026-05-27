/**
 * Azure Virtual Machine live test.
 *
 * Expected runtime: 2–5 min.
 * Expected cost:    pennies (Standard_B1s ~$0.01/hr, VM deleted promptly).
 *
 * One-time setup:
 *   - VMs need a Network Interface. Create one in your test resource
 *     group attached to an existing subnet:
 *
 *       az network vnet create -g ice-test-rg -n ice-test-vnet \
 *         --address-prefix 10.0.0.0/16 --subnet-name default \
 *         --subnet-prefix 10.0.0.0/24
 *       az network nic create -g ice-test-rg -n ice-test-nic \
 *         --vnet-name ice-test-vnet --subnet default
 *       az network nic show -g ice-test-rg -n ice-test-nic --query id -o tsv
 *
 *   - export AZURE_TEST_NIC_ID=<id printed above>
 *   - export AZURE_TEST_VM_PASSWORD=<a Strong-Pass1234> (Azure rejects weak ones)
 *
 * Run:
 *   pnpm test:live:azure virtual-machine
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

azureLive('azure.compute.virtual_machine — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;
  const nicId = process.env.AZURE_TEST_NIC_ID;
  const password = process.env.AZURE_TEST_VM_PASSWORD;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-virtual-machine');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  if (!nicId || !password) {
    describe.skip('skipped — set AZURE_TEST_NIC_ID and AZURE_TEST_VM_PASSWORD (one-time setup in test header)', () => {
      it('skipped', () => {});
    });
    return;
  }

  it(
    'creates a B1s Ubuntu VM then deletes it',
    async () => {
      const name = uniqueAzureName('vm', 60);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.compute.virtual_machine',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            vm_size: 'Standard_B1s',
            admin_username: 'azureuser',
            admin_password: password,
            network_interfaces: [{ id: nicId, primary: true }],
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-virtual-machine', result: r });
        expect(r.success).toBe(true);
        expect(r.provider_id).toMatch(/\/providers\/Microsoft\.Compute\/virtualMachines\//);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('azure.compute.virtual_machine', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'azure-virtual-machine', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    15 * 60_000,
  );
});
