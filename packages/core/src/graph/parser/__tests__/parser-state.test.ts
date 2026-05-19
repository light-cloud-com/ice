/**
 * Tests for `parser-state.ts` (rf-parse-1).
 *
 * Pins behaviour preserved from the pre-extraction `Parser` class
 * navigation methods (parser.ts L985-1048 pre-extraction). Two
 * blueprint risks are pinned with their own test cases:
 *
 *   RISK #1 — `ps_consume` on type mismatch calls `ps_add_error`
 *             AND returns `ps_current(s)` WITHOUT advancing the
 *             cursor. If this regresses, the parser will silently
 *             swallow tokens at recovery points and emit incorrect
 *             AST shapes downstream.
 *
 *   RISK #2 — `ps_synchronize` advances at least once, then exits
 *             on either (a) a statement-start keyword at current OR
 *             (b) a RIGHT_BRACE at previous. Both exit conditions
 *             are load-bearing. Without (a) the parser loses sync
 *             at top-level statements; without (b) it loses sync at
 *             nested-block boundaries.
 *
 * Tokens are constructed with hand-rolled positions (no lexer
 * involvement) so each test pins exactly the shape it cares about.
 * The `eof` helper appends a trailing EOF token so `ps_is_at_end`
 * has a sentinel to land on without depending on the lexer.
 */
import { describe, it, expect } from 'vitest';
import {
  type ParserState,
  make_parser_state,
  ps_current,
  ps_previous,
  ps_advance,
  ps_check,
  ps_match,
  ps_consume,
  ps_is_at_end,
  ps_add_error,
  ps_synchronize,
} from '../parser-state';
import type { Token, TokenType } from '../tokens';

/** Build a minimal token at line/col 1. */
function tk(type: TokenType, value = '', literal?: unknown): Token {
  return {
    type,
    value,
    literal,
    position: { line: 1, column: 1, offset: 0 },
  };
}

/** Append an EOF sentinel — the parser's `is_at_end` reads token type. */
function eof(...prefix: Token[]): Token[] {
  return [...prefix, tk('EOF')];
}

describe('make_parser_state', () => {
  it('seeds pos=0 and an empty errors array', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'foo')));
    expect(s.pos).toBe(0);
    expect(s.errors).toEqual([]);
  });

  it('fills in default options when none are supplied', () => {
    const s = make_parser_state(eof());
    expect(s.options.max_errors).toBe(100);
    expect(s.options.error_recovery).toBe(true);
  });

  it('overrides default options when partials are supplied', () => {
    const s = make_parser_state(eof(), { max_errors: 5 });
    expect(s.options.max_errors).toBe(5);
    expect(s.options.error_recovery).toBe(true);
  });

  it('overrides both options when fully supplied', () => {
    const s = make_parser_state(eof(), {
      max_errors: 0,
      error_recovery: false,
    });
    expect(s.options.max_errors).toBe(0);
    expect(s.options.error_recovery).toBe(false);
  });

  it('preserves the token stream identity', () => {
    const tokens = eof(tk('IDENTIFIER', 'a'));
    const s = make_parser_state(tokens);
    expect(s.tokens).toBe(tokens);
  });
});

describe('ps_current', () => {
  it('returns the token at the cursor', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'a'), tk('PLUS', '+')));
    expect(ps_current(s).value).toBe('a');
    s.pos = 1;
    expect(ps_current(s).type).toBe('PLUS');
  });

  it('falls back to the last token when the cursor runs past the end', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'a')));
    s.pos = 99;
    // Last token is EOF (added by `eof`).
    expect(ps_current(s).type).toBe('EOF');
  });
});

describe('ps_previous', () => {
  it('clamps to index 0 at the start of the stream', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'a')));
    expect(ps_previous(s).value).toBe('a'); // index 0 since pos=0
  });

  it('returns pos-1 when the cursor has advanced', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'a'), tk('PLUS', '+')));
    s.pos = 2;
    expect(ps_previous(s).type).toBe('PLUS');
  });
});

describe('ps_advance', () => {
  it('increments pos and returns the just-passed token', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'a'), tk('PLUS', '+')));
    const tok = ps_advance(s);
    expect(tok.value).toBe('a');
    expect(s.pos).toBe(1);
  });

  it('does not advance past EOF', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'a')));
    ps_advance(s); // consume 'a'
    ps_advance(s); // would consume EOF
    expect(s.pos).toBe(1); // capped — EOF is at index 1
    expect(ps_current(s).type).toBe('EOF');
  });
});

describe('ps_check', () => {
  it('returns true for a single matching type', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'a')));
    expect(ps_check(s, 'IDENTIFIER')).toBe(true);
  });

  it('returns true when any of the supplied types match', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'a')));
    expect(ps_check(s, 'STRING', 'IDENTIFIER', 'NUMBER')).toBe(true);
  });

  it('returns false when no type matches', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'a')));
    expect(ps_check(s, 'STRING', 'NUMBER')).toBe(false);
  });

  it('does not advance the cursor', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'a')));
    ps_check(s, 'IDENTIFIER');
    expect(s.pos).toBe(0);
  });
});

describe('ps_match', () => {
  it('advances and returns true when the type matches', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'a'), tk('PLUS', '+')));
    expect(ps_match(s, 'IDENTIFIER')).toBe(true);
    expect(s.pos).toBe(1);
  });

  it('returns false and does not advance when the type does not match', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'a')));
    expect(ps_match(s, 'STRING')).toBe(false);
    expect(s.pos).toBe(0);
  });

  it('accepts multiple types (any-of semantics)', () => {
    const s = make_parser_state(eof(tk('PLUS', '+')));
    expect(ps_match(s, 'MINUS', 'PLUS')).toBe(true);
    expect(s.pos).toBe(1);
  });
});

