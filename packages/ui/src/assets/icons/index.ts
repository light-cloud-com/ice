/**
 * Cloud Provider Icon Library
 *
 * Centralized icon management for all cloud providers.
 * Currently supports AWS, with structure ready for GCP, Azure, and Kubernetes.
 */

// =============================================================================
// AWS Icons - Import as URLs (only icons currently in use)
// =============================================================================

// Compute
import awsAthena from './aws/Analytics/Athena.svg';
import awsEmr from './aws/Analytics/EMR.svg';
import awsGlue from './aws/Analytics/Glue.svg';
import awsKinesis from './aws/Analytics/Kinesis.svg';
import awsMsk from './aws/Analytics/Managed-Streaming-for-Apache-Kafka.svg';
import awsOpenSearch from './aws/Analytics/OpenSearch-Service.svg';
import awsRedshift from './aws/Analytics/Redshift.svg';
import awsApiGateway from './aws/App-Integration/API-Gateway.svg';
import awsEventbridge from './aws/App-Integration/EventBridge.svg';
import awsMq from './aws/App-Integration/MQ.svg';
import awsSns from './aws/App-Integration/Simple-Notification-Service.svg';
import awsSqs from './aws/App-Integration/Simple-Queue-Service.svg';
import awsConnect from './aws/Business-Applications/Connect.svg';
import awsPinpoint from './aws/Business-Applications/Pinpoint.svg';
import awsSes from './aws/Business-Applications/Simple-Email-Service.svg';
import awsEc2 from './aws/Compute/EC2.svg';
import awsFargate from './aws/Compute/Fargate.svg';
import awsLambda from './aws/Compute/Lambda.svg';
import awsEcs from './aws/Containers/Elastic-Container-Service.svg';
import awsEks from './aws/Containers/Elastic-Kubernetes-Service.svg';
import awsAurora from './aws/Database/Aurora.svg';
import awsDocumentdb from './aws/Database/DocumentDB.svg';
import awsDynamodb from './aws/Database/DynamoDB.svg';
import awsElasticache from './aws/Database/ElastiCache.svg';
import awsNeptune from './aws/Database/Neptune.svg';
import awsRds from './aws/Database/RDS.svg';
import awsTimestream from './aws/Database/Timestream.svg';
import awsAmplify from './aws/Front-End-Web-Mobile/Amplify.svg';
import awsCloudwatch from './aws/Management-Governance/CloudWatch.svg';
import awsXray from './aws/Management-Governance/Distro-for-OpenTelemetry.svg';
import awsGrafana from './aws/Management-Governance/Managed-Grafana.svg';
import awsPrometheus from './aws/Management-Governance/Managed-Service-for-Prometheus.svg';
import awsCloudfront from './aws/Networking-Content-Delivery/CloudFront.svg';
import awsDirectConnect from './aws/Networking-Content-Delivery/Direct-Connect.svg';
import awsElb from './aws/Networking-Content-Delivery/Elastic-Load-Balancing.svg';
import awsRoute53 from './aws/Networking-Content-Delivery/Route-53.svg';
import awsTransitGateway from './aws/Networking-Content-Delivery/Transit-Gateway.svg';
import awsVpc from './aws/Networking-Content-Delivery/Virtual-Private-Cloud.svg';
import awsCognito from './aws/Security-Identity-Compliance/Cognito.svg';
import awsGuardduty from './aws/Security-Identity-Compliance/GuardDuty.svg';
import awsIam from './aws/Security-Identity-Compliance/Identity-and-Access-Management.svg';
import awsKms from './aws/Security-Identity-Compliance/Key-Management-Service.svg';
import awsNetworkFirewall from './aws/Security-Identity-Compliance/Network-Firewall.svg';
import awsSecretsManager from './aws/Security-Identity-Compliance/Secrets-Manager.svg';
import awsShield from './aws/Security-Identity-Compliance/Shield.svg';
import awsWaf from './aws/Security-Identity-Compliance/WAF.svg';
import awsEfs from './aws/Storage/EFS.svg';
import awsEbs from './aws/Storage/Elastic-Block-Store.svg';
import awsS3Glacier from './aws/Storage/Simple-Storage-Service-Glacier.svg';
import awsS3 from './aws/Storage/Simple-Storage-Service.svg';

