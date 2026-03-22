/**
 * Pulumi Type Mapper
 *
 * Maps Pulumi resource types to ICE unified types.
 * Pulumi type format: <provider>:<module>/<resource>:<ResourceClass>
 * Example: aws:s3/bucket:Bucket
 */

import type { ParsedUrn } from './types.js';

// =============================================================================
// URN Parsing
// =============================================================================

/**
 * Parse a Pulumi URN into its components.
 * Format: urn:pulumi:<stack>::<project>::<type>::<name>
 */
export function parse_urn(urn: string): ParsedUrn | null {
  // URN uses '::' as separator between components
  // We need to split on '::' after the 'urn:pulumi:' prefix
  if (!urn.startsWith('urn:pulumi:')) {
    return null;
  }

  const rest = urn.slice('urn:pulumi:'.length);
  const parts = rest.split('::');

  // Expect exactly 4 parts: stack, project, type, name
  if (parts.length !== 4) {
    return null;
  }

  const [stack, project, type, name] = parts;
  if (!stack || !project || !type || !name) {
    return null;
  }

  // Parse the type component
  const type_info = parse_type(type);

  return {
    stack,
    project,
    type,
    name,
    ...type_info,
  };
}

/**
 * Parse a Pulumi type string.
 * Format: <provider>:<module>/<resource>:<ResourceClass>
 * Example: aws:s3/bucket:Bucket
 */
export function parse_type(type: string): {
  provider?: string;
  module?: string;
  resource_type?: string;
  resource_class?: string;
} {
  // Handle special types
  if (type === 'pulumi:pulumi:Stack') {
    return { provider: 'pulumi', module: 'pulumi', resource_class: 'Stack' };
  }
  if (type.startsWith('pulumi:providers:')) {
    const provider = type.replace('pulumi:providers:', '');
    return { provider: 'pulumi', module: 'providers', resource_class: provider };
  }

  // Standard format: provider:module/resource:Class
  const match = type.match(/^([^:]+):([^/]+)\/([^:]+):(.+)$/);
  if (match) {
    const [, provider, module, resource_type, resource_class] = match;
    return { provider, module, resource_type, resource_class };
  }

  // Alternative format: provider:module:Class
  const alt_match = type.match(/^([^:]+):([^:]+):(.+)$/);
  if (alt_match) {
    const [, provider, module, resource_class] = alt_match;
    return { provider, module, resource_class };
  }

  return {};
}

// =============================================================================
// Provider Mapping
// =============================================================================

/**
 * Mapping from Pulumi provider names to ICE provider names.
 */
const PROVIDER_MAP: Record<string, string> = {
  aws: 'aws',
  'aws-native': 'aws',
  azure: 'azure',
  'azure-native': 'azure',
  gcp: 'gcp',
  'google-native': 'gcp',
  kubernetes: 'kubernetes',
  random: 'random',
  tls: 'tls',
  docker: 'docker',
  cloudflare: 'cloudflare',
  datadog: 'datadog',
  github: 'github',
  gitlab: 'gitlab',
  digitalocean: 'digitalocean',
  linode: 'linode',
  vultr: 'vultr',
  hcloud: 'hcloud',
  postgresql: 'postgresql',
  mysql: 'mysql',
  mongodb: 'mongodb',
  vault: 'vault',
  consul: 'consul',
  nomad: 'nomad',
};

// =============================================================================
// Type Mapping
// =============================================================================

/**
 * Mapping from Pulumi resource types to ICE types.
 * Format: pulumi_type -> ice_type
 */
