/**
 * Terraform Type Mapper
 *
 * Maps Terraform resource types to ICE unified types.
 */

// =============================================================================
// Type Mapping
// =============================================================================

/**
 * Mapping from Terraform provider prefixes to ICE provider names.
 */
const PROVIDER_MAP: Record<string, string> = {
  aws: 'aws',
  azurerm: 'azure',
  google: 'gcp',
  kubernetes: 'kubernetes',
  helm: 'kubernetes',
  random: 'random',
  null: 'null',
  local: 'local',
  tls: 'tls',
  time: 'time',
  archive: 'archive',
  external: 'external',
  http: 'http',
};

/**
 * Mapping from Terraform resource types to ICE types.
 * Format: terraform_type -> ice_type
 */
const TYPE_MAP: Record<string, string> = {
  // AWS EC2
  aws_instance: 'aws.ec2.instance',
  aws_ami: 'aws.ec2.ami',
  aws_key_pair: 'aws.ec2.key_pair',
  aws_ebs_volume: 'aws.ec2.ebs_volume',
  aws_ebs_snapshot: 'aws.ec2.ebs_snapshot',
  aws_launch_template: 'aws.ec2.launch_template',
  aws_placement_group: 'aws.ec2.placement_group',

  // AWS VPC
  aws_vpc: 'aws.vpc.vpc',
  aws_subnet: 'aws.vpc.subnet',
  aws_internet_gateway: 'aws.vpc.internet_gateway',
  aws_nat_gateway: 'aws.vpc.nat_gateway',
  aws_route_table: 'aws.vpc.route_table',
  aws_route: 'aws.vpc.route',
  aws_route_table_association: 'aws.vpc.route_table_association',
  aws_security_group: 'aws.vpc.security_group',
  aws_security_group_rule: 'aws.vpc.security_group_rule',
  aws_network_acl: 'aws.vpc.network_acl',
  aws_network_acl_rule: 'aws.vpc.network_acl_rule',
  aws_vpc_endpoint: 'aws.vpc.vpc_endpoint',
  aws_vpc_peering_connection: 'aws.vpc.vpc_peering_connection',
  aws_eip: 'aws.vpc.eip',
  aws_eip_association: 'aws.vpc.eip_association',
  aws_network_interface: 'aws.vpc.network_interface',

  // AWS S3
  aws_s3_bucket: 'aws.s3.bucket',
  aws_s3_bucket_policy: 'aws.s3.bucket_policy',
  aws_s3_bucket_acl: 'aws.s3.bucket_acl',
  aws_s3_bucket_versioning: 'aws.s3.bucket_versioning',
  aws_s3_bucket_lifecycle_configuration: 'aws.s3.bucket_lifecycle',
  aws_s3_bucket_server_side_encryption_configuration: 'aws.s3.bucket_encryption',
  aws_s3_bucket_public_access_block: 'aws.s3.bucket_public_access_block',
  aws_s3_object: 'aws.s3.object',

  // AWS IAM
  aws_iam_user: 'aws.iam.user',
  aws_iam_group: 'aws.iam.group',
  aws_iam_role: 'aws.iam.role',
  aws_iam_policy: 'aws.iam.policy',
  aws_iam_role_policy: 'aws.iam.role_policy',
  aws_iam_role_policy_attachment: 'aws.iam.role_policy_attachment',
  aws_iam_user_policy: 'aws.iam.user_policy',
  aws_iam_user_policy_attachment: 'aws.iam.user_policy_attachment',
  aws_iam_group_policy: 'aws.iam.group_policy',
  aws_iam_group_policy_attachment: 'aws.iam.group_policy_attachment',
  aws_iam_group_membership: 'aws.iam.group_membership',
  aws_iam_instance_profile: 'aws.iam.instance_profile',
  aws_iam_access_key: 'aws.iam.access_key',

  // AWS RDS
  aws_db_instance: 'aws.rds.db_instance',
  aws_db_cluster: 'aws.rds.db_cluster',
  aws_db_cluster_instance: 'aws.rds.db_cluster_instance',
  aws_db_subnet_group: 'aws.rds.db_subnet_group',
  aws_db_parameter_group: 'aws.rds.db_parameter_group',
  aws_db_cluster_parameter_group: 'aws.rds.db_cluster_parameter_group',
  aws_db_option_group: 'aws.rds.db_option_group',
  aws_db_snapshot: 'aws.rds.db_snapshot',

  // AWS Lambda
  aws_lambda_function: 'aws.lambda.function',
  aws_lambda_alias: 'aws.lambda.alias',
  aws_lambda_layer_version: 'aws.lambda.layer_version',
  aws_lambda_permission: 'aws.lambda.permission',
  aws_lambda_event_source_mapping: 'aws.lambda.event_source_mapping',

  // AWS ECS
  aws_ecs_cluster: 'aws.ecs.cluster',
  aws_ecs_service: 'aws.ecs.service',
  aws_ecs_task_definition: 'aws.ecs.task_definition',
  aws_ecs_capacity_provider: 'aws.ecs.capacity_provider',

  // AWS EKS
  aws_eks_cluster: 'aws.eks.cluster',
  aws_eks_node_group: 'aws.eks.node_group',
  aws_eks_fargate_profile: 'aws.eks.fargate_profile',
  aws_eks_addon: 'aws.eks.addon',

  // AWS Load Balancing
  aws_lb: 'aws.elb.load_balancer',
  aws_alb: 'aws.elb.load_balancer',
  aws_lb_listener: 'aws.elb.listener',
  aws_alb_listener: 'aws.elb.listener',
  aws_lb_target_group: 'aws.elb.target_group',
  aws_alb_target_group: 'aws.elb.target_group',
  aws_lb_target_group_attachment: 'aws.elb.target_group_attachment',

  // AWS CloudWatch
  aws_cloudwatch_log_group: 'aws.cloudwatch.log_group',
  aws_cloudwatch_log_stream: 'aws.cloudwatch.log_stream',
  aws_cloudwatch_metric_alarm: 'aws.cloudwatch.metric_alarm',
  aws_cloudwatch_dashboard: 'aws.cloudwatch.dashboard',

  // AWS SNS/SQS
  aws_sns_topic: 'aws.sns.topic',
  aws_sns_topic_subscription: 'aws.sns.topic_subscription',
  aws_sqs_queue: 'aws.sqs.queue',
  aws_sqs_queue_policy: 'aws.sqs.queue_policy',

  // AWS DynamoDB
  aws_dynamodb_table: 'aws.dynamodb.table',
  aws_dynamodb_global_table: 'aws.dynamodb.global_table',

  // AWS Route53
  aws_route53_zone: 'aws.route53.zone',
  aws_route53_record: 'aws.route53.record',
  aws_route53_health_check: 'aws.route53.health_check',

  // AWS ACM
  aws_acm_certificate: 'aws.acm.certificate',
  aws_acm_certificate_validation: 'aws.acm.certificate_validation',

  // AWS KMS
  aws_kms_key: 'aws.kms.key',
  aws_kms_alias: 'aws.kms.alias',

  // AWS Secrets Manager
  aws_secretsmanager_secret: 'aws.secretsmanager.secret',
  aws_secretsmanager_secret_version: 'aws.secretsmanager.secret_version',

  // AWS SSM
  aws_ssm_parameter: 'aws.ssm.parameter',

  // Azure Compute
  azurerm_virtual_machine: 'azure.compute.virtual_machine',
  azurerm_linux_virtual_machine: 'azure.compute.linux_virtual_machine',
  azurerm_windows_virtual_machine: 'azure.compute.windows_virtual_machine',
  azurerm_virtual_machine_scale_set: 'azure.compute.virtual_machine_scale_set',
  azurerm_availability_set: 'azure.compute.availability_set',
  azurerm_managed_disk: 'azure.compute.managed_disk',
  azurerm_image: 'azure.compute.image',

  // Azure Network
  azurerm_virtual_network: 'azure.network.virtual_network',
  azurerm_subnet: 'azure.network.subnet',
  azurerm_network_interface: 'azure.network.network_interface',
  azurerm_public_ip: 'azure.network.public_ip',
  azurerm_network_security_group: 'azure.network.network_security_group',
  azurerm_network_security_rule: 'azure.network.network_security_rule',
  azurerm_route_table: 'azure.network.route_table',
  azurerm_route: 'azure.network.route',
  azurerm_lb: 'azure.network.load_balancer',
  azurerm_application_gateway: 'azure.network.application_gateway',
  azurerm_dns_zone: 'azure.network.dns_zone',
  azurerm_dns_a_record: 'azure.network.dns_a_record',
  azurerm_dns_cname_record: 'azure.network.dns_cname_record',

  // Azure Storage
  azurerm_storage_account: 'azure.storage.storage_account',
  azurerm_storage_container: 'azure.storage.storage_container',
  azurerm_storage_blob: 'azure.storage.storage_blob',
  azurerm_storage_queue: 'azure.storage.storage_queue',
  azurerm_storage_table: 'azure.storage.storage_table',
  azurerm_storage_share: 'azure.storage.storage_share',

  // Azure Database
  azurerm_sql_server: 'azure.sql.sql_server',
  azurerm_sql_database: 'azure.sql.sql_database',
  azurerm_mssql_server: 'azure.sql.mssql_server',
  azurerm_mssql_database: 'azure.sql.mssql_database',
  azurerm_postgresql_server: 'azure.postgresql.server',
  azurerm_postgresql_database: 'azure.postgresql.database',
  azurerm_mysql_server: 'azure.mysql.server',
  azurerm_mysql_database: 'azure.mysql.database',
  azurerm_cosmosdb_account: 'azure.cosmosdb.account',
  azurerm_cosmosdb_sql_database: 'azure.cosmosdb.sql_database',

  // Azure Container
  azurerm_kubernetes_cluster: 'azure.aks.cluster',
  azurerm_kubernetes_cluster_node_pool: 'azure.aks.node_pool',
  azurerm_container_registry: 'azure.acr.registry',
  azurerm_container_group: 'azure.container.group',

  // Azure Identity
  azurerm_user_assigned_identity: 'azure.identity.user_assigned_identity',

  // Azure Resource Group
  azurerm_resource_group: 'azure.resources.resource_group',

  // Azure Key Vault
  azurerm_key_vault: 'azure.keyvault.vault',
  azurerm_key_vault_secret: 'azure.keyvault.secret',
  azurerm_key_vault_key: 'azure.keyvault.key',
  azurerm_key_vault_certificate: 'azure.keyvault.certificate',

  // GCP Compute
  google_compute_instance: 'gcp.compute.instance',
  google_compute_disk: 'gcp.compute.disk',
  google_compute_image: 'gcp.compute.image',
  google_compute_snapshot: 'gcp.compute.snapshot',
  google_compute_instance_template: 'gcp.compute.instance_template',
  google_compute_instance_group: 'gcp.compute.instance_group',
  google_compute_instance_group_manager: 'gcp.compute.instance_group_manager',
  google_compute_autoscaler: 'gcp.compute.autoscaler',

  // GCP Network
  google_compute_network: 'gcp.compute.network',
  google_compute_subnetwork: 'gcp.compute.subnetwork',
  google_compute_firewall: 'gcp.compute.firewall',
  google_compute_router: 'gcp.compute.router',
  google_compute_router_nat: 'gcp.compute.router_nat',
  google_compute_address: 'gcp.compute.address',
  google_compute_global_address: 'gcp.compute.global_address',
  google_compute_forwarding_rule: 'gcp.compute.forwarding_rule',
  google_compute_global_forwarding_rule: 'gcp.compute.global_forwarding_rule',
  google_compute_target_pool: 'gcp.compute.target_pool',
  google_compute_http_health_check: 'gcp.compute.http_health_check',
  google_compute_health_check: 'gcp.compute.health_check',
  google_compute_backend_service: 'gcp.compute.backend_service',
  google_compute_url_map: 'gcp.compute.url_map',
  google_compute_target_http_proxy: 'gcp.compute.target_http_proxy',
  google_compute_target_https_proxy: 'gcp.compute.target_https_proxy',
  google_compute_ssl_certificate: 'gcp.compute.ssl_certificate',

  // GCP Storage
  google_storage_bucket: 'gcp.storage.bucket',
  google_storage_bucket_object: 'gcp.storage.bucket_object',
  google_storage_bucket_acl: 'gcp.storage.bucket_acl',
  google_storage_bucket_iam_binding: 'gcp.storage.bucket_iam_binding',
  google_storage_bucket_iam_member: 'gcp.storage.bucket_iam_member',

  // GCP IAM
  google_service_account: 'gcp.iam.service_account',
  google_service_account_key: 'gcp.iam.service_account_key',
  google_project_iam_binding: 'gcp.iam.project_iam_binding',
  google_project_iam_member: 'gcp.iam.project_iam_member',
  google_project_iam_policy: 'gcp.iam.project_iam_policy',

  // GCP SQL
  google_sql_database_instance: 'gcp.sql.database_instance',
  google_sql_database: 'gcp.sql.database',
  google_sql_user: 'gcp.sql.user',

  // GCP GKE
  google_container_cluster: 'gcp.gke.cluster',
  google_container_node_pool: 'gcp.gke.node_pool',

  // GCP Cloud Functions
  google_cloudfunctions_function: 'gcp.cloudfunctions.function',
  google_cloudfunctions2_function: 'gcp.cloudfunctions.function_v2',

  // GCP Pub/Sub
  google_pubsub_topic: 'gcp.pubsub.topic',
  google_pubsub_subscription: 'gcp.pubsub.subscription',

  // GCP DNS
  google_dns_managed_zone: 'gcp.dns.managed_zone',
  google_dns_record_set: 'gcp.dns.record_set',

  // GCP KMS
  google_kms_key_ring: 'gcp.kms.key_ring',
  google_kms_crypto_key: 'gcp.kms.crypto_key',

  // GCP Secret Manager
  google_secret_manager_secret: 'gcp.secretmanager.secret',
  google_secret_manager_secret_version: 'gcp.secretmanager.secret_version',

  // Kubernetes
  kubernetes_namespace: 'kubernetes.core.namespace',
  kubernetes_deployment: 'kubernetes.apps.deployment',
  kubernetes_service: 'kubernetes.core.service',
  kubernetes_config_map: 'kubernetes.core.config_map',
  kubernetes_secret: 'kubernetes.core.secret',
  kubernetes_persistent_volume_claim: 'kubernetes.core.persistent_volume_claim',
  kubernetes_persistent_volume: 'kubernetes.core.persistent_volume',
  kubernetes_storage_class: 'kubernetes.storage.storage_class',
  kubernetes_stateful_set: 'kubernetes.apps.stateful_set',
  kubernetes_daemon_set: 'kubernetes.apps.daemon_set',
  kubernetes_job: 'kubernetes.batch.job',
  kubernetes_cron_job: 'kubernetes.batch.cron_job',
  kubernetes_ingress: 'kubernetes.networking.ingress',
  kubernetes_ingress_v1: 'kubernetes.networking.ingress',
  kubernetes_network_policy: 'kubernetes.networking.network_policy',
  kubernetes_service_account: 'kubernetes.core.service_account',
  kubernetes_role: 'kubernetes.rbac.role',
  kubernetes_role_binding: 'kubernetes.rbac.role_binding',
  kubernetes_cluster_role: 'kubernetes.rbac.cluster_role',
  kubernetes_cluster_role_binding: 'kubernetes.rbac.cluster_role_binding',
  kubernetes_pod: 'kubernetes.core.pod',
  kubernetes_replica_set: 'kubernetes.apps.replica_set',
  kubernetes_horizontal_pod_autoscaler: 'kubernetes.autoscaling.horizontal_pod_autoscaler',
};

