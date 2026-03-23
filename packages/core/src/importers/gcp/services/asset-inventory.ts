/**
 * GCP Cloud Asset Inventory Service
 *
 * Uses the Cloud Asset Inventory API to discover ALL resources in a project.
 * This is the scalable approach - one API discovers everything.
 */

import { BaseGCPService } from './base-service.js';
import { classifyGCPError } from '../../../errors/import-errors.js';
import { getGCPCloudAssetTypes } from '../../../resources/high-level-resources.js';
import type { ServiceDiscoveryResult, GCPServiceType, GCPResource } from '../types.js';

/**
 * Flatten protobuf Struct format to plain JSON.
 * Converts { stringValue: "x", kind: "stringValue" } -> "x"
 */
function flattenProtobufValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value !== 'object') return value;

  const obj = value as Record<string, unknown>;

  // Check for protobuf value wrapper
  if ('kind' in obj) {
    const kind = obj.kind as string;
    switch (kind) {
      case 'stringValue':
        return obj.stringValue;
      case 'numberValue':
        return obj.numberValue;
      case 'boolValue':
        return obj.boolValue;
      case 'nullValue':
        return null;
      case 'structValue':
        return flattenProtobufStruct(obj.structValue as Record<string, unknown>);
      case 'listValue': {
        const listVal = obj.listValue as { values?: unknown[] };
        return (listVal?.values || []).map(flattenProtobufValue);
      }
      default:
        return value;
    }
  }

  // Check for struct with fields
  if ('fields' in obj && typeof obj.fields === 'object') {
    return flattenProtobufStruct(obj as Record<string, unknown>);
  }

  // Regular object - recurse
  if (Array.isArray(value)) {
    return value.map(flattenProtobufValue);
  }

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = flattenProtobufValue(v);
  }
  return result;
}

/**
 * Flatten protobuf Struct (with fields) to plain object.
 */
function flattenProtobufStruct(struct: Record<string, unknown>): Record<string, unknown> {
  const fields = struct.fields as Record<string, unknown> | undefined;
  if (!fields) return {};

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = flattenProtobufValue(value);
  }
  return result;
}

/**
 * Convert GCP resource data to clean properties.
 */
function extractCleanProperties(resourceData: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(resourceData)) {
    // Skip internal/meta fields
    if (key.startsWith('_') || key === 'kind' || key === 'etag') continue;

    clean[key] = flattenProtobufValue(value);
  }

  return clean;
}

/**
 * Asset Inventory resource discovery service.
 * Discovers only business-relevant GCP resources (not infrastructure noise).
 */
export class AssetInventoryService extends BaseGCPService {
  private asset_client: any = null;

  get service_type(): GCPServiceType {
    return 'all';
  }

