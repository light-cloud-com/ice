/**
 * Block Blueprint Registry
 *
 * Central barrel file — imports all provider-specific blueprints and exposes
 * lookup helpers + the expansion function.
 *
 * ALL blocks are provider-specific. No bare category directories exist.
 */

// Re-export types and expansion engine
export type { BlockBlueprint, ProviderVariant, ExpandedBlueprint } from './types';
export type { Provider } from './types';
export { expandBlueprint } from './expand-blueprint';
export type { ExpandBlueprintOptions } from './expand-blueprint';

import { alibabaScheduledTaskBlueprint } from './alibaba/backend/scheduled-task';
import { functionComputeBlueprint } from './alibaba/compute/function-compute';
import { alibabaRedisCacheBlueprint } from './alibaba/data/redis-cache';
import { tablestoreBlueprint } from './alibaba/data/tablestore';
import { alibabaStaticSiteBlueprint } from './alibaba/frontend/static-site';
import { alibabaEventStreamBlueprint } from './alibaba/messaging/event-stream';
import { alibabaRabbitmqBlueprint } from './alibaba/messaging/rabbitmq';
import { alibabaGatewayBlueprint } from './alibaba/networking/gateway';
import { ossBlueprint } from './alibaba/storage/oss';
import { alibabaStorageBlueprint } from './alibaba/storage/storage';
import { awsLlmGatewayBlueprint } from './aws/ai/llm-gateway';
import { awsMlModelBlueprint } from './aws/ai/ml-model';
import { awsVectorDbBlueprint } from './aws/ai/vector-db';
import { awsDataWarehouseBlueprint } from './aws/analytics/data-warehouse';
import { awsSearchBlueprint } from './aws/analytics/search';
import { awsScalableBackendBlueprint } from './aws/backend/scalable-backend';
import { awsScheduledTaskBlueprint } from './aws/backend/scheduled-task';
import { awsWorkerBlueprint } from './aws/backend/worker';
import { awsServerlessFunctionBlueprint } from './aws/compute/serverless-function';
import { dynamodbBlueprint } from './aws/data/dynamodb';
import { awsMongodbBlueprint } from './aws/data/mongodb';
import { awsMysqlBlueprint } from './aws/data/mysql';
import { awsPostgresqlBlueprint } from './aws/data/postgresql';
import { awsRedisCacheBlueprint } from './aws/data/redis-cache';
import { awsSsrSiteBlueprint } from './aws/frontend/ssr-site';
import { awsStaticSiteBlueprint } from './aws/frontend/static-site';
import { awsEventStreamBlueprint } from './aws/messaging/event-stream';
import { awsRabbitmqBlueprint } from './aws/messaging/rabbitmq';
import { snsBlueprint } from './aws/messaging/sns';
import { sqsBlueprint } from './aws/messaging/sqs';
import { awsGatewayBlueprint } from './aws/networking/gateway';
import { awsSubnetBlueprint } from './aws/networking/subnet';
import { awsVpcBlueprint } from './aws/networking/vpc';
import { awsLogTerminalBlueprint } from './aws/observability/log-terminal';
import { awsLogsBlueprint } from './aws/observability/logs';
import { awsAuthBlueprint } from './aws/security/auth';
import { awsSecretsBlueprint } from './aws/security/secrets';
import { awsSslCertificateBlueprint } from './aws/security/ssl-certificate';
import { awsWafBlueprint } from './aws/security/waf';
import { awsStorageBlueprint } from './aws/storage/storage';
import { azureLlmGatewayBlueprint } from './azure/ai/llm-gateway';
import { azureMlModelBlueprint } from './azure/ai/ml-model';
import { azureVectorDbBlueprint } from './azure/ai/vector-db';
import { azureDataWarehouseBlueprint } from './azure/analytics/data-warehouse';
import { azureSearchBlueprint } from './azure/analytics/search';
import { azureScalableBackendBlueprint } from './azure/backend/scalable-backend';
import { azureScheduledTaskBlueprint } from './azure/backend/scheduled-task';
import { azureServerlessFunctionBlueprint } from './azure/compute/serverless-function';
import { cosmosdbBlueprint } from './azure/data/cosmosdb';
import { azureMongodbBlueprint } from './azure/data/mongodb';
import { azureMysqlBlueprint } from './azure/data/mysql';
import { azurePostgresqlBlueprint } from './azure/data/postgresql';
import { azureRedisCacheBlueprint } from './azure/data/redis-cache';
import { azureSsrSiteBlueprint } from './azure/frontend/ssr-site';
import { azureStaticSiteBlueprint } from './azure/frontend/static-site';
import { azureEventStreamBlueprint } from './azure/messaging/event-stream';
import { azureRabbitmqBlueprint } from './azure/messaging/rabbitmq';
import { serviceBusBlueprint } from './azure/messaging/service-bus';
import { azureGatewayBlueprint } from './azure/networking/gateway';
import { azureSubnetBlueprint } from './azure/networking/subnet';
import { azureVpcBlueprint } from './azure/networking/vpc';
import { azureLogTerminalBlueprint } from './azure/observability/log-terminal';
import { azureLogsBlueprint } from './azure/observability/logs';
import { azureAuthBlueprint } from './azure/security/auth';
import { azureSecretsBlueprint } from './azure/security/secrets';
import { azureSslCertificateBlueprint } from './azure/security/ssl-certificate';
import { azureWafBlueprint } from './azure/security/waf';
import { azureStorageBlueprint } from './azure/storage/storage';
import { envConfigBlueprint } from './common/config/env-config';
import { customDomainBlueprint } from './common/networking/custom-domain';
import { publicEndpointBlueprint } from './common/networking/public-endpoint';
import { secureGroupBlueprint } from './common/networking/secure-group';
import { githubRepositoryBlueprint } from './common/source/github-repository';
import { digitaloceanScheduledTaskBlueprint } from './digitalocean/backend/scheduled-task';
import { doAppPlatformBlueprint } from './digitalocean/compute/do-app-platform';
import { doManagedDbBlueprint } from './digitalocean/data/do-managed-db';
import { digitaloceanMongodbBlueprint } from './digitalocean/data/mongodb';
import { digitaloceanRedisCacheBlueprint } from './digitalocean/data/redis-cache';
import { digitaloceanStaticSiteBlueprint } from './digitalocean/frontend/static-site';
import { digitaloceanEventStreamBlueprint } from './digitalocean/messaging/event-stream';
import { digitaloceanRabbitmqBlueprint } from './digitalocean/messaging/rabbitmq';
import { digitaloceanGatewayBlueprint } from './digitalocean/networking/gateway';
import { doSpacesBlueprint } from './digitalocean/storage/do-spaces';
import { digitaloceanStorageBlueprint } from './digitalocean/storage/storage';
import { gcpLlmGatewayBlueprint } from './gcp/ai/llm-gateway';
import { gcpMlModelBlueprint } from './gcp/ai/ml-model';
import { gcpVectorDbBlueprint } from './gcp/ai/vector-db';
import { gcpDataWarehouseBlueprint } from './gcp/analytics/data-warehouse';
import { gcpSearchBlueprint } from './gcp/analytics/search';
import { gcpScalableBackendBlueprint } from './gcp/backend/scalable-backend';
import { gcpScheduledTaskBlueprint } from './gcp/backend/scheduled-task';
import { gcpWorkerBlueprint } from './gcp/backend/worker';
import { gcpServerlessFunctionBlueprint } from './gcp/compute/serverless-function';
import { firestoreBlueprint } from './gcp/data/firestore';
import { gcpMongodbBlueprint } from './gcp/data/mongodb';
import { gcpMysqlBlueprint } from './gcp/data/mysql';
import { gcpPostgresqlBlueprint } from './gcp/data/postgresql';
import { gcpRedisCacheBlueprint } from './gcp/data/redis-cache';
import { gcpSsrSiteBlueprint } from './gcp/frontend/ssr-site';
import { gcpStaticSiteBlueprint } from './gcp/frontend/static-site';
import { cloudPubsubBlueprint } from './gcp/messaging/cloud-pubsub';
import { gcpEventStreamBlueprint } from './gcp/messaging/event-stream';
import { gcpRabbitmqBlueprint } from './gcp/messaging/rabbitmq';
import { gcpGatewayBlueprint } from './gcp/networking/gateway';
import { gcpSubnetBlueprint } from './gcp/networking/subnet';
import { gcpVpcBlueprint } from './gcp/networking/vpc';
import { gcpLogTerminalBlueprint } from './gcp/observability/log-terminal';
import { gcpLogsBlueprint } from './gcp/observability/logs';
import { gcpAuthBlueprint } from './gcp/security/auth';
import { gcpSecretsBlueprint } from './gcp/security/secrets';
import { gcpSslCertificateBlueprint } from './gcp/security/ssl-certificate';
import { gcpWafBlueprint } from './gcp/security/waf';
import { gcpStorageBlueprint } from './gcp/storage/storage';
import { kubernetesLlmGatewayBlueprint } from './kubernetes/ai/llm-gateway';
import { kubernetesSearchBlueprint } from './kubernetes/analytics/search';
import { kubernetesScalableBackendBlueprint } from './kubernetes/backend/scalable-backend';
import { kubernetesScheduledTaskBlueprint } from './kubernetes/backend/scheduled-task';
import { kubernetesWorkerBlueprint } from './kubernetes/backend/worker';
import { kubernetesRedisCacheBlueprint } from './kubernetes/data/redis-cache';
import { kubernetesSsrSiteBlueprint } from './kubernetes/frontend/ssr-site';
import { kubernetesStaticSiteBlueprint } from './kubernetes/frontend/static-site';
import { kubernetesEventStreamBlueprint } from './kubernetes/messaging/event-stream';
import { kubernetesRabbitmqBlueprint } from './kubernetes/messaging/rabbitmq';
import { kubernetesGatewayBlueprint } from './kubernetes/networking/gateway';
import { kubernetesLogTerminalBlueprint } from './kubernetes/observability/log-terminal';
import { kubernetesLogsBlueprint } from './kubernetes/observability/logs';
import { kubernetesStorageBlueprint } from './kubernetes/storage/storage';
import { ociScheduledTaskBlueprint } from './oci/backend/scheduled-task';
import { ociFunctionsBlueprint } from './oci/compute/oci-functions';
import { autonomousDbBlueprint } from './oci/data/autonomous-db';
import { ociRedisCacheBlueprint } from './oci/data/redis-cache';
import { ociStaticSiteBlueprint } from './oci/frontend/static-site';
import { ociEventStreamBlueprint } from './oci/messaging/event-stream';
import { ociRabbitmqBlueprint } from './oci/messaging/rabbitmq';
import { ociGatewayBlueprint } from './oci/networking/gateway';
import { ociObjectStorageBlueprint } from './oci/storage/oci-object-storage';
import { ociStorageBlueprint } from './oci/storage/storage';
import type { BlockBlueprint } from './types';

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
  awsVpcBlueprint,
  awsSubnetBlueprint,
  awsRabbitmqBlueprint,
  awsEventStreamBlueprint,
  sqsBlueprint,
  snsBlueprint,
  awsAuthBlueprint,
  awsSecretsBlueprint,
  awsWafBlueprint,
  awsSslCertificateBlueprint,
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
  gcpVpcBlueprint,
  gcpSubnetBlueprint,
  gcpRabbitmqBlueprint,
  gcpEventStreamBlueprint,
  cloudPubsubBlueprint,
  gcpAuthBlueprint,
  gcpSecretsBlueprint,
  gcpWafBlueprint,
  gcpSslCertificateBlueprint,
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
  azureVpcBlueprint,
  azureSubnetBlueprint,
  azureRabbitmqBlueprint,
  azureEventStreamBlueprint,
  serviceBusBlueprint,
  azureAuthBlueprint,
  azureSecretsBlueprint,
  azureWafBlueprint,
  azureSslCertificateBlueprint,
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
  digitaloceanRabbitmqBlueprint,
  digitaloceanEventStreamBlueprint,
  doAppPlatformBlueprint,
  // Common (5)
  githubRepositoryBlueprint,
  envConfigBlueprint,
  publicEndpointBlueprint,
  customDomainBlueprint,
  secureGroupBlueprint,
];

