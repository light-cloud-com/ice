/** Truncate text with ellipsis */
export function truncate(t: string, n: number) {
  return !t ? '' : t.length <= n ? t : t.slice(0, n) + '\u2026';
}

/** Extract owner/repo from full repo URL */
export function shortRepo(r: string) {
  if (!r) return '';
  const m = r.match(/(?:github|gitlab)\.com\/(.+?)(?:\.git)?$/);
  return m ? m[1] : r.includes('/') && !r.includes('://') ? r : r;
}

/** Extract hostname from URL */
export function shortDomain(d: string) {
  if (!d) return '';
  try {
    if (d.includes('://')) return new URL(d).hostname;
  } catch {
    /* */
  }
  return d;
}

/** Placeholder styling prefix — rendered with lower opacity in the SVG */
const PH = '\u00A0';

export function ph(text: string): string {
  return PH + text;
}

export function isPlaceholder(text: string): boolean {
  return text.startsWith(PH);
}

/** Count items in a list field */
export function listCount(val: unknown): number {
  return Array.isArray(val) ? val.length : 0;
}
