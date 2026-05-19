/**
 * DNS-records data shaping for the deploy-panel results section.
 *
 * Lifted verbatim from `deploy-panel.tsx` (rf-pdpl-3, L600–701). The two
 * helpers below are the pure data-shaping logic that drives the "DNS records
 * for <domain>" panel rendered after a successful deploy of a Custom Domain
 * block — the JSX section itself stays inline in deploy-panel.tsx for now and
 * lifts out separately in rf-pdpl-11.
 *
 * RISK #7 from the rf-pdpl blueprint: keep the `(r.outputs as any)` cast at
 * this util's boundary. `DeployResourceResult.outputs` is typed as
 * `Record<string, unknown>` because the server hands back arbitrary
 * provider-specific output bags; the `custom_domain_dns_records` shape lives
 * under that bag and is documented only by the Firebase Hosting deployer.
 * Switching to a type guard (e.g. `typeof === 'object' && 'type' in rec`) is
 * NOT semantics-preserving — the original filter/split runs on every entry
 * regardless of shape and trusts that the deployer respected the contract.
 * Type-narrowing here would silently drop malformed records the original code
 * would have rendered (and shown as visibly-broken in the UI, which is the
 * desired feedback loop for a deployer bug).
 */

import type { DeployResourceResult } from '../../../store/slices/deploy-slice';

export type DnsRec = { type: string; domain: string; value: string; required_action?: string };

/**
 * Pick the subset of `deploy.results` whose entries carry at least one DNS
 * record to display. Verbatim 3-condition filter from the source IIFE: the
 * result must be successful, must have an array under
 * `outputs.custom_domain_dns_records`, and that array must be non-empty.
 *
 * Keep all three predicates — dropping any one of them changes the output:
 * - removing `r.success` would surface DNS records from failed Firebase
 *   Hosting attempts (the deployer can write partial output even on failure).
 * - removing `Array.isArray(...)` would crash on `.length` for non-array
 *   shapes (e.g. an `outputs.custom_domain_dns_records: { error: '...' }`
 *   diagnostic blob from a future deployer revision).
 * - removing `length > 0` would render an empty "DNS records for <domain>"
 *   panel for every Firebase Hosting result (the deployer always writes the
 *   key, even when there's nothing to display because verification is done).
 */
export function extractDnsResults(results: DeployResourceResult[]): DeployResourceResult[] {
  return results.filter(
    (r) =>
      r.success &&
      Array.isArray((r.outputs as any)?.custom_domain_dns_records) &&
      (r.outputs as any).custom_domain_dns_records.length > 0,
  );
}

/**
 * Split the DNS records for a single result into "add" and "remove" buckets.
 *
 * The asymmetric default-via-OR is load-bearing:
 * - undefined `required_action` → addRecords (the OR defaults to `'add'`).
 * - `'remove'` → removeRecords.
 * - any other string ('add', 'verify', a future literal) → addRecords (the
 *   OR keeps the original string, which then `!== 'remove'` is true).
 *
 * A record never appears in BOTH lists — the two filters are mutually
 * exclusive. Switching to a non-default-aware split would change runtime for
 * the (currently unused but legal) `'verify'` bucket: it would land in
 * neither list and disappear from the UI.
 */
export function splitDnsByAction(records: DnsRec[]): { addRecords: DnsRec[]; removeRecords: DnsRec[] } {
  const addRecords = records.filter((rec) => (rec.required_action || 'add') !== 'remove');
  const removeRecords = records.filter((rec) => rec.required_action === 'remove');
  return { addRecords, removeRecords };
}
