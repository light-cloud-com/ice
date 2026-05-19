/**
 * Name and value sanitization helpers for the card-to-graph translator.
 *
 * Pure string transformers shared by the orchestrator and extractor modules.
 * No external dependencies; safe to import from any layer of the deploy stack.
 */

/**
 * Sanitize a name to be a valid GCP resource name.
 * GCP names: lowercase letters, digits, hyphens. Max 63 chars.
 */
export function sanitize_name(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63);
}

/**
 * Sanitize a value for use as a GCP resource label.
 * GCP label values: lowercase letters, digits, underscores, hyphens. Max 63.
 * Empty strings are not valid label values — fall back to a placeholder.
 */
export function sanitize_label_value(value: string | undefined | null): string {
  if (!value) return 'unknown';
  const cleaned = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63);
  return cleaned || 'unknown';
}

/**
 * Parse a storage size string like "50 GB" to a number of GB.
 */
export function parse_storage_gb(storage?: string): number | undefined {
  if (!storage) return undefined;
  const match = storage.match(/(\d+)\s*(GB|TB|MB)/i);
  if (!match || !match[1] || !match[2]) return undefined;
  const value = parseInt(match[1], 10);
  const unit = match[2].toUpperCase();
  if (unit === 'TB') return value * 1024;
  if (unit === 'MB') return Math.max(1, Math.round(value / 1024));
  return value;
}

/**
 * Normalize a runtime string like "Node.js 20" → "nodejs20".
 */
export function normalize_runtime(runtime?: string): string | undefined {
  if (!runtime) return undefined;
  const lower = runtime.toLowerCase();
  if (lower.includes('node')) {
    const ver = lower.match(/(\d+)/)?.[1] ?? '20';
    return `nodejs${ver}`;
  }
  if (lower.includes('python')) {
    const ver = lower.match(/(\d+\.?\d*)/)?.[1] ?? '3.12';
    return `python${ver.replace('.', '')}`;
  }
  if (lower.includes('go')) {
    const ver = lower.match(/(\d+\.?\d*)/)?.[1] ?? '1.21';
    return `go${ver.replace('.', '')}`;
  }
  if (lower.includes('java')) {
    const ver = lower.match(/(\d+)/)?.[1] ?? '17';
    return `java${ver}`;
  }
  return runtime.toLowerCase().replace(/[^a-z0-9]/g, '');
}
