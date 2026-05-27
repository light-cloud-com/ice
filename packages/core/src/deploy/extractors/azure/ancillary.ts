/**
 * Property extractors for Azure ancillary services.
 *
 * Resources covered:
 *   - azure.keyvault.vault   (Security.Secret, Security.Certificate)
 *
 * Vault name needs to be globally unique + 3-24 chars + alphanumeric/hyphens.
 * The translator gives us the resource name; we don't sanitise here (the
 * canvas-driven sanitiser runs before the extractor).
 */

/**
 * Key Vault. Canvas Security.Secret + Security.Certificate blocks
 * route through the same iceType — the vault holds both kinds.
 * `bindings` mirrors the AWS Secrets Manager extractor's contract:
 * the schema-declared deploy-expansion pass projects one Secret /
 * Certificate child per binding row.
 */
export function extract_azure_keyvault_vault_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    sku: (data.sku as string) || 'standard',
    tenant_id: (data.tenant_id as string) || (data.tenantId as string) || '',
    enable_rbac_authorization: data.enable_rbac_authorization !== false,
    enable_soft_delete: data.enable_soft_delete !== false,
    soft_delete_retention_days: (data.soft_delete_retention_days as number) ?? 7,
    enable_purge_protection: data.enable_purge_protection === true,
    bindings: Array.isArray(data.secrets) ? data.secrets : [],
    tags: {},
  };
}
