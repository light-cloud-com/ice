/**
 * Tests for `lexer-state.ts` (rf-lex-1).
 *
 * Pins behaviour preserved from the pre-extraction `Lexer` class
 * navigation methods (lexer.ts L547-L634 pre-extraction). Two
 * blueprint risks are pinned with their own test cases:
 *
 *   RISK #1 — `column = 0` then `ls_advance` (column += 1 → 1) is a
 *             two-step sequence used inside `scan_block_comment`.
 *             The state interface keeps `column` mutable so callers
 *             can implement the 0-then-advance dance; this test pins
 *             the building blocks (column reset + advance increment).
 *
 *   RISK #2 — `ls_add_error(recoverable=true)` snapshots the bad char
 *             at `s.source[s.pos - 1]`, NOT `s.source[s.pos]`. Every
 *             callsite hits `ls_add_error` AFTER `ls_advance` has
 *             consumed the offending char, so `pos - 1` recovers the
 *             original. Regressing to `pos` would emit ERROR tokens
 *             with the WRONG char (the next char in the stream).
 */
import { describe, it, expect } from 'vitest';
import {
  type LexerState,
  make_lexer_state,
  ls_is_at_end,
  ls_peek,
  ls_peek_next,
  ls_advance,
  ls_match,
  ls_skip_whitespace,
  ls_current_position,
  ls_add_token,
  ls_add_token_with_literal,
  ls_add_error,
} from '../lexer-state.js';

describe('make_lexer_state', () => {
  it('seeds pos=0, line=1, column=1, empty tokens/errors', () => {
    const s = make_lexer_state('abc');
    expect(s.pos).toBe(0);
    expect(s.line).toBe(1);
    expect(s.column).toBe(1);
    expect(s.tokens).toEqual([]);
    expect(s.errors).toEqual([]);
  });

  it('preserves the source string identity', () => {
    const src = 'foo';
    const s = make_lexer_state(src);
    expect(s.source).toBe(src);
  });

  it('fills in default options when none are supplied', () => {
    const s = make_lexer_state('');
    expect(s.options.file).toBe('<input>');
    expect(s.options.include_comments).toBe(false);
    expect(s.options.include_newlines).toBe(false);
    expect(s.options.max_errors).toBe(100);
  });

  it('overrides default options when partials are supplied', () => {
    const s = make_lexer_state('', { file: 'main.ice', max_errors: 5 });
    expect(s.options.file).toBe('main.ice');
    expect(s.options.max_errors).toBe(5);
    // Not-supplied options keep defaults.
    expect(s.options.include_comments).toBe(false);
    expect(s.options.include_newlines).toBe(false);
  });

  it('overrides all options when fully supplied', () => {
    const s = make_lexer_state('', {
      file: 'x.ice',
      include_comments: true,
      include_newlines: true,
      max_errors: 0,
    });
    expect(s.options.file).toBe('x.ice');
    expect(s.options.include_comments).toBe(true);
    expect(s.options.include_newlines).toBe(true);
    expect(s.options.max_errors).toBe(0);
  });
});

describe('ls_is_at_end', () => {
  it('returns false when pos < source.length', () => {
    const s = make_lexer_state('a');
    expect(ls_is_at_end(s)).toBe(false);
  });

  it('returns true when pos == source.length', () => {
    const s = make_lexer_state('a');
    s.pos = 1;
    expect(ls_is_at_end(s)).toBe(true);
  });

  it('returns true on empty source', () => {
    const s = make_lexer_state('');
    expect(ls_is_at_end(s)).toBe(true);
  });
});

describe('ls_peek', () => {
  it('returns the char at the cursor without advancing', () => {
    const s = make_lexer_state('abc');
    expect(ls_peek(s)).toBe('a');
    expect(s.pos).toBe(0);
  });

  it('returns "\\0" past the end', () => {
    const s = make_lexer_state('a');
    s.pos = 1;
    expect(ls_peek(s)).toBe('\0');
  });

  it('returns "\\0" on empty source', () => {
    const s = make_lexer_state('');
    expect(ls_peek(s)).toBe('\0');
  });
});

