/**
 * graph/parser/index — barrel re-exports + parse_source convenience.
 *
 * The barrel re-exports tokens / ast / lexer / parser / format-parser surfaces
 * AND ships a `parse_source(source, lexerOptions?, parserOptions?)` shorthand
 * that runs the lexer then the parser, with a fatal-lexer-error short-circuit.
 */

import { describe, it, expect } from 'vitest';

import * as parserBarrel from '../index.js';

describe('graph/parser/index — re-exports', () => {
  it('re-exports the token helpers', () => {
    expect(typeof parserBarrel.is_keyword).toBe('function');
    expect(typeof parserBarrel.get_keyword_type).toBe('function');
    expect(typeof parserBarrel.create_token).toBe('function');
    expect(typeof parserBarrel.create_position).toBe('function');
    expect(typeof parserBarrel.is_token_type).toBe('function');
    expect(typeof parserBarrel.is_one_of).toBe('function');
    expect(typeof parserBarrel.describe_token).toBe('function');
    expect(typeof parserBarrel.KEYWORDS).toBe('object');
    expect(parserBarrel.KEYWORDS.resource).toBe('RESOURCE');
  });

  it('re-exports the AST helpers', () => {
    expect(typeof parserBarrel.is_node_kind).toBe('function');
    expect(typeof parserBarrel.create_span).toBe('function');
    expect(typeof parserBarrel.visit_ast).toBe('function');
  });

  it('re-exports the lexer surface', () => {
    expect(typeof parserBarrel.Lexer).toBe('function');
    expect(typeof parserBarrel.tokenize).toBe('function');
  });

  it('re-exports the parser surface', () => {
    expect(typeof parserBarrel.Parser).toBe('function');
    expect(typeof parserBarrel.parse).toBe('function');
  });

  it('re-exports the format-parser surface', () => {
    expect(typeof parserBarrel.parse_json).toBe('function');
    expect(typeof parserBarrel.parse_yaml).toBe('function');
    expect(typeof parserBarrel.parse_auto).toBe('function');
  });
});

describe('parse_source — happy path', () => {
  it('returns a non-null program with success=true for a well-formed resource block', () => {
    const result = parserBarrel.parse_source('resource Ec2 web {}');
    expect(result.success).toBe(true);
    expect(result.program).not.toBeNull();
    expect(result.lexer_errors).toEqual([]);
    expect(result.parser_errors).toEqual([]);
  });

  it('threads lexer_options and parser_options through to the underlying classes', () => {
    // The barrel forwards both options bags to Lexer and Parser; supplying
    // them exercises the option-forwarding branch in parse_source.
    const result = parserBarrel.parse_source(
      'resource Ec2 web {}',
      { include_comments: false },
      { recover_from_errors: true },
    );
    expect(result.success).toBe(true);
    expect(result.program).not.toBeNull();
  });
});

describe('parse_source — error short-circuits', () => {
  it('returns success=false with non-empty parser_errors when source is malformed (lexer recoverable, parser hits errors)', () => {
    // Stray `}` without a matching block — lexer is happy, parser surfaces an error.
    const result = parserBarrel.parse_source('}');
    expect(result.success).toBe(false);
    expect(result.parser_errors.length).toBeGreaterThan(0);
  });

  it('returns success=false and program=null when the lexer produces a non-recoverable error', () => {
    // The "Too many errors, stopping lexer" guard is the only non-recoverable
    // lexer error site. Drive it by capping max_errors at 0 — every input
    // hits the guard immediately and the barrel short-circuits before the
    // parser runs (program is null, parser_errors is empty).
    const result = parserBarrel.parse_source('resource Ec2 web {}', { max_errors: 0 });
    expect(result.lexer_errors.some((e) => !e.recoverable)).toBe(true);
    expect(result.success).toBe(false);
    expect(result.program).toBeNull();
    expect(result.parser_errors).toEqual([]);
  });

  it('reports lexer_errors when present even on otherwise-recoverable input', () => {
    // A weird character produces a recoverable lexer error; the parser then
    // attempts to make sense of the rest. success must be false because
    // lexer_errors is non-empty.
    const result = parserBarrel.parse_source('@@@');
    if (result.lexer_errors.length > 0 && result.lexer_errors.every((e) => e.recoverable)) {
      expect(result.success).toBe(false);
      expect(result.program).not.toBeNull();
    } else {
      // If the lexer treats it as fatal, that branch is covered above.
      expect(result.success).toBe(false);
    }
  });
});
