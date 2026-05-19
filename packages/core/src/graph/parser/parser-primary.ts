/**
 * Parser Primary Expressions (rf-parse-4, landed atomically with rf-parse-3)
 *
 * Primary-expression parsers extracted from the `Parser` class:
 * `parse_primary` (the leaf-token dispatcher), plus the four shape-
 * specific helpers it dispatches into — `parse_array_expression`,
 * `parse_object_expression`, `parse_for_expression`, and
 * `parse_reference`. Bodies are direct ports of the class methods on
 * parser.ts pre-extraction (L714-L924 pre-extraction); `this.X(...)`
 * calls are rewritten to `X(s, ...)`.
 *
 * Forms a circular import cycle with `parser-binary-exprs.ts`
 * (which in turn calls `parse_primary` from `parse_postfix`). The
 * cycle resolves at function-call time — `parse_expression` is only
 * referenced inside function bodies, never at module-init time.
 *
 * RISK #8 — `parse_primary` pre-advance token snapshot: the very
 *           first line is `const token = ps_current(s)`; the
 *           subsequent `ps_match(...)` calls advance past that
 *           token but every read inside the matched branches uses
 *           the SNAPSHOT (e.g. `token.literal`, `token.position`,
 *           `token.value`). If a future refactor were to read
 *           `ps_current(s)` after `ps_match`, it would read the
 *           NEXT token instead. Preserve the pre-advance snapshot.
 *
 * RISK #9 — `parse_for_expression` map-comprehension identity:
 *           when FAT_ARROW is matched, `key_expr` is set to
 *           `value_expr` — the SAME object reference, NOT a re-
 *           parse. The pre-extraction class method had this
 *           "single-expression doubled into key+value" shape; do
 *           NOT add a second `parse_expression(s)` call after the
 *           FAT_ARROW, even though that would be the more
 *           "correct" map-comprehension grammar. Several upstream
 *           callers depend on the identity (===) check.
 *
 * RISK #10 — `parse_reference` path empty-vs-undefined: when there
 *            are no trailing `.segment` parts, the field is set to
 *            `undefined` (via `path.length > 0 ? path : undefined`),
 *            NOT to `[]`. Downstream code distinguishes "explicitly
 *            no path" (undefined) from "empty path" (would be `[]`)
 *            and would mis-match if this regresses.
 */
import type {
  ArrayExpression,
  BooleanLiteral,
  Expression,
  ForExpression,
  Identifier,
  NullLiteral,
  NumberLiteral,
  ObjectExpression,
  ObjectProperty,
  Reference,
  StringLiteral,
  TypeIdentifier,
} from './ast';
import type { SourcePosition } from './tokens';
import {
  type ParserState,
  ps_add_error,
  ps_advance,
  ps_check,
  ps_consume,
  ps_current,
  ps_match,
  ps_previous,
} from './parser-state';
import { describe_token } from './tokens';
import {
  create_null_literal,
  create_span,
  parse_identifier,
  parse_string_literal,
} from './parser-literals';
// Circular import resolves at function-call time — `parse_expression`
// is only referenced inside function bodies. See parser-binary-exprs.ts
// for the matching back-edge. (rf-parse-3/4 atomic landing.)
import { parse_expression } from './parser-binary-exprs';

/**
 * Leaf-token dispatcher for primary expressions.
 *
 * RISK #8 — the `const token = ps_current(s)` snapshot is taken
 * BEFORE any `ps_match(...)` advance. Every literal/reference branch
 * reads from `token` (the pre-advance snapshot), not from a fresh
 * `ps_current(s)` call. The order matters: `ps_match` advances past
 * the token, so `ps_current(s)` after the match would return the
 * NEXT token.
 */
