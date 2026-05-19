/**
 * Tests for `parser-binary-exprs.ts` (rf-parse-3, landed atomically with rf-parse-4).
 *
 * Pins behaviour preserved from the pre-extraction `Parser` class
 * expression-grammar methods (parser.ts L497-L696 pre-extraction).
 * Three blueprint risks are pinned with their own test cases:
 *
 *   RISK #5 — `parse_equality` operator ternary: the operator is
 *             derived via an explicit `=== '==' ? '==' : '!='`
 *             ternary, NOT a cast. Test pins both `==` and `!=`
 *             tokens to the right operator string.
 *
 *   RISK #6 — `parse_postfix` error-but-continue: when the function-
 *             call callee is not an Identifier, an error is added
 *             but the FunctionCall node is STILL constructed. There
 *             is no break/skip.
 *
 *   RISK #7 — Precedence chain order: the 10-level chain encodes
 *             operator precedence. Tests pin precedence by parsing
 *             mixed-precedence expressions and asserting the AST
 *             nesting shape (multiplicative tighter than additive,
 *             additive tighter than equality, etc.).
 *
 * Tokens are constructed by hand (no lexer involvement) so each
 * test pins exactly the shape it cares about. The `eof` helper
 * appends a trailing EOF token so navigation helpers have a
 * sentinel.
 */
import { describe, it, expect } from 'vitest';
import {
  parse_expression,
  parse_conditional,
  parse_or,
  parse_and,
  parse_equality,
  parse_comparison,
  parse_term,
  parse_factor,
  parse_unary,
  parse_postfix,
} from '../parser-binary-exprs';
import { make_parser_state } from '../parser-state';
import type {
  BinaryExpression,
  ConditionalExpression,
  FunctionCall,
  Identifier,
  IndexAccess,
  NumberLiteral,
  PropertyAccess,
  StringLiteral,
  UnaryExpression,
} from '../ast';
import type { Token, TokenType, SourcePosition } from '../tokens';

/** Build a minimal token at line/col 1 (with optional literal). */
function tk(
  type: TokenType,
  value = '',
  literal?: unknown,
  position: SourcePosition = { line: 1, column: 1, offset: 0, length: value.length },
): Token {
  return { type, value, literal, position };
}

/** Append an EOF sentinel — `ps_is_at_end` reads token type. */
function eof(...prefix: Token[]): Token[] {
  return [...prefix, tk('EOF')];
}

/** Number-literal token shorthand. */
function num(n: number): Token {
  return tk('NUMBER', String(n), n);
}

/** Identifier-token shorthand. */
function id(name: string): Token {
  return tk('IDENTIFIER', name);
}

describe('parse_expression', () => {
  it('delegates to parse_conditional and returns a primary literal directly', () => {
    const s = make_parser_state(eof(num(42)));
    const expr = parse_expression(s) as NumberLiteral;
    expect(expr.kind).toBe('NumberLiteral');
    expect(expr.value).toBe(42);
  });
});

describe('parse_conditional', () => {
  it('returns the OR-level expression when no QUESTION token follows', () => {
    const s = make_parser_state(eof(num(1)));
    const expr = parse_conditional(s) as NumberLiteral;
    expect(expr.kind).toBe('NumberLiteral');
    expect(expr.value).toBe(1);
  });

  it('builds a ConditionalExpression for `cond ? then : else`', () => {
    const s = make_parser_state(
      eof(tk('BOOLEAN', 'true', true), tk('QUESTION', '?'), num(1), tk('COLON', ':'), num(2)),
    );
    const expr = parse_conditional(s) as ConditionalExpression;
    expect(expr.kind).toBe('ConditionalExpression');
    expect(expr.condition.kind).toBe('BooleanLiteral');
    expect((expr.then_branch as NumberLiteral).value).toBe(1);
    expect((expr.else_branch as NumberLiteral).value).toBe(2);
  });

  it('parses chained ternaries as right-associative on the else branch', () => {
    // `a ? b : c ? d : e` parses as `a ? b : (c ? d : e)`.
    const s = make_parser_state(
      eof(
        id('a'),
        tk('QUESTION', '?'),
        id('b'),
        tk('COLON', ':'),
        id('c'),
        tk('QUESTION', '?'),
        id('d'),
        tk('COLON', ':'),
        id('e'),
      ),
    );
    const outer = parse_conditional(s) as ConditionalExpression;
    expect(outer.kind).toBe('ConditionalExpression');
    // The else branch must itself be a ConditionalExpression.
    const inner = outer.else_branch as ConditionalExpression;
    expect(inner.kind).toBe('ConditionalExpression');
    expect((inner.condition as Identifier).name).toBe('c');
    expect((inner.then_branch as Identifier).name).toBe('d');
    expect((inner.else_branch as Identifier).name).toBe('e');
  });

  it('emits an error when the COLON is missing', () => {
    const s = make_parser_state(eof(id('a'), tk('QUESTION', '?'), id('b'), id('c')));
    parse_conditional(s);
    // ps_consume mismatch on COLON.
    expect(s.errors.some((e) => e.message.includes("Expected ':'"))).toBe(true);
  });
});

