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
  extract_alibaba_alidns_record_properties,
  extract_alibaba_amqp_instance_properties,
  extract_alibaba_apigateway_api_properties,
  extract_alibaba_cas_certificate_properties,
  extract_alibaba_cdn_domain_properties,
  extract_alibaba_cr_build_task_properties,
  extract_alibaba_cr_instance_properties,
  extract_alibaba_cs_managed_cluster_properties,
  extract_alibaba_dds_db_instance_properties,
  extract_alibaba_eci_container_group_properties,
  extract_alibaba_ecs_instance_properties,
  extract_alibaba_ecs_security_group_properties,
  extract_alibaba_eventbridge_rule_properties,
  extract_alibaba_fc_function_properties,
  extract_alibaba_kms_secret_properties,
  extract_alibaba_kvstore_instance_properties,
  extract_alibaba_maxcompute_project_properties,
  extract_alibaba_mns_queue_properties,
  extract_alibaba_mns_topic_properties,
  extract_alibaba_opensearch_app_properties,
  extract_alibaba_oss_bucket_properties,
  extract_alibaba_pai_eas_service_properties,
  extract_alibaba_pai_workspace_properties,
  extract_alibaba_privatelink_endpoint_properties,
  extract_alibaba_ram_user_properties,
  extract_alibaba_rds_db_instance_properties,
  extract_alibaba_sae_application_properties,
  extract_alibaba_slb_properties,
  extract_alibaba_sls_project_properties,
  extract_alibaba_vpc_properties,
  extract_alibaba_vswitch_properties,
  extract_alibaba_waf_policy_properties,
} from './alibaba';
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
  extract_opensearch_serverless_collection_properties,
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
  extract_amazon_mq_broker_properties,
  extract_kinesis_stream_properties,
  extract_ecr_repository_properties,
  extract_cloudwatch_alarm_properties,
  extract_timestream_database_properties,
} from './aws/ancillary';
import {
  extract_ecs_service_properties,
  extract_ecs_worker_properties,
  extract_lambda_function_properties,
  extract_events_rule_properties,
  extract_codebuild_project_properties,
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
  extract_amplify_app_properties as extract_aws_amplify_app_properties,
  extract_wafv2_web_acl_properties as extract_aws_wafv2_web_acl_properties,
  extract_vpc_endpoint_properties as extract_aws_vpc_endpoint_properties,
} from './aws/network';
import {
  extract_azure_cognitive_search_properties,
  extract_azure_data_explorer_properties,
  extract_azure_entra_b2c_properties,
  extract_azure_ml_properties,
  extract_azure_openai_properties,
  extract_azure_synapse_properties,
} from './azure/ai';
import {
  extract_azure_app_insights_properties,
  extract_azure_keyvault_vault_properties,
  extract_azure_log_analytics_properties,
  extract_azure_servicebus_namespace_properties,
} from './azure/ancillary';
import {
  extract_azure_acr_task_properties,
  extract_azure_app_service_plan_properties,
  extract_azure_container_apps_properties,
  extract_azure_function_app_properties,
  extract_azure_static_site_properties,
} from './azure/compute';
import {
  extract_azure_cosmosdb_account_properties,
  extract_azure_mysql_flex_properties,
  extract_azure_postgresql_flex_properties,
  extract_azure_redis_cache_properties,
  extract_azure_sql_server_properties,
} from './azure/database';
import {
  extract_azure_event_grid_properties,
  extract_azure_event_hubs_properties,
  extract_azure_logic_apps_properties,
} from './azure/messaging';
import {
  extract_azure_acr_properties,
  extract_azure_aks_properties,
  extract_azure_apim_properties,
  extract_azure_app_gateway_properties,
  extract_azure_dns_zone_properties,
  extract_azure_front_door_properties,
  extract_azure_nsg_properties,
  extract_azure_private_endpoint_properties,
  extract_azure_subnet_properties,
  extract_azure_vnet_properties,
  extract_azure_waf_properties,
} from './azure/network';
import {
  extract_cloud_run_properties,
  extract_cloud_run_job_properties,
  extract_cloud_functions_properties,
  extract_cloud_scheduler_properties,
} from './compute';
import { extract_cloud_sql_properties, extract_firestore_properties, extract_memorystore_properties } from './database';
import {
  extract_gcp_artifact_registry_properties,
  extract_gcp_cloud_build_properties,
  extract_gcp_monitoring_properties,
  extract_gcp_cloud_dns_properties,
  extract_gcp_compute_instance_properties,
  extract_gcp_compute_firewall_properties,
  extract_gcp_psc_properties,
} from './gcp/new-services';
import {
  extract_k8s_namespace_properties,
  extract_k8s_secret_properties,
  extract_k8s_configmap_properties,
  extract_k8s_pvc_properties,
  extract_k8s_service_properties,
  extract_k8s_deployment_properties,
  extract_k8s_statefulset_properties,
  extract_k8s_cronjob_properties,
  extract_k8s_ingress_properties,
  extract_k8s_networkpolicy_properties,
  extract_k8s_job_properties,
  extract_k8s_serviceaccount_properties,
  extract_k8s_hpa_properties,
  extract_k8s_certmanager_certificate_properties,
  extract_k8s_knative_service_properties,
  extract_k8s_prometheus_rule_properties,
  extract_k8s_pdb_properties,
} from './kubernetes';
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

  // ─── GCP — new (cross-cloud parity push) ────────────────────────────
  'gcp.artifactregistry.repository': extract_gcp_artifact_registry_properties,
  'gcp.cloudbuild.trigger': extract_gcp_cloud_build_properties,
  'gcp.monitoring.alertPolicy': extract_gcp_monitoring_properties,
  'gcp.dns.managedZone': extract_gcp_cloud_dns_properties,
  'gcp.compute.instance': extract_gcp_compute_instance_properties,
  'gcp.compute.firewall': extract_gcp_compute_firewall_properties,
  'gcp.compute.privateServiceConnect': extract_gcp_psc_properties,

  // ─── AWS — compute ─────────────────────────────────────────────────
  'aws.ecs.service': extract_ecs_service_properties,
  // Worker variant — resolves to the same handler but with the
  // `service_type: 'worker'` shape flag the handler reads.
  'aws.ecs.worker': extract_ecs_worker_properties,
  'aws.lambda.function': extract_lambda_function_properties,
  'aws.events.rule': extract_events_rule_properties,
  'aws.codebuild.project': extract_codebuild_project_properties,

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
  'aws.amplify.app': extract_aws_amplify_app_properties,
  'aws.mq.broker': extract_amazon_mq_broker_properties,
  'aws.wafv2.webAcl': extract_aws_wafv2_web_acl_properties,
  'aws.ec2.vpcEndpoint': extract_aws_vpc_endpoint_properties,

  // ─── AWS — new (cross-cloud parity push) ────────────────────────────
  'aws.kinesis.stream': extract_kinesis_stream_properties,
  'aws.ecr.repository': extract_ecr_repository_properties,
  'aws.cloudwatch.alarm': extract_cloudwatch_alarm_properties,
  'aws.timestream.database': extract_timestream_database_properties,

  // ─── Azure — ancillary ─────────────────────────────────────────────
  'azure.keyvault.vault': extract_azure_keyvault_vault_properties,
  'azure.servicebus.namespace': extract_azure_servicebus_namespace_properties,
  'azure.monitor.logAnalytics': extract_azure_log_analytics_properties,
  'azure.insights.appInsights': extract_azure_app_insights_properties,
  'azure.web.appServicePlan': extract_azure_app_service_plan_properties,
  'azure.containerapps.app': extract_azure_container_apps_properties,
  'azure.web.functionApp': extract_azure_function_app_properties,
  'azure.web.staticSite': extract_azure_static_site_properties,
  'azure.cosmosdb.account': extract_azure_cosmosdb_account_properties,
  'azure.postgresqlflex.server': extract_azure_postgresql_flex_properties,
  'azure.mysqlflex.server': extract_azure_mysql_flex_properties,
  'azure.cache.redis': extract_azure_redis_cache_properties,
  'azure.sql.server': extract_azure_sql_server_properties,

  // ─── Azure — network ───────────────────────────────────────────────
  'azure.network.virtualNetwork': extract_azure_vnet_properties,
  'azure.network.subnet': extract_azure_subnet_properties,
  'azure.network.networkSecurityGroup': extract_azure_nsg_properties,
  'azure.network.privateEndpoint': extract_azure_private_endpoint_properties,
  'azure.network.dnsZone': extract_azure_dns_zone_properties,
  'azure.network.applicationGateway': extract_azure_app_gateway_properties,
  'azure.network.frontDoor': extract_azure_front_door_properties,
  'azure.network.webApplicationFirewallPolicy': extract_azure_waf_properties,
  'azure.apimanagement.service': extract_azure_apim_properties,
  'azure.containerservice.managedCluster': extract_azure_aks_properties,
  'azure.containerregistry.registry': extract_azure_acr_properties,

  // ─── Azure — P2 long tail (messaging + AI + analytics + identity) ──
  'azure.logic.workflow': extract_azure_logic_apps_properties,
  'azure.eventgrid.topic': extract_azure_event_grid_properties,
  'azure.eventhub.namespace': extract_azure_event_hubs_properties,
  'azure.search.service': extract_azure_cognitive_search_properties,
  'azure.cognitiveservices.account': extract_azure_openai_properties,
  'azure.machinelearning.workspace': extract_azure_ml_properties,
  'azure.synapse.workspace': extract_azure_synapse_properties,
  'azure.kusto.cluster': extract_azure_data_explorer_properties,
  'azure.aadb2c.directory': extract_azure_entra_b2c_properties,

  // ─── Azure — new (cross-cloud parity push) ──────────────────────────
  'azure.containerregistry.task': extract_azure_acr_task_properties,

  // ─── Kubernetes — P0 handlers ───────────────────────────────────────
  'k8s.core.namespace': extract_k8s_namespace_properties,
  'k8s.core.secret': extract_k8s_secret_properties,
  'k8s.core.configmap': extract_k8s_configmap_properties,
  'k8s.core.persistentvolumeclaim': extract_k8s_pvc_properties,
  'k8s.core.service': extract_k8s_service_properties,
  'k8s.apps.deployment': extract_k8s_deployment_properties,
  'k8s.apps.statefulset': extract_k8s_statefulset_properties,
  'k8s.batch.cronjob': extract_k8s_cronjob_properties,
  'k8s.networking.ingress': extract_k8s_ingress_properties,
  'k8s.networking.networkpolicy': extract_k8s_networkpolicy_properties,
  'k8s.batch.job': extract_k8s_job_properties,
  'k8s.core.serviceaccount': extract_k8s_serviceaccount_properties,
  'k8s.autoscaling.hpa': extract_k8s_hpa_properties,
  'k8s.certmanager.certificate': extract_k8s_certmanager_certificate_properties,
  'k8s.serving.service': extract_k8s_knative_service_properties,
  'k8s.monitoring.prometheusrule': extract_k8s_prometheus_rule_properties,
  'k8s.policy.poddisruptionbudget': extract_k8s_pdb_properties,

  // ─── Alibaba Cloud — P0 handlers ───────────────────────────────────
  'alibaba.ecs.instance': extract_alibaba_ecs_instance_properties,
  'alibaba.ecs.securityGroup': extract_alibaba_ecs_security_group_properties,
  'alibaba.sae.application': extract_alibaba_sae_application_properties,
  'alibaba.fc.function': extract_alibaba_fc_function_properties,
  'alibaba.eventbridge.rule': extract_alibaba_eventbridge_rule_properties,
  'alibaba.eci.containerGroup': extract_alibaba_eci_container_group_properties,
  'alibaba.rds.dbInstance': extract_alibaba_rds_db_instance_properties,
  'alibaba.dds.dbInstance': extract_alibaba_dds_db_instance_properties,
  'alibaba.kvstore.instance': extract_alibaba_kvstore_instance_properties,
  'alibaba.oss.bucket': extract_alibaba_oss_bucket_properties,
  'alibaba.mns.queue': extract_alibaba_mns_queue_properties,
  'alibaba.mns.topic': extract_alibaba_mns_topic_properties,
  'alibaba.vpc.vpc': extract_alibaba_vpc_properties,
  'alibaba.vpc.vSwitch': extract_alibaba_vswitch_properties,
  'alibaba.kms.secret': extract_alibaba_kms_secret_properties,

  // ─── Alibaba Cloud — P1 handlers ───────────────────────────────────
  'alibaba.slb.loadBalancer': extract_alibaba_slb_properties,
  'alibaba.alidns.domainRecord': extract_alibaba_alidns_record_properties,
  'alibaba.privatelink.endpoint': extract_alibaba_privatelink_endpoint_properties,
  'alibaba.apigateway.api': extract_alibaba_apigateway_api_properties,
  'alibaba.cs.managedCluster': extract_alibaba_cs_managed_cluster_properties,
  'alibaba.cr.instance': extract_alibaba_cr_instance_properties,
  'alibaba.cdn.domain': extract_alibaba_cdn_domain_properties,
  'alibaba.ram.user': extract_alibaba_ram_user_properties,
  'alibaba.cas.certificate': extract_alibaba_cas_certificate_properties,
  'alibaba.waf.policy': extract_alibaba_waf_policy_properties,
  'alibaba.sls.project': extract_alibaba_sls_project_properties,

  // ─── Alibaba Cloud — P2 handlers ───────────────────────────────────
  'alibaba.amqp.instance': extract_alibaba_amqp_instance_properties,
  'alibaba.maxcompute.project': extract_alibaba_maxcompute_project_properties,
  'alibaba.opensearch.app': extract_alibaba_opensearch_app_properties,
  'alibaba.paieas.service': extract_alibaba_pai_eas_service_properties,
  'alibaba.pai.workspace': extract_alibaba_pai_workspace_properties,
  'alibaba.cr.buildTask': extract_alibaba_cr_build_task_properties,

  // ─── AWS — ancillary (messaging, auth, secrets, logging) ───────────
  'aws.sqs.queue': extract_sqs_queue_properties,
  'aws.sns.topic': extract_sns_topic_properties,
  'aws.cognito.userPool': extract_cognito_user_pool_properties,
  'aws.secretsmanager.secret': extract_secrets_manager_secret_properties,
  'aws.cloudwatch.logGroup': extract_cloudwatch_log_group_properties,

  // ─── AWS — AI / analytics ──────────────────────────────────────────
  'aws.opensearch.domain': extract_opensearch_domain_properties,
  'aws.opensearchserverless.collection': extract_opensearch_serverless_collection_properties,
  'aws.bedrock.endpoint': extract_bedrock_endpoint_properties,
  'aws.sagemaker.endpoint': extract_sagemaker_endpoint_properties,
  'aws.redshift.cluster': extract_redshift_cluster_properties,
};
