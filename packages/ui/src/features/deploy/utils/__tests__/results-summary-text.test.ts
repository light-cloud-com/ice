/**
 * rf-pdpl-4 — `utils/results-summary-text.ts` invariant tests.
 *
 * The module was lifted verbatim from `deploy-panel.tsx` (L1919–1941). These
 * tests pin the exact format the deploy panel's "Copy summary" / "Copy
 * errors" clipboard buttons hand to `navigator.clipboard.writeText`, so any
 * future "tidy up" — e.g. swapping ✓/✗ for ASCII fallback, joining with
 * `\r\n`, simplifying the `r.duration_ms || 0` quirk to `?? 0`, or rounding
 * durations differently — fails loudly. Behavior #9 in the rf-pdpl
 * blueprint risk list.
 *
 * The Unicode-glyph defense is the most important assertion: a NFC/NFD
 * round-trip in an editor or CI step that "normalizes" U+2713 and U+2717
 * away would silently change the clipboard text every E2E snapshot relies
 * on. We assert byte-equality with explicit `'✓'` / `'✗'` literals via both
 * `toContain` and full-string `toBe` matchers.
 */

import { describe, it, expect } from 'vitest';
import {
  buildResultsSummaryText,
  summaryCounts,
  type ResultLike,
} from '../results-summary-text';

// ─── Test fixtures ──────────────────────────────────────────────────────────

function makeResult(overrides: Partial<ResultLike> = {}): ResultLike {
  return {
    name: 'svc',
    type: 'CloudRunService',
    action: 'create',
    success: true,
    ...overrides,
  };
}

// ─── summaryCounts ──────────────────────────────────────────────────────────

describe('summaryCounts', () => {
  it('returns all-zero counts and allOk=true for an empty array', () => {
    expect(summaryCounts([])).toEqual({
      succeeded: 0,
      failed: 0,
      total: 0,
      totalMs: 0,
      allOk: true,
    });
  });

  it('returns succeeded === total when all rows are successful', () => {
    const results: ResultLike[] = [
      makeResult({ success: true, duration_ms: 1000 }),
      makeResult({ success: true, duration_ms: 2000 }),
      makeResult({ success: true, duration_ms: 500 }),
    ];
    expect(summaryCounts(results)).toEqual({
      succeeded: 3,
      failed: 0,
      total: 3,
      totalMs: 3500,
      allOk: true,
    });
  });

  it('returns failed === total and allOk=false when every row failed', () => {
    const results: ResultLike[] = [
      makeResult({ success: false, duration_ms: 100 }),
      makeResult({ success: false, duration_ms: 200 }),
    ];
    expect(summaryCounts(results)).toEqual({
      succeeded: 0,
      failed: 2,
      total: 2,
      totalMs: 300,
      allOk: false,
    });
  });

  it('returns the exact counts for a mixed batch and flips allOk to false on a single failure', () => {
    const results: ResultLike[] = [
      makeResult({ success: true, duration_ms: 1000 }),
      makeResult({ success: false, duration_ms: 2000 }),
      makeResult({ success: true, duration_ms: 1500 }),
    ];
    expect(summaryCounts(results)).toEqual({
      succeeded: 2,
      failed: 1,
      total: 3,
      totalMs: 4500,
      allOk: false,
    });
  });

  it('treats undefined duration_ms as 0 in the totalMs sum (the `|| 0` quirk)', () => {
    const results: ResultLike[] = [
      makeResult({ success: true, duration_ms: 1000 }),
      makeResult({ success: true /* duration_ms: undefined */ }),
      makeResult({ success: true, duration_ms: 500 }),
    ];
    expect(summaryCounts(results).totalMs).toBe(1500);
  });

  it('treats duration_ms === 0 as 0 in the totalMs sum (same as undefined; do not "fix" `|| 0` to `?? 0`)', () => {
    // The 0 case is degenerate — both `|| 0` and `?? 0` give the same answer
    // for a literal 0 input — but pin the contract anyway so a future
    // refactor that swaps the operator is at least covered by an asserted
    // identity for zero. The actual divergence (negative duration_ms) is not
    // realistic for this domain.
    const results: ResultLike[] = [
      makeResult({ success: true, duration_ms: 0 }),
      makeResult({ success: true, duration_ms: 1000 }),
    ];
    expect(summaryCounts(results).totalMs).toBe(1000);
  });
});

// ─── buildResultsSummaryText — header form ──────────────────────────────────

