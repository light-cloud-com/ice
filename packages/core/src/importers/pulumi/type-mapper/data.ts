/**
 * Pulumi Type Mapper — lookup tables (rf-pmap-1).
 *
 * The two giant lookup tables extracted verbatim from
 * `type-mapper.ts` (pre-extraction L94-120 PROVIDER_MAP, L130-413
 * TYPE_MAP). These tables are the SOURCE OF TRUTH for ICE iceType
 * names — external consumers (importers, validators, resource
 * registries) depend on the exact dotted-form values produced by
 * TYPE_MAP. ANY change here is a behaviour change for those
 * consumers; preserve verbatim.
 *
 * Size exception: the file exceeds the 200-LOC ceiling because
 * the data is dominated by the TYPE_MAP entries (one per Pulumi
 * resource type). The pure data-only nature justifies the size
 * (cf. /docs/refactoring-patterns.md "Data-heavy shim split").
 *
 * The two tables are separated for two reasons:
 *  - PROVIDER_MAP (~26 entries) and TYPE_MAP (~280 entries) live
 *    on independent change cadences. PROVIDER_MAP changes when a
 *    new IaC provider is added to ICE; TYPE_MAP changes when new
 *    Pulumi resource types are mapped into ICE.
 *  - TYPE_MAP keys are the load-bearing surface for the importer's
 *    schema-lookup path; isolating them in a single export makes
 *    the diff for a new resource type obvious.
 */

// =============================================================================
// Provider Mapping
// =============================================================================

/**
 * Mapping from Pulumi provider names to ICE provider names.
 *
 * Most Pulumi providers map 1:1; the aws-native / azure-native /
 * google-native variants collapse into the same ICE provider as
 * their non-native counterparts (`aws`, `azure`, `gcp`). This
 * collapse is INTENTIONAL — ICE doesn't differentiate between
 * native and non-native Pulumi packages at the iceType level.
 */
export const PROVIDER_MAP: Record<string, string> = {
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
 *
 * Pulumi type format: `<provider>:<module>/<resource>:<ResourceClass>`
 * ICE type format: `<provider>.<module>.<resource>`
 *
 * Categories represented:
 *  - AWS: EC2, VPC, S3, IAM, RDS, Lambda, ECS, EKS, ELB, CloudWatch,
 *    SNS/SQS, DynamoDB, Route53, ACM, KMS, Secrets Manager, SSM
 *  - Azure: Compute, Network, Storage, Database (SQL/PostgreSQL/MySQL/
 *    CosmosDB), Container (AKS/ACR), Resource Group, Key Vault
 *  - GCP: Compute, Network, Storage, IAM, SQL, GKE, Cloud Functions,
 *    Pub/Sub, DNS, KMS, Secret Manager
 *  - Kubernetes: Core, Apps, Storage, Batch, Networking, RBAC,
 *    Autoscaling
 *
 * Note: many AWS LB types appear with two synonymous Pulumi keys
 * (`aws:lb/...` and `aws:alb/...`); both map to the same ICE type.
 * The `aws:s3/bucketObject:BucketObject` and `aws:s3/bucketObjectv2:BucketObjectv2`
 * also both map to `aws.s3.object` — preserved verbatim.
 */
export const TYPE_MAP: Record<string, string> = {
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