describe('parse_or', () => {
  it('returns the AND-level expression when no OR token follows', () => {
    const s = make_parser_state(eof(num(1)));
    const expr = parse_or(s) as NumberLiteral;
    expect(expr.value).toBe(1);
  });

  it('folds left for `a || b || c` → ((a || b) || c)', () => {
    const s = make_parser_state(eof(id('a'), tk('OR', '||'), id('b'), tk('OR', '||'), id('c')));
    const expr = parse_or(s) as BinaryExpression;
    expect(expr.kind).toBe('BinaryExpression');
    expect(expr.operator).toBe('||');
    // Left side must be a nested BinaryExpression `a || b`.
    const left = expr.left as BinaryExpression;
    expect(left.kind).toBe('BinaryExpression');
    expect(left.operator).toBe('||');
    expect((left.left as Identifier).name).toBe('a');
    expect((left.right as Identifier).name).toBe('b');
    expect((expr.right as Identifier).name).toBe('c');
  });
});

describe('parse_and', () => {
  it('returns the equality-level expression when no AND token follows', () => {
    const s = make_parser_state(eof(num(1)));
    const expr = parse_and(s) as NumberLiteral;
    expect(expr.value).toBe(1);
  });

  it('folds left for `a && b && c` with operator `&&`', () => {
    const s = make_parser_state(eof(id('a'), tk('AND', '&&'), id('b'), tk('AND', '&&'), id('c')));
    const expr = parse_and(s) as BinaryExpression;
    expect(expr.operator).toBe('&&');
    expect((expr.left as BinaryExpression).operator).toBe('&&');
  });
});

describe('parse_equality (RISK #5)', () => {
  it('pins the operator string to `==` when EQUALS_EQUALS matched', () => {
    const s = make_parser_state(eof(num(1), tk('EQUALS_EQUALS', '=='), num(2)));
    const expr = parse_equality(s) as BinaryExpression;
    expect(expr.kind).toBe('BinaryExpression');
    // RISK #5: must be exactly the string '==' — the ternary returns
    // it explicitly rather than via cast.
    expect(expr.operator).toBe('==');
  });

  it('pins the operator string to `!=` when NOT_EQUALS matched', () => {
    const s = make_parser_state(eof(num(1), tk('NOT_EQUALS', '!='), num(2)));
    const expr = parse_equality(s) as BinaryExpression;
    expect(expr.operator).toBe('!=');
  });

  it(
    'RISK #5 — operator is derived from the previous token VALUE, not type. ' +
      'Pin that the ternary uses `value === "=="` (not type === EQUALS_EQUALS)',
    () => {
      // Test that even with arbitrary token value, the ternary picks
      // `!=` for any value that is not `==`. This pins the exact
      // ternary shape (`previous().value === '==' ? '==' : '!='`).
      const s = make_parser_state(eof(num(1), tk('NOT_EQUALS', 'something-else'), num(2)));
      const expr = parse_equality(s) as BinaryExpression;
      // Token value is 'something-else', which is not '==', so the
      // ternary returns '!=' regardless.
      expect(expr.operator).toBe('!=');
    },
  );

  it('folds left for `a == b == c`', () => {
    const s = make_parser_state(eof(id('a'), tk('EQUALS_EQUALS', '=='), id('b'), tk('EQUALS_EQUALS', '=='), id('c')));
    const expr = parse_equality(s) as BinaryExpression;
    expect(expr.operator).toBe('==');
    expect((expr.left as BinaryExpression).operator).toBe('==');
  });
});

