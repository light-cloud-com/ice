/**
 * Azure VM handler — `azure.compute.virtual_machine`.
 *
 * Migrated verbatim from the legacy monolithic azure-deployer.ts —
 * same SDK calls, same shape, same defaults. Auto-resource-group
 * support added so a canvas without an explicit resource_group still
 * works.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.compute.virtual_machine';
const SDK = '@azure/arm-compute';

export const virtual_machine_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('compute') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Compute', SDK);

    try {
      const location = (properties.location as string) || ctx.location;
      const vm_size = (properties.vm_size as string) || 'Standard_B1s';
      const resource_group = (properties.resource_group as string) || ctx.resource_group;

      const result = await client.virtualMachines.beginCreateOrUpdateAndWait(resource_group, name, {
        location,
        hardwareProfile: { vmSize: vm_size },
        storageProfile: {
          imageReference: {
            publisher: (properties.image_publisher as string) || 'Canonical',
            offer: (properties.image_offer as string) || '0001-com-ubuntu-server-jammy',
            sku: (properties.image_sku as string) || '22_04-lts',
            version: 'latest',
          },
          osDisk: {
            createOption: 'FromImage',
            managedDisk: { storageAccountType: 'Standard_LRS' },
          },
        },
        osProfile: {
          computerName: name,
          adminUsername: (properties.admin_username as string) || 'azureuser',
          adminPassword: properties.admin_password as string,
          linuxConfiguration: !properties.admin_password
            ? {
                disablePasswordAuthentication: true,
                ssh: { publicKeys: properties.ssh_public_keys as any[] },
              }
            : undefined,
        },
        networkProfile: { networkInterfaces: properties.network_interfaces as any[] },
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('compute') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Compute SDK not available');

    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      if (properties.tags) {
        await client.virtualMachines.beginUpdateAndWait(resource_group, name, {
          tags: properties.tags as Record<string, string>,
        });
      }
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('compute') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Compute SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.virtualMachines.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
