/**
 * Tests for `lexer-heredoc.ts` (rf-lex-3) — HIGHEST-RISK UNIT.
 *
 * Pins behaviour preserved from the pre-extraction `Lexer.scan_heredoc`
 * method. Four blueprint risks are pinned with their own test cases:
 *
 *   RISK #7 — Terminator backtrack to `check_start`, NOT `line_start`.
 *             When a candidate terminator line fails the match check,
 *             `s.pos` is reset to AFTER the indentation whitespace,
 *             and that whitespace is then re-scanned as content by
 *             the "read until end of line" loop. Observable in the
 *             raw slice but matches pre-extraction behaviour.
 *
 *   RISK #8 — `content_end = line_start` then `trimEnd()`. Content
 *             boundary is set BEFORE leading-whitespace consumption,
 *             so it includes the trailing newline + leading indent
 *             of the line preceding the terminator. The trim at the
 *             end strips this in one shot.
 *
 *   RISK #9 — EOF without a closing delimiter is silent. No
 *             `ls_add_error` fires; the token still emits with an
 *             empty literal.
 *
 *   RISK #10 — Two newline accounting sites — opening line +
 *              content lines. Both `ls_advance(s); s.line++; s.column = 1`.
 *
 * Tests use the full `Lexer.tokenize` path because heredoc behaviour
 * is most visible at the integration level — the standalone scanner
 * relies on the dispatch site having consumed the leading `<<` first.
 */
import { describe, it, expect } from 'vitest';
import { Lexer, tokenize } from '../lexer.js';
import { make_lexer_state } from '../lexer-state.js';
import { scan_heredoc } from '../lexer-heredoc.js';

describe('scan_heredoc — basic', () => {
  it('plain heredoc emits STRING with literal=content', () => {
    const result = tokenize('<<EOT\nhello\nEOT\n');
    expect(result.errors).toHaveLength(0);
    const string_tokens = result.tokens.filter((t) => t.type === 'STRING');
    expect(string_tokens).toHaveLength(1);
    expect(string_tokens[0]?.literal).toBe('hello');
  });

  it('multi-line heredoc preserves internal newlines (then trims trailing)', () => {
    const result = tokenize('<<EOT\nline1\nline2\nEOT\n');
    expect(result.errors).toHaveLength(0);
    const string_tokens = result.tokens.filter((t) => t.type === 'STRING');
    expect(string_tokens[0]?.literal).toBe('line1\nline2');
  });

  it('heredoc with delimiter using digits/underscores', () => {
    const result = tokenize('<<MY_DELIM_99\ncontent\nMY_DELIM_99\n');
    expect(result.errors).toHaveLength(0);
    const string_tokens = result.tokens.filter((t) => t.type === 'STRING');
    expect(string_tokens[0]?.literal).toBe('content');
  });

  it('heredoc with empty delimiter errors', () => {
    // `<<\n` — no delimiter chars; the scanner reads zero chars and
    // fires the empty-delimiter error.
    const result = tokenize('<<\nfoo\n');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message === 'Expected heredoc delimiter')).toBe(true);
  });
});

describe('scan_heredoc — indented mode', () => {
  it('indented heredoc strips terminator indent during match', () => {
    const result = tokenize('<<-EOT\n  line1\n  line2\n  EOT\n');
    expect(result.errors).toHaveLength(0);
    const string_tokens = result.tokens.filter((t) => t.type === 'STRING');
    // Note: indented mode only allows the terminator to have leading
    // whitespace; content lines retain their indentation in the
    // literal. The trailing trimEnd strips the post-content newline +
    // indent before the terminator.
    expect(string_tokens[0]?.literal).toBe('  line1\n  line2');
  });

  it(
    'RISK #7 — content line that looks LIKE the terminator but has ' +
      'extra chars backtracks to check_start (not line_start)',
    () => {
      // Content line "  EOTbar" starts with two spaces (indent),
      // matches "EOT" then has "bar". The match-check fails because
      // the next char is 'b', not '\n'. The backtrack resets to
      // check_start (after the two-space indent), and the line is
      // re-read from "EOTbar" onwards as content.
      //
      // Note on what's observable: content_start is set BEFORE the
      // first iteration of the line-loop, so the content slice
      // already covers "  EOTbar\n". The backtrack-to-check_start
      // contract is therefore about CURSOR POSITION (we don't
      // double-consume the indent on the trailing read), not about
      // content offsets. The literal preserves the original line as
      // it appeared in the source, leading whitespace and all.
      // RISK #7 is preserved because the read-until-end-of-line
      // loop walks from check_start (NOT line_start) — if it walked
      // from line_start we'd consume "  EOTbar" twice and end up
      // pointing into the next line, breaking the terminator match
      // on the line after.
      const result = tokenize('<<-EOT\n  EOTbar\n  EOT\n');
      expect(result.errors).toHaveLength(0);
      const string_tokens = result.tokens.filter((t) => t.type === 'STRING');
      expect(string_tokens[0]?.literal).toBe('  EOTbar');
      // The terminator on the next line WAS recognized — that's
      // what the backtrack contract enforces. If the backtrack
      // was wrong (e.g. to line_start), we'd end up scanning past
      // the terminator and either erroring or producing a
      // malformed token.
      expect(string_tokens).toHaveLength(1);
    },
  );
});

