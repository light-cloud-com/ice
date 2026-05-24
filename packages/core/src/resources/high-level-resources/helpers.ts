/**
 * Helpers for the high-level resource catalogue (rf-hlres-8).
 *
 * Owns:
 *   - the assembled `HIGH_LEVEL_CATEGORIES` array (compute → monitoring)
 *   - the public lookup helpers (`getAllHighLevelResources`, palette,
 *     `filterResourcesByProvider`, `getBehaviorLabel`, `getBehaviorColor`)
 *   - the GCP Cloud Asset API mapping helpers (`getGCPCloudAssetTypes`,
 *     `cloudAssetToHighLevelType`) and the `PULUMI_TO_CLOUD_ASSET` table
 *
 * Public consumers should import from `../high-level-resources.js` (the
 * shim re-exports everything here under the same names). This module is
 * the runtime home; the shim adds the type re-exports.
 */

import { type NodeBehavior, BEHAVIOR_LABELS, BEHAVIOR_COLORS } from '@ice/constants';
import { compute } from './categories/compute';
import { database } from './categories/database';
import { messaging } from './categories/messaging';
import { monitoring } from './categories/monitoring';
import { networking } from './categories/networking';
import { security } from './categories/security';
import { storage } from './categories/storage';
import type { HighLevelCategory, HighLevelResource } from './types';

/**
 * High-level resource categories that make sense to developers.
 *
 * Order is load-bearing — `getHighLevelResourcesForPalette` and
 * `getAllHighLevelResources` preserve it, and downstream consumers
 * (UI palette, AI prompt builder) render in this order.
 */
export const HIGH_LEVEL_CATEGORIES: HighLevelCategory[] = [
  compute,
  database,
  storage,
  networking,
  messaging,
  security,
  monitoring,
];

/**
 * Get all high-level resources flattened
 */
export function getAllHighLevelResources(): HighLevelResource[] {
  return HIGH_LEVEL_CATEGORIES.flatMap((cat) => cat.resources);
}

// Lazy iceType → resource index. Built once on first lookup and cached
// thereafter — `HIGH_LEVEL_CATEGORIES` is a static module-level constant
// so the map is safe to cache for the lifetime of the process.
let HIGH_LEVEL_BY_ICE_TYPE: Map<string, HighLevelResource> | null = null;

function buildIceTypeIndex(): Map<string, HighLevelResource> {
  const map = new Map<string, HighLevelResource>();
  for (const resource of getAllHighLevelResources()) {
    if (resource.iceType) map.set(resource.iceType, resource);
  }
  return map;
}

/**
 * Look up the canonical `HighLevelResource` by iceType.
 *
 * The translator (and any other cross-cutting layer) uses this to read
 * schema-declared deploy semantics like `deployExpansion` WITHOUT
 * hardcoding iceType-specific branches. Resources that don't set
 * `iceType` on the schema return `undefined` here.
 */
export function getHighLevelResourceByIceType(iceType: string): HighLevelResource | undefined {
  if (!iceType) return undefined;
  if (!HIGH_LEVEL_BY_ICE_TYPE) HIGH_LEVEL_BY_ICE_TYPE = buildIceTypeIndex();
  return HIGH_LEVEL_BY_ICE_TYPE.get(iceType);
}

/**
 * Get resources formatted for the palette
 */
export function getHighLevelResourcesForPalette() {
  return HIGH_LEVEL_CATEGORIES.map((category) => ({
    category: category.name,
    categoryId: category.id,
    categoryIcon: category.icon,
    categoryDescription: category.description,
    resources: category.resources.map((resource) => ({
      ice_type: resource.id,
      display_name: resource.name,
      description: resource.description,
      category: category.name,
      icon: resource.icon,
      behavior: resource.behavior,
      providers: resource.providers,
      implementations: resource.implementations,
      properties: resource.properties,
    })),
  }));
}

/**
 * Filter resources by provider
 */
export function filterResourcesByProvider(provider: string): HighLevelResource[] {
  if (provider === 'all') {
    return getAllHighLevelResources();
  }
  return getAllHighLevelResources().filter((resource) =>
    resource.providers.includes(provider as 'aws' | 'gcp' | 'azure' | 'kubernetes'),
  );
}

/**
 * Get behavior label for display
 */
