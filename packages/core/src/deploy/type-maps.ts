/**
 * Provider type maps and dispatcher for the card-to-graph translator.
 *
 * Maps canvas iceTypes (e.g. `Compute.StaticSite`) to concrete provider
 * resource types (e.g. `gcp.firebase.hosting`) per cloud provider. The
 * translator looks up the right map via `get_type_map(provider)` and
 * uses the resolved string as the deployer-handler key.
 *
 * `DESIGN_ONLY_PROVIDERS` lists the providers that have no deployer
 * support yet — blocks for those providers stay on the canvas for
 * architecture planning but never compile to a real resource.
 */

import type { DeployProvider } from './card-translator';

// =============================================================================
// GCP iceType → deployer type mapping
// =============================================================================

export const GCP_TYPE_MAP: Record<string, string> = {
  // Firebase Hosting is the right answer for static sites on GCP. It
  // bypasses the Cloud Storage org policies (`iam.allowedPolicyMemberDomains`,
  // `storage.uniformBucketLevelAccess`, `storage.publicAccessPrevention`)
  // that make a public Cloud Storage bucket impossible in hardened
  // enterprise projects, AND it gives you free HTTPS, CDN, and a public
  // URL out of the box without provisioning a load balancer + backend
  // bucket + URL map + forwarding rule + managed cert.
  'Compute.StaticSite': 'gcp.firebase.hosting',
  'Compute.SSRSite': 'gcp.run.service',
  'Compute.Container': 'gcp.run.service',
  'Compute.BackendAPI': 'gcp.run.service',
  'Compute.Worker': 'gcp.run.job',
  'Compute.CronJob': 'gcp.cloudscheduler.job',
  'Compute.ServerlessFunction': 'gcp.cloudfunctions.function',
  'Database.PostgreSQL': 'gcp.sql.databaseInstance',
  'Database.MySQL': 'gcp.sql.databaseInstance',
  'Database.Firestore': 'gcp.firestore.database',
  'Database.Redis': 'gcp.redis.instance',
  'Storage.Bucket': 'gcp.storage.bucket',
  'Storage.ObjectStorage': 'gcp.storage.bucket',
  'Network.Gateway': 'gcp.apigateway.api',
  // `Network.PublicEndpoint` is the single "make my services reachable
  // from the internet" block. It compiles to a global forwarding rule
  // (which the handler expands into backend bucket + URL map + target
  // HTTPS proxy + forwarding rule). The managed SSL cert is injected
  // by the Pass 1.5 semantic wiring below when `enableHttps + domain`
  // are set, and the URL map host rules are populated from each
  // outgoing edge's `subdomain` field.
  'Network.PublicEndpoint': 'gcp.compute.globalForwardingRule',
  // `Network.PrivateNetwork` is the user-facing "private network" block:
  // one group on the canvas that wraps the services we want isolated.
  // Compiles to an auto-mode VPC (`autoCreateSubnetworks: true`) so the
  // user doesn't have to drag explicit Subnet blocks — GCP auto-creates
  // a /20 subnet per region. Templates should use this block, not the
  // lower-level `Network.VPC` + `Network.Subnet` pair (which still exists
  // for power users who need custom CIDR layouts).
  'Network.PrivateNetwork': 'gcp.compute.network',
  'Network.LoadBalancer': 'gcp.compute.globalForwardingRule',
  'Network.VPC': 'gcp.compute.network',
  'Network.Subnet': 'gcp.compute.subnetwork',
  'Security.WAF': 'gcp.compute.securityPolicy',
  'Messaging.CloudPubSub': 'gcp.pubsub.topic',
  'Messaging.Queue': 'gcp.pubsub.topic',
  'Messaging.Topic': 'gcp.pubsub.topic',
  'Messaging.RabbitMQ': 'gcp.container.cluster',
  'Security.Identity': 'gcp.identityplatform.config',
  'Security.Secret': 'gcp.secretmanager.secret',
  'Monitoring.Log': 'gcp.logging.sink',
  'AI.VectorDB': 'gcp.aiplatform.index',
  'AI.LLMGateway': 'gcp.aiplatform.endpoint',
  'AI.ModelServing': 'gcp.aiplatform.endpoint',
  'Analytics.DataWarehouse': 'gcp.bigquery.dataset',
  'Analytics.Search': 'gcp.discoveryengine.searchEngine',
};

