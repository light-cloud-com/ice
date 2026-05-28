/**
 * Feature Flags
 *
 * Per-provider toggles and per-(category × provider) overrides that gate
 * UI surfaces: palette, wizard, onboarding, app bar, settings, canvas
 * menus, template badges, status dots, deploy validation.
 *
 * Each provider has a top-level `enabled` toggle and an exhaustive
 * per-category map. To gate a (provider, category) combo, flip its
 * boolean. Top-level `enabled: false` short-circuits everything — the
 * category map for that provider is ignored.
 *
 * The category list is the user-facing palette partition (see
 * `categories.ts`, `CATEGORY_IDS`). An integrity test asserts every
 * provider's `categories` map covers every CategoryId.
 */

import { getCategoryForIceType, type CategoryId } from './categories';
import { ALL_PROVIDERS, CLOUD_PROVIDERS, type CloudProviderMeta, type Provider } from './providers';

export interface ProviderFlags {
  enabled: boolean;
  categories: Record<CategoryId, boolean>;
}

export const PROVIDER_FLAGS: Record<Provider, ProviderFlags> = {
  // AWS — full category rollout. Every block listed in
  // packages/core/src/deploy/providers/aws/README.md now has:
  //   - a handler (`HANDLER_REGISTRY` entry in aws-deployer.ts)
  //   - an extractor (`PROPERTY_EXTRACTORS` entry in dispatch.ts)
  //   - a mocked-SDK test
  //   - a developer-runnable live test (`pnpm test:live:aws <service>`)
  //   - the canvas-wired update path for CloudFront / Cognito / DocDB /
  //     Redshift / EC2 ModifyVolume
  // SDK class refs and input-field names are statically verified
  // against the real npm SDK packages by `pnpm verify:sdk:all`.
  //
  // Per-handler real-cloud deploy gates remain a developer responsibility
  // (the cardinal rule). Flipping the UI flags exposes the handlers in
  // the palette / plan modal; operators should still smoke-test each
  // category against their own account before treating production
  // deploys as supported.
  aws: {
    enabled: true,
    categories: {
      Compute: true, // ECS service/worker, Lambda (with CodeBuild fallback), EC2 instance
      Scheduler: true, // EventBridge rule (schedule_expression branch)
      Frontend: true, // CloudFront (canvas-wired ACM cert), Amplify Hosting
      Network: true, // VPC, Subnet, SecurityGroup, ELBv2, Route53, VPC Endpoint
      Database: true, // RDS, DynamoDB, ElastiCache, DocDB, Redshift
      Cache: true, // ElastiCache (Redis + Memcached)
      Messaging: true, // SQS, SNS, EventBridge, Amazon MQ, Kinesis
      Storage: true, // S3 (account-id suffix)
      Security: true, // ACM, Cognito user pool, Secrets Manager, WAFv2
      AI: true, // Bedrock, SageMaker, OpenSearch Serverless (vector)
      Analytics: true, // OpenSearch, Redshift, Timestream
      Monitoring: true, // CloudWatch Logs, CloudWatch Alarm
      Source: true, // CodeBuild
      Config: true, // provider-agnostic
    },
  },
  gcp: {
    enabled: true,
    categories: {
      Compute: true, // Cloud Run service/job, Cloud Functions, GKE, Compute Instance
      Scheduler: true, // Cloud Scheduler
      Frontend: true, // Firebase Hosting, Backend Bucket, Cloud CDN
      Network: true, // VPC, Subnet, LB, Cloud DNS, Firewall, PSC
      Database: true, // Cloud SQL, Firestore, Memorystore
      Cache: true, // Memorystore Redis
      Messaging: true, // Pub/Sub, Dataflow
      Storage: true, // Cloud Storage
      Security: true, // Secret Manager, Identity Platform, Cloud Armor, Managed SSL
      AI: true, // Vertex AI, Discovery Engine
      Analytics: true, // BigQuery, Dataflow
      Monitoring: true, // Cloud Logging, Cloud Monitoring (alerts)
      Source: true, // Cloud Build
      Config: true, // provider-agnostic
    },
  },
  // Azure — full category rollout. 38 handlers across every category
  // (see packages/core/src/deploy/providers/azure/README.md). Same
  // verification gates as AWS: mocked tests, live tests under
  // packages/core/src/deploy/providers/__tests__/live/azure-*.live.test.ts,
  // and `pnpm verify:sdk:all` for SDK input-field correctness.
  azure: {
    enabled: true,
    categories: {
      Compute: true, // VM, Web App, Functions, Container Apps, Static Web Apps, AKS, ACR
      Scheduler: true, // Logic Apps (recurrence trigger)
      Frontend: true, // Static Web Apps, Front Door, DNS Zone
      Network: true, // VNet, Subnet, NSG, Private Endpoint, App Gateway, Front Door, APIM, WAF
      Database: true, // PostgreSQL Flex, MySQL Flex, Cosmos DB, Redis Cache, SQL Server
      Cache: true, // Cache for Redis
      Messaging: true, // Service Bus, Event Hubs, Event Grid, Logic Apps
      Storage: true, // Blob Storage (Storage Account)
      Security: true, // Key Vault, Entra B2C, WAF policy
      AI: true, // Azure OpenAI, Azure ML, Cognitive Search (vector)
      Analytics: true, // Synapse, Data Explorer (Kusto), Cognitive Search
      Monitoring: true, // Log Analytics, App Insights
      Source: true, // ACR Tasks
      Config: true, // provider-agnostic
    },
  },
  // Kubernetes — design-only. Blocks render on the canvas; no deployer
  // ships yet. Each category gated off so the palette won't surface
  // Kubernetes options for any of them.
  kubernetes: {
    enabled: false,
    categories: {
      Compute: false,
      Scheduler: false,
      Frontend: false,
      Network: false,
      Database: false,
      Cache: false,
      Messaging: false,
      Storage: false,
      Security: false,
      AI: false,
      Analytics: false,
      Monitoring: false,
      Source: false,
      Config: false,
    },
  },
  // Alibaba Cloud — design-only.
  alibaba: {
    enabled: false,
    categories: {
      Compute: false,
      Scheduler: false,
      Frontend: false,
      Network: false,
      Database: false,
      Cache: false,
      Messaging: false,
      Storage: false,
      Security: false,
      AI: false,
      Analytics: false,
      Monitoring: false,
      Source: false,
      Config: false,
    },
  },
  // Oracle Cloud Infrastructure — design-only.
  oci: {
    enabled: false,
    categories: {
      Compute: false,
      Scheduler: false,
      Frontend: false,
      Network: false,
      Database: false,
      Cache: false,
      Messaging: false,
      Storage: false,
      Security: false,
      AI: false,
      Analytics: false,
      Monitoring: false,
      Source: false,
      Config: false,
    },
  },
  // DigitalOcean — design-only.
  digitalocean: {
    enabled: false,
    categories: {
      Compute: false,
      Scheduler: false,
      Frontend: false,
      Network: false,
      Database: false,
      Cache: false,
      Messaging: false,
      Storage: false,
      Security: false,
      AI: false,
      Analytics: false,
      Monitoring: false,
      Source: false,
      Config: false,
    },
  },
  // IBM Cloud — design-only.
  ibm: {
    enabled: false,
    categories: {
      Compute: false,
      Scheduler: false,
      Frontend: false,
      Network: false,
      Database: false,
      Cache: false,
      Messaging: false,
      Storage: false,
      Security: false,
      AI: false,
      Analytics: false,
      Monitoring: false,
      Source: false,
      Config: false,
    },
  },
};