const TYPE_MAP: Record<string, string> = {
  // AWS EC2
  'aws:ec2/instance:Instance': 'aws.ec2.instance',
  'aws:ec2/ami:Ami': 'aws.ec2.ami',
  'aws:ec2/keyPair:KeyPair': 'aws.ec2.key_pair',
  'aws:ec2/volume:Volume': 'aws.ec2.ebs_volume',
  'aws:ec2/volumeAttachment:VolumeAttachment': 'aws.ec2.volume_attachment',
  'aws:ec2/launchTemplate:LaunchTemplate': 'aws.ec2.launch_template',
  'aws:ec2/placementGroup:PlacementGroup': 'aws.ec2.placement_group',
  'aws:ec2/snapshot:Snapshot': 'aws.ec2.ebs_snapshot',

  // AWS VPC
  'aws:ec2/vpc:Vpc': 'aws.vpc.vpc',
  'aws:ec2/subnet:Subnet': 'aws.vpc.subnet',
  'aws:ec2/internetGateway:InternetGateway': 'aws.vpc.internet_gateway',
  'aws:ec2/natGateway:NatGateway': 'aws.vpc.nat_gateway',
  'aws:ec2/routeTable:RouteTable': 'aws.vpc.route_table',
  'aws:ec2/route:Route': 'aws.vpc.route',
  'aws:ec2/routeTableAssociation:RouteTableAssociation': 'aws.vpc.route_table_association',
  'aws:ec2/securityGroup:SecurityGroup': 'aws.vpc.security_group',
  'aws:ec2/securityGroupRule:SecurityGroupRule': 'aws.vpc.security_group_rule',
  'aws:ec2/networkAcl:NetworkAcl': 'aws.vpc.network_acl',
  'aws:ec2/networkAclRule:NetworkAclRule': 'aws.vpc.network_acl_rule',
  'aws:ec2/vpcEndpoint:VpcEndpoint': 'aws.vpc.vpc_endpoint',
  'aws:ec2/vpcPeeringConnection:VpcPeeringConnection': 'aws.vpc.vpc_peering_connection',
  'aws:ec2/eip:Eip': 'aws.vpc.eip',
  'aws:ec2/eipAssociation:EipAssociation': 'aws.vpc.eip_association',
  'aws:ec2/networkInterface:NetworkInterface': 'aws.vpc.network_interface',

  // AWS S3
  'aws:s3/bucket:Bucket': 'aws.s3.bucket',
  'aws:s3/bucketV2:BucketV2': 'aws.s3.bucket',
  'aws:s3/bucketPolicy:BucketPolicy': 'aws.s3.bucket_policy',
  'aws:s3/bucketAclV2:BucketAclV2': 'aws.s3.bucket_acl',
  'aws:s3/bucketVersioningV2:BucketVersioningV2': 'aws.s3.bucket_versioning',
  'aws:s3/bucketLifecycleConfigurationV2:BucketLifecycleConfigurationV2': 'aws.s3.bucket_lifecycle',
  'aws:s3/bucketServerSideEncryptionConfigurationV2:BucketServerSideEncryptionConfigurationV2':
    'aws.s3.bucket_encryption',
  'aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock': 'aws.s3.bucket_public_access_block',
  'aws:s3/bucketObject:BucketObject': 'aws.s3.object',
  'aws:s3/bucketObjectv2:BucketObjectv2': 'aws.s3.object',

  // AWS IAM
  'aws:iam/user:User': 'aws.iam.user',
  'aws:iam/group:Group': 'aws.iam.group',
  'aws:iam/role:Role': 'aws.iam.role',
  'aws:iam/policy:Policy': 'aws.iam.policy',
  'aws:iam/rolePolicy:RolePolicy': 'aws.iam.role_policy',
  'aws:iam/rolePolicyAttachment:RolePolicyAttachment': 'aws.iam.role_policy_attachment',
  'aws:iam/userPolicy:UserPolicy': 'aws.iam.user_policy',
  'aws:iam/userPolicyAttachment:UserPolicyAttachment': 'aws.iam.user_policy_attachment',
  'aws:iam/groupPolicy:GroupPolicy': 'aws.iam.group_policy',
  'aws:iam/groupPolicyAttachment:GroupPolicyAttachment': 'aws.iam.group_policy_attachment',
  'aws:iam/groupMembership:GroupMembership': 'aws.iam.group_membership',
  'aws:iam/instanceProfile:InstanceProfile': 'aws.iam.instance_profile',
  'aws:iam/accessKey:AccessKey': 'aws.iam.access_key',

  // AWS RDS
  'aws:rds/instance:Instance': 'aws.rds.db_instance',
  'aws:rds/cluster:Cluster': 'aws.rds.db_cluster',
  'aws:rds/clusterInstance:ClusterInstance': 'aws.rds.db_cluster_instance',
  'aws:rds/subnetGroup:SubnetGroup': 'aws.rds.db_subnet_group',
  'aws:rds/parameterGroup:ParameterGroup': 'aws.rds.db_parameter_group',
  'aws:rds/clusterParameterGroup:ClusterParameterGroup': 'aws.rds.db_cluster_parameter_group',
  'aws:rds/optionGroup:OptionGroup': 'aws.rds.db_option_group',
  'aws:rds/snapshot:Snapshot': 'aws.rds.db_snapshot',

  // AWS Lambda
  'aws:lambda/function:Function': 'aws.lambda.function',
  'aws:lambda/alias:Alias': 'aws.lambda.alias',
  'aws:lambda/layerVersion:LayerVersion': 'aws.lambda.layer_version',
  'aws:lambda/permission:Permission': 'aws.lambda.permission',
  'aws:lambda/eventSourceMapping:EventSourceMapping': 'aws.lambda.event_source_mapping',

  // AWS ECS
  'aws:ecs/cluster:Cluster': 'aws.ecs.cluster',
  'aws:ecs/service:Service': 'aws.ecs.service',
  'aws:ecs/taskDefinition:TaskDefinition': 'aws.ecs.task_definition',
  'aws:ecs/capacityProvider:CapacityProvider': 'aws.ecs.capacity_provider',

  // AWS EKS
  'aws:eks/cluster:Cluster': 'aws.eks.cluster',
  'aws:eks/nodeGroup:NodeGroup': 'aws.eks.node_group',
  'aws:eks/fargateProfile:FargateProfile': 'aws.eks.fargate_profile',
  'aws:eks/addon:Addon': 'aws.eks.addon',

  // AWS Load Balancing
  'aws:lb/loadBalancer:LoadBalancer': 'aws.elb.load_balancer',
  'aws:alb/loadBalancer:LoadBalancer': 'aws.elb.load_balancer',
  'aws:lb/listener:Listener': 'aws.elb.listener',
  'aws:alb/listener:Listener': 'aws.elb.listener',
  'aws:lb/targetGroup:TargetGroup': 'aws.elb.target_group',
  'aws:alb/targetGroup:TargetGroup': 'aws.elb.target_group',
  'aws:lb/targetGroupAttachment:TargetGroupAttachment': 'aws.elb.target_group_attachment',

  // AWS CloudWatch
  'aws:cloudwatch/logGroup:LogGroup': 'aws.cloudwatch.log_group',
  'aws:cloudwatch/logStream:LogStream': 'aws.cloudwatch.log_stream',
  'aws:cloudwatch/metricAlarm:MetricAlarm': 'aws.cloudwatch.metric_alarm',
  'aws:cloudwatch/dashboard:Dashboard': 'aws.cloudwatch.dashboard',

  // AWS SNS/SQS
  'aws:sns/topic:Topic': 'aws.sns.topic',
  'aws:sns/topicSubscription:TopicSubscription': 'aws.sns.topic_subscription',
  'aws:sqs/queue:Queue': 'aws.sqs.queue',
  'aws:sqs/queuePolicy:QueuePolicy': 'aws.sqs.queue_policy',

  // AWS DynamoDB
  'aws:dynamodb/table:Table': 'aws.dynamodb.table',
  'aws:dynamodb/globalTable:GlobalTable': 'aws.dynamodb.global_table',

  // AWS Route53
  'aws:route53/zone:Zone': 'aws.route53.zone',
  'aws:route53/record:Record': 'aws.route53.record',
  'aws:route53/healthCheck:HealthCheck': 'aws.route53.health_check',

  // AWS ACM
  'aws:acm/certificate:Certificate': 'aws.acm.certificate',
  'aws:acm/certificateValidation:CertificateValidation': 'aws.acm.certificate_validation',

  // AWS KMS
  'aws:kms/key:Key': 'aws.kms.key',
  'aws:kms/alias:Alias': 'aws.kms.alias',

  // AWS Secrets Manager
  'aws:secretsmanager/secret:Secret': 'aws.secretsmanager.secret',
  'aws:secretsmanager/secretVersion:SecretVersion': 'aws.secretsmanager.secret_version',

  // AWS SSM
  'aws:ssm/parameter:Parameter': 'aws.ssm.parameter',

  // Azure Compute
  'azure:compute/virtualMachine:VirtualMachine': 'azure.compute.virtual_machine',
  'azure-native:compute:VirtualMachine': 'azure.compute.virtual_machine',
  'azure:compute/linuxVirtualMachine:LinuxVirtualMachine': 'azure.compute.linux_virtual_machine',
  'azure:compute/windowsVirtualMachine:WindowsVirtualMachine': 'azure.compute.windows_virtual_machine',
  'azure:compute/virtualMachineScaleSet:VirtualMachineScaleSet': 'azure.compute.virtual_machine_scale_set',
  'azure:compute/availabilitySet:AvailabilitySet': 'azure.compute.availability_set',
  'azure:compute/managedDisk:ManagedDisk': 'azure.compute.managed_disk',
  'azure:compute/image:Image': 'azure.compute.image',

  // Azure Network
  'azure:network/virtualNetwork:VirtualNetwork': 'azure.network.virtual_network',
  'azure-native:network:VirtualNetwork': 'azure.network.virtual_network',
  'azure:network/subnet:Subnet': 'azure.network.subnet',
  'azure:network/networkInterface:NetworkInterface': 'azure.network.network_interface',
  'azure:network/publicIp:PublicIp': 'azure.network.public_ip',
  'azure:network/networkSecurityGroup:NetworkSecurityGroup': 'azure.network.network_security_group',
  'azure:network/networkSecurityRule:NetworkSecurityRule': 'azure.network.network_security_rule',
  'azure:network/routeTable:RouteTable': 'azure.network.route_table',
  'azure:network/route:Route': 'azure.network.route',
  'azure:network/loadBalancer:LoadBalancer': 'azure.network.load_balancer',
  'azure:network/applicationGateway:ApplicationGateway': 'azure.network.application_gateway',

  // Azure Storage
  'azure:storage/account:Account': 'azure.storage.storage_account',
  'azure-native:storage:StorageAccount': 'azure.storage.storage_account',
  'azure:storage/container:Container': 'azure.storage.storage_container',
  'azure:storage/blob:Blob': 'azure.storage.storage_blob',
  'azure:storage/queue:Queue': 'azure.storage.storage_queue',
  'azure:storage/table:Table': 'azure.storage.storage_table',
  'azure:storage/share:Share': 'azure.storage.storage_share',

  // Azure Database
  'azure:sql/server:Server': 'azure.sql.sql_server',
  'azure:sql/database:Database': 'azure.sql.sql_database',
  'azure:postgresql/server:Server': 'azure.postgresql.server',
  'azure:postgresql/database:Database': 'azure.postgresql.database',
  'azure:mysql/server:Server': 'azure.mysql.server',
  'azure:mysql/database:Database': 'azure.mysql.database',
  'azure:cosmosdb/account:Account': 'azure.cosmosdb.account',
  'azure:cosmosdb/sqlDatabase:SqlDatabase': 'azure.cosmosdb.sql_database',

  // Azure Container
  'azure:containerservice/kubernetesCluster:KubernetesCluster': 'azure.aks.cluster',
  'azure-native:containerservice:ManagedCluster': 'azure.aks.cluster',
  'azure:containerregistry/registry:Registry': 'azure.acr.registry',
  'azure:containerinstance/group:Group': 'azure.container.group',

  // Azure Resource Group
  'azure:core/resourceGroup:ResourceGroup': 'azure.resources.resource_group',
  'azure-native:resources:ResourceGroup': 'azure.resources.resource_group',

  // Azure Key Vault
  'azure:keyvault/keyVault:KeyVault': 'azure.keyvault.vault',
  'azure:keyvault/secret:Secret': 'azure.keyvault.secret',
  'azure:keyvault/key:Key': 'azure.keyvault.key',
  'azure:keyvault/certificate:Certificate': 'azure.keyvault.certificate',

  // GCP Compute
  'gcp:compute/instance:Instance': 'gcp.compute.instance',
  'gcp:compute/disk:Disk': 'gcp.compute.disk',
  'gcp:compute/image:Image': 'gcp.compute.image',
  'gcp:compute/snapshot:Snapshot': 'gcp.compute.snapshot',
  'gcp:compute/instanceTemplate:InstanceTemplate': 'gcp.compute.instance_template',
  'gcp:compute/instanceGroup:InstanceGroup': 'gcp.compute.instance_group',
  'gcp:compute/instanceGroupManager:InstanceGroupManager': 'gcp.compute.instance_group_manager',
  'gcp:compute/autoscaler:Autoscaler': 'gcp.compute.autoscaler',

  // GCP Network
  'gcp:compute/network:Network': 'gcp.compute.network',
  'gcp:compute/subnetwork:Subnetwork': 'gcp.compute.subnetwork',
  'gcp:compute/firewall:Firewall': 'gcp.compute.firewall',
  'gcp:compute/router:Router': 'gcp.compute.router',
  'gcp:compute/routerNat:RouterNat': 'gcp.compute.router_nat',
  'gcp:compute/address:Address': 'gcp.compute.address',
  'gcp:compute/globalAddress:GlobalAddress': 'gcp.compute.global_address',
  'gcp:compute/forwardingRule:ForwardingRule': 'gcp.compute.forwarding_rule',
  'gcp:compute/globalForwardingRule:GlobalForwardingRule': 'gcp.compute.global_forwarding_rule',
  'gcp:compute/targetPool:TargetPool': 'gcp.compute.target_pool',
  'gcp:compute/healthCheck:HealthCheck': 'gcp.compute.health_check',
  'gcp:compute/backendService:BackendService': 'gcp.compute.backend_service',
  'gcp:compute/urlMap:URLMap': 'gcp.compute.url_map',
  'gcp:compute/targetHttpProxy:TargetHttpProxy': 'gcp.compute.target_http_proxy',
  'gcp:compute/targetHttpsProxy:TargetHttpsProxy': 'gcp.compute.target_https_proxy',
  'gcp:compute/sslCertificate:SSLCertificate': 'gcp.compute.ssl_certificate',

  // GCP Storage
  'gcp:storage/bucket:Bucket': 'gcp.storage.bucket',
  'gcp:storage/bucketObject:BucketObject': 'gcp.storage.bucket_object',
  'gcp:storage/bucketACL:BucketACL': 'gcp.storage.bucket_acl',
  'gcp:storage/bucketIAMBinding:BucketIAMBinding': 'gcp.storage.bucket_iam_binding',
  'gcp:storage/bucketIAMMember:BucketIAMMember': 'gcp.storage.bucket_iam_member',

  // GCP IAM
  'gcp:serviceaccount/account:Account': 'gcp.iam.service_account',
  'gcp:serviceaccount/key:Key': 'gcp.iam.service_account_key',
  'gcp:projects/iAMBinding:IAMBinding': 'gcp.iam.project_iam_binding',
  'gcp:projects/iAMMember:IAMMember': 'gcp.iam.project_iam_member',
  'gcp:projects/iAMPolicy:IAMPolicy': 'gcp.iam.project_iam_policy',

  // GCP SQL
  'gcp:sql/databaseInstance:DatabaseInstance': 'gcp.sql.database_instance',
  'gcp:sql/database:Database': 'gcp.sql.database',
  'gcp:sql/user:User': 'gcp.sql.user',

  // GCP GKE
  'gcp:container/cluster:Cluster': 'gcp.gke.cluster',
  'gcp:container/nodePool:NodePool': 'gcp.gke.node_pool',

  // GCP Cloud Functions
  'gcp:cloudfunctions/function:Function': 'gcp.cloudfunctions.function',
  'gcp:cloudfunctionsv2/function:Function': 'gcp.cloudfunctions.function_v2',

  // GCP Pub/Sub
  'gcp:pubsub/topic:Topic': 'gcp.pubsub.topic',
  'gcp:pubsub/subscription:Subscription': 'gcp.pubsub.subscription',

  // GCP DNS
  'gcp:dns/managedZone:ManagedZone': 'gcp.dns.managed_zone',
  'gcp:dns/recordSet:RecordSet': 'gcp.dns.record_set',

  // GCP KMS
  'gcp:kms/keyRing:KeyRing': 'gcp.kms.key_ring',
  'gcp:kms/cryptoKey:CryptoKey': 'gcp.kms.crypto_key',

  // GCP Secret Manager
  'gcp:secretmanager/secret:Secret': 'gcp.secretmanager.secret',
  'gcp:secretmanager/secretVersion:SecretVersion': 'gcp.secretmanager.secret_version',

  // Kubernetes
  'kubernetes:core/v1:Namespace': 'kubernetes.core.namespace',
  'kubernetes:apps/v1:Deployment': 'kubernetes.apps.deployment',
  'kubernetes:core/v1:Service': 'kubernetes.core.service',
  'kubernetes:core/v1:ConfigMap': 'kubernetes.core.config_map',
  'kubernetes:core/v1:Secret': 'kubernetes.core.secret',
  'kubernetes:core/v1:PersistentVolumeClaim': 'kubernetes.core.persistent_volume_claim',
  'kubernetes:core/v1:PersistentVolume': 'kubernetes.core.persistent_volume',
  'kubernetes:storage.k8s.io/v1:StorageClass': 'kubernetes.storage.storage_class',
  'kubernetes:apps/v1:StatefulSet': 'kubernetes.apps.stateful_set',
  'kubernetes:apps/v1:DaemonSet': 'kubernetes.apps.daemon_set',
  'kubernetes:batch/v1:Job': 'kubernetes.batch.job',
  'kubernetes:batch/v1:CronJob': 'kubernetes.batch.cron_job',
  'kubernetes:networking.k8s.io/v1:Ingress': 'kubernetes.networking.ingress',
  'kubernetes:networking.k8s.io/v1:NetworkPolicy': 'kubernetes.networking.network_policy',
  'kubernetes:core/v1:ServiceAccount': 'kubernetes.core.service_account',
  'kubernetes:rbac.authorization.k8s.io/v1:Role': 'kubernetes.rbac.role',
  'kubernetes:rbac.authorization.k8s.io/v1:RoleBinding': 'kubernetes.rbac.role_binding',
  'kubernetes:rbac.authorization.k8s.io/v1:ClusterRole': 'kubernetes.rbac.cluster_role',
  'kubernetes:rbac.authorization.k8s.io/v1:ClusterRoleBinding': 'kubernetes.rbac.cluster_role_binding',
  'kubernetes:core/v1:Pod': 'kubernetes.core.pod',
  'kubernetes:apps/v1:ReplicaSet': 'kubernetes.apps.replica_set',
  'kubernetes:autoscaling/v2:HorizontalPodAutoscaler': 'kubernetes.autoscaling.horizontal_pod_autoscaler',
};