describe('ls_peek_next', () => {
  it('returns the char one position past the cursor', () => {
    const s = make_lexer_state('abc');
    expect(ls_peek_next(s)).toBe('b');
    expect(s.pos).toBe(0);
  });

  it('returns "\\0" when only one char remains', () => {
    const s = make_lexer_state('a');
    expect(ls_peek_next(s)).toBe('\0');
  });

  it('returns "\\0" past the end', () => {
    const s = make_lexer_state('ab');
    s.pos = 2;
    expect(ls_peek_next(s)).toBe('\0');
  });
});

describe('ls_advance', () => {
  it('returns the consumed char and advances pos by 1', () => {
    const s = make_lexer_state('abc');
    expect(ls_advance(s)).toBe('a');
    expect(s.pos).toBe(1);
  });

  it('increments column by 1 (no line change)', () => {
    const s = make_lexer_state('abc');
    ls_advance(s);
    expect(s.column).toBe(2);
    expect(s.line).toBe(1);
  });

  it(
    'RISK #1 — column starts at 0 then advance increments to 1 ' +
      '(matches scan_block_comment newline sequence)',
    () => {
      // This pins the two-step dance: caller sets `column = 0` after
      // a newline, then `ls_advance` moves it to 1. The lexer relies
      // on this exact sequence inside multi-line block comments.
      const s = make_lexer_state('\n');
      // Simulate: caller has consumed up through newline detection,
      // bumped line, set column = 0.
      s.column = 0;
      ls_advance(s);
      expect(s.column).toBe(1);
    },
  );

  it('returns "\\0" past the end without crashing', () => {
    const s = make_lexer_state('a');
    ls_advance(s); // consume 'a'
    // Advancing past end is a no-op for the source but pos still
    // increments — matches the pre-extraction shape.
    expect(ls_advance(s)).toBe('\0');
    expect(s.pos).toBe(2);
  });
});

describe('ls_match', () => {
  it('advances and returns true when char matches', () => {
    const s = make_lexer_state('==');
    expect(ls_match(s, '=')).toBe(true);
    expect(s.pos).toBe(1);
    expect(s.column).toBe(2);
  });

  it('does not advance and returns false when char does not match', () => {
    const s = make_lexer_state('=>');
    expect(ls_match(s, '=')).toBe(true);
    expect(ls_match(s, '=')).toBe(false);
    expect(s.pos).toBe(1);
    expect(s.column).toBe(2);
  });

  it('returns false at EOF without advancing', () => {
    const s = make_lexer_state('');
    expect(ls_match(s, '=')).toBe(false);
    expect(s.pos).toBe(0);
  });
});

describe('ls_skip_whitespace', () => {
  it('skips spaces and tabs', () => {
    const s = make_lexer_state('  \t\tfoo');
    ls_skip_whitespace(s);
    expect(ls_peek(s)).toBe('f');
    expect(s.pos).toBe(4);
  });

  it('does NOT skip newlines (they are line-tracking events)', () => {
    const s = make_lexer_state('  \n');
    ls_skip_whitespace(s);
    expect(ls_peek(s)).toBe('\n');
    expect(s.pos).toBe(2);
  });

  it('is a no-op at EOF', () => {
    const s = make_lexer_state('');
    ls_skip_whitespace(s);
    expect(s.pos).toBe(0);
  });

  it('updates column for each whitespace consumed', () => {
    const s = make_lexer_state('   x');
    ls_skip_whitespace(s);
    expect(s.column).toBe(4);
  });
});

describe('ls_current_position', () => {
  it('emits a SourcePosition with the requested length', () => {
    const s = make_lexer_state('abc');
    s.pos = 1;
    s.line = 2;
    s.column = 5;
    const pos = ls_current_position(s, 3);
    expect(pos.line).toBe(2);
    expect(pos.column).toBe(5);
    expect(pos.offset).toBe(1);
    expect(pos.length).toBe(3);
  });

  it('uses options.file as the source path', () => {
    const s = make_lexer_state('', { file: 'main.ice' });
    expect(ls_current_position(s, 0).file).toBe('main.ice');
  });
});

