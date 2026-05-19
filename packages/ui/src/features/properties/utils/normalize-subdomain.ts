/**
 * Subdomain normalization + validation.
 *
 * Users often paste a full URL or type `api.` and we want the input to
 * not reject them on a typo. `normalizeSubdomain` runs a 6-step pipeline
 * that turns any pasted-or-typed value into a valid RFC 1035 DNS label
 * (or the empty string for "root" deploys):
 *
 *   1. Lowercase + trim whitespace.
 *   2. Strip a leading `http://` or `https://` scheme.
 *   3. If the input is `api.example.com`, keep only the first label.
 *   4. Drop any character outside `[a-z0-9-]`.
 *   5. Trim leading/trailing hyphens (GCP rejects them).
 *   6. Truncate to 63 chars (the DNS label limit).
 *
 * `validateSubdomain` returns null for the empty string (callers decide
 * whether empty is allowed) or for anything matching the RFC 1035 label
 * shape; otherwise it returns the user-facing error message verbatim.
 */
export function normalizeSubdomain(raw: string): string {
  let s = raw.toLowerCase().trim();
  s = s.replace(/^https?:\/\//, '');
  // If they typed `api.example.com`, keep only the first label.
  const dotIdx = s.indexOf('.');
  if (dotIdx !== -1) s = s.slice(0, dotIdx);
  // Only allow RFC 1035 DNS label characters (plus the empty
  // string for "root" deploys).
  s = s.replace(/[^a-z0-9-]/g, '');
  // Trim leading/trailing hyphens — GCP rejects them.
  s = s.replace(/^-+/, '').replace(/-+$/, '');
  if (s.length > 63) s = s.slice(0, 63);
  return s;
}

export function validateSubdomain(s: string): string | null {
  if (!s) return null;
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(s)) {
    return 'Subdomain must be lowercase letters, digits, hyphens (not starting/ending). Max 63 chars.';
  }
  return null;
}
