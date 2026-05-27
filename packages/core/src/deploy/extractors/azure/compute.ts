/**
 * Property extractors for Azure compute services.
 *
 * Resources covered:
 *   - azure.web.appServicePlan   (Compute.Container, web variant — hosts Web Apps)
 */

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
