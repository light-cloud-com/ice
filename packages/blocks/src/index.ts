/**
 * Block Blueprint Registry
 *
 * Central barrel file — imports all provider-specific blueprints and exposes
 * lookup helpers + the expansion function.
 *
 * ALL blocks are provider-specific. No bare category directories exist.
 */

import type { BlockBlueprint } from './types';

// Re-export types and expansion engine
export type { BlockBlueprint, ProviderVariant, ExpandedBlueprint } from './types';
export type { Provider } from './types';
export { expandBlueprint } from './expand-blueprint';
export type { ExpandBlueprintOptions } from './expand-blueprint';

// =============================================================================
// AWS (27 blocks)
// =============================================================================
import { awsStaticSiteBlueprint } from './aws/frontend/static-site';
import { awsSsrSiteBlueprint } from './aws/frontend/ssr-site';
import { awsScalableBackendBlueprint } from './aws/backend/scalable-backend';
import { awsWorkerBlueprint } from './aws/backend/worker';
import { awsScheduledTaskBlueprint } from './aws/backend/scheduled-task';
import { awsServerlessFunctionBlueprint } from './aws/compute/serverless-function';
import { awsPostgresqlBlueprint } from './aws/data/postgresql';
import { awsMysqlBlueprint } from './aws/data/mysql';
import { awsMongodbBlueprint } from './aws/data/mongodb';
import { awsRedisCacheBlueprint } from './aws/data/redis-cache';
import { dynamodbBlueprint } from './aws/data/dynamodb';
import { awsStorageBlueprint } from './aws/storage/storage';
import { awsGatewayBlueprint } from './aws/networking/gateway';
import { awsPublicTrafficBlueprint } from './aws/networking/public-traffic';
import { awsRabbitmqBlueprint } from './aws/messaging/rabbitmq';
import { awsEventStreamBlueprint } from './aws/messaging/event-stream';
import { sqsBlueprint } from './aws/messaging/sqs';
import { snsBlueprint } from './aws/messaging/sns';
import { awsAuthBlueprint } from './aws/security/auth';
import { awsSecretsBlueprint } from './aws/security/secrets';
import { awsLogsBlueprint } from './aws/observability/logs';
import { awsLogTerminalBlueprint } from './aws/observability/log-terminal';
import { awsVectorDbBlueprint } from './aws/ai/vector-db';
import { awsLlmGatewayBlueprint } from './aws/ai/llm-gateway';
import { awsMlModelBlueprint } from './aws/ai/ml-model';
import { awsDataWarehouseBlueprint } from './aws/analytics/data-warehouse';
import { awsSearchBlueprint } from './aws/analytics/search';

// =============================================================================
// GCP (26 blocks)
// =============================================================================
import { gcpStaticSiteBlueprint } from './gcp/frontend/static-site';
import { gcpSsrSiteBlueprint } from './gcp/frontend/ssr-site';
import { gcpScalableBackendBlueprint } from './gcp/backend/scalable-backend';
import { gcpWorkerBlueprint } from './gcp/backend/worker';
import { gcpScheduledTaskBlueprint } from './gcp/backend/scheduled-task';
import { gcpServerlessFunctionBlueprint } from './gcp/compute/serverless-function';
import { gcpPostgresqlBlueprint } from './gcp/data/postgresql';
import { gcpMysqlBlueprint } from './gcp/data/mysql';
import { gcpMongodbBlueprint } from './gcp/data/mongodb';
import { gcpRedisCacheBlueprint } from './gcp/data/redis-cache';
import { firestoreBlueprint } from './gcp/data/firestore';
import { gcpStorageBlueprint } from './gcp/storage/storage';
import { gcpGatewayBlueprint } from './gcp/networking/gateway';
import { gcpPublicTrafficBlueprint } from './gcp/networking/public-traffic';
import { gcpRabbitmqBlueprint } from './gcp/messaging/rabbitmq';
import { gcpEventStreamBlueprint } from './gcp/messaging/event-stream';
import { cloudPubsubBlueprint } from './gcp/messaging/cloud-pubsub';
import { gcpAuthBlueprint } from './gcp/security/auth';
import { gcpSecretsBlueprint } from './gcp/security/secrets';
import { gcpLogsBlueprint } from './gcp/observability/logs';
import { gcpLogTerminalBlueprint } from './gcp/observability/log-terminal';
import { gcpVectorDbBlueprint } from './gcp/ai/vector-db';
import { gcpLlmGatewayBlueprint } from './gcp/ai/llm-gateway';
import { gcpMlModelBlueprint } from './gcp/ai/ml-model';
import { gcpDataWarehouseBlueprint } from './gcp/analytics/data-warehouse';
import { gcpSearchBlueprint } from './gcp/analytics/search';

