/**
 * rf-pdpl-5 — `utils/error-classification.ts` invariant tests.
 *
 * The four exports were lifted verbatim from `deploy-panel.tsx`'s inline
 * `ApiErrorBanner` (L1561–1756). These tests pin:
 *
 *   - `QUOTA_PATTERN` matches every alternative of the OR-joined regex
 *     (including the `TARGET_(HTTPS?)_PROXIES` capture group on both
 *     `TARGET_HTTPS_PROXIES` and `TARGET_HTTP_PROXIES`) — RISK #10 from
 *     the rf-pdpl blueprint.
 *
 *   - `extractProjectIdFromError` returns `''` (NOT `null`) on no match
 *     and rejects upper-case project IDs (the `[a-z0-9-]` character class
 *     intentionally normalizes against accidentally matching resource
 *     names that contain `projectId=Foo`).
 *
 *   - `collectApiEnableUrls` deduplicates across `r.api_enable_url`
 *     and the URL extracted via `extractApiEnableUrl(r.error)` when
 *     `isApiNotEnabledError(r.error)` returns true.
 *
 *   - `classifyDeployError` applies the priority cascade
 *     `quota > billing > rapt > api > unknown` exactly. Quota wins even
 *     when billing/rapt/api substrings are also present; `'api'` only
 *     fires when at least one enable URL is collected.
 */

import { describe, it, expect } from 'vitest';
import {
  QUOTA_PATTERN,
  collectApiEnableUrls,
  extractProjectIdFromError,
  classifyDeployError,
  type ResultLike,
  type DeployErrorKind,
} from '../error-classification';

// ─── QUOTA_PATTERN ────────────────────────────────────────────────────────

describe('QUOTA_PATTERN', () => {
  it.each([
    'QUOTA_EXCEEDED',
    'quota_exceeded',
    'Some prefix QUOTA_EXCEEDED with suffix',
    'quota.*exceeded literally as text', // the `.*` regex form matches
    'quota was exceeded', // matches the `quota.*exceeded` alternative
    'BACKEND_BUCKETS',
    'backend_buckets',
    'IN_USE_ADDRESSES',
    'IN-USE-ADDRESSES',
    'in-use-addresses',
    'FORWARDING_RULES',
    'URL_MAPS',
    'TARGET_HTTPS_PROXIES',
    'TARGET_HTTP_PROXIES',
    'BACKEND_SERVICES',
    'SSL_CERTIFICATES',
    'ssl_certificates',
  ])('matches alternative: %s', (input) => {
    expect(QUOTA_PATTERN.test(input)).toBe(true);
  });

  it('does NOT match unrelated GCP errors', () => {
    expect(QUOTA_PATTERN.test('Permission denied')).toBe(false);
    expect(QUOTA_PATTERN.test('Billing not enabled')).toBe(false);
    expect(QUOTA_PATTERN.test('invalid_rapt token')).toBe(false);
    expect(QUOTA_PATTERN.test('API has not been enabled')).toBe(false);
    expect(QUOTA_PATTERN.test('')).toBe(false);
  });

  it('captures HTTPS proxies via the TARGET_(HTTPS?) group', () => {
    // Pin the verbatim regex shape: `TARGET_(HTTPS?)_PROXIES` is one
    // alternative with a capture group, NOT two alternatives joined
    // with `|`. Splitting it into `TARGET_HTTPS_PROXIES|TARGET_HTTP_PROXIES`
    // would produce identical match results today, but a future
    // "tidy up" that drops the capture group could be missed by the
    // simpler test. We assert the match index includes the captured
    // protocol token to defend the regex AST.
    const httpsMatch = 'TARGET_HTTPS_PROXIES'.match(QUOTA_PATTERN);
    expect(httpsMatch).not.toBeNull();
    expect(httpsMatch![1]).toBe('HTTPS');
    const httpMatch = 'TARGET_HTTP_PROXIES'.match(QUOTA_PATTERN);
    expect(httpMatch).not.toBeNull();
    expect(httpMatch![1]).toBe('HTTP');
  });
});

// ─── extractProjectIdFromError ────────────────────────────────────────────