// =============================================================================
// Mapping Functions
// =============================================================================

/**
 * Get the ICE type for a Pulumi resource type.
 */
export function get_ice_type(pulumi_type: string): string {
  // Check direct mapping first
  if (TYPE_MAP[pulumi_type]) {
    return TYPE_MAP[pulumi_type]!;
  }

  // Fall back to converting the pulumi type format
  const parsed = parse_type(pulumi_type);
  if (parsed.provider && parsed.module && parsed.resource_class) {
    const ice_provider = PROVIDER_MAP[parsed.provider] ?? parsed.provider;
    const resource = to_snake_case(parsed.resource_class);
    return `${ice_provider}.${parsed.module}.${resource}`;
  }

  // Return as-is if no mapping found
  return pulumi_type.replace(/:/g, '.').toLowerCase();
}

/**
 * Get the ICE provider name from a Pulumi provider string.
 */
export function get_ice_provider(pulumi_provider: string): string {
  // Extract provider from URN or type
  const parsed = parse_urn(pulumi_provider) ?? { type: pulumi_provider };
  const type_info = parse_type(parsed.type ?? pulumi_provider);

  if (type_info.provider) {
    return PROVIDER_MAP[type_info.provider] ?? type_info.provider;
  }

  // Try to extract from simple name
  const simple_match = pulumi_provider.match(/^([^:]+)/);
  if (simple_match && simple_match[1]) {
    return PROVIDER_MAP[simple_match[1]] ?? simple_match[1];
  }

  return 'unknown';
}