// =============================================================================
// Azure (25 blocks)
// =============================================================================
import { azureStaticSiteBlueprint } from './azure/frontend/static-site';
import { azureSsrSiteBlueprint } from './azure/frontend/ssr-site';
import { azureScalableBackendBlueprint } from './azure/backend/scalable-backend';
import { azureScheduledTaskBlueprint } from './azure/backend/scheduled-task';
import { azureServerlessFunctionBlueprint } from './azure/compute/serverless-function';
import { azurePostgresqlBlueprint } from './azure/data/postgresql';
import { azureMysqlBlueprint } from './azure/data/mysql';
import { azureMongodbBlueprint } from './azure/data/mongodb';
import { azureRedisCacheBlueprint } from './azure/data/redis-cache';
import { cosmosdbBlueprint } from './azure/data/cosmosdb';
import { azureStorageBlueprint } from './azure/storage/storage';
import { azureGatewayBlueprint } from './azure/networking/gateway';
import { azurePublicTrafficBlueprint } from './azure/networking/public-traffic';
import { azureRabbitmqBlueprint } from './azure/messaging/rabbitmq';
import { azureEventStreamBlueprint } from './azure/messaging/event-stream';
import { serviceBusBlueprint } from './azure/messaging/service-bus';
import { azureAuthBlueprint } from './azure/security/auth';
import { azureSecretsBlueprint } from './azure/security/secrets';
import { azureLogsBlueprint } from './azure/observability/logs';
import { azureLogTerminalBlueprint } from './azure/observability/log-terminal';
import { azureVectorDbBlueprint } from './azure/ai/vector-db';
import { azureLlmGatewayBlueprint } from './azure/ai/llm-gateway';
import { azureMlModelBlueprint } from './azure/ai/ml-model';
import { azureDataWarehouseBlueprint } from './azure/analytics/data-warehouse';
import { azureSearchBlueprint } from './azure/analytics/search';

// =============================================================================
// Kubernetes (15 blocks)
// =============================================================================
import { kubernetesStaticSiteBlueprint } from './kubernetes/frontend/static-site';
import { kubernetesSsrSiteBlueprint } from './kubernetes/frontend/ssr-site';
import { kubernetesScalableBackendBlueprint } from './kubernetes/backend/scalable-backend';
import { kubernetesWorkerBlueprint } from './kubernetes/backend/worker';
import { kubernetesScheduledTaskBlueprint } from './kubernetes/backend/scheduled-task';
import { kubernetesRedisCacheBlueprint } from './kubernetes/data/redis-cache';
import { kubernetesStorageBlueprint } from './kubernetes/storage/storage';
import { kubernetesGatewayBlueprint } from './kubernetes/networking/gateway';
import { kubernetesPublicTrafficBlueprint } from './kubernetes/networking/public-traffic';
import { kubernetesRabbitmqBlueprint } from './kubernetes/messaging/rabbitmq';
import { kubernetesEventStreamBlueprint } from './kubernetes/messaging/event-stream';
import { kubernetesLogsBlueprint } from './kubernetes/observability/logs';
import { kubernetesLogTerminalBlueprint } from './kubernetes/observability/log-terminal';
import { kubernetesLlmGatewayBlueprint } from './kubernetes/ai/llm-gateway';
import { kubernetesSearchBlueprint } from './kubernetes/analytics/search';

// =============================================================================
// Alibaba (11 blocks)
// =============================================================================
import { alibabaStaticSiteBlueprint } from './alibaba/frontend/static-site';
import { alibabaScheduledTaskBlueprint } from './alibaba/backend/scheduled-task';
import { alibabaRedisCacheBlueprint } from './alibaba/data/redis-cache';
import { tablestoreBlueprint } from './alibaba/data/tablestore';
import { alibabaStorageBlueprint } from './alibaba/storage/storage';
import { ossBlueprint } from './alibaba/storage/oss';
import { alibabaGatewayBlueprint } from './alibaba/networking/gateway';
import { alibabaPublicTrafficBlueprint } from './alibaba/networking/public-traffic';
import { alibabaRabbitmqBlueprint } from './alibaba/messaging/rabbitmq';
import { alibabaEventStreamBlueprint } from './alibaba/messaging/event-stream';
import { functionComputeBlueprint } from './alibaba/compute/function-compute';