/**
 * Fast lookup maps:
 * - blueprintByTypeAndProvider: "iceType|provider" → blueprint (for provider-specific lookup)
 * - blueprintByType: "iceType" → first blueprint (for provider-agnostic lookup)
 */
const blueprintByTypeAndProvider = new Map<string, BlockBlueprint>();
const blueprintByType = new Map<string, BlockBlueprint>();

for (const bp of BLOCK_BLUEPRINTS) {
  // Index by iceType (first match wins for provider-agnostic lookup)
  if (!blueprintByType.has(bp.iceType)) {
    blueprintByType.set(bp.iceType, bp);
  }
  // Index by iceType + each provider
  for (const provider of bp.providers) {
    blueprintByTypeAndProvider.set(`${bp.iceType}|${provider}`, bp);
  }
}

/**
 * Get a blueprint by its canonical iceType and optional provider.
 *
 * @example
 * getBlueprint('Database.PostgreSQL', 'aws')  // → AWS PostgreSQL blueprint
 * getBlueprint('Database.PostgreSQL', 'gcp')  // → GCP Cloud SQL blueprint
 * getBlueprint('Network.PublicEndpoint')              // → Domain blueprint (cross-provider)
 */
export function getBlueprint(iceType: string, provider?: string): BlockBlueprint | undefined {
  if (provider) {
    return blueprintByTypeAndProvider.get(`${iceType}|${provider}`);
  }
  return blueprintByType.get(iceType);
}