describe('parse_comparison', () => {
  it.each([
    ['LESS_THAN', '<'],
    ['LESS_THAN_EQUALS', '<='],
    ['GREATER_THAN', '>'],
    ['GREATER_THAN_EQUALS', '>='],
  ] as const)('matches %s and uses the previous-token value as the operator (%s)', (type, op) => {
    const s = make_parser_state(eof(num(1), tk(type, op), num(2)));
    const expr = parse_comparison(s) as BinaryExpression;
    expect(expr.kind).toBe('BinaryExpression');
    expect(expr.operator).toBe(op);
  });

  it('returns the term-level expression when no comparison token follows', () => {
    const s = make_parser_state(eof(num(7)));
    const expr = parse_comparison(s) as NumberLiteral;
    expect(expr.value).toBe(7);
  });
});

describe('parse_term', () => {
  it('matches PLUS with operator `+`', () => {
    const s = make_parser_state(eof(num(1), tk('PLUS', '+'), num(2)));
    const expr = parse_term(s) as BinaryExpression;
    expect(expr.operator).toBe('+');
  });

  it('matches MINUS with operator `-`', () => {
    const s = make_parser_state(eof(num(1), tk('MINUS', '-'), num(2)));
    const expr = parse_term(s) as BinaryExpression;
    expect(expr.operator).toBe('-');
  });

  it('folds left for `1 - 2 - 3` → `(1 - 2) - 3`', () => {
    const s = make_parser_state(eof(num(1), tk('MINUS', '-'), num(2), tk('MINUS', '-'), num(3)));
    const expr = parse_term(s) as BinaryExpression;
    expect(expr.operator).toBe('-');
    const left = expr.left as BinaryExpression;
    expect(left.operator).toBe('-');
    expect((left.left as NumberLiteral).value).toBe(1);
    expect((left.right as NumberLiteral).value).toBe(2);
    expect((expr.right as NumberLiteral).value).toBe(3);
  });
});

describe('parse_factor', () => {
  it.each([
    ['STAR', '*'],
    ['SLASH', '/'],
    ['PERCENT', '%'],
  ] as const)('matches %s with operator `%s`', (type, op) => {
    const s = make_parser_state(eof(num(1), tk(type, op), num(2)));
    const expr = parse_factor(s) as BinaryExpression;
    expect(expr.operator).toBe(op);
  });
});

describe('parse_unary', () => {
  it('builds a UnaryExpression for `!x` (NOT)', () => {
    const s = make_parser_state(eof(tk('NOT', '!'), id('x')));
    const expr = parse_unary(s) as UnaryExpression;
    expect(expr.kind).toBe('UnaryExpression');
    expect(expr.operator).toBe('!');
    expect((expr.operand as Identifier).name).toBe('x');
  });

  it('builds a UnaryExpression for `-x` (MINUS)', () => {
    const s = make_parser_state(eof(tk('MINUS', '-'), num(5)));
    const expr = parse_unary(s) as UnaryExpression;
    expect(expr.operator).toBe('-');
    expect((expr.operand as NumberLiteral).value).toBe(5);
  });

  it('right-associative — `!!x` builds two nested UnaryExpressions', () => {
    const s = make_parser_state(eof(tk('NOT', '!'), tk('NOT', '!'), id('x')));
    const outer = parse_unary(s) as UnaryExpression;
    expect(outer.operator).toBe('!');
    const inner = outer.operand as UnaryExpression;
    expect(inner.kind).toBe('UnaryExpression');
    expect(inner.operator).toBe('!');
    expect((inner.operand as Identifier).name).toBe('x');
  });

  it('falls through to parse_postfix when no NOT/MINUS prefix', () => {
    const s = make_parser_state(eof(id('x')));
    const expr = parse_unary(s) as Identifier;
    expect(expr.kind).toBe('Identifier');
    expect(expr.name).toBe('x');
  });
});

