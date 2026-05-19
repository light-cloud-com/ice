/**
 * Plain-text summary builder for the deploy-panel "Copy summary" / "Copy
 * errors" clipboard buttons.
 *
 * Lifted verbatim from `deploy-panel.tsx` (rf-pdpl-4, L1919–1941). Both
 * helpers below preserve the exact format strings, ordering, and Unicode
 * glyphs the original closure produced — `ResultsSummary` calls
 * `buildResultsSummaryText` from a clipboard-copy callback, and the textual
 * shape of that clipboard payload is observable by anyone pasting it into a
 * bug report (or by E2E snapshot tests that assert on clipboard contents).
 *
 * RISK #9 from the rf-pdpl blueprint: the ✓ (U+2713) and ✗ (U+2717) glyphs
 * MUST stay byte-identical. A tidy-up that replaces them with ASCII fallback
 * (`[OK]` / `[FAIL]`), reorders the per-line fields, switches the join from
 * `\n` to `\r\n`, or rounds durations differently is NOT semantics-preserving.
 *
 * The accompanying invariant tests assert each of those constraints by
 * literal-matching the output string, including a `toContain('✓')` /
 * `toContain('✗')` pair that defends against editor- or CI-side Unicode
 * normalization (NFC/NFD round-trip) silently mangling the source.
 */

/**
 * Row-shape consumed by both helpers. Matches the inline prop shape used by
 * `ResultsSummary` in deploy-panel.tsx — `action` is widened to `string`
 * (rather than the narrower `'create' | 'update' | 'delete'` literal union of
 * `DeployResourceResult` from the deploy-slice) because the inline JSX-level
 * prop signature accepts any string. Keeping the wider type here means the
 * call site at `ResultsSummary` does not need a cast or narrowing helper.
 *
 * Subset of `DeployResourceResult` fields plus the same widened `action`. If
 * a future field is read by the body of `buildResultsSummaryText`, add it
 * here AND to the inline prop type — the two shapes drift in lockstep.
 */
export type ResultLike = {
  name: string;
  type: string;
  action: string;
  success: boolean;
  error?: string;
  api_enable_url?: string;
  provider_id?: string;
  outputs?: Record<string, unknown>;
  duration_ms?: number;
};

/**
 * Single-pass count summary over a results array. Computes the four header
 * inputs `buildResultsSummaryText` needs (succeeded / failed / total / total
 * duration in ms) plus the boolean derived flag `allOk` (failed === 0).
 *
 * Verbatim semantics from the source consts: two filters and one reduce. Not
 * collapsed into a single reducer because (a) the original code paid for the
 * extra passes and any downstream test may depend on iteration count not
 * changing, and (b) the `allOk` flag is computed from `failed`, not from a
 * separate scan, so the source has exactly three list passes and we keep it
 * that way.
 *
 * The `r.duration_ms || 0` quirk in the reducer means a deliberate
 * `duration_ms === 0` row contributes 0 (falsy short-circuit) — same as a
 * missing `duration_ms` field. The original behavior; do not "fix" by
 * switching to `?? 0`.
 */
export function summaryCounts(results: ResultLike[]): {
  succeeded: number;
  failed: number;
  total: number;
  totalMs: number;
  allOk: boolean;
} {
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalMs = results.reduce((acc, r) => acc + (r.duration_ms || 0), 0);
  const allOk = failed === 0;
  return { succeeded, failed, total: results.length, totalMs, allOk };
}

/**
 * Builds the plain-text summary string a user sees pasted from the deploy
 * panel's "Copy summary" / "Copy errors" buttons.
 *
 * Output shape:
 *
 * ```
 * Deploy summary: 2/3 succeeded, 1 failed, 4.5s
 *
 * ✓ CloudRunService my-svc [create] (2.0s)
 * ✓ CustomDomain example.com [create] (1.5s)
 * ✗ Bucket my-bucket [create] (1.0s)
 *   error: permission denied
 *   resource: projects/x/buckets/my-bucket
 * ```
 *
 * `errorsOnly: true` swaps the header to the `Deploy errors (N of M
 * resource(s) failed)` form and skips every successful row in the body —
 * but indented `error:` / `resource:` follow-up lines for failed rows are
 * still emitted.
 *
 * Format details preserved verbatim:
 * - ✓ for success, ✗ for failure (Unicode U+2713 / U+2717).
 * - Per-line: `<flag> <type> <name> [<action>]<duration>` (single space sep).
 * - Duration suffix: ` (X.Ys)` ONLY when `duration_ms` is truthy; the
 *   `r.duration_ms ? ... : ''` ternary drops the suffix for both undefined
 *   AND `=== 0` (matching the source's `||` reducer quirk).
 * - Indent: two spaces before `error:` / `resource:`.
 * - Lines joined by `\n`. The blank second line (after the header) is a
 *   literal `''` push, not a `\n\n` joiner trick.
 * - Header uses `(totalMs / 1000).toFixed(1)` — integer ms / 1000 → 1-decimal
 *   seconds (so 4500 → "4.5s", 999 → "1.0s", 0 → "0.0s").
 */
export function buildResultsSummaryText(results: ResultLike[], options: { errorsOnly: boolean }): string {
  const { errorsOnly } = options;
  const { succeeded, failed, total, totalMs } = summaryCounts(results);
  const header = errorsOnly
    ? `Deploy errors (${failed} of ${total} resource(s) failed)`
    : `Deploy summary: ${succeeded}/${total} succeeded, ${failed} failed, ${(totalMs / 1000).toFixed(1)}s`;
  const lines: string[] = [header, ''];
  for (const r of results) {
    if (errorsOnly && r.success) continue;
    const flag = r.success ? '✓' : '✗';
    const dur = r.duration_ms ? ` (${(r.duration_ms / 1000).toFixed(1)}s)` : '';
    lines.push(`${flag} ${r.type} ${r.name} [${r.action}]${dur}`);
    if (r.error) lines.push(`  error: ${r.error}`);
    if (r.provider_id) lines.push(`  resource: ${r.provider_id}`);
  }
  return lines.join('\n');
}