// =============================================================================
// OCI (11 blocks)
// =============================================================================
import { ociStaticSiteBlueprint } from './oci/frontend/static-site';
import { ociScheduledTaskBlueprint } from './oci/backend/scheduled-task';
import { ociRedisCacheBlueprint } from './oci/data/redis-cache';
import { autonomousDbBlueprint } from './oci/data/autonomous-db';
import { ociStorageBlueprint } from './oci/storage/storage';
import { ociObjectStorageBlueprint } from './oci/storage/oci-object-storage';
import { ociGatewayBlueprint } from './oci/networking/gateway';
import { ociPublicTrafficBlueprint } from './oci/networking/public-traffic';
import { ociRabbitmqBlueprint } from './oci/messaging/rabbitmq';
import { ociEventStreamBlueprint } from './oci/messaging/event-stream';
import { ociFunctionsBlueprint } from './oci/compute/oci-functions';

// =============================================================================
// DigitalOcean (12 blocks)
// =============================================================================
import { digitaloceanStaticSiteBlueprint } from './digitalocean/frontend/static-site';
import { digitaloceanScheduledTaskBlueprint } from './digitalocean/backend/scheduled-task';
import { digitaloceanMongodbBlueprint } from './digitalocean/data/mongodb';
import { digitaloceanRedisCacheBlueprint } from './digitalocean/data/redis-cache';
import { doManagedDbBlueprint } from './digitalocean/data/do-managed-db';
import { digitaloceanStorageBlueprint } from './digitalocean/storage/storage';
import { doSpacesBlueprint } from './digitalocean/storage/do-spaces';
import { digitaloceanGatewayBlueprint } from './digitalocean/networking/gateway';
import { digitaloceanPublicTrafficBlueprint } from './digitalocean/networking/public-traffic';
import { digitaloceanRabbitmqBlueprint } from './digitalocean/messaging/rabbitmq';
import { digitaloceanEventStreamBlueprint } from './digitalocean/messaging/event-stream';
import { doAppPlatformBlueprint } from './digitalocean/compute/do-app-platform';

// =============================================================================
// Common — provider-agnostic (3 blocks)
// =============================================================================
import { githubRepositoryBlueprint } from './common/source/github-repository';
import { envConfigBlueprint } from './common/config/env-config';
import { domainBlueprint } from './common/networking/domain';

// =============================================================================
// Registry
// =============================================================================

