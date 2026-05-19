/**
 * Block categories.
 *
 * Two layers:
 *   - `NodeCategory` (5 buckets) lives in `ice-types.ts` and drives
 *     visibility levels in the editor.
 *   - `CategoryId` (14 buckets) is the user-facing palette partition
 *     and the granularity at which feature-flag gating happens.
 *
 * The iceType → CategoryId map mirrors the palette's 25-concept
 * inventory (packages/ui/src/features/palette/data/components.ts).
 * Concepts not listed here fall back to a prefix-based default. A
 * test in `__tests__/categories.test.ts` asserts every concept iceType
 * in @ice/blocks resolves to a known CategoryId.
 */

import { Cat, ICE } from './ice-types';
import type { NodeCategory } from './ice-types';

// ── Editor visibility levels (existing) ─────────────────────────────────────

export const LEVEL_VISIBLE_CATEGORIES: Record<1 | 2 | 3, NodeCategory[]> = {
  1: [Cat.Compute, Cat.Data],
  2: [Cat.Compute, Cat.Data, Cat.Network],
  3: [Cat.Compute, Cat.Data, Cat.Network, Cat.Security, Cat.Observability],
};

export const NETWORK_CONTAINER_TYPES = [ICE.Network.VPC, ICE.Network.Subnet, ICE.Network.PrivateNetwork];

export const L1_VISIBLE_NETWORK_TYPES = [
  ICE.Network.PublicEndpoint,
  ICE.Network.CustomDomain,
  ICE.Network.PrivateNetwork,
  ICE.Network.Gateway,
];

// ── Palette categories — user-facing partition for feature-flag gating ─────

export const CATEGORY_IDS = [
  'Compute',
  'Scheduler',
  'Frontend',
  'Network',
  'Database',
  'Cache',
  'Messaging',
  'Storage',
  'Security',
  'AI',
  'Analytics',
  'Monitoring',
  'Source',
  'Config',
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

/**
 * Explicit iceType → palette CategoryId map. Mirrors the COMPONENTS
 * list in `packages/ui/src/features/palette/data/components.ts`.
 *
 * Keep this in lockstep with the palette — the integrity test fails
 * if any concept iceType is missing here.
 */
export const ICE_TYPE_TO_CATEGORY_ID: Record<string, CategoryId> = {
  // Frontend
  'Compute.StaticSite': 'Frontend',
  'Compute.SSRSite': 'Frontend',
  // Compute
  'Compute.Container': 'Compute',
  'Compute.BackendAPI': 'Compute',
  'Compute.ServerlessFunction': 'Compute',
  'Compute.Worker': 'Compute',
  // Scheduler
  'Compute.CronJob': 'Scheduler',
  // Database
  'Database.PostgreSQL': 'Database',
  'Database.MySQL': 'Database',
  'Database.MongoDB': 'Database',
  'Database.DynamoDB': 'Database',
  'Database.Firestore': 'Database',
  'Database.CosmosDB': 'Database',
  'Database.AutonomousDB': 'Database',
  'Database.Tablestore': 'Database',
  'Database.ManagedDB': 'Database',
  // Cache
  'Database.Redis': 'Cache',
  // Storage
  'Storage.Bucket': 'Storage',
  'Storage.ObjectStorage': 'Storage',
  // Messaging
  'Messaging.Queue': 'Messaging',
  'Messaging.EventStream': 'Messaging',
  'Messaging.Email': 'Messaging',
  'Messaging.SQS': 'Messaging',
  'Messaging.SNS': 'Messaging',
  'Messaging.Topic': 'Messaging',
  'Messaging.RabbitMQ': 'Messaging',
  'Messaging.CloudPubSub': 'Messaging',
  'Messaging.ServiceBus': 'Messaging',
  'Messaging.Kafka': 'Messaging',
  // Network
  'Network.Gateway': 'Network',
  'Network.CustomDomain': 'Network',
  'Network.PrivateNetwork': 'Network',
  'Network.PublicEndpoint': 'Network',
  'Network.VPC': 'Network',
  'Network.Subnet': 'Network',
  'Network.LoadBalancer': 'Network',
  // Security
  'Security.Secret': 'Security',
  'Security.Identity': 'Security',
  'Security.SSLCertificate': 'Security',
  'Security.WAF': 'Security',
  'Security.Auth': 'Security',
  // AI
  'AI.VectorDB': 'AI',
  'AI.LLMGateway': 'AI',
  'AI.PrivateAIService': 'AI',
  'AI.ModelServing': 'AI',
  'AI.MlModel': 'AI',
  // Analytics
  'Analytics.DataWarehouse': 'Analytics',
  'Analytics.Search': 'Analytics',
  // Monitoring
  'Monitoring.Log': 'Monitoring',
  // Source
  'Source.Repository': 'Source',
  // Config
  'Config.Environment': 'Config',
};

/** iceType prefix → fallback CategoryId for blueprints not in the explicit map. */
const PREFIX_FALLBACK: Record<string, CategoryId> = {
  Compute: 'Compute',
  Database: 'Database',
  Storage: 'Storage',
  Messaging: 'Messaging',
  Network: 'Network',
  Security: 'Security',
  AI: 'AI',
  Analytics: 'Analytics',
  Monitoring: 'Monitoring',
  Source: 'Source',
  Config: 'Config',
};

/**
 * Resolve the palette CategoryId for a given iceType.
 *
 * Looks up the explicit map first; if missing, falls back to the
 * prefix (e.g. `Database.DynamoDB` → `Database`). Returns undefined
 * for unrecognized iceTypes — callers should treat that as "ungated".
 */
export function getCategoryForIceType(iceType: string): CategoryId | undefined {
  const explicit = ICE_TYPE_TO_CATEGORY_ID[iceType];
  if (explicit) return explicit;
  const prefix = iceType.split('.')[0];
  return prefix ? PREFIX_FALLBACK[prefix] : undefined;
}
