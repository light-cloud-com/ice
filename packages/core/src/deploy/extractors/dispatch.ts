/**
 * Property extractor dispatch table for the card-to-graph translator.
 *
 * Maps each resolved GCP resource type (e.g. `gcp.run.service`) to the
 * extractor function that converts a canvas node's `data` payload into the
 * deployer-handler input shape for that resource.
 *
 * The translator looks up entries by `resource_type`. If a key is missing,
 * the lookup returns `undefined` and the orchestrator's `if (extractor)` gate
 * fails loudly with the `Register an extractor in PROPERTY_EXTRACTORS …`
 * error rather than silently dropping block-level config.
 *
 * Note: `gcp.aiplatform.endpoint` and `gcp.aiplatform.index` both map to
 * `extract_vertex_ai_properties` — this is the only "two keys → same fn"
 * case in the table. Adding a new entry that needs a node-id-derived
 * default (currently only `extract_subnet_properties` uses the optional
 * third `node_id?` parameter) must take all three args.
 */

import {
  extract_secret_manager_properties,
  extract_identity_platform_properties,
  extract_bigquery_properties,
  extract_logging_properties,
  extract_vertex_ai_properties,
  extract_dataflow_properties,
  extract_discovery_engine_properties,
  extract_gke_properties,
  extract_domain_mapping_properties,
  extract_custom_domain_properties,
  extract_backend_bucket_properties,
  extract_firebase_hosting_properties,
} from './ancillary';
import {
  extract_opensearch_domain_properties,
  extract_bedrock_endpoint_properties,
  extract_sagemaker_endpoint_properties,
  extract_redshift_cluster_properties,
} from './aws/ai';
import {
  extract_sqs_queue_properties,
  extract_sns_topic_properties,
  extract_cognito_user_pool_properties,
  extract_secrets_manager_secret_properties,
  extract_cloudwatch_log_group_properties,
} from './aws/ancillary';
import {
  extract_ecs_service_properties,
  extract_lambda_function_properties,
  extract_events_rule_properties,
} from './aws/compute';
import {
  extract_rds_db_instance_properties,
  extract_dynamodb_table_properties,
  extract_elasticache_cluster_properties,
  extract_docdb_cluster_properties,
} from './aws/database';
import {
  extract_s3_bucket_properties,
  extract_api_gateway_rest_api_properties,
  extract_cloudfront_distribution_properties,
  extract_elbv2_load_balancer_properties,
  extract_vpc_properties as extract_aws_vpc_properties,
  extract_subnet_properties as extract_aws_subnet_properties,
  extract_security_group_properties as extract_aws_security_group_properties,
  extract_acm_certificate_properties as extract_aws_acm_certificate_properties,
  extract_route53_record_properties as extract_aws_route53_record_properties,
} from './aws/network';
import {
  extract_cloud_run_properties,
  extract_cloud_run_job_properties,
  extract_cloud_functions_properties,
  extract_cloud_scheduler_properties,
} from './compute';
import { extract_cloud_sql_properties, extract_firestore_properties, extract_memorystore_properties } from './database';
import {
  extract_storage_bucket_properties,
  extract_pubsub_properties,
  extract_api_gateway_properties,
  extract_load_balancer_properties,
  extract_vpc_properties,
  extract_subnet_properties,
  extract_cloud_armor_properties,
} from './network';

export const PROPERTY_EXTRACTORS: Record<
  string,
  (data: Record<string, unknown>, region: string, node_id?: string) => Record<string, unknown>
> = {
  'gcp.run.service': extract_cloud_run_properties,
  'gcp.run.job': extract_cloud_run_job_properties,
  'gcp.sql.databaseInstance': extract_cloud_sql_properties,
  'gcp.cloudfunctions.function': extract_cloud_functions_properties,
  'gcp.cloudscheduler.job': extract_cloud_scheduler_properties,
  'gcp.storage.bucket': extract_storage_bucket_properties,
  'gcp.pubsub.topic': extract_pubsub_properties,
  'gcp.firestore.database': extract_firestore_properties,
  'gcp.redis.instance': extract_memorystore_properties,
  'gcp.secretmanager.secret': extract_secret_manager_properties,
  'gcp.identityplatform.config': extract_identity_platform_properties,
  'gcp.bigquery.dataset': extract_bigquery_properties,
  'gcp.apigateway.api': extract_api_gateway_properties,
  'gcp.compute.globalForwardingRule': extract_load_balancer_properties,
  'gcp.logging.sink': extract_logging_properties,
  'gcp.aiplatform.endpoint': extract_vertex_ai_properties,
  'gcp.aiplatform.index': extract_vertex_ai_properties,
  'gcp.dataflow.job': extract_dataflow_properties,
  'gcp.discoveryengine.searchEngine': extract_discovery_engine_properties,
  'gcp.container.cluster': extract_gke_properties,
  'gcp.run.domainMapping': extract_domain_mapping_properties,
  'gcp.compute.managedSslCertificate': extract_custom_domain_properties,
  'gcp.compute.backendBucket': extract_backend_bucket_properties,
  'gcp.compute.network': extract_vpc_properties,
  'gcp.compute.subnetwork': extract_subnet_properties,
  'gcp.compute.securityPolicy': extract_cloud_armor_properties,
  'gcp.firebase.hosting': extract_firebase_hosting_properties,

  // ─── AWS — compute ─────────────────────────────────────────────────
  'aws.ecs.service': extract_ecs_service_properties,
  'aws.lambda.function': extract_lambda_function_properties,
  'aws.events.rule': extract_events_rule_properties,

  // ─── AWS — database ────────────────────────────────────────────────
  'aws.rds.dbInstance': extract_rds_db_instance_properties,
  'aws.dynamodb.table': extract_dynamodb_table_properties,
  'aws.elasticache.cluster': extract_elasticache_cluster_properties,
  'aws.docdb.cluster': extract_docdb_cluster_properties,

  // ─── AWS — network ─────────────────────────────────────────────────
  'aws.s3.bucket': extract_s3_bucket_properties,
  'aws.apigateway.restApi': extract_api_gateway_rest_api_properties,
  'aws.cloudfront.distribution': extract_cloudfront_distribution_properties,
  'aws.elbv2.loadBalancer': extract_elbv2_load_balancer_properties,
  'aws.ec2.vpc': extract_aws_vpc_properties,
  'aws.ec2.subnet': extract_aws_subnet_properties,
  'aws.ec2.securityGroup': extract_aws_security_group_properties,
  'aws.acm.certificate': extract_aws_acm_certificate_properties,
  'aws.route53.recordSet': extract_aws_route53_record_properties,

  // ─── AWS — ancillary (messaging, auth, secrets, logging) ───────────
  'aws.sqs.queue': extract_sqs_queue_properties,
  'aws.sns.topic': extract_sns_topic_properties,
  'aws.cognito.userPool': extract_cognito_user_pool_properties,
  'aws.secretsmanager.secret': extract_secrets_manager_secret_properties,
  'aws.cloudwatch.logGroup': extract_cloudwatch_log_group_properties,

  // ─── AWS — AI / analytics ──────────────────────────────────────────
  'aws.opensearch.domain': extract_opensearch_domain_properties,
  'aws.bedrock.endpoint': extract_bedrock_endpoint_properties,
  'aws.sagemaker.endpoint': extract_sagemaker_endpoint_properties,
  'aws.redshift.cluster': extract_redshift_cluster_properties,
};
