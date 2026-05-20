/**
 * GCP API Error Detection Utilities
 *
 * Browser-safe copies of core detection functions for identifying
 * GCP API-not-enabled errors and extracting enable URLs.
 */

const API_NOT_ENABLED_PATTERNS = [
  'has not been used in project',
  'it is disabled',
  'API has not been enabled',
  'PERMISSION_DENIED',
  'SERVICE_DISABLED',
  'accessNotConfigured',
  'must be enabled',
];

export function isApiNotEnabledError(error: string): boolean {
  return API_NOT_ENABLED_PATTERNS.some((p) => error.includes(p));
}

export function extractApiName(errorOrUrl: string): string | null {
  const urlMatch = errorOrUrl.match(/api\/([a-z0-9.-]+\.googleapis\.com)/);
  if (urlMatch) return urlMatch[1]!;
  const patterns = [
    /API \[([a-z0-9.-]+\.googleapis\.com)\]/,
    /service\s+"([a-z0-9.-]+\.googleapis\.com)"/,
    /([a-z0-9]+\.googleapis\.com)\s+/,
  ];
  for (const re of patterns) {
    const m = errorOrUrl.match(re);
    if (m) return m[1]!;
  }
  return null;
}

export function extractApiEnableUrl(error: string): string | null {
  const urlPattern = /https:\/\/console\.cloud\.google\.com\/apis\/[^\s"')]+/;
  const m = error.match(urlPattern);
  if (m) return m[0]!;
  const apiName = extractApiName(error);
  if (apiName) return buildApiEnableUrl(apiName);
  return null;
}

export function buildApiEnableUrl(apiName: string, project?: string): string {
  const base = `https://console.cloud.google.com/apis/api/${apiName}/overview`;
  return project ? `${base}?project=${project}` : base;
}
