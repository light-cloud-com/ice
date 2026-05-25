/**
 * Property extractors for AWS AI / analytics services.
 *
 * Resources covered:
 *   - aws.opensearch.domain     (AI.VectorDB)
 *   - aws.bedrock.endpoint      (AI.LLMGateway)
 *   - aws.sagemaker.endpoint    (AI.ModelServing)
 *   - aws.redshift.cluster      (Analytics.DataWarehouse)
 *
 * Both Bedrock and SageMaker iceTypes carry the same `llm` role in
 * the shared classifier table, but AWS gives them distinct managed
 * surfaces so each gets its own extractor.
 */

/**
 * OpenSearch domain — backs AI.VectorDB. Defaults to a single-node
 * t3.small.search instance for cost-conscious dev/test; production
 * users set `instance_count` ≥ 3 + `dedicated_master_enabled`.
 */
export function extract_opensearch_domain_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    engine_version: (data.engine_version as string) || 'OpenSearch_2.13',
    instance_type: (data.instance_type as string) || 't3.small.search',
    instance_count: (data.instance_count as number) ?? 1,
    dedicated_master_enabled: data.dedicated_master_enabled ?? false,
    dedicated_master_type: (data.dedicated_master_type as string) || undefined,
    dedicated_master_count: (data.dedicated_master_count as number) ?? 0,
    ebs_enabled: data.ebs_enabled ?? true,
    ebs_volume_type: (data.ebs_volume_type as string) || 'gp3',
    ebs_volume_size_gb: (data.ebs_volume_size_gb as number) ?? 10,
    encryption_at_rest: data.encryption_at_rest ?? true,
    node_to_node_encryption: data.node_to_node_encryption ?? true,
    tags: {},
  };
}

/**
 * Bedrock — backs AI.LLMGateway. Bedrock is mostly a foundation-model
 * surface (on-demand calls don't need provisioning), but provisioned
 * throughput + guardrails are the resources operators actually deploy.
 * The extractor focuses on the provisioned-throughput shape; if no
 * model is set the handler returns a no-op create (Bedrock on-demand
 * access is account-level, not resource-level).
 */
export function extract_bedrock_endpoint_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    // Foundation model id — defaults to the most-common Claude model
    // available on Bedrock. Operators override to pin a specific model.
    model_id: (data.model_id as string) || 'anthropic.claude-3-haiku-20240307-v1:0',
    // Provisioned throughput in `model units` (Bedrock's pricing unit).
    // 0 = on-demand only (no resource is created at deploy time).
    model_units: (data.model_units as number) ?? 0,
    commitment_duration: (data.commitment_duration as string) || 'OneMonth',
    // Optional guardrail attached to invocations.
    guardrail_id: (data.guardrail_id as string) || undefined,
    guardrail_version: (data.guardrail_version as string) || undefined,
    tags: {},
  };
}

/**
 * SageMaker endpoint — backs AI.ModelServing. Real-time inference
 * endpoint over a previously-registered model. The model itself
 * (training, registration) is operator-side; the extractor focuses
 * on the endpoint config (instance class + count).
 */
export function extract_sagemaker_endpoint_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    // Model name resolved by the handler from the connected canvas
    // node OR set explicitly. Empty = handler fails loudly.
    model_name: (data.model_name as string) || '',
    instance_type: (data.instance_type as string) || 'ml.t2.medium',
    initial_instance_count: (data.initial_instance_count as number) ?? 1,
    initial_variant_weight: (data.initial_variant_weight as number) ?? 1.0,
    // Async / serverless / real-time endpoint mode. Defaults to
    // real-time (the most common).
    endpoint_mode: (data.endpoint_mode as string) || 'real-time',
    tags: {},
  };
}

/**
 * Redshift cluster — backs Analytics.DataWarehouse. Like RDS, Redshift
 * needs an admin password supplied by the operator.
 */
export function extract_redshift_cluster_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    // Smallest dc2.large default — fits dev/test, cheap. Production
    // workloads override to ra3.* node types.
    node_type: (data.node_type as string) || 'dc2.large',
    cluster_type: (data.cluster_type as string) || 'single-node',
    number_of_nodes: (data.number_of_nodes as number) ?? 1,
    db_name: (data.db_name as string) || 'analytics',
    master_username: (data.master_username as string) || 'admin',
    master_user_password: (data.master_user_password as string) || '',
    publicly_accessible: data.publicly_accessible ?? false,
    encrypted: data.encrypted ?? true,
    port: data.port || 5439,
    tags: {},
  };
}