describe('parse_postfix', () => {
  it('builds a PropertyAccess for `x.y`', () => {
    const s = make_parser_state(eof(id('x'), tk('DOT', '.'), id('y')));
    const expr = parse_postfix(s) as PropertyAccess;
    expect(expr.kind).toBe('PropertyAccess');
    expect((expr.object as Identifier).name).toBe('x');
    expect(expr.property.name).toBe('y');
  });

  it('builds an IndexAccess for `x[1]`', () => {
    const s = make_parser_state(eof(id('x'), tk('LEFT_BRACKET', '['), num(1), tk('RIGHT_BRACKET', ']')));
    const expr = parse_postfix(s) as IndexAccess;
    expect(expr.kind).toBe('IndexAccess');
    expect((expr.object as Identifier).name).toBe('x');
    expect((expr.index as NumberLiteral).value).toBe(1);
  });

  it('builds a FunctionCall for `f(1, 2)`', () => {
    const s = make_parser_state(
      eof(id('f'), tk('LEFT_PAREN', '('), num(1), tk('COMMA', ','), num(2), tk('RIGHT_PAREN', ')')),
    );
    const expr = parse_postfix(s) as FunctionCall;
    expect(expr.kind).toBe('FunctionCall');
    expect((expr.callee as Identifier).name).toBe('f');
    expect(expr.arguments).toHaveLength(2);
    expect((expr.arguments[0] as NumberLiteral).value).toBe(1);
    expect((expr.arguments[1] as NumberLiteral).value).toBe(2);
  });

  it('builds a FunctionCall for `f()` with zero args', () => {
    const s = make_parser_state(eof(id('f'), tk('LEFT_PAREN', '('), tk('RIGHT_PAREN', ')')));
    const expr = parse_postfix(s) as FunctionCall;
    expect(expr.kind).toBe('FunctionCall');
    expect(expr.arguments).toHaveLength(0);
  });

  it('RISK #6 — non-Identifier callee: emits error AND still constructs ' + 'FunctionCall (no break/skip)', () => {
    // `5(1, 2)` — callee is a NumberLiteral, not an Identifier.
    const s = make_parser_state(
      eof(num(5), tk('LEFT_PAREN', '('), num(1), tk('COMMA', ','), num(2), tk('RIGHT_PAREN', ')')),
    );
    const expr = parse_postfix(s) as FunctionCall;
    // Error MUST be emitted.
    expect(s.errors.some((e) => e.message === 'Expected function name')).toBe(true);
    // BUT the FunctionCall node is still constructed.
    expect(expr.kind).toBe('FunctionCall');
    expect(expr.arguments).toHaveLength(2);
    // Cursor advanced past the closing `)`.
    expect(s.pos).toBe(6);
  });

  it('RISK #6 — string-literal callee `"x"(1)` also emits error but still ' + 'returns FunctionCall', () => {
    const s = make_parser_state(eof(tk('STRING', '"x"', 'x'), tk('LEFT_PAREN', '('), num(1), tk('RIGHT_PAREN', ')')));
    const expr = parse_postfix(s) as FunctionCall;
    expect(s.errors.some((e) => e.message === 'Expected function name')).toBe(true);
    expect(expr.kind).toBe('FunctionCall');
    expect(expr.arguments).toHaveLength(1);
    // Callee is the StringLiteral cast to Identifier (preserved
    // verbatim — downstream sees a non-Identifier callee).
    expect((expr.callee as unknown as StringLiteral).kind).toBe('StringLiteral');
  });

  it('chains postfix accessors — `x.y[0]` builds IndexAccess on PropertyAccess', () => {
    const s = make_parser_state(
      eof(id('x'), tk('DOT', '.'), id('y'), tk('LEFT_BRACKET', '['), num(0), tk('RIGHT_BRACKET', ']')),
    );
    const expr = parse_postfix(s) as IndexAccess;
    expect(expr.kind).toBe('IndexAccess');
    expect((expr.object as PropertyAccess).kind).toBe('PropertyAccess');
  });

  it('breaks the chain on a non-postfix token', () => {
    const s = make_parser_state(eof(id('x'), tk('PLUS', '+'), num(1)));
    const expr = parse_postfix(s) as Identifier;
    expect(expr.kind).toBe('Identifier');
    expect(expr.name).toBe('x');
    // Cursor stops at PLUS — does not consume.
    expect(s.pos).toBe(1);
  });
});