// =============================================================================
// AWS iceType → deployer type mapping
// =============================================================================

export const AWS_TYPE_MAP: Record<string, string> = {
  'Compute.StaticSite': 'aws.s3.bucket',
  'Compute.SSRSite': 'aws.ecs.service',
  'Compute.Container': 'aws.ecs.service',
  'Compute.BackendAPI': 'aws.ecs.service',
  'Compute.Worker': 'aws.ecs.service',
  'Compute.CronJob': 'aws.events.rule',
  'Compute.ServerlessFunction': 'aws.lambda.function',
  'Database.PostgreSQL': 'aws.rds.dbInstance',
  'Database.MySQL': 'aws.rds.dbInstance',
  'Database.DynamoDB': 'aws.dynamodb.table',
  'Database.Redis': 'aws.elasticache.cluster',
  'Database.MongoDB': 'aws.docdb.cluster',
  'Storage.Bucket': 'aws.s3.bucket',
  'Storage.ObjectStorage': 'aws.s3.bucket',
  'Network.Gateway': 'aws.apigateway.restApi',
  'Network.PublicEndpoint': 'aws.cloudfront.distribution',
  'Network.LoadBalancer': 'aws.elbv2.loadBalancer',
  'Messaging.Queue': 'aws.sqs.queue',
  'Messaging.Topic': 'aws.sns.topic',
  'Messaging.CloudPubSub': 'aws.sns.topic',
  'Security.Identity': 'aws.cognito.userPool',
  'Security.Secret': 'aws.secretsmanager.secret',
  'Monitoring.Log': 'aws.cloudwatch.logGroup',
  'AI.VectorDB': 'aws.opensearch.domain',
  'AI.LLMGateway': 'aws.bedrock.endpoint',
  'AI.ModelServing': 'aws.sagemaker.endpoint',
  'Analytics.DataWarehouse': 'aws.redshift.cluster',
};

// =============================================================================
// Azure iceType → deployer type mapping
// =============================================================================

export const AZURE_TYPE_MAP: Record<string, string> = {
  'Compute.StaticSite': 'azure.storage.staticSite',
  'Compute.SSRSite': 'azure.appservice.webApp',
  'Compute.Container': 'azure.containerapp.containerApp',
  'Compute.BackendAPI': 'azure.appservice.webApp',
  'Compute.Worker': 'azure.containerapp.containerApp',
  'Compute.CronJob': 'azure.logicapp.workflow',
  'Compute.ServerlessFunction': 'azure.functions.functionApp',
  'Database.PostgreSQL': 'azure.dbforpostgresql.server',
  'Database.MySQL': 'azure.dbformysql.server',
  'Database.CosmosDB': 'azure.cosmosdb.account',
  'Database.Redis': 'azure.cache.redis',
  'Database.MongoDB': 'azure.cosmosdb.account',
  'Storage.Bucket': 'azure.storage.storageAccount',
  'Storage.ObjectStorage': 'azure.storage.storageAccount',
  'Network.Gateway': 'azure.apimanagement.service',
  'Network.PublicEndpoint': 'azure.cdn.profile',
  'Network.LoadBalancer': 'azure.network.loadBalancer',
  'Messaging.Queue': 'azure.servicebus.queue',
  'Messaging.Topic': 'azure.servicebus.topic',
  'Security.Identity': 'azure.activedirectory.application',
  'Security.Secret': 'azure.keyvault.vault',
  'Monitoring.Log': 'azure.monitor.logAnalyticsWorkspace',
  'AI.VectorDB': 'azure.search.searchService',
  'AI.LLMGateway': 'azure.openai.deployment',
  'AI.ModelServing': 'azure.machinelearning.endpoint',
  'Analytics.DataWarehouse': 'azure.synapse.workspace',
};

// Providers that have no deployer support — blocks are design-only
export const DESIGN_ONLY_PROVIDERS = new Set(['alibaba', 'digitalocean', 'kubernetes']);

export function get_type_map(provider: DeployProvider): Record<string, string> {
  switch (provider) {
    case 'gcp':
      return GCP_TYPE_MAP;
    case 'aws':
      return AWS_TYPE_MAP;
    case 'azure':
      return AZURE_TYPE_MAP;
    default:
      return {};
  }
}