export function getBehaviorLabel(behavior: NodeBehavior): string {
  return BEHAVIOR_LABELS[behavior];
}

/**
 * Get behavior color for UI
 */
export function getBehaviorColor(behavior: NodeBehavior): string {
  return BEHAVIOR_COLORS[behavior];
}

// =============================================================================
// Cloud Asset API Type Mapping
// =============================================================================

/**
 * Map Pulumi GCP resource types to Cloud Asset API types.
 * Pulumi: gcp:cloudrun:Service -> Cloud Asset: run.googleapis.com/Service
 */
const PULUMI_TO_CLOUD_ASSET: Record<string, string> = {
  // Applications
  'gcp:cloudrun:Service': 'run.googleapis.com/Service',
  'gcp:cloudfunctions:Function': 'cloudfunctions.googleapis.com/CloudFunction',
  'gcp:appengine:StandardAppVersion': 'appengine.googleapis.com/Service',

  // Container
  'gcp:container:Cluster': 'container.googleapis.com/Cluster',

  // Databases
  'gcp:sql:DatabaseInstance': 'sqladmin.googleapis.com/Instance',
  'gcp:spanner:Instance': 'spanner.googleapis.com/Instance',
  'gcp:redis:Instance': 'redis.googleapis.com/Instance',
  'gcp:firestore:Database': 'firestore.googleapis.com/Database',

  // Storage
  'gcp:storage:Bucket': 'storage.googleapis.com/Bucket',
  'gcp:filestore:Instance': 'file.googleapis.com/Instance',

  // Messaging
  'gcp:pubsub:Topic': 'pubsub.googleapis.com/Topic',
  'gcp:pubsub:Subscription': 'pubsub.googleapis.com/Subscription',

  // Networking
  'gcp:compute:Network': 'compute.googleapis.com/Network',
  'gcp:compute:Subnetwork': 'compute.googleapis.com/Subnetwork',
  'gcp:compute:ForwardingRule': 'compute.googleapis.com/ForwardingRule',
  'gcp:compute:GlobalForwardingRule': 'compute.googleapis.com/GlobalForwardingRule',
  'gcp:apigateway:Gateway': 'apigateway.googleapis.com/Gateway',
  'gcp:dns:ManagedZone': 'dns.googleapis.com/ManagedZone',

  // Security
  'gcp:secretmanager:Secret': 'secretmanager.googleapis.com/Secret',
  'gcp:compute:ManagedSslCertificate': 'compute.googleapis.com/SslCertificate',
  'gcp:serviceaccount:Account': 'iam.googleapis.com/ServiceAccount',

  // Monitoring
  'gcp:logging:Sink': 'logging.googleapis.com/LogSink',
  'gcp:monitoring:AlertPolicy': 'monitoring.googleapis.com/AlertPolicy',
  'gcp:monitoring:Dashboard': 'monitoring.googleapis.com/Dashboard',

  // Scheduled Jobs
  'gcp:cloudscheduler:Job': 'cloudscheduler.googleapis.com/Job',

  // BigQuery
  'gcp:bigquery:Dataset': 'bigquery.googleapis.com/Dataset',
};

/**
 * Get Cloud Asset API types for all GCP high-level resources.
 * These are the business-relevant resources we want to import.
 */
export function getGCPCloudAssetTypes(): string[] {
  const assetTypes = new Set<string>();

  for (const resource of getAllHighLevelResources()) {
    for (const impl of resource.implementations) {
      if (impl.provider === 'gcp') {
        const assetType = PULUMI_TO_CLOUD_ASSET[impl.resource_type];
        if (assetType) {
          assetTypes.add(assetType);
        }
      }
    }
  }

  return Array.from(assetTypes);
}

/**
 * Map Cloud Asset type to high-level resource ID.
 */
export function cloudAssetToHighLevelType(cloudAssetType: string): string | null {
  // Reverse lookup
  for (const [pulumiType, assetType] of Object.entries(PULUMI_TO_CLOUD_ASSET)) {
    if (assetType === cloudAssetType) {
      // Find the high-level resource that uses this Pulumi type
      for (const resource of getAllHighLevelResources()) {
        for (const impl of resource.implementations) {
          if (impl.resource_type === pulumiType) {
            return resource.id;
          }
        }
      }
    }
  }
  return null;
}