export function parse_primary(s: ParserState): Expression {
  const token = ps_current(s);

  if (ps_match(s, 'STRING')) {
    return {
      kind: 'StringLiteral',
      value: token.literal as string,
      span: create_span(token.position, token.position),
    } as StringLiteral;
  }

  if (ps_match(s, 'NUMBER')) {
    return {
      kind: 'NumberLiteral',
      value: token.literal as number,
      span: create_span(token.position, token.position),
    } as NumberLiteral;
  }

  if (ps_match(s, 'BOOLEAN')) {
    return {
      kind: 'BooleanLiteral',
      value: token.literal as boolean,
      span: create_span(token.position, token.position),
    } as BooleanLiteral;
  }

  if (ps_match(s, 'NULL')) {
    return {
      kind: 'NullLiteral',
      span: create_span(token.position, token.position),
    } as NullLiteral;
  }

  if (ps_match(s, 'LEFT_BRACKET')) {
    return parse_array_expression(s, token.position);
  }

  if (ps_match(s, 'LEFT_BRACE')) {
    return parse_object_expression(s, token.position);
  }

  if (ps_match(s, 'LEFT_PAREN')) {
    const expr = parse_expression(s);
    ps_consume(s, 'RIGHT_PAREN', "Expected ')'");
    return expr;
  }

  if (ps_match(s, 'FOR')) {
    return parse_for_expression(s, token.position);
  }

  if (ps_match(s, 'TYPE_IDENTIFIER')) {
    return {
      kind: 'TypeIdentifier',
      name: token.value,
      span: create_span(token.position, token.position),
    } as TypeIdentifier;
  }

  if (ps_match(s, 'IDENTIFIER')) {
    // Check if this is a reference
    const name = token.value;

    if (['var', 'local', 'module', 'path', 'data'].includes(name)) {
      return parse_reference(s, token.position, name);
    }

    return {
      kind: 'Identifier',
      name,
      span: create_span(token.position, token.position),
    } as Identifier;
  }

  ps_add_error(s, `Unexpected token ${describe_token(token.type)}`);
  ps_advance(s);
  return create_null_literal(s, token.position);
}

/**
 * Array literal `[a, b, c]`. The opening `[` has already been
 * consumed by `parse_primary`; this helper takes `start` as the
 * position of that opening bracket (used as the span start).
 *
 * Trailing commas are tolerated via the inner `if (ps_check(s,
 * 'RIGHT_BRACKET')) break;` — `[1, 2,]` parses to a 2-element array.
 */
export function parse_array_expression(s: ParserState, start: SourcePosition): ArrayExpression {
  const elements: Expression[] = [];

  if (!ps_check(s, 'RIGHT_BRACKET')) {
    do {
      if (ps_check(s, 'RIGHT_BRACKET')) break;
      elements.push(parse_expression(s));
    } while (ps_match(s, 'COMMA'));
  }

  ps_consume(s, 'RIGHT_BRACKET', "Expected ']'");
  const end = ps_previous(s).position;

  return {
    kind: 'ArrayExpression',
    elements,
    span: create_span(start, end),
  };
}

/**
 * Object literal `{ k = v, ... }`. The opening `{` has already been
 * consumed by `parse_primary`. Three key shapes are accepted:
 *   - `(expr)` — computed key (parenthesised expression).
 *   - STRING literal — string key.
 *   - IDENTIFIER — bare identifier key.
 *
 * The separator is `=` (per HCL) — `EQUALS` token. Trailing commas
 * are tolerated.
 */
export function parse_object_expression(s: ParserState, start: SourcePosition): ObjectExpression {
  const properties: ObjectProperty[] = [];

  if (!ps_check(s, 'RIGHT_BRACE')) {
    do {
      if (ps_check(s, 'RIGHT_BRACE')) break;

      let key: Expression;
      let computed = false;

      if (ps_match(s, 'LEFT_PAREN')) {
        key = parse_expression(s);
        ps_consume(s, 'RIGHT_PAREN', "Expected ')'");
        computed = true;
      } else if (ps_check(s, 'STRING')) {
        key = parse_string_literal(s);
      } else {
        key = parse_identifier(s);
      }

      ps_consume(s, 'EQUALS', "Expected '=' or ':'");
      const value = parse_expression(s);

      properties.push({ key, value, computed });
    } while (ps_match(s, 'COMMA'));
  }

  ps_consume(s, 'RIGHT_BRACE', "Expected '}'");
  const end = ps_previous(s).position;

  return {
    kind: 'ObjectExpression',
    properties,
    span: create_span(start, end),
  };
}

