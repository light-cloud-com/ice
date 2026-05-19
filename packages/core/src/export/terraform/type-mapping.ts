/**
 * Terraform Exporter — type-mapping helpers (rf-tfexp-3).
 *
 * Single helper extracted from `terraform-exporter.ts`
 * (pre-extraction L335-362). Pure string transform; no class state.
 *
 * The provider-prefix table is preserved VERBATIM — every key,
 * every value, every fallthrough order. The order of the three
 * explicit branches (gcp / aws / azure) and the generic fallback
 * matters: a type starting with `gcp.` always hits the gcp branch
 * even if `provider_prefix_map[provider]` would map it elsewhere.
 *
 * Pre-extraction subtleties:
 *  - The `gcp` branch substitutes the inferred `tf_prefix` (could
 *    be `'google'` or whatever the caller passed) — so calling
 *    with provider `'gcp'` and ice_type `'gcp.compute.instance'`
 *    yields `'google_compute_instance'`. Calling with provider
 *    `'aws'` and ice_type `'gcp.compute.instance'` yields
 *    `'aws_compute_instance'` — preserved verbatim, may be a bug
 *    but is the documented behaviour.
 *  - The `aws` branch hard-codes `'aws_'` as prefix — even if the
 *    caller passes `provider: 'gcp'`, an `aws.*` type still becomes
 *    `aws_*`. Same goes for `azure.*` → `azurerm_*`.
 *  - The generic fallback uses `tf_prefix` — so an unknown ice_type
 *    `'foo.bar'` with provider `'gcp'` becomes `'google_foo_bar'`.
 */

/**
 * Fallback type mapping for common types.
 *
 * Mechanical "ICE dotted type -> Terraform underscored type"
 * conversion when the schema-provider has no explicit mapping for
 * the (ice_type, provider) pair. The provider table maps the
 * caller's `provider` token to the canonical Terraform provider
 * prefix (e.g. `'gcp' -> 'google'`).
 *
 * Always returns a string — no `null` case in the original
 * implementation. The "Generic fallback" branch handles every
 * input that doesn't match the gcp/aws/azure prefixes.
 */
export function fallback_type_mapping(ice_type: string, provider: string): string | null {
  // Map provider prefixes
  const provider_prefix_map: Record<string, string> = {
    google: 'google',
    gcp: 'google',
    aws: 'aws',
    azure: 'azurerm',
    azurerm: 'azurerm',
  };

  const tf_prefix = provider_prefix_map[provider] || provider;

  // Try to convert ICE type to Terraform type
  // e.g., gcp.compute.instance -> google_compute_instance
  // e.g., aws.ec2.instance -> aws_instance
  if (ice_type.startsWith('gcp.')) {
    return ice_type.replace('gcp.', `${tf_prefix}_`).replace(/\./g, '_');
  }
  if (ice_type.startsWith('aws.')) {
    return ice_type.replace('aws.', 'aws_').replace(/\./g, '_');
  }
  if (ice_type.startsWith('azure.')) {
    return ice_type.replace('azure.', 'azurerm_').replace(/\./g, '_');
  }

  // Generic fallback
  return `${tf_prefix}_${ice_type.replace(/\./g, '_')}`;
}