describe('Precedence chain (RISK #7)', () => {
  it('multiplication binds tighter than addition: `1 + 2 * 3` → `1 + (2 * 3)`', () => {
    const s = make_parser_state(eof(num(1), tk('PLUS', '+'), num(2), tk('STAR', '*'), num(3)));
    const expr = parse_expression(s) as BinaryExpression;
    expect(expr.operator).toBe('+');
    // Right side must be the multiplication.
    const right = expr.right as BinaryExpression;
    expect(right.kind).toBe('BinaryExpression');
    expect(right.operator).toBe('*');
    expect((right.left as NumberLiteral).value).toBe(2);
    expect((right.right as NumberLiteral).value).toBe(3);
  });

  it('addition binds tighter than equality: `1 + 2 == 3` → `(1 + 2) == 3`', () => {
    const s = make_parser_state(eof(num(1), tk('PLUS', '+'), num(2), tk('EQUALS_EQUALS', '=='), num(3)));
    const expr = parse_expression(s) as BinaryExpression;
    expect(expr.operator).toBe('==');
    const left = expr.left as BinaryExpression;
    expect(left.operator).toBe('+');
    expect((expr.right as NumberLiteral).value).toBe(3);
  });

  it('comparison binds tighter than equality: `1 < 2 == true` → `(1 < 2) == true`', () => {
    const s = make_parser_state(
      eof(num(1), tk('LESS_THAN', '<'), num(2), tk('EQUALS_EQUALS', '=='), tk('BOOLEAN', 'true', true)),
    );
    const expr = parse_expression(s) as BinaryExpression;
    expect(expr.operator).toBe('==');
    expect((expr.left as BinaryExpression).operator).toBe('<');
  });

  it('equality binds tighter than AND: `1 == 1 && 2 == 2` → `(1==1) && (2==2)`', () => {
    const s = make_parser_state(
      eof(num(1), tk('EQUALS_EQUALS', '=='), num(1), tk('AND', '&&'), num(2), tk('EQUALS_EQUALS', '=='), num(2)),
    );
    const expr = parse_expression(s) as BinaryExpression;
    expect(expr.operator).toBe('&&');
    expect((expr.left as BinaryExpression).operator).toBe('==');
    expect((expr.right as BinaryExpression).operator).toBe('==');
  });

  it('AND binds tighter than OR: `a && b || c` → `(a && b) || c`', () => {
    const s = make_parser_state(eof(id('a'), tk('AND', '&&'), id('b'), tk('OR', '||'), id('c')));
    const expr = parse_expression(s) as BinaryExpression;
    expect(expr.operator).toBe('||');
    expect((expr.left as BinaryExpression).operator).toBe('&&');
  });

  it('OR binds tighter than ternary: `a || b ? c : d` → `(a || b) ? c : d`', () => {
    const s = make_parser_state(
      eof(id('a'), tk('OR', '||'), id('b'), tk('QUESTION', '?'), id('c'), tk('COLON', ':'), id('d')),
    );
    const expr = parse_expression(s) as ConditionalExpression;
    expect(expr.kind).toBe('ConditionalExpression');
    expect((expr.condition as BinaryExpression).operator).toBe('||');
  });

  it('unary binds tighter than multiplication: `-1 * 2` → `(-1) * 2`', () => {
    const s = make_parser_state(eof(tk('MINUS', '-'), num(1), tk('STAR', '*'), num(2)));
    const expr = parse_expression(s) as BinaryExpression;
    expect(expr.operator).toBe('*');
    expect((expr.left as UnaryExpression).kind).toBe('UnaryExpression');
    expect((expr.right as NumberLiteral).value).toBe(2);
  });

  it('postfix binds tightest: `x.y + 1` → `(x.y) + 1`', () => {
    const s = make_parser_state(eof(id('x'), tk('DOT', '.'), id('y'), tk('PLUS', '+'), num(1)));
    const expr = parse_expression(s) as BinaryExpression;
    expect(expr.operator).toBe('+');
    expect((expr.left as PropertyAccess).kind).toBe('PropertyAccess');
  });

  it('full chain stack — `!a + b * c == d && e || f ? g : h` parses with ' + 'expected precedence', () => {
    // Pins that all 10 levels are wired in the right order.
    const s = make_parser_state(
      eof(
        tk('NOT', '!'),
        id('a'),
        tk('PLUS', '+'),
        id('b'),
        tk('STAR', '*'),
        id('c'),
        tk('EQUALS_EQUALS', '=='),
        id('d'),
        tk('AND', '&&'),
        id('e'),
        tk('OR', '||'),
        id('f'),
        tk('QUESTION', '?'),
        id('g'),
        tk('COLON', ':'),
        id('h'),
      ),
    );
    const expr = parse_expression(s) as ConditionalExpression;
    expect(expr.kind).toBe('ConditionalExpression');
    // Condition: `!a + b * c == d && e || f`
    const cond = expr.condition as BinaryExpression;
    expect(cond.operator).toBe('||');
    const left = cond.left as BinaryExpression;
    expect(left.operator).toBe('&&');
    const eq = left.left as BinaryExpression;
    expect(eq.operator).toBe('==');
    // The left of `==` is `!a + b * c` → addition root, with unary
    // `!a` on the left and `b * c` on the right.
    const add = eq.left as BinaryExpression;
    expect(add.operator).toBe('+');
    expect((add.left as UnaryExpression).kind).toBe('UnaryExpression');
    expect((add.right as BinaryExpression).operator).toBe('*');
  });
});