describe('ps_consume', () => {
  it('advances and returns the consumed token on type match', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'a'), tk('PLUS', '+')));
    const tok = ps_consume(s, 'IDENTIFIER', 'expected ident');
    expect(tok.value).toBe('a');
    expect(s.pos).toBe(1);
    expect(s.errors).toEqual([]);
  });

  it(
    'RISK #1 — on mismatch, calls ps_add_error AND returns ps_current ' +
      'WITHOUT advancing',
    () => {
      const s = make_parser_state(eof(tk('IDENTIFIER', 'a')));
      const tok = ps_consume(s, 'STRING', 'expected string');

      // Cursor stays put.
      expect(s.pos).toBe(0);

      // Returned token is the un-consumed current token, not the
      // expected token. Consumers rely on this to make recovery
      // decisions.
      expect(tok.value).toBe('a');
      expect(tok.type).toBe('IDENTIFIER');

      // Error is recorded with the message verbatim.
      expect(s.errors).toHaveLength(1);
      expect(s.errors[0]?.message).toBe('expected string');
    },
  );
});

describe('ps_is_at_end', () => {
  it('returns true when current token type is EOF', () => {
    const s = make_parser_state(eof());
    expect(ps_is_at_end(s)).toBe(true);
  });

  it('returns false when there are tokens before EOF', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'a')));
    expect(ps_is_at_end(s)).toBe(false);
  });

  it('keys off token type, not cursor index', () => {
    // If a non-EOF token sits past the cursor, we are not at end.
    const s = make_parser_state(eof(tk('IDENTIFIER', 'a'), tk('PLUS', '+')));
    s.pos = 1;
    expect(ps_is_at_end(s)).toBe(false);
    s.pos = 2;
    expect(ps_is_at_end(s)).toBe(true);
  });
});

describe('ps_add_error', () => {
  it('appends an error with the current token+position', () => {
    const tok: Token = {
      type: 'IDENTIFIER',
      value: 'foo',
      position: { line: 7, column: 4, offset: 42 },
    };
    const s: ParserState = make_parser_state([tok, tk('EOF')]);
    ps_add_error(s, 'oops');

    expect(s.errors).toHaveLength(1);
    expect(s.errors[0]?.message).toBe('oops');
    expect(s.errors[0]?.position).toEqual({ line: 7, column: 4, offset: 42 });
    expect(s.errors[0]?.token).toBe(tok);
  });

  it('does not advance the cursor', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'a')));
    ps_add_error(s, 'oops');
    expect(s.pos).toBe(0);
  });

  it('accumulates errors across multiple calls', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'a')));
    ps_add_error(s, 'one');
    ps_add_error(s, 'two');
    expect(s.errors.map((e) => e.message)).toEqual(['one', 'two']);
  });
});

describe('ps_synchronize', () => {
  it('RISK #2a — exits on a statement-start keyword at current', () => {
    // `bad RESOURCE foo { } EOF` — sync from `bad` should land on
    // RESOURCE. The unconditional first advance moves past `bad`,
    // then the keyword check fires.
    const s = make_parser_state(
      eof(
        tk('IDENTIFIER', 'bad'),
        tk('RESOURCE', 'resource'),
        tk('TYPE_IDENTIFIER', 'Foo'),
      ),
    );
    ps_synchronize(s);
    expect(ps_current(s).type).toBe('RESOURCE');
  });

  it('exits on each of the 8 statement-start keywords', () => {
    const keywords: TokenType[] = [
      'RESOURCE',
      'DATA',
      'VARIABLE',
      'OUTPUT',
      'PROVIDER',
      'MODULE',
      'LOCALS',
      'IMPORT',
    ];
    for (const kw of keywords) {
      const s = make_parser_state(eof(tk('IDENTIFIER', 'bad'), tk(kw)));
      ps_synchronize(s);
      expect(ps_current(s).type).toBe(kw);
    }
  });

  it(
    'RISK #2b — exits when previous token is RIGHT_BRACE ' +
      '(post-block recovery)',
    () => {
      // `bad } more EOF` — sync from `bad` should consume `bad` and
      // `}` and then exit because previous == RIGHT_BRACE.
      const s = make_parser_state(
        eof(
          tk('IDENTIFIER', 'bad'),
          tk('RIGHT_BRACE', '}'),
          tk('IDENTIFIER', 'more'),
        ),
      );
      ps_synchronize(s);
      expect(ps_current(s).value).toBe('more');
      expect(ps_previous(s).type).toBe('RIGHT_BRACE');
    },
  );

  it('always advances at least once (cannot stall on a keyword at start)', () => {
    // If sync is called WITH the cursor sitting on a keyword (which
    // can happen if a prior parse step left the cursor un-consumed),
    // it must still advance — otherwise outer loops infinite-loop.
    const s = make_parser_state(eof(tk('RESOURCE', 'resource'), tk('DATA', 'data')));
    ps_synchronize(s);
    // Advanced past RESOURCE; now lands on DATA (which is also a
    // keyword, so the loop exits).
    expect(ps_current(s).type).toBe('DATA');
    expect(s.pos).toBe(1);
  });

  it('advances to EOF when no keyword and no RIGHT_BRACE found', () => {
    const s = make_parser_state(
      eof(tk('IDENTIFIER', 'a'), tk('PLUS', '+'), tk('NUMBER', '1')),
    );
    ps_synchronize(s);
    expect(ps_is_at_end(s)).toBe(true);
  });
});
