/**
 * Cloud Logging Entry → ICE LogEntry mapping + error classification.
 *
 * Extracted from `log-stream.service.ts` (rf-lstream-3). Pure functions:
 * no I/O, no SDK calls, no module state. Both polling and tail call
 * `mapEntry` once per raw SDK Entry; both also call `isPermissionDenied`
 * to differentiate fatal (permission-denied) from recoverable errors.
 *
 * `probeErrorMessage` is a thin formatter for the `err.message` field
 * the SDK sometimes leaves undefined — kept as a named export so tests
 * can assert on a stable string when an error has no message.
 */

import type { LogEntry } from './types.js';

/**
 * Convert a raw SDK Entry (from `getEntries` or `tailEntries`) to the
 * ICE-shaped `LogEntry`. Returns null when the entry is missing the
 * fields we treat as required (timestamp + insertId).
 *
 * The SDK's Entry type has `metadata` for envelope fields and `data`
 * for payload. Both are populated for entries returned from `getEntries`
 * and `tailEntries` (Entry.fromApiResponse_).
 */
export function mapEntry(entry: any): LogEntry | null {
  if (!entry) return null;
  const meta = entry.metadata ?? {};
  const tsRaw = meta.timestamp ?? entry.timestamp;
  const ts = normalizeTimestamp(tsRaw);
  if (!ts) return null;
  const insertId = String(meta.insertId ?? entry.insertId ?? '');
  if (!insertId) return null;
  const severity = String(meta.severity ?? entry.severity ?? 'INFO').toLowerCase();
  const level = mapLevel(severity);

  const data = entry.data;
  let message: string;
  if (typeof data === 'string') {
    message = data;
  } else if (data == null) {
    message = '';
  } else {
    try {
      message = JSON.stringify(data);
    } catch {
      message = String(data);
    }
  }

  const resourceMeta = meta.resource ?? entry.resource ?? {};
  const resource = {
    type: String(resourceMeta.type ?? ''),
    labels: (resourceMeta.labels ?? {}) as Record<string, string>,
  };

  return { ts, level, message, resource, insertId };
}

/**
 * Normalize the SDK's severity string into the ICE LogEntry level union.
 * Anything unrecognized falls back to `'info'` so a stray severity from
 * a future GCP rev doesn't drop the entry.
 */
export function mapLevel(severity: string): LogEntry['level'] {
  switch (severity) {
    case 'debug':
      return 'debug';
    case 'info':
      return 'info';
    case 'notice':
      return 'notice';
    case 'warning':
    case 'warn':
      return 'warn';
    case 'error':
    case 'critical':
    case 'alert':
    case 'emergency':
      return 'error';
    default:
      return 'info';
  }
}

/**
 * Coerce SDK timestamp shapes (string ISO, Date, protobuf {seconds, nanos})
 * into an ISO 8601 string. Returns null for missing/unrecognized shapes;
 * mapEntry treats null as "drop this entry".
 */
export function normalizeTimestamp(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === 'string') return raw;
  if (raw instanceof Date) return raw.toISOString();
  // Protobuf Timestamp shape — { seconds, nanos }.
  if (typeof raw === 'object' && raw !== null && 'seconds' in (raw as any)) {
    const seconds = Number((raw as any).seconds ?? 0);
    const nanos = Number((raw as any).nanos ?? 0);
    return new Date(seconds * 1000 + nanos / 1e6).toISOString();
  }
  return null;
}

/**
 * Classify an SDK error as "permission-denied" so the caller can flip
 * resolution state to permission-denied + tear down vs. retry. The SDK
 * surfaces the gRPC code on `err.code` (numeric 7) or sometimes as
 * `'PERMISSION_DENIED'` on `err.code` / `err.status`. We also fall back
 * to a substring match on `err.message` because the SDK has historically
 * been inconsistent about which envelope it picks.
 */
export function isPermissionDenied(err: any): boolean {
  if (!err) return false;
  // gRPC code 7 = PERMISSION_DENIED. The SDK surfaces it on err.code
  // (numeric) and sometimes err.status === 'PERMISSION_DENIED'.
  if (err.code === 7) return true;
  if (typeof err.code === 'string' && err.code.toUpperCase() === 'PERMISSION_DENIED') return true;
  if (err.status && String(err.status).toUpperCase() === 'PERMISSION_DENIED') return true;
  const msg = String(err.message ?? '').toLowerCase();
  if (msg.includes('permission_denied') || msg.includes('permission denied')) return true;
  return false;
}

/**
 * Stable error-message extraction. The SDK may surface errors as
 * `Error` instances with a useful `.message`, or as bare objects/strings.
 * The fallback "Unknown Cloud Logging error." is what shows up in the
 * client toast when a probe error has no message — kept as a named
 * constant rather than an inlined string so tests can assert it.
 */
export function probeErrorMessage(err: any): string {
  if (!err) return 'Unknown Cloud Logging error.';
  return err.message ?? String(err);
}