// ── Public API ──────────────────────────────────────────────────────────────

export function isProviderEnabled(p: Provider | string): boolean {
  return PROVIDER_FLAGS[p as Provider]?.enabled === true;
}

export function isCategoryEnabledForProvider(category: CategoryId, p: Provider | string): boolean {
  const cfg = PROVIDER_FLAGS[p as Provider];
  return cfg?.enabled === true && cfg.categories[category] === true;
}

/**
 * Resolve (iceType, provider) → enabled.
 *
 * Returns `true` if the provider is on AND the iceType's category is on.
 * iceTypes that don't map to any CategoryId (unknown shape) are treated
 * as ungated — only the provider-level flag applies.
 */
export function isIceTypeEnabledForProvider(iceType: string, p: Provider | string): boolean {
  if (!isProviderEnabled(p)) return false;
  const category = getCategoryForIceType(iceType);
  if (!category) return true;
  return isCategoryEnabledForProvider(category, p);
}

export function getEnabledProvidersForCategory(category: CategoryId): Provider[] {
  return ALL_PROVIDERS.filter((p) => isCategoryEnabledForProvider(category, p));
}

// ── Derived lists used by the UI ───────────────────────────────────────────

export const ENABLED_PROVIDER_IDS: ReadonlySet<string> = new Set<string>(ALL_PROVIDERS.filter(isProviderEnabled));

export const ENABLED_PROVIDERS: CloudProviderMeta[] = CLOUD_PROVIDERS.filter((p) => isProviderEnabled(p.id));