/**
 * Get provider name from resource type.
 */
export function get_provider_from_type(pulumi_type: string): string {
  const parsed = parse_type(pulumi_type);
  if (parsed.provider) {
    return PROVIDER_MAP[parsed.provider] ?? parsed.provider;
  }
  return 'unknown';
}

/**
 * Check if a Pulumi type is supported.
 */
export function is_type_supported(pulumi_type: string): boolean {
  return pulumi_type in TYPE_MAP;
}

/**
 * Get all supported Pulumi types.
 */
export function get_supported_types(): string[] {
  return Object.keys(TYPE_MAP);
}

/**
 * Get all supported ICE types.
 */
export function get_supported_ice_types(): string[] {
  return [...new Set(Object.values(TYPE_MAP))];
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert a PascalCase string to snake_case.
 */
function to_snake_case(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

/**
 * Extract the resource name from a URN.
 */
export function get_name_from_urn(urn: string): string {
  const parsed = parse_urn(urn);
  return parsed?.name ?? urn.split('::').pop() ?? urn;
}

/**
 * Check if a resource is a provider resource.
 */
export function is_provider_resource(type: string): boolean {
  return type.startsWith('pulumi:providers:');
}

/**
 * Check if a resource is a stack resource.
 */
export function is_stack_resource(type: string): boolean {
  return type === 'pulumi:pulumi:Stack';
}