/**
 * For expression / comprehension. The `FOR` keyword has already been
 * consumed by `parse_primary`.
 *
 * Two grammars supported:
 *   - List comprehension: `[for x in xs : expr]` — single value var.
 *   - Map comprehension:  `[for k, v in m : expr => expr]` — two
 *     vars separated by COMMA, FAT_ARROW between key and value.
 *
 * RISK #9 — when FAT_ARROW is matched, `key_expr` is assigned the
 * SAME OBJECT as `value_expr`. The pre-extraction class method does
 * NOT call `parse_expression(s)` a second time after the FAT_ARROW;
 * it just aliases `key_expr = value_expr`. This is preserved verbatim
 * because callers (the compiler/evaluator) check `key_expr ===
 * value_expr` to detect "this is a map comprehension" without
 * needing to walk the AST.
 *
 * The closing `]` is consumed (the message hedges with "or `}`" but
 * the actual token type is RIGHT_BRACKET; the message matches the
 * pre-extraction class method).
 */
export function parse_for_expression(s: ParserState, start: SourcePosition): ForExpression {
  let key_var: Identifier | undefined;
  let value_var: Identifier;

  const first_var = parse_identifier(s);

  if (ps_match(s, 'COMMA')) {
    key_var = first_var;
    value_var = parse_identifier(s);
  } else {
    value_var = first_var;
  }

  ps_consume(s, 'IN', "Expected 'in'");
  const collection = parse_expression(s);
  ps_consume(s, 'COLON', "Expected ':'");

  let key_expr: Expression | undefined;
  const value_expr = parse_expression(s);

  if (ps_match(s, 'FAT_ARROW')) {
    key_expr = value_expr;
  }

  let condition: Expression | undefined;
  if (ps_match(s, 'IF')) {
    condition = parse_expression(s);
  }

  ps_consume(s, 'RIGHT_BRACKET', "Expected ']' or '}'");
  const end = ps_previous(s).position;

  return {
    kind: 'ForExpression',
    key_var,
    value_var,
    collection,
    key_expr,
    value_expr,
    condition,
    span: create_span(start, end),
  };
}

/**
 * Reference: `var.foo`, `local.foo`, `module.foo.bar`, `path.module`,
 * `data.aws_ami.ubuntu.id`. The first identifier (`var`, `local`,
 * etc.) has already been consumed by `parse_primary`; `ref_type` is
 * that name and `start` is its position.
 *
 * For `data.<type>.<name>` references, the second segment is a type
 * name and the third is the resource name. Other ref types skip the
 * type segment.
 *
 * RISK #10 — `path` is set to `undefined` when there are no trailing
 * `.segment` parts (via `path.length > 0 ? path : undefined`). NOT
 * `[]`. Downstream callers distinguish "no path" (undefined) from
 * an empty path; a regression to `[]` would mis-match.
 */
export function parse_reference(s: ParserState, start: SourcePosition, ref_type: string): Reference {
  ps_consume(s, 'DOT', "Expected '.' after reference type");

  let type_name: string | undefined;
  let name: string;
  const path: string[] = [];

  if (ref_type === 'data') {
    type_name = parse_identifier(s).name;
    ps_consume(s, 'DOT', "Expected '.' after data type");
    name = parse_identifier(s).name;
  } else {
    name = parse_identifier(s).name;
  }

  while (ps_match(s, 'DOT')) {
    path.push(parse_identifier(s).name);
  }

  const end = ps_previous(s).position;

  return {
    kind: 'Reference',
    ref_type: ref_type as Reference['ref_type'],
    type_name,
    name,
    path: path.length > 0 ? path : undefined,
    span: create_span(start, end),
  };
}
