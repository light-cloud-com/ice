/**
 * GCP Cloud Storage Service
 *
 * Discovers Cloud Storage buckets.
 */

import { BaseGCPService } from './base-service.js';
import type {
  ServiceDiscoveryResult,
  GCPServiceType,
  GCPResource,
  GCPImportError,
  GCPImportWarning,
} from '../types.js';

/**
 * Cloud Storage resource discovery service.
 */
export class StorageService extends BaseGCPService {
   
  private storage_client: any = null;

  get service_type(): GCPServiceType {
    return 'storage';
  }

  /**
   * Initialize the Cloud Storage client.
   */
  private async init_client(): Promise<void> {
    if (this.storage_client) return;

    try {
      // Dynamic import to make the dependency optional
      // Use string variable to prevent TypeScript from trying to resolve the module
      const module_name = '@google-cloud/storage';
       
      const storage_module: any = await Function('moduleName', 'return import(moduleName)')(module_name);
      const Storage = storage_module.Storage;

      const options: Record<string, unknown> = {
        projectId: this.project,
      };

      if (this.key_file) {
        options.keyFilename = this.key_file;
      }

      this.storage_client = new Storage(options);
    } catch (error) {
      throw new Error(
        `Failed to initialize GCP Storage client. Make sure @google-cloud/storage is installed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  async discover(): Promise<ServiceDiscoveryResult> {
    const resources: GCPResource[] = [];
    const errors: GCPImportError[] = [];
    const warnings: GCPImportWarning[] = [];

    try {
      await this.init_client();
    } catch (error) {
      return {
        service: this.service_type,
        resources: [],
        errors: [this.create_error('INIT_ERROR', error instanceof Error ? error.message : String(error))],
        warnings: [],
      };
    }

    if (!this.storage_client) {
      return {
        service: this.service_type,
        resources: [],
        errors: [this.create_error('INIT_ERROR', 'Storage client not initialized')],
        warnings: [],
      };
    }

    try {
      const [buckets] = await this.storage_client.getBuckets();

      for (const bucket of buckets) {
        try {
          const [metadata] = await bucket.getMetadata();

          resources.push({
            self_link: metadata.selfLink || `https://storage.googleapis.com/storage/v1/b/${bucket.name}`,
            name: bucket.name,
            id: metadata.id || bucket.name,
            kind: 'storage#bucket',
            region: metadata.location,
            project: this.project,
            properties: metadata as Record<string, unknown>,
            labels: metadata.labels,
            creation_timestamp: metadata.timeCreated,
          });
        } catch (error: unknown) {
          const err = error as { message?: string };
          warnings.push(
            this.create_warning(
              'METADATA_ERROR',
              `Failed to get metadata for bucket ${bucket.name}: ${err.message || String(error)}`,
              bucket.name,
            ),
          );
        }
      }
    } catch (error: unknown) {
      const err = error as { code?: number; message?: string };
      if (err.code === 403 || err.code === 404) {
        warnings.push(this.create_warning('ACCESS_DENIED', `Cannot list buckets: ${err.message || 'Access denied'}`));
      } else {
        errors.push(this.create_error('API_ERROR', `Failed to list buckets: ${err.message || String(error)}`));
      }
    }

    return { service: this.service_type, resources, errors, warnings };
  }
}