describe('scan_heredoc — RISK pins', () => {
  it(
    'RISK #8 — content_end = line_start before whitespace consumed; ' +
      'trimEnd strips trailing newline + indent',
    () => {
      // For "<<EOT\nABC\nEOT\n" the content slice runs from after
      // the opening newline through the start of the EOT line —
      // i.e. it includes "ABC\n". The trailing trimEnd strips the
      // newline so the literal is "ABC", not "ABC\n".
      const result = tokenize('<<EOT\nABC\nEOT\n');
      expect(result.errors).toHaveLength(0);
      const string_tokens = result.tokens.filter((t) => t.type === 'STRING');
      expect(string_tokens[0]?.literal).toBe('ABC');
      // RAW value carries the full source slice including delimiters.
      expect(string_tokens[0]?.value).toBe('<<EOT\nABC\nEOT');
    },
  );

  it(
    'RISK #9 — EOF without a closing delimiter is SILENT (no error)',
    () => {
      // Heredoc with content but no terminator: the loop walks to
      // EOF and emits the token with an empty literal. NO ERROR.
      const result = tokenize('<<EOT\nlost content');
      // No 'Unterminated heredoc' or similar error.
      expect(result.errors).toHaveLength(0);
      const string_tokens = result.tokens.filter((t) => t.type === 'STRING');
      expect(string_tokens).toHaveLength(1);
      // content_end stays at content_start (initial value), so
      // literal is empty after trimEnd.
      expect(string_tokens[0]?.literal).toBe('');
    },
  );

  it(
    'RISK #10 — opening-line + content-line newlines both bump line counter',
    () => {
      // After "<<EOT\nfoo\nbar\nEOT\n" we should have line == 5
      // (1 for opener line, 2 for "foo", 3 for "bar", 4 for "EOT",
      // 5 for the trailing newline). Verify line tracking by
      // probing the EOF token's position.
      const result = tokenize('<<EOT\nfoo\nbar\nEOT\n');
      expect(result.errors).toHaveLength(0);
      const eof = result.tokens.find((t) => t.type === 'EOF');
      expect(eof?.position.line).toBe(5);
    },
  );

  it('terminator at EOF (no trailing newline) closes correctly', () => {
    // Heredoc that ends with terminator + EOF (no \n after EOT).
    const result = tokenize('<<EOT\nhi\nEOT');
    expect(result.errors).toHaveLength(0);
    const string_tokens = result.tokens.filter((t) => t.type === 'STRING');
    expect(string_tokens[0]?.literal).toBe('hi');
  });
});

describe('scan_heredoc — direct unit (cursor seeded post-dispatch)', () => {
  it('direct call after the dispatch consumes <<', () => {
    // Simulate the dispatch site: outer scan_token consumed `<<`,
    // so cursor sits at index 2 of the source.
    const source = '<<EOT\nhi\nEOT';
    const s = make_lexer_state(source);
    s.pos = 2;
    s.column = 3;
    scan_heredoc(s, 0, 1, 1);
    expect(s.errors).toHaveLength(0);
    expect(s.tokens).toHaveLength(1);
    expect(s.tokens[0]?.type).toBe('STRING');
    expect(s.tokens[0]?.literal).toBe('hi');
  });

  it('direct call with empty delimiter records error', () => {
    const source = '<<';
    const s = make_lexer_state(source);
    s.pos = 2;
    s.column = 3;
    scan_heredoc(s, 0, 1, 1);
    expect(s.errors).toHaveLength(1);
    expect(s.errors[0]?.message).toBe('Expected heredoc delimiter');
  });

  it('integration via Lexer class produces same tokens as standalone call', () => {
    const result = new Lexer('<<EOT\nhello\nEOT').tokenize();
    expect(result.errors).toHaveLength(0);
    expect(result.tokens.map((t) => t.type)).toEqual(['STRING', 'EOF']);
    expect(result.tokens[0]?.literal).toBe('hello');
  });
});