describe('span tracking', () => {
  it('binary expression span runs from left.start to right.end', () => {
    const startPos: SourcePosition = { line: 1, column: 1, offset: 0, length: 1 };
    const endPos: SourcePosition = { line: 5, column: 9, offset: 50, length: 1 };
    const s = make_parser_state(eof(tk('NUMBER', '1', 1, startPos), tk('PLUS', '+'), tk('NUMBER', '2', 2, endPos)));
    const expr = parse_expression(s) as BinaryExpression;
    expect(expr.span.start).toEqual(startPos);
    expect(expr.span.end).toEqual(endPos);
  });

  it('conditional expression span runs from condition.start to else.end', () => {
    const startPos: SourcePosition = { line: 1, column: 1, offset: 0, length: 1 };
    const endPos: SourcePosition = { line: 1, column: 9, offset: 8, length: 1 };
    const s = make_parser_state(
      eof(
        tk('IDENTIFIER', 'a', undefined, startPos),
        tk('QUESTION', '?'),
        tk('IDENTIFIER', 'b'),
        tk('COLON', ':'),
        tk('IDENTIFIER', 'c', undefined, endPos),
      ),
    );
    const expr = parse_expression(s) as ConditionalExpression;
    expect(expr.span.start).toEqual(startPos);
    expect(expr.span.end).toEqual(endPos);
  });

  it('unary expression span runs from operator pos to operand.end', () => {
    const opPos: SourcePosition = { line: 1, column: 1, offset: 0, length: 1 };
    const operandPos: SourcePosition = { line: 1, column: 3, offset: 2, length: 1 };
    const s = make_parser_state(eof(tk('NOT', '!', undefined, opPos), tk('IDENTIFIER', 'x', undefined, operandPos)));
    const expr = parse_unary(s) as UnaryExpression;
    expect(expr.span.start).toEqual(opPos);
    expect(expr.span.end).toEqual(operandPos);
  });
});
