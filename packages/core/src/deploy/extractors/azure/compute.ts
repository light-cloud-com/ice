/**
 * Property extractors for Azure compute services.
 *
 * Resources covered:
 *   - azure.web.appServicePlan      (Compute.Container, web variant — hosts Web Apps)
 *   - azure.containerApps.app       (Compute.Container, serverless variant; Compute.Worker)
 *   - azure.web.functionApp         (Compute.ServerlessFunction)
 *   - azure.web.staticSite          (Compute.SSRSite)
 */

/**
 * Container Apps. Backs Compute.Container (serverless) + Compute.Worker.
 * Worker variant routes through the same handler — service_type='worker'
 * suppresses ingress.
 */
export function extract_azure_container_apps_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  const isWorker = data.iceType === 'Compute.Worker' || data.service_type === 'worker';
  return {
    region,
    location: (data.location as string) || region,
    service_type: isWorker ? 'worker' : 'service',
    image: (data.image as string) || '',
    port: isWorker ? undefined : ((data.port as number) ?? 8080),
    external: data.external !== false,
    cpu: (data.cpu as number) ?? 0.5,
    memory: (data.memory as string) || '1Gi',
    min_replicas: (data.minInstances as number) ?? (isWorker ? 1 : 0),
    max_replicas: (data.maxInstances as number) ?? 3,
    env_vars: (data.envVars as Record<string, string>) || {},
    tags: {},
  };
}

/**
 * App Service Plan. Default = F1 Linux (Free tier). Operators flip
 * to B1/S1/P1V3 etc. via `properties.tier`. `reserved=true` means
 * Linux; `false` means Windows.
 */
export function extract_azure_app_service_plan_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    tier: (data.tier as string) || (data.sku as string) || 'F1',
    capacity: (data.capacity as number) ?? 1,
    reserved: data.reserved !== false,
    tags: {},
  };
}

/**
 * Function App. Backs Compute.ServerlessFunction. Runtime defaults to
 * Node 20; operator overrides via `properties.runtime` (node, dotnet,
 * python, java). `storage_account_id` is required (Azure Functions
 * hard requirement); auto-bootstrap quirk lands in B4.
 */
export function extract_azure_function_app_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    runtime: (data.runtime as string) || 'node',
    app_settings: (data.envVars as Record<string, string>) || {},
    tags: {},
  };
}

/**
 * Static Web App. Backs Compute.SSRSite. Free tier by default; the
 * canvas connects a GitHub Repo block to populate repository_url +
 * branch + build properties.
 */
export function extract_azure_static_site_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    sku_name: (data.sku_name as string) || (data.tier as string) || 'Free',
    sku_tier: (data.sku_tier as string) || (data.sku_name as string) || (data.tier as string) || 'Free',
    repository_url: (data.repository_url as string) || (data.repo_url as string) || '',
    branch: (data.branch as string) || 'main',
    repository_token: (data.repository_token as string) || '',
    app_location: (data.app_location as string) || '/',
    output_location: (data.output_location as string) || 'dist',
    api_location: (data.api_location as string) || '',
    app_build_command: (data.app_build_command as string) || (data.build_command as string) || '',
    tags: {},
  };
}