/** All available block blueprints */
export const BLOCK_BLUEPRINTS: BlockBlueprint[] = [
  // AWS (27)
  awsStaticSiteBlueprint,
  awsSsrSiteBlueprint,
  awsScalableBackendBlueprint,
  awsWorkerBlueprint,
  awsScheduledTaskBlueprint,
  awsServerlessFunctionBlueprint,
  awsPostgresqlBlueprint,
  awsMysqlBlueprint,
  awsMongodbBlueprint,
  awsRedisCacheBlueprint,
  dynamodbBlueprint,
  awsStorageBlueprint,
  awsGatewayBlueprint,
  awsPublicTrafficBlueprint,
  awsRabbitmqBlueprint,
  awsEventStreamBlueprint,
  sqsBlueprint,
  snsBlueprint,
  awsAuthBlueprint,
  awsSecretsBlueprint,
  awsLogsBlueprint,
  awsLogTerminalBlueprint,
  awsVectorDbBlueprint,
  awsLlmGatewayBlueprint,
  awsMlModelBlueprint,
  awsDataWarehouseBlueprint,
  awsSearchBlueprint,
  // GCP (26)
  gcpStaticSiteBlueprint,
  gcpSsrSiteBlueprint,
  gcpScalableBackendBlueprint,
  gcpWorkerBlueprint,
  gcpScheduledTaskBlueprint,
  gcpServerlessFunctionBlueprint,
  gcpPostgresqlBlueprint,
  gcpMysqlBlueprint,
  gcpMongodbBlueprint,
  gcpRedisCacheBlueprint,
  firestoreBlueprint,
  gcpStorageBlueprint,
  gcpGatewayBlueprint,
  gcpPublicTrafficBlueprint,
  gcpRabbitmqBlueprint,
  gcpEventStreamBlueprint,
  cloudPubsubBlueprint,
  gcpAuthBlueprint,
  gcpSecretsBlueprint,
  gcpLogsBlueprint,
  gcpLogTerminalBlueprint,
  gcpVectorDbBlueprint,
  gcpLlmGatewayBlueprint,
  gcpMlModelBlueprint,
  gcpDataWarehouseBlueprint,
  gcpSearchBlueprint,
  // Azure (25)
  azureStaticSiteBlueprint,
  azureSsrSiteBlueprint,
  azureScalableBackendBlueprint,
  azureScheduledTaskBlueprint,
  azureServerlessFunctionBlueprint,
  azurePostgresqlBlueprint,
  azureMysqlBlueprint,
  azureMongodbBlueprint,
  azureRedisCacheBlueprint,
  cosmosdbBlueprint,
  azureStorageBlueprint,
  azureGatewayBlueprint,
  azurePublicTrafficBlueprint,
  azureRabbitmqBlueprint,
  azureEventStreamBlueprint,
  serviceBusBlueprint,
  azureAuthBlueprint,
  azureSecretsBlueprint,
  azureLogsBlueprint,
  azureLogTerminalBlueprint,
  azureVectorDbBlueprint,
  azureLlmGatewayBlueprint,
  azureMlModelBlueprint,
  azureDataWarehouseBlueprint,
  azureSearchBlueprint,
  // Kubernetes (15)
  kubernetesStaticSiteBlueprint,
  kubernetesSsrSiteBlueprint,
  kubernetesScalableBackendBlueprint,
  kubernetesWorkerBlueprint,
  kubernetesScheduledTaskBlueprint,
  kubernetesRedisCacheBlueprint,
  kubernetesStorageBlueprint,
  kubernetesGatewayBlueprint,
  kubernetesPublicTrafficBlueprint,
  kubernetesRabbitmqBlueprint,
  kubernetesEventStreamBlueprint,
  kubernetesLogsBlueprint,
  kubernetesLogTerminalBlueprint,
  kubernetesLlmGatewayBlueprint,
  kubernetesSearchBlueprint,
  // Alibaba (11)
  alibabaStaticSiteBlueprint,
  alibabaScheduledTaskBlueprint,
  alibabaRedisCacheBlueprint,
  tablestoreBlueprint,
  alibabaStorageBlueprint,
  ossBlueprint,
  alibabaGatewayBlueprint,
  alibabaPublicTrafficBlueprint,
  alibabaRabbitmqBlueprint,
  alibabaEventStreamBlueprint,
  functionComputeBlueprint,
  // OCI (11)
  ociStaticSiteBlueprint,
  ociScheduledTaskBlueprint,
  ociRedisCacheBlueprint,
  autonomousDbBlueprint,
  ociStorageBlueprint,
  ociObjectStorageBlueprint,
  ociGatewayBlueprint,
  ociPublicTrafficBlueprint,
  ociRabbitmqBlueprint,
  ociEventStreamBlueprint,
  ociFunctionsBlueprint,
  // DigitalOcean (12)
  digitaloceanStaticSiteBlueprint,
  digitaloceanScheduledTaskBlueprint,
  digitaloceanMongodbBlueprint,
  digitaloceanRedisCacheBlueprint,
  doManagedDbBlueprint,
  digitaloceanStorageBlueprint,
  doSpacesBlueprint,
  digitaloceanGatewayBlueprint,
  digitaloceanPublicTrafficBlueprint,
  digitaloceanRabbitmqBlueprint,
  digitaloceanEventStreamBlueprint,
  doAppPlatformBlueprint,
  // Common (3)
  githubRepositoryBlueprint,
  envConfigBlueprint,
  domainBlueprint,
];

/** Fast lookup map: blockType → blueprint */
const blueprintMap = new Map<string, BlockBlueprint>(
  BLOCK_BLUEPRINTS.map((bp) => [bp.blockType, bp])
);

/**
 * Get a blueprint by its palette block type.
 *
 * Supports two lookup modes:
 * 1. Exact match: `getBlueprint('aws-postgresql')` → AWS PostgreSQL
 * 2. Provider-prefixed: `getBlueprint('postgresql', 'aws')` → AWS PostgreSQL
 *
 * The second form enables templates to use generic blockTypes ('postgresql')
 * which resolve to provider-specific blueprints ('aws-postgresql') at expand time.
 */
export function getBlueprint(blockType: string, provider?: string): BlockBlueprint | undefined {
  // 1. Try exact match (e.g., 'aws-postgresql' or 'dynamodb')
  const exact = blueprintMap.get(blockType);
  if (exact) return exact;

  // 2. Try provider-prefixed match (e.g., 'postgresql' + 'aws' → 'aws-postgresql')
  if (provider) {
    return blueprintMap.get(`${provider}-${blockType}`);
  }

  return undefined;
}
