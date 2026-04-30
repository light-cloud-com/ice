/**
 * Apply user-set simple bucket properties on update — labels,
 * lifecycle, versioning. Extracted from `cloud-storage.ts` update()
 * (rf-cstor-6).
 *
 * Each property is applied only when present in the input. The three
 * GCS APIs are:
 *
 *   labels      → `bucket.setLabels(...)`
 *   lifecycle   → `bucket.setMetadata({ lifecycle })`
 *   versioning  → `bucket.setMetadata({ versioning: { enabled } })`
 *
 * Versioning uses `!!properties.versioning` so `false`/`null`/`""` all
 * disable while `true`/non-empty truthy enables. The orchestrator
 * passes the bare property bag.
 */

/**
 * Apply labels + lifecycle + versioning patches if present. Throws on
 * any underlying GCS API failure — the caller is expected to wrap in
 * a try/catch and surface as a `fail()` deploy result.
 */
export async function applySimpleProperties(
  bucket: any,
  properties: Record<string, unknown>,
): Promise<void> {
  if (properties.labels) {
    await bucket.setLabels(properties.labels);
  }
  if (properties.lifecycle) {
    await bucket.setMetadata({ lifecycle: properties.lifecycle });
  }
  if (properties.versioning !== undefined) {
    await bucket.setMetadata({ versioning: { enabled: !!properties.versioning } });
  }
}