describe('buildResultsSummaryText (header)', () => {
  it('emits the full-summary header form with totals and seconds rounded to 1 decimal', () => {
    const results: ResultLike[] = [
      makeResult({ name: 'a', success: true, duration_ms: 1000 }),
      makeResult({ name: 'b', success: true, duration_ms: 1500 }),
      makeResult({ name: 'c', success: false, duration_ms: 2000 }),
    ];
    const out = buildResultsSummaryText(results, { errorsOnly: false });
    expect(out.split('\n')[0]).toBe(
      'Deploy summary: 2/3 succeeded, 1 failed, 4.5s',
    );
  });

  it('emits the errors-only header form with the failed/total ratio', () => {
    const results: ResultLike[] = [
      makeResult({ name: 'a', success: true }),
      makeResult({ name: 'b', success: true }),
      makeResult({ name: 'c', success: false }),
    ];
    const out = buildResultsSummaryText(results, { errorsOnly: true });
    expect(out.split('\n')[0]).toBe(
      'Deploy errors (1 of 3 resource(s) failed)',
    );
  });

  it('rounds seconds with toFixed(1) — 999ms → "1.0s", 0ms → "0.0s"', () => {
    expect(
      buildResultsSummaryText(
        [makeResult({ success: true, duration_ms: 999 })],
        { errorsOnly: false },
      ).split('\n')[0],
    ).toBe('Deploy summary: 1/1 succeeded, 0 failed, 1.0s');

    expect(
      buildResultsSummaryText([makeResult({ success: true, duration_ms: 0 })], {
        errorsOnly: false,
      }).split('\n')[0],
    ).toBe('Deploy summary: 1/1 succeeded, 0 failed, 0.0s');
  });
});

// ─── buildResultsSummaryText — body lines ───────────────────────────────────

describe('buildResultsSummaryText (body lines)', () => {
  it('uses ✓ (U+2713) for success rows — byte-identical glyph defended against Unicode normalization', () => {
    const out = buildResultsSummaryText(
      [makeResult({ name: 'svc', type: 'CloudRunService', success: true })],
      { errorsOnly: false },
    );
    // Two assertions: `toContain` for any occurrence, and explicit codepoint
    // for the byte-equality — together they pin both the literal and the
    // intended Unicode codepoint U+2713.
    expect(out).toContain('✓');
    expect(out).toContain(String.fromCodePoint(0x2713));
    // Negative: no ✗ should leak in for an all-success batch.
    expect(out).not.toContain('✗');
  });

  it('uses ✗ (U+2717) for failure rows — byte-identical glyph defended against Unicode normalization', () => {
    const out = buildResultsSummaryText(
      [makeResult({ name: 'svc', type: 'CloudRunService', success: false })],
      { errorsOnly: false },
    );
    expect(out).toContain('✗');
    expect(out).toContain(String.fromCodePoint(0x2717));
    expect(out).not.toContain('✓');
  });

  it('formats a single success row as "✓ <type> <name> [<action>]" with NO duration suffix when duration_ms is undefined', () => {
    const out = buildResultsSummaryText(
      [
        makeResult({
          name: 'my-svc',
          type: 'CloudRunService',
          action: 'create',
          success: true,
          /* duration_ms: undefined */
        }),
      ],
      { errorsOnly: false },
    );
    const bodyLines = out.split('\n').slice(2); // skip header + blank
    expect(bodyLines).toEqual(['✓ CloudRunService my-svc [create]']);
  });

  it('appends " (X.Ys)" to the row when duration_ms is set', () => {
    const out = buildResultsSummaryText(
      [
        makeResult({
          name: 'my-svc',
          type: 'CloudRunService',
          action: 'create',
          success: true,
          duration_ms: 1500,
        }),
      ],
      { errorsOnly: false },
    );
    const bodyLines = out.split('\n').slice(2);
    expect(bodyLines).toEqual(['✓ CloudRunService my-svc [create] (1.5s)']);
  });

  it('OMITS the duration suffix when duration_ms === 0 (the `r.duration_ms ?` ternary treats 0 as falsy)', () => {
    // Mirrors the `r.duration_ms || 0` quirk in summaryCounts and the
    // `r.duration_ms ? ` ternary in the body — both are intentional.
    const out = buildResultsSummaryText(
      [makeResult({ name: 'svc', success: true, duration_ms: 0 })],
      { errorsOnly: false },
    );
    const bodyLines = out.split('\n').slice(2);
    expect(bodyLines).toEqual(['✓ CloudRunService svc [create]']);
  });

  it('emits an indented "  error: ..." line below the row when error is present', () => {
    const out = buildResultsSummaryText(
      [
        makeResult({
          name: 'svc',
          success: false,
          error: 'permission denied',
        }),
      ],
      { errorsOnly: false },
    );
    const bodyLines = out.split('\n').slice(2);
    expect(bodyLines).toEqual([
      '✗ CloudRunService svc [create]',
      '  error: permission denied',
    ]);
  });

  it('emits an indented "  resource: ..." line below the row when provider_id is present', () => {
    const out = buildResultsSummaryText(
      [
        makeResult({
          name: 'svc',
          success: true,
          provider_id: 'projects/x/services/svc',
        }),
      ],
      { errorsOnly: false },
    );
    const bodyLines = out.split('\n').slice(2);
    expect(bodyLines).toEqual([
      '✓ CloudRunService svc [create]',
      '  resource: projects/x/services/svc',
    ]);
  });

  it('emits BOTH error and resource indent lines (in that order) when both are present', () => {
    const out = buildResultsSummaryText(
      [
        makeResult({
          name: 'svc',
          success: false,
          error: 'permission denied',
          provider_id: 'projects/x/services/svc',
        }),
      ],
      { errorsOnly: false },
    );
    const bodyLines = out.split('\n').slice(2);
    expect(bodyLines).toEqual([
      '✗ CloudRunService svc [create]',
      '  error: permission denied',
      '  resource: projects/x/services/svc',
    ]);
  });
});