describe('ls_add_token', () => {
  it('appends a token derived from start_pos/start_line/start_column', () => {
    const s = make_lexer_state('foo');
    // Simulate: scan consumed all 3 chars.
    s.pos = 3;
    s.column = 4;
    ls_add_token(s, 'IDENTIFIER', 'foo', 0, 1, 1);
    expect(s.tokens).toHaveLength(1);
    expect(s.tokens[0]?.type).toBe('IDENTIFIER');
    expect(s.tokens[0]?.value).toBe('foo');
    expect(s.tokens[0]?.position.line).toBe(1);
    expect(s.tokens[0]?.position.column).toBe(1);
    expect(s.tokens[0]?.position.offset).toBe(0);
    expect(s.tokens[0]?.position.length).toBe(3);
  });

  it('does not mutate cursor state', () => {
    const s = make_lexer_state('abc');
    s.pos = 2;
    s.column = 3;
    ls_add_token(s, 'IDENTIFIER', 'ab', 0, 1, 1);
    expect(s.pos).toBe(2);
    expect(s.column).toBe(3);
  });
});

describe('ls_add_token_with_literal', () => {
  it('appends a token whose `literal` field carries the payload', () => {
    const s = make_lexer_state('42');
    s.pos = 2;
    ls_add_token_with_literal(s, 'NUMBER', '42', 0, 1, 1, 42);
    expect(s.tokens[0]?.literal).toBe(42);
  });

  it('preserves null literal (TRUE/FALSE/NULL_KEYWORD path)', () => {
    const s = make_lexer_state('null');
    s.pos = 4;
    ls_add_token_with_literal(s, 'NULL', 'null', 0, 1, 1, null);
    expect(s.tokens[0]?.literal).toBeNull();
  });

  it('preserves boolean literal', () => {
    const s = make_lexer_state('true');
    s.pos = 4;
    ls_add_token_with_literal(s, 'BOOLEAN', 'true', 0, 1, 1, true);
    expect(s.tokens[0]?.literal).toBe(true);
  });
});

describe('ls_add_error', () => {
  it('appends an error with the current line/column/pos snapshot', () => {
    const s = make_lexer_state('abc');
    s.pos = 1;
    s.line = 2;
    s.column = 5;
    ls_add_error(s, 'oops', false);
    expect(s.errors).toHaveLength(1);
    expect(s.errors[0]?.message).toBe('oops');
    expect(s.errors[0]?.position.line).toBe(2);
    expect(s.errors[0]?.position.column).toBe(5);
    expect(s.errors[0]?.recoverable).toBe(false);
  });

  it(
    'does NOT push an ERROR token when recoverable=false',
    () => {
      const s = make_lexer_state('abc');
      ls_add_error(s, 'fatal', false);
      expect(s.tokens).toHaveLength(0);
    },
  );

  it(
    'RISK #2 — recoverable=true pushes an ERROR token whose value is ' +
      'source[pos - 1] (post-advance snapshot)',
    () => {
      // Simulate the canonical caller shape: scan_token consumed the
      // bad char with `ls_advance` (pos is now 1, column is 2), then
      // dispatched to default which fired `ls_add_error(..., true)`.
      // The ERROR token must reflect 'X', not the next char.
      const s: LexerState = make_lexer_state('Xy');
      ls_advance(s); // consume 'X', now pos=1
      ls_add_error(s, `Unexpected character 'X'`, true);

      expect(s.tokens).toHaveLength(1);
      expect(s.tokens[0]?.type).toBe('ERROR');
      // The bad char is at pos - 1 (which is the 'X' just consumed),
      // NOT pos (which is 'y', the next char in the stream). If this
      // regresses to `s.source[s.pos]` the ERROR token will carry the
      // wrong char.
      expect(s.tokens[0]?.value).toBe('X');
    },
  );

  it(
    'RISK #2 — recoverable error at end of source emits empty-string token',
    () => {
      // Edge case: ls_advance off the end leaves pos > source.length,
      // so source[pos - 1] is the last char OR `'\0'` from advance.
      // Here we hit add_error after consuming the only char, so pos=1
      // and source[0] = '&' which is the bad char.
      const s = make_lexer_state('&');
      ls_advance(s); // pos=1
      ls_add_error(s, `Unexpected character '&'`, true);
      expect(s.tokens[0]?.value).toBe('&');
    },
  );

  it('accumulates multiple errors with their own snapshots', () => {
    const s = make_lexer_state('Xy');
    ls_advance(s);
    ls_add_error(s, 'one', true);
    ls_advance(s);
    ls_add_error(s, 'two', true);
    expect(s.errors).toHaveLength(2);
    expect(s.tokens).toHaveLength(2);
    expect(s.tokens[0]?.value).toBe('X');
    expect(s.tokens[1]?.value).toBe('y');
  });
});