// =============================================================================
// Brand Icons — Real official logos via simple-icons (137+ technologies)
// =============================================================================

export { getBrandIcon, getProviderBrandIcon, type BrandIcon } from './brand-registry';

// =============================================================================
// Icon Type Mapping
// =============================================================================

export type Provider = 'aws' | 'gcp' | 'azure' | 'kubernetes' | 'alibaba' | 'oci' | 'digitalocean' | 'external';

export interface IconMapping {
  icon: string;
  label: string;
  color: string;
}

// AWS Icons mapped by ice type
export const AWS_ICONS: Record<string, IconMapping> = {
  // Compute
  'Compute.Container': { icon: awsEcs, label: 'ECS', color: '#ED7100' },
  'Compute.Function': { icon: awsLambda, label: 'Lambda', color: '#ED7100' },
  'Compute.VM': { icon: awsEc2, label: 'EC2', color: '#ED7100' },
  'Compute.StaticSite': { icon: awsAmplify, label: 'Amplify', color: '#ED7100' },

  // Containers
  'Container.ECS': { icon: awsEcs, label: 'ECS', color: '#ED7100' },
  'Container.EKS': { icon: awsEks, label: 'EKS', color: '#ED7100' },
  'Container.Fargate': { icon: awsFargate, label: 'Fargate', color: '#ED7100' },

  // Database
  'Database.PostgreSQL': { icon: awsRds, label: 'RDS', color: '#3B48CC' },
  'Database.MySQL': { icon: awsRds, label: 'RDS', color: '#3B48CC' },
  'Database.Aurora': { icon: awsAurora, label: 'Aurora', color: '#3B48CC' },
  'Database.MongoDB': { icon: awsDocumentdb, label: 'DocumentDB', color: '#3B48CC' },
  'Database.DynamoDB': { icon: awsDynamodb, label: 'DynamoDB', color: '#3B48CC' },
  'Database.Redis': { icon: awsElasticache, label: 'ElastiCache', color: '#3B48CC' },
  'Database.Elasticsearch': { icon: awsOpenSearch, label: 'OpenSearch', color: '#3B48CC' },
  'Database.Neptune': { icon: awsNeptune, label: 'Neptune', color: '#3B48CC' },
  'Database.Timestream': { icon: awsTimestream, label: 'Timestream', color: '#3B48CC' },

  // Storage
  'Storage.Bucket': { icon: awsS3, label: 'S3', color: '#1A9C3E' },
  'Storage.S3': { icon: awsS3, label: 'S3', color: '#1A9C3E' },
  'Storage.EFS': { icon: awsEfs, label: 'EFS', color: '#1A9C3E' },
  'Storage.EBS': { icon: awsEbs, label: 'EBS', color: '#1A9C3E' },
  'Storage.Glacier': { icon: awsS3Glacier, label: 'Glacier', color: '#1A9C3E' },

  // Network
  'Network.VPC': { icon: awsVpc, label: 'VPC', color: '#8B5CF6' },
  'Network.Subnet': { icon: awsVpc, label: 'Subnet', color: '#8B5CF6' },
  'Network.CDN': { icon: awsCloudfront, label: 'CloudFront', color: '#8B5CF6' },
  'Network.LoadBalancer': { icon: awsElb, label: 'ELB', color: '#8B5CF6' },
  'Network.APIGateway': { icon: awsApiGateway, label: 'API Gateway', color: '#E7157B' },
  'Network.Gateway': { icon: awsApiGateway, label: 'Gateway', color: '#E7157B' },
  'Network.Route53': { icon: awsRoute53, label: 'Route 53', color: '#8B5CF6' },
  'Network.TransitGateway': { icon: awsTransitGateway, label: 'Transit GW', color: '#8B5CF6' },
  'Network.DirectConnect': { icon: awsDirectConnect, label: 'Direct Connect', color: '#8B5CF6' },

  // Security
  'Security.WAF': { icon: awsWaf, label: 'WAF', color: '#DD344C' },
  'Security.Shield': { icon: awsShield, label: 'Shield', color: '#DD344C' },
  'Security.IAM': { icon: awsIam, label: 'IAM', color: '#DD344C' },
  'Security.Cognito': { icon: awsCognito, label: 'Cognito', color: '#DD344C' },
  'Security.SecretsManager': { icon: awsSecretsManager, label: 'Secrets', color: '#DD344C' },
  'Security.KMS': { icon: awsKms, label: 'KMS', color: '#DD344C' },
  'Security.GuardDuty': { icon: awsGuardduty, label: 'GuardDuty', color: '#DD344C' },
  'Security.Firewall': { icon: awsNetworkFirewall, label: 'Firewall', color: '#DD344C' },

  // Messaging
  'Messaging.Queue': { icon: awsSqs, label: 'SQS', color: '#E7157B' },
  'Messaging.SQS': { icon: awsSqs, label: 'SQS', color: '#E7157B' },
  'Messaging.Topic': { icon: awsSns, label: 'SNS', color: '#E7157B' },
  'Messaging.SNS': { icon: awsSns, label: 'SNS', color: '#E7157B' },
  'Messaging.EventBridge': { icon: awsEventbridge, label: 'EventBridge', color: '#E7157B' },
  'Messaging.Kafka': { icon: awsMsk, label: 'MSK', color: '#E7157B' },
  'Messaging.MQ': { icon: awsMq, label: 'MQ', color: '#E7157B' },

  // Analytics / Streaming
  'Analytics.Kinesis': { icon: awsKinesis, label: 'Kinesis', color: '#8B5CF6' },
  'Analytics.OpenSearch': { icon: awsOpenSearch, label: 'OpenSearch', color: '#8B5CF6' },
  'Analytics.Athena': { icon: awsAthena, label: 'Athena', color: '#8B5CF6' },
  'Analytics.Redshift': { icon: awsRedshift, label: 'Redshift', color: '#8B5CF6' },
  'Analytics.Glue': { icon: awsGlue, label: 'Glue', color: '#8B5CF6' },
  'Analytics.EMR': { icon: awsEmr, label: 'EMR', color: '#8B5CF6' },

  // Observability
  'Observability.Metrics': { icon: awsPrometheus, label: 'Prometheus', color: '#E7157B' },
  'Observability.Dashboard': { icon: awsGrafana, label: 'Grafana', color: '#E7157B' },
  'Observability.Tracing': { icon: awsXray, label: 'X-Ray', color: '#E7157B' },
  'Observability.Logs': { icon: awsCloudwatch, label: 'CloudWatch', color: '#E7157B' },
  'Observability.CloudWatch': { icon: awsCloudwatch, label: 'CloudWatch', color: '#E7157B' },

  // External Services
  'External.Payment': { icon: awsConnect, label: 'Payment', color: '#64748b' },
  'External.Email': { icon: awsSes, label: 'Email', color: '#64748b' },
  'External.SMS': { icon: awsPinpoint, label: 'SMS', color: '#64748b' },

  // Groups (organizational containers)
  'Group.Frontend': { icon: awsVpc, label: 'Frontend', color: '#8B5CF6' },
  'Group.Services': { icon: awsVpc, label: 'Services', color: '#8B5CF6' },
  'Group.Data': { icon: awsVpc, label: 'Data', color: '#8B5CF6' },
  'Group.Messaging': { icon: awsVpc, label: 'Messaging', color: '#8B5CF6' },
  'Group.Monitoring': { icon: awsCloudwatch, label: 'Monitoring', color: '#E7157B' },
  'Group.External': { icon: awsVpc, label: 'External', color: '#8B5CF6' },
};

// =============================================================================
// Icon Resolution
// =============================================================================

/**
 * Get cloud provider icon for a given ice type (AWS service icon).
 * Used as a SECONDARY icon — small badge below the brand logo.
 */
export function getIcon(iceType: string, _provider: Provider = 'aws'): IconMapping | null {
  return AWS_ICONS[iceType] || null;
}

/**
 * Get all icons for a provider
 */
export function getProviderIcons(provider: Provider): Record<string, IconMapping> {
  if (provider === 'aws') return AWS_ICONS;
  return {};
}

// Export default icon for unknown types
export const DEFAULT_ICON = awsVpc;