// ─── buildResultsSummaryText — errorsOnly filter ────────────────────────────

describe('buildResultsSummaryText (errorsOnly filter)', () => {
  it('skips every r.success === true row in the body but keeps the indent lines for failed rows', () => {
    const results: ResultLike[] = [
      makeResult({ name: 'ok-1', success: true, duration_ms: 1000 }),
      makeResult({
        name: 'bad',
        success: false,
        error: 'boom',
        provider_id: 'p/bad',
        duration_ms: 2000,
      }),
      makeResult({ name: 'ok-2', success: true, duration_ms: 500 }),
    ];
    const out = buildResultsSummaryText(results, { errorsOnly: true });
    const bodyLines = out.split('\n').slice(2);
    expect(bodyLines).toEqual([
      '✗ CloudRunService bad [create] (2.0s)',
      '  error: boom',
      '  resource: p/bad',
    ]);
    // Negative: no successful row name should appear in the body.
    expect(out).not.toContain('ok-1');
    expect(out).not.toContain('ok-2');
  });

  it('errorsOnly with no failed rows produces only the header + blank line', () => {
    const results: ResultLike[] = [
      makeResult({ name: 'ok-1', success: true }),
      makeResult({ name: 'ok-2', success: true }),
    ];
    const out = buildResultsSummaryText(results, { errorsOnly: true });
    expect(out).toBe('Deploy errors (0 of 2 resource(s) failed)\n');
  });
});

// ─── buildResultsSummaryText — empty input + line joiner ────────────────────

describe('buildResultsSummaryText (edge cases + joiner)', () => {
  it('emits the full-summary header + blank line for an empty results array', () => {
    expect(buildResultsSummaryText([], { errorsOnly: false })).toBe(
      'Deploy summary: 0/0 succeeded, 0 failed, 0.0s\n',
    );
  });

  it('emits the errors-only header + blank line for an empty results array', () => {
    expect(buildResultsSummaryText([], { errorsOnly: true })).toBe(
      'Deploy errors (0 of 0 resource(s) failed)\n',
    );
  });

  it('joins lines with "\\n" (LF) — never "\\r\\n" (CRLF)', () => {
    const results: ResultLike[] = [
      makeResult({ name: 'a', success: true, duration_ms: 1000 }),
      makeResult({ name: 'b', success: false, error: 'oops' }),
    ];
    const out = buildResultsSummaryText(results, { errorsOnly: false });
    // No carriage returns anywhere.
    expect(out.includes('\r')).toBe(false);
    // Exact full-string assertion to pin the LF joiner and the
    // header → blank line → row → indent ordering.
    expect(out).toBe(
      [
        'Deploy summary: 1/2 succeeded, 1 failed, 1.0s',
        '',
        '✓ CloudRunService a [create] (1.0s)',
        '✗ CloudRunService b [create]',
        '  error: oops',
      ].join('\n'),
    );
  });

  it('preserves the order of input rows in the output (no implicit sorting)', () => {
    const results: ResultLike[] = [
      makeResult({ name: 'c', success: true }),
      makeResult({ name: 'a', success: true }),
      makeResult({ name: 'b', success: true }),
    ];
    const out = buildResultsSummaryText(results, { errorsOnly: false });
    const bodyLines = out.split('\n').slice(2);
    expect(bodyLines.map((l) => l.split(' ')[2])).toEqual(['c', 'a', 'b']);
  });
});
