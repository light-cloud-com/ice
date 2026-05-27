/**
 * Property extractors for Azure AI + analytics services.
 *
 * Resources covered:
 *   - azure.search.service              (Analytics.Search + AI.VectorDB)
 *   - azure.cognitiveservices.account   (AI.LLMGateway — OpenAI flavour)
 *   - azure.machinelearning.workspace   (AI.ModelServing)
 *   - azure.synapse.workspace           (Analytics.DataWarehouse)
 *   - azure.kusto.cluster               (template-only data-explorer)
 *   - azure.aadb2c.directory            (Security.Identity)
 */

/**
 * Cognitive Search service. Free tier by default. AI.VectorDB also
 * lands here — vector search is a feature of the same service.
 */
export function extract_azure_cognitive_search_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  // Vector workloads need at least the Basic tier — flip free → basic
  // when the block is AI.VectorDB.
  const isVector = data.iceType === 'AI.VectorDB';
  const default_sku = isVector ? 'basic' : 'free';
  return {
    region,
    location: (data.location as string) || region,
    sku_name: (data.sku_name as string) || (data.tier as string) || default_sku,
    replica_count: (data.replica_count as number) ?? 1,
    partition_count: (data.partition_count as number) ?? 1,
    hosting_mode: (data.hosting_mode as string) || 'default',
    tags: {},
  };
}

/**
 * Azure OpenAI account. Standard S0 — the only OpenAI SKU. Custom
 * sub-domain defaults to the resource name (required by the SDK).
 */
export function extract_azure_openai_properties(
  data: Record<string, unknown>,
  region: string,
  node_id?: string,
): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    kind: 'OpenAI',
    sku_name: (data.sku_name as string) || 'S0',
    custom_subdomain: (data.custom_subdomain as string) || node_id || '',
    public_network_access: (data.public_network_access as string) || 'Enabled',
    tags: {},
  };
}

/** Azure ML workspace. Needs storage + key-vault + app-insights. */
export function extract_azure_ml_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    storage_account_id: (data.storage_account_id as string) || '',
    key_vault_id: (data.key_vault_id as string) || '',
    app_insights_id: (data.app_insights_id as string) || '',
    container_registry_id: (data.container_registry_id as string) || '',
    tags: {},
  };
}

/** Synapse workspace. SQL admin password + Data Lake filesystem required. */
export function extract_azure_synapse_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    sql_administrator_login: (data.sql_administrator_login as string) || (data.master_username as string) || '',
    sql_administrator_login_password:
      (data.sql_administrator_login_password as string) || (data.master_user_password as string) || '',
    storage_account_url: (data.storage_account_url as string) || '',
    filesystem_name: (data.filesystem_name as string) || 'synapse',
    tags: {},
  };
}

/** Data Explorer (Kusto) cluster. Dev SKU by default — cheapest tier. */
export function extract_azure_data_explorer_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    sku_name: (data.sku_name as string) || 'Dev(No SLA)_Standard_E2a_v4',
    sku_tier: (data.sku_tier as string) || 'Basic',
    sku_capacity: (data.sku_capacity as number) ?? 1,
    tags: {},
  };
}

/** Entra External ID (B2C) tenant. Standard tier; .onmicrosoft.com domain. */
export function extract_azure_entra_b2c_properties(
  data: Record<string, unknown>,
  region: string,
  node_id?: string,
): Record<string, unknown> {
  const base = (data.display_name as string) || node_id || 'ice';
  return {
    region,
    location: (data.location as string) || 'United States',
    tenant_name: (data.tenant_name as string) || `${base}.onmicrosoft.com`,
    country_code: (data.country_code as string) || 'US',
    display_name: (data.display_name as string) || base,
    sku_name: (data.sku_name as string) || 'Standard',
    tags: {},
  };
}