/**
 * Get the ICE type for a Terraform resource type.
 */
export function get_ice_type(terraform_type: string): string {
  // Check direct mapping first
  if (TYPE_MAP[terraform_type]) {
    return TYPE_MAP[terraform_type]!;
  }

  // Fall back to converting the terraform type format
  // e.g., aws_vpc -> aws.vpc
  const parts = terraform_type.split('_');
  if (parts.length >= 2) {
    const provider = parts[0];
    const ice_provider = PROVIDER_MAP[provider!] ?? provider;
    const resource_parts = parts.slice(1);
    return `${ice_provider}.${resource_parts.join('_')}`;
  }

  // Return as-is if no mapping found
  return terraform_type;
}

/**
 * Get the ICE provider name from a Terraform provider string.
 * Terraform provider format: "provider[\"registry.terraform.io/hashicorp/aws\"]"
 */
export function get_ice_provider(terraform_provider: string): string {
  // Extract provider name from the full provider string
  // e.g., "provider[\"registry.terraform.io/hashicorp/aws\"]" -> "aws"
  const match = terraform_provider.match(/provider\["[^"]*\/([^"]+)"\]/);
  if (match && match[1]) {
    const provider_name = match[1];
    return PROVIDER_MAP[provider_name] ?? provider_name;
  }

  // Try simpler format: "provider.aws" or just "aws"
  const simple_match = terraform_provider.match(/(?:provider\.)?(\w+)$/);
  if (simple_match && simple_match[1]) {
    return PROVIDER_MAP[simple_match[1]] ?? simple_match[1];
  }

  return terraform_provider;
}

/**
 * Get provider name from resource type.
 */
export function get_provider_from_type(terraform_type: string): string {
  const parts = terraform_type.split('_');
  if (parts.length >= 1 && parts[0]) {
    return PROVIDER_MAP[parts[0]] ?? parts[0];
  }
  return 'unknown';
}

/**
 * Check if a Terraform type is supported.
 */
export function is_type_supported(terraform_type: string): boolean {
  return terraform_type in TYPE_MAP;
}

/**
 * Get all supported Terraform types.
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

/**
 * Property mapping for specific resource types.
 * Maps Terraform attribute names to ICE property names where they differ.
 */
const PROPERTY_MAP: Record<string, Record<string, string>> = {
  aws_instance: {
    ami: 'image_id',
    instance_type: 'instance_type',
    key_name: 'key_pair',
    vpc_security_group_ids: 'security_groups',
    subnet_id: 'subnet',
    iam_instance_profile: 'instance_profile',
    user_data: 'user_data',
    user_data_base64: 'user_data_base64',
    availability_zone: 'availability_zone',
    private_ip: 'private_ip',
    public_ip: 'public_ip',
    tags: 'tags',
  },
  aws_vpc: {
    cidr_block: 'cidr_block',
    enable_dns_hostnames: 'dns_hostnames',
    enable_dns_support: 'dns_support',
    instance_tenancy: 'tenancy',
    tags: 'tags',
  },
  aws_subnet: {
    vpc_id: 'vpc',
    cidr_block: 'cidr_block',
    availability_zone: 'availability_zone',
    map_public_ip_on_launch: 'map_public_ip',
    tags: 'tags',
  },
  aws_security_group: {
    vpc_id: 'vpc',
    name: 'name',
    description: 'description',
    ingress: 'ingress_rules',
    egress: 'egress_rules',
    tags: 'tags',
  },
  aws_s3_bucket: {
    bucket: 'name',
    acl: 'acl',
    tags: 'tags',
  },
};

/**
 * Map Terraform properties to ICE properties for a given resource type.
 */
export function map_properties(
  terraform_type: string,
  attributes: Record<string, unknown>
): Record<string, unknown> {
  const property_map = PROPERTY_MAP[terraform_type];

  if (!property_map) {
    // No mapping defined, return attributes as-is
    return { ...attributes };
  }

  const result: Record<string, unknown> = {};

  for (const [tf_key, value] of Object.entries(attributes)) {
    const ice_key = property_map[tf_key] ?? tf_key;
    result[ice_key] = value;
  }

  return result;
}