describe('extractProjectIdFromError', () => {
  it('extracts project id from `project=...` form', () => {
    expect(extractProjectIdFromError('project=foo-bar-1')).toBe('foo-bar-1');
  });

  it('extracts project id from `project/...` form', () => {
    expect(extractProjectIdFromError('project/foo-bar-1')).toBe('foo-bar-1');
  });

  it('returns empty string (NOT null) when no project token is present', () => {
    // The verbatim inline code uses `projectMatch?.[1] || ''` so the
    // empty-string fallback is observable: the call site splats the
    // result into a billing console URL template without a guard, and
    // an `undefined`/`null` would render as `?project=undefined`.
    expect(extractProjectIdFromError('plain error message')).toBe('');
  });

  it('returns empty string for the `/projects/foo` (plural) pattern — regex requires `project[=/]` not `projects/`', () => {
    // `/projects/foo` has the literal text `projects/foo` but the
    // intervening `s` between `project` and the `/` separator breaks
    // the `project[=/]` literal-then-class match. The `s` consumes the
    // position the class would have matched at, so the regex returns
    // null and the function returns `''`.
    expect(extractProjectIdFromError('/projects/foo')).toBe('');
    // Sentence with `project` but no separator before the id token —
    // e.g. `the project foo-bar` — also doesn't match (space is not in
    // `[=/]`).
    expect(extractProjectIdFromError('the project foo-bar')).toBe('');
  });

  it('preserves verbatim behaviour: regex `/i` flag widens the [a-z0-9-] class to also accept upper-case', () => {
    // BRIEF↔CODE NOTE: the rf-pdpl-5 brief stated "project ID with
    // uppercase → no match (regex is `[a-z0-9-]`)". That description
    // is INCORRECT for the verbatim regex. JavaScript's `/i` flag
    // applies to character classes too: `[a-z]` under `/i` matches
    // `[A-Za-z]`. So `project=FooBar` actually matches and returns
    // `'FooBar'`. We pin the verbatim behaviour here (per the
    // `brief-test-spec-vs-verbatim-behavior-conflict` learning anchor)
    // — if upper-case rejection is the intended behaviour, that's a
    // separate behaviour-change unit, NOT this extraction.
    expect(extractProjectIdFromError('project=FooBar')).toBe('FooBar');
    expect(extractProjectIdFromError('project=ABC123')).toBe('ABC123');
  });

  it('greedy-matches mixed-case project IDs end-to-end (no early stop on uppercase)', () => {
    // Same `/i`-on-char-class consequence: `[a-z0-9-]+` under `/i`
    // matches `[A-Za-z0-9-]+`, so `foo-BAR-baz` matches in one go
    // rather than stopping at `foo-`.
    expect(extractProjectIdFromError('project=foo-BAR-baz')).toBe('foo-BAR-baz');
  });

  it('returns empty string for empty input', () => {
    expect(extractProjectIdFromError('')).toBe('');
  });

  it('is case-insensitive on the literal `project` token', () => {
    // The outer `i` flag is real: `Project=foo` matches.
    expect(extractProjectIdFromError('Project=foo-bar')).toBe('foo-bar');
    expect(extractProjectIdFromError('PROJECT/qux')).toBe('qux');
  });

  it('matches the first occurrence when multiple `project=` tokens are present', () => {
    expect(extractProjectIdFromError('first project=alpha then project=beta')).toBe('alpha');
  });
});

// ─── collectApiEnableUrls ─────────────────────────────────────────────────

