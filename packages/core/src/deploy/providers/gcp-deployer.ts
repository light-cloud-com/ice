/**
 * GCP Deployer
 *
 * Deploys resources to Google Cloud Platform using direct API calls.
 */

import type { DeployOptions, ResourceDeployResult, ProviderDeployer } from '../types.js';

/**
 * GCP resource deployer.
 */
export class GCPDeployer implements ProviderDeployer {
  provider = 'gcp';

  private project: string = '';
  private compute_client: any = null;
  private storage_client: any = null;
  private run_client: any = null;

  async initialize(options: DeployOptions): Promise<void> {
    if (!options.project) {
      throw new Error('GCP project is required');
    }
    this.project = options.project;

    // Dynamic import of Google Cloud SDKs
    try {
      // Import Compute Engine client
      try {
        const compute_module = '@google-cloud/compute';
        const compute = await Function('m', 'return import(m)')(compute_module);
        this.compute_client = new compute.InstancesClient();
      } catch {
        // Compute client not available
      }

      // Import Storage client
      try {
        const storage_module = '@google-cloud/storage';
        const storage = await Function('m', 'return import(m)')(storage_module);
        this.storage_client = new storage.Storage();
      } catch {
        // Storage client not available
      }

      // Import Cloud Run client
      try {
        const run_module = '@google-cloud/run';
        const run = await Function('m', 'return import(m)')(run_module);
        this.run_client = new run.ServicesClient();
      } catch {
        // Cloud Run client not available
      }
    } catch (error) {
      throw new Error(
        `Failed to initialize GCP SDK: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async cleanup(): Promise<void> {
    // No cleanup needed for GCP clients
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

      // Route to appropriate handler based on type
      if (type.startsWith('gcp.compute.instance')) {
        provider_id = await this.create_compute_instance(name, properties);
      } else if (type.startsWith('gcp.storage.bucket')) {
        provider_id = await this.create_storage_bucket(name, properties);
      } else if (type.startsWith('gcp.run.service')) {
        provider_id = await this.create_cloud_run_service(name, properties);
      } else {
        // Unsupported resource type
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
      // Route to appropriate handler based on type
      if (type.startsWith('gcp.compute.instance')) {
        await this.update_compute_instance(name, provider_id, properties, current_properties);
      } else if (type.startsWith('gcp.storage.bucket')) {
        await this.update_storage_bucket(name, provider_id, properties);
      } else if (type.startsWith('gcp.run.service')) {
        await this.update_cloud_run_service(name, provider_id, properties);
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
      // Route to appropriate handler based on type
      if (type.startsWith('gcp.compute.instance')) {
        await this.delete_compute_instance(name, provider_id);
      } else if (type.startsWith('gcp.storage.bucket')) {
        await this.delete_storage_bucket(name, provider_id);
      } else if (type.startsWith('gcp.run.service')) {
        await this.delete_cloud_run_service(name, provider_id);
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
  // Compute Engine
  // ============================================================================

  private async create_compute_instance(
    name: string,
    properties: Record<string, unknown>
  ): Promise<string> {
    if (!this.compute_client) {
      throw new Error('Compute Engine SDK not available. Install @google-cloud/compute');
    }

    const zone = (properties.zone as string) || 'us-central1-a';
    const machine_type = (properties.machine_type as string) || 'e2-micro';

    const [operation] = await this.compute_client.insert({
      project: this.project,
      zone,
      instanceResource: {
        name,
        machineType: `zones/${zone}/machineTypes/${machine_type}`,
        disks: properties.disks || [
          {
            boot: true,
            initializeParams: {
              sourceImage: 'projects/debian-cloud/global/images/family/debian-11',
            },
          },
        ],
        networkInterfaces: properties.network_interfaces || [
          {
            network: 'global/networks/default',
            accessConfigs: [{ type: 'ONE_TO_ONE_NAT', name: 'External NAT' }],
          },
        ],
        metadata: properties.metadata,
        labels: properties.labels,
      },
    });

    // Wait for operation to complete
    await operation.promise();

    return `projects/${this.project}/zones/${zone}/instances/${name}`;
  }

  private async update_compute_instance(
    name: string,
    provider_id: string,
    properties: Record<string, unknown>,
    current_properties: Record<string, unknown>
  ): Promise<void> {
    if (!this.compute_client) {
      throw new Error('Compute Engine SDK not available');
    }

    // Extract zone from provider_id
    const zone_match = provider_id.match(/zones\/([^/]+)/);
    const zone = zone_match ? zone_match[1] : 'us-central1-a';

    // Update labels if changed
    if (properties.labels) {
      const [operation] = await this.compute_client.setLabels({
        project: this.project,
        zone,
        instance: name,
        instancesSetLabelsRequestResource: {
          labels: properties.labels,
          labelFingerprint: current_properties._label_fingerprint,
        },
      });
      await operation.promise();
    }

    // Update metadata if changed
    if (properties.metadata) {
      const [operation] = await this.compute_client.setMetadata({
        project: this.project,
        zone,
        instance: name,
        metadataResource: {
          items: Object.entries(properties.metadata as Record<string, string>).map(
            ([key, value]) => ({ key, value })
          ),
          fingerprint: current_properties._metadata_fingerprint,
        },
      });
      await operation.promise();
    }
  }

  private async delete_compute_instance(name: string, provider_id: string): Promise<void> {
    if (!this.compute_client) {
      throw new Error('Compute Engine SDK not available');
    }

    // Extract zone from provider_id
    const zone_match = provider_id.match(/zones\/([^/]+)/);
    const zone = zone_match ? zone_match[1] : 'us-central1-a';

    const [operation] = await this.compute_client.delete({
      project: this.project,
      zone,
      instance: name,
    });

    await operation.promise();
  }

  // ============================================================================
  // Cloud Storage
  // ============================================================================

  private async create_storage_bucket(
    name: string,
    properties: Record<string, unknown>
  ): Promise<string> {
    if (!this.storage_client) {
      throw new Error('Cloud Storage SDK not available. Install @google-cloud/storage');
    }

    const location = (properties.location as string) || 'US';
    const storage_class = (properties.storage_class as string) || 'STANDARD';

    await this.storage_client.createBucket(name, {
      location,
      storageClass: storage_class,
      labels: properties.labels,
    });

    return `gs://${name}`;
  }

  private async update_storage_bucket(
    name: string,
    provider_id: string,
    properties: Record<string, unknown>
  ): Promise<void> {
    if (!this.storage_client) {
      throw new Error('Cloud Storage SDK not available');
    }

    const bucket = this.storage_client.bucket(name);

    // Update labels
    if (properties.labels) {
      await bucket.setLabels(properties.labels);
    }

    // Update lifecycle rules
    if (properties.lifecycle) {
      await bucket.setMetadata({
        lifecycle: properties.lifecycle,
      });
    }
  }

  private async delete_storage_bucket(name: string, provider_id: string): Promise<void> {
    if (!this.storage_client) {
      throw new Error('Cloud Storage SDK not available');
    }

    const bucket = this.storage_client.bucket(name);

    // Delete all objects first (required before bucket deletion)
    await bucket.deleteFiles({ force: true });

    // Delete the bucket
    await bucket.delete();
  }

  // ============================================================================
  // Cloud Run
  // ============================================================================

  private async create_cloud_run_service(
    name: string,
    properties: Record<string, unknown>
  ): Promise<string> {
    if (!this.run_client) {
      throw new Error('Cloud Run SDK not available. Install @google-cloud/run');
    }

    const region = (properties.region as string) || 'us-central1';
    const image = properties.image as string;

    if (!image) {
      throw new Error('Cloud Run service requires an image property');
    }

    const [operation] = await this.run_client.createService({
      parent: `projects/${this.project}/locations/${region}`,
      service: {
        name,
        template: {
          containers: [
            {
              image,
              env: properties.env_vars
                ? Object.entries(properties.env_vars as Record<string, string>).map(
                    ([name, value]) => ({ name, value })
                  )
                : undefined,
            },
          ],
        },
        labels: properties.labels,
      },
    });

    await operation.promise();

    return `projects/${this.project}/locations/${region}/services/${name}`;
  }

  private async update_cloud_run_service(
    name: string,
    provider_id: string,
    properties: Record<string, unknown>
  ): Promise<void> {
    if (!this.run_client) {
      throw new Error('Cloud Run SDK not available');
    }

    // Extract region from provider_id
    const region_match = provider_id.match(/locations\/([^/]+)/);
    const region = region_match ? region_match[1] : 'us-central1';

    const [operation] = await this.run_client.updateService({
      service: {
        name: `projects/${this.project}/locations/${region}/services/${name}`,
        template: {
          containers: [
            {
              image: properties.image as string,
              env: properties.env_vars
                ? Object.entries(properties.env_vars as Record<string, string>).map(
                    ([name, value]) => ({ name, value })
                  )
                : undefined,
            },
          ],
        },
        labels: properties.labels,
      },
    });

    await operation.promise();
  }

  private async delete_cloud_run_service(name: string, provider_id: string): Promise<void> {
    if (!this.run_client) {
      throw new Error('Cloud Run SDK not available');
    }

    // Extract region from provider_id
    const region_match = provider_id.match(/locations\/([^/]+)/);
    const region = region_match ? region_match[1] : 'us-central1';

    const [operation] = await this.run_client.deleteService({
      name: `projects/${this.project}/locations/${region}/services/${name}`,
    });

    await operation.promise();
  }
}

/**
 * Create a GCP deployer instance.
 */
export function create_gcp_deployer(): GCPDeployer {
  return new GCPDeployer();
}
