/**
 * Deploy-panel error-classification helpers.
 *
 * Lifted verbatim from `deploy-panel.tsx`'s inline `ApiErrorBanner` component
 * (rf-pdpl-5, original L1561–1756). The four helpers below pin the
 * priority cascade the inline banner uses to decide which sub-banner to
 * render — quota, billing, RAPT, API-not-enabled, or a plain "standard
 * error" fallback. They are pure data transforms (regex, string includes,
 * Set construction) and intentionally have no React or Redux dependency
 * so the surrounding component re-render is purely the outer JSX.
 *
 * Priority cascade (re-derived by reading the inline cascade, NOT from the
 * brief): `'quota'` → `'billing'` → `'rapt'` → `'api'` (only when
 * `enableUrls.size > 0`) → `'unknown'` (the standard-error fallback). The
 * inline cascade collects `enableUrls` up-front (so we have them ready for
 * the API banner's button list) but only consults `hasApiErrors` AFTER the
 * three secondary error checks have early-returned. `classifyDeployError`
 * mirrors that order exactly.
 *
 * RISK #10 from the rf-pdpl blueprint: `QUOTA_PATTERN` is a single regex
 * with capture group `TARGET_(HTTPS?)_PROXIES`. Splitting it into multiple
 * regexes or OR-joined `includes()` substring checks drops semantics —
 * `TARGET_HTTPS_PROXIES` and `TARGET_HTTP_PROXIES` both must match, and the
 * `quota.*exceeded` alternative is a true regex pattern, not a substring.
 * Preserve byte-identical.
 */

import { isApiNotEnabledError, extractApiEnableUrl } from '../../../shared/utils/gcp-errors';

/**
 * Result-row shape consumed by every helper here. Subset of
 * `DeployResourceResult` (the wire shape from `deploy-slice.ts`). Only the
 * two fields the inline cascade actually reads are listed — keep this
 * narrow so the helper can be used from both the deploy panel and any
 * future caller (e.g. a test diagnostic) without forcing a full
 * `DeployResourceResult` cast.
 */
export type ResultLike = {
  error?: string;
  api_enable_url?: string;
};

/**
 * Discriminator returned by `classifyDeployError`. The cascade order is
 * load-bearing: `'quota'` wins over `'billing'`, which wins over `'rapt'`,
 * which wins over `'api'`. `'api'` only fires when at least one
 * `enableUrl` was collected (otherwise the banner has nothing to link to
 * and falls through to `'unknown'` for the plain-text error display).
 */
export type DeployErrorKind = 'quota' | 'billing' | 'rapt' | 'api' | 'unknown';

// Quota exhaustion. Matches the family of GCP quota errors: backend
// buckets, in-use IP addresses, forwarding rules, URL maps, etc. —
// all of which leak together when template deploys partially fail.
export const QUOTA_PATTERN =
  /QUOTA_EXCEEDED|quota.*exceeded|BACKEND_BUCKETS|IN_USE_ADDRESSES|IN-USE-ADDRESSES|FORWARDING_RULES|URL_MAPS|TARGET_(HTTPS?)_PROXIES|BACKEND_SERVICES|SSL_CERTIFICATES/i;

/**
 * Collect all unique `https://console.cloud.google.com/apis/...` enable
 * URLs from the top-level error string and per-result errors.
 *
 * Verbatim port of the inline loop at L1568–1581: each result contributes
 * its own `api_enable_url` (if present) plus the URL extracted via
 * `extractApiEnableUrl(r.error)` whenever `isApiNotEnabledError(r.error)`
 * is true. The top-level `error` string is checked last with the same
 * `isApiNotEnabledError` → `extractApiEnableUrl` pair. Returns a Set so
 * duplicate URLs across results collapse to one button in the rendered
 * banner.
 */
export function collectApiEnableUrls(error: string, results: ResultLike[]): Set<string> {
  const enableUrls = new Set<string>();
  for (const r of results) {
    if (r.api_enable_url) enableUrls.add(r.api_enable_url);
    if (r.error && isApiNotEnabledError(r.error)) {
      const url = extractApiEnableUrl(r.error);
      if (url) enableUrls.add(url);
    }
  }
  if (isApiNotEnabledError(error)) {
    const url = extractApiEnableUrl(error);
    if (url) enableUrls.add(url);
  }
  return enableUrls;
}

/**
 * Pull the GCP project ID out of an error string by matching either
 * `project=...` or `project/...` (case-insensitive). Verbatim port of the
 * inline two-liner at L1602–1603. Returns `''` (NOT `null`) when no match
 * is found so the consumer can splat the result directly into a console
 * URL template without a guard.
 *
 * Subtlety on the character class: the regex is `/project[=/]([a-z0-9-]+)/i`
 * — the `/i` flag applies to the character class too, so `[a-z0-9-]`
 * actually matches upper-case letters as well. `project=FooBar` returns
 * `'FooBar'`, not `''` and not `'foo'`. This is verbatim behaviour from
 * the inline cascade and is pinned by tests; if narrower lower-case-only
 * matching is the desired behaviour, that is a separate behaviour-change
 * unit, not this extraction.
 */
export function extractProjectIdFromError(error: string): string {
  const projectMatch = error.match(/project[=/]([a-z0-9-]+)/i);
  return projectMatch?.[1] || '';
}

/**
 * Classify a deploy-panel error into one of five kinds, applying the same
 * priority cascade the inline `ApiErrorBanner` component used pre-rf-pdpl-5.
 *
 * Order (load-bearing, do NOT reorder):
 *
 *   1. `'quota'` — the top-level error string OR any result error matches
 *      `QUOTA_PATTERN`.
 *   2. `'billing'` — the top-level error or any result error contains the
 *      substring `'Billing'` or `'billing'` (case-sensitive — both casings
 *      checked because the inline code does so).
 *   3. `'rapt'` — the top-level error or any result error contains
 *      `'invalid_rapt'` or `'reauth'` (re-authentication required for
 *      session-controlled access).
 *   4. `'api'` — none of the above AND `collectApiEnableUrls(...).size > 0`.
 *      The banner needs at least one URL to render an "Enable API" button;
 *      without one, it falls through to the plain-text fallback.
 *   5. `'unknown'` — none of the above. The caller renders a plain
 *      red-bordered error card with the original error text.
 *
 * Pure function, no side effects. The only environmental coupling is the
 * `isApiNotEnabledError` / `extractApiEnableUrl` calls inside
 * `collectApiEnableUrls`, which are themselves pure regex/substring
 * predicates from `shared/utils/gcp-errors`.
 */
export function classifyDeployError(error: string, results: ResultLike[]): DeployErrorKind {
  const isQuotaError = QUOTA_PATTERN.test(error) || results.some((r) => r.error && QUOTA_PATTERN.test(r.error));
  if (isQuotaError) return 'quota';

  const isBillingError =
    error.includes('Billing') ||
    error.includes('billing') ||
    results.some((r) => r.error?.includes('Billing') || r.error?.includes('billing'));
  if (isBillingError) return 'billing';

  const isRaptError =
    error.includes('invalid_rapt') ||
    error.includes('reauth') ||
    results.some((r) => r.error?.includes('invalid_rapt') || r.error?.includes('reauth'));
  if (isRaptError) return 'rapt';

  const enableUrls = collectApiEnableUrls(error, results);
  if (enableUrls.size > 0) return 'api';

  return 'unknown';
}