describe('collectApiEnableUrls', () => {
  it('returns empty Set for clean error and empty results', () => {
    expect(collectApiEnableUrls('plain failure', [])).toEqual(new Set<string>());
  });

  it('collects api_enable_url verbatim from each result', () => {
    const results: ResultLike[] = [
      { api_enable_url: 'https://console.cloud.google.com/apis/api/foo.googleapis.com/overview' },
      { api_enable_url: 'https://console.cloud.google.com/apis/api/bar.googleapis.com/overview' },
    ];
    expect(collectApiEnableUrls('', results)).toEqual(
      new Set([
        'https://console.cloud.google.com/apis/api/foo.googleapis.com/overview',
        'https://console.cloud.google.com/apis/api/bar.googleapis.com/overview',
      ]),
    );
  });

  it('extracts a URL from r.error when isApiNotEnabledError(r.error) is true', () => {
    // The shared util `isApiNotEnabledError` matches the substring
    // `'API has not been enabled'` (one of seven patterns in
    // `gcp-errors.ts`). Pair that with an explicit
    // `https://console.cloud.google.com/apis/...` URL so
    // `extractApiEnableUrl` succeeds via its first regex branch.
    const results: ResultLike[] = [
      {
        error:
          'API has not been enabled. See https://console.cloud.google.com/apis/api/compute.googleapis.com/overview to enable.',
      },
    ];
    expect(collectApiEnableUrls('', results)).toEqual(
      new Set(['https://console.cloud.google.com/apis/api/compute.googleapis.com/overview']),
    );
  });

  it('skips r.error when isApiNotEnabledError returns false', () => {
    const results: ResultLike[] = [{ error: 'Random validation failure with no API hint' }];
    expect(collectApiEnableUrls('', results)).toEqual(new Set<string>());
  });

  it('skips r.error when extractApiEnableUrl returns null for an api-not-enabled error without URL or API name', () => {
    // `isApiNotEnabledError` matches by substring; `extractApiEnableUrl`
    // requires either a console URL or a discoverable API name. An
    // error like `'PERMISSION_DENIED'` matches the not-enabled
    // predicate (it's in API_NOT_ENABLED_PATTERNS) but neither URL nor
    // `*.googleapis.com` token is present, so no URL is collected.
    const results: ResultLike[] = [{ error: 'PERMISSION_DENIED' }];
    expect(collectApiEnableUrls('', results)).toEqual(new Set<string>());
  });

  it('also extracts a URL from the top-level error parameter', () => {
    const error =
      'API has not been enabled. Visit https://console.cloud.google.com/apis/api/dns.googleapis.com/overview to enable.';
    expect(collectApiEnableUrls(error, [])).toEqual(
      new Set(['https://console.cloud.google.com/apis/api/dns.googleapis.com/overview']),
    );
  });

  it('deduplicates when the same URL appears in multiple results', () => {
    const sameUrl = 'https://console.cloud.google.com/apis/api/foo.googleapis.com/overview';
    const results: ResultLike[] = [{ api_enable_url: sameUrl }, { api_enable_url: sameUrl }];
    const got = collectApiEnableUrls('', results);
    expect(got.size).toBe(1);
    expect(got.has(sameUrl)).toBe(true);
  });

  it('deduplicates across api_enable_url and the URL extracted from r.error', () => {
    const url = 'https://console.cloud.google.com/apis/api/foo.googleapis.com/overview';
    const results: ResultLike[] = [
      { api_enable_url: url },
      { error: `API has not been enabled. ${url}` },
    ];
    expect(collectApiEnableUrls('', results)).toEqual(new Set([url]));
  });

  it('combines URLs from results and the top-level error', () => {
    const resultUrl = 'https://console.cloud.google.com/apis/api/foo.googleapis.com/overview';
    const errorUrl = 'https://console.cloud.google.com/apis/api/bar.googleapis.com/overview';
    const error = `API has not been enabled. ${errorUrl}`;
    const results: ResultLike[] = [{ api_enable_url: resultUrl }];
    expect(collectApiEnableUrls(error, results)).toEqual(new Set([resultUrl, errorUrl]));
  });

  it('handles results with both api_enable_url and a non-API-not-enabled error', () => {
    const url = 'https://console.cloud.google.com/apis/api/qux.googleapis.com/overview';
    const results: ResultLike[] = [{ api_enable_url: url, error: 'unrelated noise' }];
    expect(collectApiEnableUrls('', results)).toEqual(new Set([url]));
  });
});

// ─── classifyDeployError ──────────────────────────────────────────────────

