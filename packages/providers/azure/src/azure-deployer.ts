/**
 * Azure Deployer
 *
 * Deploys resources to Microsoft Azure using direct API calls.
 */

import type { DeployOptions, ResourceDeployResult, ProviderDeployer } from '../types.js';

/**
 * Azure resource deployer.
 */
export class AzureDeployer implements ProviderDeployer {
  provider = 'azure';

  private subscription_id: string = '';
  private resource_group: string = '';
  private credential: any = null;
  private compute_client: any = null;
  private storage_client: any = null;
  private web_client: any = null;

  async initialize(options: DeployOptions): Promise<void> {
    if (options.subscriptions && options.subscriptions.length > 0 && options.subscriptions[0]) {
      this.subscription_id = options.subscriptions[0];
    }

    if (
      options.resource_groups &&
      options.resource_groups.length > 0 &&
      options.resource_groups[0]
    ) {
      this.resource_group = options.resource_groups[0];
    }

    try {
      // Dynamic import of Azure SDK
      const identity_module = '@azure/identity';
      const identity = await Function('m', 'return import(m)')(identity_module);
      this.credential = new identity.DefaultAzureCredential();

      // Initialize compute client
      try {
        const compute_module = '@azure/arm-compute';
        const compute = await Function('m', 'return import(m)')(compute_module);
        this.compute_client = new compute.ComputeManagementClient(
          this.credential,
          this.subscription_id
        );
      } catch {
        // Compute client not available
      }

      // Initialize storage client
      try {
        const storage_module = '@azure/arm-storage';
        const storage = await Function('m', 'return import(m)')(storage_module);
        this.storage_client = new storage.StorageManagementClient(
          this.credential,
          this.subscription_id
        );
      } catch {
        // Storage client not available
      }

      // Initialize web client
      try {
        const web_module = '@azure/arm-appservice';
        const web = await Function('m', 'return import(m)')(web_module);
        this.web_client = new web.WebSiteManagementClient(this.credential, this.subscription_id);
      } catch {
        // Web client not available
      }
    } catch (error) {
      throw new Error(
        `Failed to initialize Azure SDK: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async cleanup(): Promise<void> {
    // No cleanup needed for Azure clients
  }

  async create(
    type: string,
    name: string,
    properties: Record<string, unknown>,
    options: Record<string, unknown>
  ): Promise<ResourceDeployResult> {
    const start = Date.now();

    try {
      let provider_id: string | undefined;

      if (type.startsWith('azure.compute.virtual_machine')) {
        provider_id = await this.create_virtual_machine(name, properties);
      } else if (type.startsWith('azure.storage.account')) {
        provider_id = await this.create_storage_account(name, properties);
      } else if (type.startsWith('azure.web.app')) {
        provider_id = await this.create_web_app(name, properties);
      } else {
        return {
          resource_id: name,
          name,
          type,
          action: 'create',
          success: false,
          error: `Unsupported resource type for creation: ${type}`,
          duration_ms: Date.now() - start,
        };
      }

      return {
        resource_id: name,
        name,
        type,
        action: 'create',
        success: true,
        provider_id,
        duration_ms: Date.now() - start,
      };
    } catch (error) {
      return {
        resource_id: name,
        name,
        type,
        action: 'create',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - start,
      };
    }
  }

  async update(
    type: string,
    name: string,
    provider_id: string,
    properties: Record<string, unknown>,
    current_properties: Record<string, unknown>,
    options: Record<string, unknown>
  ): Promise<ResourceDeployResult> {
    const start = Date.now();

    try {
      if (type.startsWith('azure.compute.virtual_machine')) {
        await this.update_virtual_machine(name, provider_id, properties);
      } else if (type.startsWith('azure.storage.account')) {
        await this.update_storage_account(name, provider_id, properties);
      } else if (type.startsWith('azure.web.app')) {
        await this.update_web_app(name, provider_id, properties);
      } else {
        return {
          resource_id: name,
          name,
          type,
          action: 'update',
          success: false,
          error: `Unsupported resource type for update: ${type}`,
          duration_ms: Date.now() - start,
        };
      }

      return {
        resource_id: name,
        name,
        type,
        action: 'update',
        success: true,
        provider_id,
        duration_ms: Date.now() - start,
      };
    } catch (error) {
      return {
        resource_id: name,
        name,
        type,
        action: 'update',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - start,
      };
    }
  }

  async delete(
    type: string,
    name: string,
    provider_id: string,
    options: Record<string, unknown>
  ): Promise<ResourceDeployResult> {
    const start = Date.now();

    try {
      if (type.startsWith('azure.compute.virtual_machine')) {
        await this.delete_virtual_machine(name, provider_id);
      } else if (type.startsWith('azure.storage.account')) {
        await this.delete_storage_account(name, provider_id);
      } else if (type.startsWith('azure.web.app')) {
        await this.delete_web_app(name, provider_id);
      } else {
        return {
          resource_id: name,
          name,
          type,
          action: 'delete',
          success: false,
          error: `Unsupported resource type for deletion: ${type}`,
          duration_ms: Date.now() - start,
        };
      }

      return {
        resource_id: name,
        name,
        type,
        action: 'delete',
        success: true,
        duration_ms: Date.now() - start,
      };
    } catch (error) {
      return {
        resource_id: name,
        name,
        type,
        action: 'delete',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - start,
      };
    }
  }

  // ============================================================================
  // Virtual Machines
  // ============================================================================

  private async create_virtual_machine(
    name: string,
    properties: Record<string, unknown>
  ): Promise<string> {
    if (!this.compute_client) {
      throw new Error('Compute SDK not available. Install @azure/arm-compute');
    }

    const location = (properties.location as string) || 'eastus';
    const vm_size = (properties.vm_size as string) || 'Standard_B1s';
    const resource_group = (properties.resource_group as string) || this.resource_group;

    const result = await this.compute_client.virtualMachines.beginCreateOrUpdateAndWait(
      resource_group,
      name,
      {
        location,
        hardwareProfile: {
          vmSize: vm_size,
        },
        storageProfile: {
          imageReference: {
            publisher: (properties.image_publisher as string) || 'Canonical',
            offer: (properties.image_offer as string) || '0001-com-ubuntu-server-jammy',
            sku: (properties.image_sku as string) || '22_04-lts',
            version: 'latest',
          },
          osDisk: {
            createOption: 'FromImage',
            managedDisk: {
              storageAccountType: 'Standard_LRS',
            },
          },
        },
        osProfile: {
          computerName: name,
          adminUsername: (properties.admin_username as string) || 'azureuser',
          adminPassword: properties.admin_password as string,
          linuxConfiguration: !properties.admin_password
            ? {
                disablePasswordAuthentication: true,
                ssh: {
                  publicKeys: properties.ssh_public_keys as any[],
                },
              }
            : undefined,
        },
        networkProfile: {
          networkInterfaces: properties.network_interfaces as any[],
        },
        tags: properties.tags as Record<string, string>,
      }
    );

    return result.id || '';
  }

  private async update_virtual_machine(
    name: string,
    provider_id: string,
    properties: Record<string, unknown>
  ): Promise<void> {
    if (!this.compute_client) {
      throw new Error('Compute SDK not available');
    }

    const resource_group = this.extract_resource_group(provider_id);

    // Update tags
    if (properties.tags) {
      await this.compute_client.virtualMachines.beginUpdateAndWait(resource_group, name, {
        tags: properties.tags as Record<string, string>,
      });
    }
  }

  private async delete_virtual_machine(name: string, provider_id: string): Promise<void> {
    if (!this.compute_client) {
      throw new Error('Compute SDK not available');
    }

    const resource_group = this.extract_resource_group(provider_id);

    await this.compute_client.virtualMachines.beginDeleteAndWait(resource_group, name);
  }

  // ============================================================================
  // Storage Accounts
  // ============================================================================

  private async create_storage_account(
    name: string,
    properties: Record<string, unknown>
  ): Promise<string> {
    if (!this.storage_client) {
      throw new Error('Storage SDK not available. Install @azure/arm-storage');
    }

    const location = (properties.location as string) || 'eastus';
    const sku = (properties.sku as string) || 'Standard_LRS';
    const resource_group = (properties.resource_group as string) || this.resource_group;

    const result = await this.storage_client.storageAccounts.beginCreateAndWait(
      resource_group,
      name,
      {
        location,
        sku: { name: sku },
        kind: (properties.kind as string) || 'StorageV2',
        tags: properties.tags as Record<string, string>,
      }
    );

    return result.id || '';
  }

  private async update_storage_account(
    name: string,
    provider_id: string,
    properties: Record<string, unknown>
  ): Promise<void> {
    if (!this.storage_client) {
      throw new Error('Storage SDK not available');
    }

    const resource_group = this.extract_resource_group(provider_id);

    await this.storage_client.storageAccounts.update(resource_group, name, {
      tags: properties.tags as Record<string, string>,
    });
  }

  private async delete_storage_account(name: string, provider_id: string): Promise<void> {
    if (!this.storage_client) {
      throw new Error('Storage SDK not available');
    }

    const resource_group = this.extract_resource_group(provider_id);

    await this.storage_client.storageAccounts.delete(resource_group, name);
  }

  // ============================================================================
  // Web Apps
  // ============================================================================

  private async create_web_app(name: string, properties: Record<string, unknown>): Promise<string> {
    if (!this.web_client) {
      throw new Error('Web SDK not available. Install @azure/arm-appservice');
    }

    const location = (properties.location as string) || 'eastus';
    const resource_group = (properties.resource_group as string) || this.resource_group;

    const result = await this.web_client.webApps.beginCreateOrUpdateAndWait(resource_group, name, {
      location,
      serverFarmId: properties.app_service_plan_id as string,
      siteConfig: {
        linuxFxVersion: properties.linux_fx_version as string,
        appSettings: properties.app_settings
          ? Object.entries(properties.app_settings as Record<string, string>).map(
              ([name, value]) => ({ name, value })
            )
          : undefined,
      },
      tags: properties.tags as Record<string, string>,
    });

    return result.id || '';
  }

  private async update_web_app(
    name: string,
    provider_id: string,
    properties: Record<string, unknown>
  ): Promise<void> {
    if (!this.web_client) {
      throw new Error('Web SDK not available');
    }

    const resource_group = this.extract_resource_group(provider_id);

    await this.web_client.webApps.update(resource_group, name, {
      siteConfig: {
        appSettings: properties.app_settings
          ? Object.entries(properties.app_settings as Record<string, string>).map(
              ([name, value]) => ({ name, value })
            )
          : undefined,
      },
      tags: properties.tags as Record<string, string>,
    });
  }

  private async delete_web_app(name: string, provider_id: string): Promise<void> {
    if (!this.web_client) {
      throw new Error('Web SDK not available');
    }

    const resource_group = this.extract_resource_group(provider_id);

    await this.web_client.webApps.delete(resource_group, name);
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private extract_resource_group(provider_id: string): string {
    const match = provider_id.match(/resourceGroups\/([^/]+)/i);
    return match && match[1] ? match[1] : this.resource_group;
  }
}

/**
 * Create an Azure deployer instance.
 */
export function create_azure_deployer(): AzureDeployer {
  return new AzureDeployer();
}
