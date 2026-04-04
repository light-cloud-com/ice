/**
 * Schema Bridge
 *
 * Bidirectional lookup between iceType (e.g. 'Database.PostgreSQL')
 * and resourceId (e.g. 'postgres-db'), plus property schema access.
 *
 * The canvas uses iceType; HIGH_LEVEL_CATEGORIES uses resourceId.
 * BLOCK_BLUEPRINTS has both — we build the bridge from them.
 */

import {
  HIGH_LEVEL_CATEGORIES,
  type HighLevelResource,
  type HighLevelProperty,
} from '../resources/high-level-resources.js';

// ─── Build lookup maps on first access ──────────────────────────────────────

let _iceTypeToResource: Map<string, HighLevelResource> | null = null;
let _allResources: HighLevelResource[] | null = null;

function ensureMaps() {
  if (_iceTypeToResource) return;
  _iceTypeToResource = new Map();
  _allResources = [];

  for (const cat of HIGH_LEVEL_CATEGORIES) {
    for (const res of cat.resources) {
      _allResources.push(res);
    }
  }
}

/**
 * Known iceType → resourceId mappings.
 * Derived from BLOCK_BLUEPRINTS at import time via @ice/blocks,
 * but we can also infer from HighLevelResource fields and conventions.
 */
const ICE_TYPE_TO_RESOURCE_ID: Record<string, string> = {
  // Compute
  'Compute.StaticSite': 'frontend-app',
  'Compute.SSRSite': 'ssr-site',
  'Compute.Container': 'container-service',
  'Compute.BackendAPI': 'backend-api',
  'Compute.Worker': 'worker',
  'Compute.CronJob': 'scheduled-task',
  'Compute.ServerlessFunction': 'serverless-function',
  'Compute.Function': 'serverless-function',
  // Database
  'Database.PostgreSQL': 'postgres-db',
  'Database.MySQL': 'mysql-db',
  'Database.MongoDB': 'mongodb-db',
  'Database.Redis': 'redis-cache',
  'Database.DynamoDB': 'dynamodb',
  'Database.Firestore': 'firestore',
  'Database.CosmosDB': 'cosmosdb',
  'Database.AutonomousDB': 'autonomous-db',
  'Database.Tablestore': 'tablestore',
  'Database.ManagedDB': 'do-managed-db',
  // Storage
  'Storage.Bucket': 'object-storage',
  'Storage.ObjectStorage': 'object-storage',
  'Storage.S3': 'object-storage',
  'Storage.GCS': 'object-storage',
  'Storage.Blob': 'object-storage',
  'Storage.Spaces': 'do-spaces',
  'Storage.OSS': 'oss-storage',
  // Messaging
  'Messaging.Queue': 'message-queue',
  'Messaging.SQS': 'sqs',
  'Messaging.SNS': 'sns',
  'Messaging.RabbitMQ': 'rabbitmq',
  'Messaging.Kafka': 'event-stream',
  'Messaging.EventStream': 'event-stream',
  'Messaging.ServiceBus': 'service-bus',
  'Messaging.CloudPubSub': 'cloud-pubsub',
  // Networking
  'Network.Gateway': 'api-gateway',
  'Network.Internet': 'public-traffic',
  'Network.LoadBalancer': 'public-traffic',
  'Network.VPC': 'vpc-network',
  'Network.Subnet': 'subnet',
  'Network.Domain': 'domain',
  // Security
  'Security.Identity': 'service-account',
  'Security.Secret': 'secrets-manager',
  'Security.WAF': 'waf',
  'Security.SSLCertificate': 'ssl-certificate',
  // Monitoring
  'Monitoring.Log': 'log-group',
  'Monitoring.Terminal': 'log-terminal',
  // AI
  'AI.VectorDB': 'vector-db',
  'AI.LLMGateway': 'llm-gateway',
  'AI.ModelServing': 'ml-model',
  // Analytics
  'Analytics.Search': 'search-engine',
  'Analytics.DataWarehouse': 'data-warehouse',
  // Special
  'Source.Repository': '',
  'Config.Environment': '',
};

/**
 * Look up the HighLevelResource for a given iceType.
 * Returns undefined for special types (Source.Repository, Config.Environment, Groups).
 */
export function getResourceForIceType(iceType: string): HighLevelResource | undefined {
  ensureMaps();
  const resourceId = ICE_TYPE_TO_RESOURCE_ID[iceType];
  if (!resourceId) return undefined;
  return _allResources!.find(r => r.id === resourceId);
}

/**
 * Get the property schema for a given iceType.
 * Returns the HighLevelProperty[] from the matching resource, or empty array.
 */
export function getPropertiesForIceType(iceType: string): HighLevelProperty[] {
  const resource = getResourceForIceType(iceType);
  return resource?.properties ?? [];
}

/**
 * Get which providers support a given iceType.
 */
export function getSupportedProviders(iceType: string): string[] {
  const resource = getResourceForIceType(iceType);
  return resource?.providers ?? [];
}

/**
 * Check if an iceType is a known resource type (not a group or unknown).
 */
export function isKnownIceType(iceType: string): boolean {
  if (!iceType) return false;
  // Groups and containers are valid but don't have resource schemas
  if (iceType.startsWith('Group.') || iceType === 'Network.VPC' || iceType === 'Network.Subnet') return true;
  // Special types
  if (iceType === 'Source.Repository' || iceType === 'Config.Environment') return true;
  return iceType in ICE_TYPE_TO_RESOURCE_ID;
}