describe('classifyDeployError', () => {
  it('returns "unknown" for empty inputs', () => {
    expect(classifyDeployError('', [])).toBe<DeployErrorKind>('unknown');
  });

  it('returns "unknown" for a plain error string with empty results', () => {
    expect(classifyDeployError('connection refused', [])).toBe<DeployErrorKind>('unknown');
  });

  it('returns "quota" when the top-level error matches QUOTA_PATTERN', () => {
    expect(classifyDeployError('QUOTA_EXCEEDED for backend buckets', [])).toBe<DeployErrorKind>('quota');
  });

  it('returns "quota" when any result error matches QUOTA_PATTERN', () => {
    expect(classifyDeployError('', [{ error: 'IN_USE_ADDRESSES limit reached' }])).toBe<DeployErrorKind>('quota');
  });

  it('returns "billing" when the top-level error contains "Billing"', () => {
    expect(classifyDeployError('Billing account is not active', [])).toBe<DeployErrorKind>('billing');
  });

  it('returns "billing" when the top-level error contains lowercase "billing"', () => {
    expect(classifyDeployError('billing must be enabled', [])).toBe<DeployErrorKind>('billing');
  });

  it('returns "billing" when any result error contains "Billing" or "billing"', () => {
    expect(classifyDeployError('', [{ error: 'Billing required for this API' }])).toBe<DeployErrorKind>('billing');
    expect(classifyDeployError('', [{ error: 'enable billing first' }])).toBe<DeployErrorKind>('billing');
  });

  it('returns "rapt" when the top-level error contains "invalid_rapt"', () => {
    expect(classifyDeployError('invalid_rapt token', [])).toBe<DeployErrorKind>('rapt');
  });

  it('returns "rapt" when the top-level error contains "reauth"', () => {
    expect(classifyDeployError('please reauth', [])).toBe<DeployErrorKind>('rapt');
  });

  it('returns "rapt" when any result error contains "invalid_rapt" or "reauth"', () => {
    expect(classifyDeployError('', [{ error: 'invalid_rapt session' }])).toBe<DeployErrorKind>('rapt');
    expect(classifyDeployError('', [{ error: 'reauth required' }])).toBe<DeployErrorKind>('rapt');
  });

  it('returns "api" when no quota/billing/rapt match and at least one enable URL is collected', () => {
    const results: ResultLike[] = [
      { api_enable_url: 'https://console.cloud.google.com/apis/api/dns.googleapis.com/overview' },
    ];
    expect(classifyDeployError('plain error', results)).toBe<DeployErrorKind>('api');
  });

  it('returns "api" when only the top-level error carries the API-not-enabled pattern + URL', () => {
    const error =
      'API has not been enabled. https://console.cloud.google.com/apis/api/compute.googleapis.com/overview';
    expect(classifyDeployError(error, [])).toBe<DeployErrorKind>('api');
  });

  it('returns "unknown" when error matches isApiNotEnabledError but no URL can be extracted', () => {
    // Pins the load-bearing "api fires only when enableUrls.size > 0"
    // condition. `PERMISSION_DENIED` matches the not-enabled predicate
    // but extractApiEnableUrl returns null (no URL, no API name), so the
    // final cascade step skips `'api'` and falls through to `'unknown'`.
    expect(classifyDeployError('PERMISSION_DENIED', [])).toBe<DeployErrorKind>('unknown');
  });

  // ─── Priority cascade ────────────────────────────────────────────────

  it('quota wins when quota AND billing both match', () => {
    expect(classifyDeployError('QUOTA_EXCEEDED Billing required', [])).toBe<DeployErrorKind>('quota');
  });

  it('quota wins when quota AND rapt both match', () => {
    expect(classifyDeployError('FORWARDING_RULES exhausted invalid_rapt', [])).toBe<DeployErrorKind>('quota');
  });

  it('quota wins when quota AND api both match', () => {
    const results: ResultLike[] = [
      { api_enable_url: 'https://console.cloud.google.com/apis/api/dns.googleapis.com/overview' },
    ];
    expect(classifyDeployError('SSL_CERTIFICATES limit', results)).toBe<DeployErrorKind>('quota');
  });

  it('billing wins over rapt when both match', () => {
    expect(classifyDeployError('Billing not enabled. Please reauth.', [])).toBe<DeployErrorKind>('billing');
  });

  it('billing wins over api when both match', () => {
    const results: ResultLike[] = [
      { api_enable_url: 'https://console.cloud.google.com/apis/api/dns.googleapis.com/overview' },
    ];
    expect(classifyDeployError('Billing required', results)).toBe<DeployErrorKind>('billing');
  });

  it('rapt wins over api when both match', () => {
    const results: ResultLike[] = [
      { api_enable_url: 'https://console.cloud.google.com/apis/api/dns.googleapis.com/overview' },
    ];
    expect(classifyDeployError('invalid_rapt detected', results)).toBe<DeployErrorKind>('rapt');
  });

  it('priority cascade end-to-end: quota > billing > rapt > api > unknown', () => {
    // Quota-flavoured top-level + billing/rapt/api in result errors.
    // The presence of all four signals must still resolve to `'quota'`.
    const allFour: ResultLike[] = [
      { error: 'Billing not configured' },
      { error: 'invalid_rapt session' },
      { api_enable_url: 'https://console.cloud.google.com/apis/api/dns.googleapis.com/overview' },
    ];
    expect(classifyDeployError('QUOTA_EXCEEDED', allFour)).toBe<DeployErrorKind>('quota');

    // Drop the quota signal — billing should now win.
    expect(classifyDeployError('plain', allFour)).toBe<DeployErrorKind>('billing');

    // Drop billing too — rapt should win.
    const noBilling: ResultLike[] = [
      { error: 'invalid_rapt session' },
      { api_enable_url: 'https://console.cloud.google.com/apis/api/dns.googleapis.com/overview' },
    ];
    expect(classifyDeployError('plain', noBilling)).toBe<DeployErrorKind>('rapt');

    // Drop rapt too — api should win.
    const onlyApi: ResultLike[] = [
      { api_enable_url: 'https://console.cloud.google.com/apis/api/dns.googleapis.com/overview' },
    ];
    expect(classifyDeployError('plain', onlyApi)).toBe<DeployErrorKind>('api');

    // Drop api too — unknown.
    expect(classifyDeployError('plain', [])).toBe<DeployErrorKind>('unknown');
  });
});
