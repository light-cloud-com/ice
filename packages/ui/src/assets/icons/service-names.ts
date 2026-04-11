/**
 * Cloud-Native Service Name Registry
 *
 * Maps (iceType, provider) → full cloud-native service name.
 * Displayed on the second header line of block cards:
 *   "Amazon RDS · PostgreSQL 16"
 *   "AWS Lambda · Node.js 20"
 */

// ─── Service Name Database ────────────────────────────────────────────────

const SERVICE_NAMES: Record<string, Record<string, string>> = {
  // ── Compute ──
  'Compute.Container': {
    aws: 'Amazon ECS',
    gcp: 'Cloud Run',
    azure: 'Azure Container Apps',
    kubernetes: 'Kubernetes Deployment',
    alibaba: 'Alibaba ECI',
    oci: 'OCI Container Instances',
    digitalocean: 'DO App Platform',
  },
  'Compute.Function': {
    aws: 'AWS Lambda',
    gcp: 'Cloud Functions',
    azure: 'Azure Functions',
    alibaba: 'Alibaba FC',
  },
  'Compute.ServerlessFunction': {
    aws: 'AWS Lambda',
    gcp: 'Cloud Functions',
    azure: 'Azure Functions',
    alibaba: 'Alibaba FC',
  },
  'Compute.VM': {
    aws: 'Amazon EC2',
    gcp: 'Compute Engine',
    azure: 'Azure Virtual Machines',
    alibaba: 'Alibaba ECS',
    oci: 'OCI Compute',
    digitalocean: 'DO Droplets',
  },
  'Compute.StaticSite': {
    aws: 'AWS Amplify',
    gcp: 'Firebase Hosting',
    azure: 'Azure Static Web Apps',
    cloudflare: 'Cloudflare Pages',
  },
  'Compute.SSRSite': {
    aws: 'AWS App Runner',
    gcp: 'Cloud Run',
    azure: 'Azure App Service',
  },
  'Compute.Worker': {
    aws: 'Amazon ECS Task',
    gcp: 'Cloud Run Job',
    azure: 'Azure Container Apps Job',
    kubernetes: 'Kubernetes Job',
  },
  'Compute.ScheduledTask': {
    aws: 'Amazon EventBridge',
    gcp: 'Cloud Scheduler',
    azure: 'Azure Logic Apps',
  },

  // ── Database ──
  'Database.PostgreSQL': {
    aws: 'Amazon RDS',
    gcp: 'Cloud SQL',
    azure: 'Azure Database for PostgreSQL',
    digitalocean: 'DO Managed Database',
  },
  'Database.MySQL': {
    aws: 'Amazon RDS',
    gcp: 'Cloud SQL',
    azure: 'Azure Database for MySQL',
  },
  'Database.Aurora': {
    aws: 'Amazon Aurora',
  },
  'Database.MongoDB': {
    aws: 'Amazon DocumentDB',
    gcp: 'MongoDB Atlas',
    azure: 'Azure Cosmos DB',
  },
  'Database.DynamoDB': {
    aws: 'Amazon DynamoDB',
  },
  'Database.Firestore': {
    gcp: 'Cloud Firestore',
  },
  'Database.CosmosDB': {
    azure: 'Azure Cosmos DB',
  },
  'Database.Redis': {
    aws: 'Amazon ElastiCache',
    gcp: 'Cloud Memorystore',
    azure: 'Azure Cache for Redis',
  },
  'Database.Elasticsearch': {
    aws: 'Amazon OpenSearch',
    gcp: 'Elastic Cloud',
    azure: 'Azure Cognitive Search',
  },
  'Database.Neptune': {
    aws: 'Amazon Neptune',
  },
  'Database.Timestream': {
    aws: 'Amazon Timestream',
  },

  // ── Storage ──
  'Storage.Bucket': {
    aws: 'Amazon S3',
    gcp: 'Cloud Storage',
    azure: 'Azure Blob Storage',
    alibaba: 'Alibaba OSS',
    oci: 'OCI Object Storage',
    digitalocean: 'DO Spaces',
  },
  'Storage.S3': { aws: 'Amazon S3' },
  'Storage.EFS': { aws: 'Amazon EFS' },
  'Storage.EBS': { aws: 'Amazon EBS' },
  'Storage.Glacier': { aws: 'Amazon S3 Glacier' },

  // ── Network ──
  'Network.Gateway': {
    aws: 'AWS API Gateway',
    gcp: 'Cloud API Gateway',
    azure: 'Azure API Management',
  },
  'Network.APIGateway': {
    aws: 'AWS API Gateway',
    gcp: 'Cloud API Gateway',
    azure: 'Azure API Management',
  },
  'Network.CDN': {
    aws: 'Amazon CloudFront',
    gcp: 'Cloud CDN',
    azure: 'Azure CDN',
    cloudflare: 'Cloudflare CDN',
  },
  'Network.LoadBalancer': {
    aws: 'Elastic Load Balancer',
    gcp: 'Cloud Load Balancing',
    azure: 'Azure Load Balancer',
  },
  'Network.PublicTraffic': {
    aws: 'AWS Public Traffic',
    gcp: 'GCP Public Traffic',
    azure: 'Azure Public Traffic',
  },
  'Network.PublicEndpoint': {
    aws: 'Amazon Route 53',
    gcp: 'Cloud DNS',
    azure: 'Azure DNS',
  },
  'Network.CustomDomain': {
    aws: 'Custom Domain',
    gcp: 'Custom Domain',
    azure: 'Custom Domain',
  },
  'Network.SecureGroup': {
    aws: 'VPC + ALB',
    gcp: 'VPC + Load Balancer',
    azure: 'VNet + App Gateway',
  },
  'Network.Route53': { aws: 'Amazon Route 53' },
  'Network.VPC': {
    aws: 'Amazon VPC',
    gcp: 'VPC Network',
    azure: 'Azure VNet',
  },

  // ── Security ──
  'Security.Identity': {
    aws: 'Amazon Cognito',
    gcp: 'Firebase Auth',
    azure: 'Azure Entra ID',
  },
  'Security.Cognito': { aws: 'Amazon Cognito' },
  'Security.IAM': {
    aws: 'AWS IAM',
    gcp: 'Cloud IAM',
    azure: 'Azure RBAC',
  },
  'Security.Secrets': {
    aws: 'AWS Secrets Manager',
    gcp: 'Secret Manager',
    azure: 'Azure Key Vault',
  },
  'Security.SecretsManager': { aws: 'AWS Secrets Manager' },
  'Security.WAF': { aws: 'AWS WAF' },
  'Security.Shield': { aws: 'AWS Shield' },
  'Security.KMS': {
    aws: 'AWS KMS',
    gcp: 'Cloud KMS',
    azure: 'Azure Key Vault',
  },

  // ── Messaging ──
  'Messaging.Queue': {
    aws: 'Amazon SQS',
    gcp: 'Cloud Pub/Sub',
    azure: 'Azure Service Bus',
  },
  'Messaging.SQS': { aws: 'Amazon SQS' },
  'Messaging.Topic': {
    aws: 'Amazon SNS',
    gcp: 'Cloud Pub/Sub',
    azure: 'Azure Event Grid',
  },
  'Messaging.SNS': { aws: 'Amazon SNS' },
  'Messaging.EventBridge': { aws: 'Amazon EventBridge' },
  'Messaging.Kafka': {
    aws: 'Amazon MSK',
    gcp: 'Confluent Cloud',
    azure: 'Azure Event Hubs',
  },
  'Messaging.MQ': { aws: 'Amazon MQ' },

  // ── Analytics ──
  'Analytics.Kinesis': { aws: 'Amazon Kinesis' },
  'Analytics.OpenSearch': { aws: 'Amazon OpenSearch' },
  'Analytics.Athena': { aws: 'Amazon Athena' },
  'Analytics.Redshift': { aws: 'Amazon Redshift' },
  'Analytics.DataWarehouse': {
    aws: 'Amazon Redshift',
    gcp: 'BigQuery',
    azure: 'Azure Synapse',
  },
  'Analytics.Search': {
    aws: 'Amazon OpenSearch',
    gcp: 'Elastic Cloud on GCP',
    azure: 'Azure Cognitive Search',
  },
  'Analytics.Glue': { aws: 'AWS Glue' },
  'Analytics.EMR': { aws: 'Amazon EMR' },

  // ── Observability ──
  'Observability.Logs': {
    aws: 'Amazon CloudWatch',
    gcp: 'Cloud Logging',
    azure: 'Azure Monitor',
  },
  'Observability.Metrics': {
    aws: 'Amazon Managed Prometheus',
    gcp: 'Cloud Monitoring',
    azure: 'Azure Monitor',
  },
  'Observability.Tracing': {
    aws: 'AWS X-Ray',
    gcp: 'Cloud Trace',
    azure: 'Application Insights',
  },
  'Observability.Dashboard': {
    aws: 'Amazon Managed Grafana',
    gcp: 'Cloud Monitoring',
    azure: 'Azure Dashboards',
  },
  'Monitoring.Log': {
    aws: 'Amazon CloudWatch',
    gcp: 'Cloud Logging',
    azure: 'Azure Monitor',
  },

  // ── AI ──
  'AI.LLMGateway': {
    aws: 'Amazon Bedrock',
    gcp: 'Vertex AI',
    azure: 'Azure OpenAI',
  },
  'AI.MLModel': {
    aws: 'Amazon SageMaker',
    gcp: 'Vertex AI',
    azure: 'Azure ML',
  },
  'AI.VectorDB': {
    aws: 'Amazon OpenSearch',
    gcp: 'Vertex AI Vector Search',
    azure: 'Azure Cognitive Search',
  },

  // ── Source / Config ──
  'Source.Repository': {
    github: 'GitHub',
    gitlab: 'GitLab',
    bitbucket: 'Bitbucket',
  },
  'Config.Environment': {
    aws: 'AWS Systems Manager',
    gcp: 'Runtime Configurator',
    azure: 'Azure App Configuration',
  },
};

// ─── Lookup ───────────────────────────────────────────────────────────────

/**
 * Get the full cloud-native service name for a given iceType + provider.
 *
 * @example getServiceName('Database.PostgreSQL', 'aws') → 'Amazon RDS'
 * @example getServiceName('Compute.Container', 'gcp') → 'Cloud Run'
 */
export function getServiceName(iceType: string, provider: string): string | null {
  const providerMap = SERVICE_NAMES[iceType];
  if (!providerMap) return null;

  const p = provider?.toLowerCase() || 'aws';
  return providerMap[p] || null;
}