  /**
   * Initialize the Asset Inventory client.
   */
  private async init_client(): Promise<void> {
    if (this.asset_client) return;

    try {
      const module_name = '@google-cloud/asset';

      const asset_module: any = await Function('moduleName', 'return import(moduleName)')(module_name);
      const AssetServiceClient = asset_module.AssetServiceClient;

      const options: Record<string, unknown> = {
        projectId: this.project,
      };

      if (this.key_file) {
        // Read and parse the key file to pass credentials directly
        // This avoids issues with the gRPC metadata handling
        try {
          const fs = await import('fs');
          const keyContent = fs.readFileSync(this.key_file, 'utf-8');
          const keyData = JSON.parse(keyContent);
          options.credentials = {
            client_email: keyData.client_email,
            private_key: keyData.private_key,
          };
          // Also set projectId from key if available
          if (keyData.project_id) {
            options.projectId = keyData.project_id;
          }
        } catch {
          // Fallback to keyFilename if direct read fails
          options.keyFilename = this.key_file;
        }
      }

      this.asset_client = new AssetServiceClient(options);
    } catch (error) {
      throw new Error(
        `Failed to initialize GCP Asset client. Make sure @google-cloud/asset is installed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  async discover(): Promise<ServiceDiscoveryResult> {
    const resources: GCPResource[] = [];

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

    if (!this.asset_client) {
      return {
        service: this.service_type,
        resources: [],
        errors: [this.create_error('INIT_ERROR', 'Asset client not initialized')],
        warnings: [],
      };
    }

    try {
      // Generate unique debug ID for this import session
      const debugId = `IMPORT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // List only business-relevant assets (not infrastructure noise)
      // Uses the high-level resource definitions to determine what to import
      const requestedAssetTypes = getGCPCloudAssetTypes();

      console.log(`\n[${debugId}] ========== GCP ASSET INVENTORY DEBUG ==========`);
      console.log(`[${debugId}] Project: ${this.project}`);
      console.log(`[${debugId}] Requested asset types (${requestedAssetTypes.length}):`);
      requestedAssetTypes.forEach((t, i) => console.log(`[${debugId}]   ${i + 1}. ${t}`));

      const request = {
        parent: `projects/${this.project}`,
        contentType: 'RESOURCE',
        // Only import high-level resources users care about
        assetTypes: requestedAssetTypes,
      };

      // Use listAssets which returns all resources
      console.log(`[${debugId}] Calling listAssets API...`);
      const [assets] = await this.asset_client.listAssets(request);

      console.log(`[${debugId}] API returned ${assets?.length || 0} raw assets`);

      // Track asset types found
      const assetTypeCounts: Record<string, number> = {};

      for (const asset of assets || []) {
        const asset_type = asset.assetType || 'UNKNOWN';
        assetTypeCounts[asset_type] = (assetTypeCounts[asset_type] || 0) + 1;

        if (!asset.resource?.data) {
          console.log(`[${debugId}] SKIP: Asset ${asset.name} has no resource.data`);
          continue;
        }

        const resource_data = asset.resource.data;

        // Convert asset type to GCP kind format
        // e.g., "compute.googleapis.com/Instance" -> "compute#instance"
        const kind = this.asset_type_to_kind(asset_type);

        // Extract location info from asset name
        const { zone, region } = this.extract_location(asset.name || '');

        // Flatten protobuf Struct format to clean JSON
        const clean_properties = extractCleanProperties(resource_data);

        const resourceId = `res-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        const resourceName = resource_data.name || this.extract_name(asset.name || '');

        console.log(`[${debugId}] FOUND: [${resourceId}] type=${asset_type} kind=${kind} name=${resourceName}`);

        resources.push({
          self_link: resource_data.selfLink || asset.resource.resourceUrl || asset.name || '',
          name: resourceName,
          id: resource_data.id || resource_data.name || asset.name || '',
          kind,
          zone,
          region,
          project: this.project,
          properties: clean_properties,
          labels: (clean_properties.labels || resource_data.labels) as Record<string, string> | undefined,
          creation_timestamp: (clean_properties.creation_timestamp ||
            resource_data.creationTimestamp ||
            resource_data.createTime) as string | undefined,
        });
      }

      console.log(`[${debugId}] ========== ASSET TYPE SUMMARY ==========`);
      Object.entries(assetTypeCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([type, count]) => {
          console.log(`[${debugId}]   ${type}: ${count}`);
        });
      console.log(`[${debugId}] Total resources collected: ${resources.length}`);
      console.log(`[${debugId}] ==========================================\n`);

      return {
        service: this.service_type,
        resources,
        errors: [],
        warnings: [],
      };
    } catch (error: unknown) {
      const err = error as { code?: number; message?: string; details?: unknown };

      // Use the centralized error classifier for consistent error handling
      const classified = classifyGCPError(err, this.service_type);

      // Build error response with action information
      const errorDetails: Record<string, unknown> = {};
      if (classified.action) {
        errorDetails.action = classified.action.type;
        if (classified.action.command) {
          errorDetails.command = classified.action.command;
        }
        if (classified.action.url) {
          errorDetails.help_url = classified.action.url;
        }
      }

      return {
        service: this.service_type,
        resources: [],
        errors: [
          {
            code: classified.code,
            message: classified.message,
            service: this.service_type,
            ...errorDetails,
          },
        ],
        warnings: [],
      };
    }
  }

  /**
   * Convert GCP asset type to kind format.
   * e.g., "compute.googleapis.com/Instance" -> "compute#instance"
   * e.g., "run.googleapis.com/Service" -> "run#service"
   * e.g., "storage.googleapis.com/Bucket" -> "storage#bucket"
   */
  private asset_type_to_kind(asset_type: string): string {
    // Format: "service.googleapis.com/ResourceType"
    const match = asset_type.match(/^([^.]+)\.googleapis\.com\/(.+)$/);
    if (match && match[1] && match[2]) {
      const service = match[1];
      const resource_type = match[2];
      return `${service}#${resource_type.toLowerCase()}`;
    }
    // Fallback - just lowercase the whole thing
    return asset_type.toLowerCase().replace(/\./g, '#');
  }

  /**
   * Extract zone and region from asset name.
   * Asset names look like:
   * - //compute.googleapis.com/projects/proj/zones/us-central1-a/instances/name
   * - //compute.googleapis.com/projects/proj/regions/us-central1/subnetworks/name
   * - //run.googleapis.com/projects/proj/locations/europe-west1/services/name
   */
  private extract_location(asset_name: string): { zone?: string; region?: string } {
    // Check for zone
    const zone_match = asset_name.match(/\/zones\/([^/]+)\//);
    if (zone_match && zone_match[1]) {
      const zone = zone_match[1];
      // Derive region from zone (e.g., us-central1-a -> us-central1)
      const region = zone.replace(/-[a-z]$/, '');
      return { zone, region };
    }

    // Check for region
    const region_match = asset_name.match(/\/regions\/([^/]+)\//);
    if (region_match) {
      return { region: region_match[1] };
    }

    // Check for location (used by Cloud Run, Cloud Functions, etc.)
    const location_match = asset_name.match(/\/locations\/([^/]+)\//);
    if (location_match) {
      return { region: location_match[1] };
    }

    return {};
  }

  /**
   * Extract resource name from asset name.
   */
  private extract_name(asset_name: string): string {
    // Get the last segment of the path
    const parts = asset_name.split('/');
    return parts[parts.length - 1] || '';
  }
}
