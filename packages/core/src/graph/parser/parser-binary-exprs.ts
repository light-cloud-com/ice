/**
 * Parser Binary Expressions (rf-parse-3, landed atomically with rf-parse-4)
 *
 * The 10-level expression grammar chain extracted from the `Parser`
 * class. Bodies are direct ports of the class methods on parser.ts
 * pre-extraction (L513-L712 pre-extraction); `this.X(...)` calls are
 * rewritten to `X(s, ...)` per the rf-parse-1/2 pattern, and the chain
 * is preserved one-for-one:
 *
 *   parse_expression -> parse_conditional -> parse_or -> parse_and ->
 *   parse_equality -> parse_comparison -> parse_term -> parse_factor ->
 *   parse_unary -> parse_postfix -> parse_primary
 *
 * The last step bridges into `parser-primary.ts`, which in turn calls
 * back into `parse_expression`, `parse_array_expression`, etc. on this
 * module. The two files form a circular import cycle that resolves at
 * function-call time (TypeScript allows ESM cycles as long as both
 * sides only use the imported names inside function bodies, not at
 * module-init time). See the comment on the `parse_primary` import.
 *
 * RISK #5 — `parse_equality`: the operator is derived via an explicit
 *           `=== '==' ? '==' : '!='` ternary on the previous token's
 *           value, NOT a cast. The pre-extraction class method had
 *           this exact shape; preserve it verbatim. A naive `as
 *           BinaryOperator` cast would silently widen.
 *
 * RISK #6 — `parse_postfix`: when the function-call callee is not an
 *           Identifier, an error is added via `ps_add_error` BUT the
 *           FunctionCall node is still constructed with `expr` cast
 *           to `Identifier`. There is no `break` or skip; the cursor
 *           advances past the args and the `)`, and downstream code
 *           sees a FunctionCall with a non-identifier callee. This
 *           "error-but-continue" recovery shape is load-bearing for
 *           callers that walk the AST after parse-with-errors.
 *
 * RISK #7 — Precedence chain order: the 10 levels encode operator
 *           precedence. Every level calls EXACTLY the next level
 *           below it; mis-routing a level (e.g. `parse_equality`
 *           calling `parse_term` instead of `parse_comparison`) re-
 *           orders precedence silently. Tests pin the chain by
 *           parsing mixed-precedence expressions and asserting the
 *           AST shape.
 */
import { create_span, parse_identifier } from './parser-literals';
// Circular import resolves at function-call time, not module-init time
// — `parse_primary` is only referenced inside the body of
// `parse_postfix`, never at top level. See parser-primary.ts for the
// matching back-edge. (rf-parse-3/4 atomic landing.)
import { parse_primary } from './parser-primary';
import { type ParserState, ps_add_error, ps_check, ps_consume, ps_match, ps_previous } from './parser-state';
import type {
  BinaryExpression,
  BinaryOperator,
  ConditionalExpression,
  Expression,
  FunctionCall,
  Identifier,
  IndexAccess,
  PropertyAccess,
  UnaryExpression,
  UnaryOperator,
} from './ast';

/**
 * Top of the expression grammar — entry point that every block- /
 * statement-level parser calls when it needs a value.
 */
export function parse_expression(s: ParserState): Expression {
  return parse_conditional(s);
}

/**
 * Conditional (ternary) expression: `cond ? then : else`. Right-
 * associative on the `else` branch — recurses into `parse_conditional`
 * (not `parse_expression`) so chained ternaries `a ? b : c ? d : e`
 * parse as `a ? b : (c ? d : e)`.
 */
export function parse_conditional(s: ParserState): Expression {
  const expr = parse_or(s);

  if (ps_match(s, 'QUESTION')) {
    const start = expr.span.start;
    const then_branch = parse_expression(s);
    ps_consume(s, 'COLON', "Expected ':' in conditional");
    const else_branch = parse_conditional(s);

    return {
      kind: 'ConditionalExpression',
      condition: expr,
      then_branch,
      else_branch,
      span: create_span(start, else_branch.span.end),
    } as ConditionalExpression;
  }

  return expr;
}

/**
 * Logical OR (`||`). Left-associative — folds left-to-right in the
 * while loop.
 */
export function parse_or(s: ParserState): Expression {
  let left = parse_and(s);

  while (ps_match(s, 'OR')) {
    const operator = '||' as BinaryOperator;
    const right = parse_and(s);
    left = {
      kind: 'BinaryExpression',
      operator,
      left,
      right,
      span: create_span(left.span.start, right.span.end),
    } as BinaryExpression;
  }

  return left;
}

/**
 * Logical AND (`&&`). Left-associative.
 */
export function parse_and(s: ParserState): Expression {
  let left = parse_equality(s);

  while (ps_match(s, 'AND')) {
    const operator = '&&' as BinaryOperator;
    const right = parse_equality(s);
    left = {
      kind: 'BinaryExpression',
      operator,
      left,
      right,
      span: create_span(left.span.start, right.span.end),
    } as BinaryExpression;
  }

  return left;
}

/**
 * Equality (`==`, `!=`).
 *
 * RISK #5 — the operator is derived via an explicit ternary on the
 * previous token's `value`, NOT a cast. Preserve verbatim. A
 * `previous().value as BinaryOperator` would compile but lose the
 * narrowing the ternary provides.
 */
export function parse_equality(s: ParserState): Expression {
  let left = parse_comparison(s);

  while (ps_match(s, 'EQUALS_EQUALS', 'NOT_EQUALS')) {
    const operator = (ps_previous(s).value === '==' ? '==' : '!=') as BinaryOperator;
    const right = parse_comparison(s);
    left = {
      kind: 'BinaryExpression',
      operator,
      left,
      right,
      span: create_span(left.span.start, right.span.end),
    } as BinaryExpression;
  }

  return left;
}

/**
 * Comparison (`<`, `<=`, `>`, `>=`). The operator is the previous
 * token's `value` cast to `BinaryOperator` — every matched token
 * type maps 1:1 to a member of the `BinaryOperator` union.
 */
export function parse_comparison(s: ParserState): Expression {
  let left = parse_term(s);

  while (ps_match(s, 'LESS_THAN', 'LESS_THAN_EQUALS', 'GREATER_THAN', 'GREATER_THAN_EQUALS')) {
    const token = ps_previous(s);
    const operator = token.value as BinaryOperator;
    const right = parse_term(s);
    left = {
      kind: 'BinaryExpression',
      operator,
      left,
      right,
      span: create_span(left.span.start, right.span.end),
    } as BinaryExpression;
  }

  return left;
}

/**
 * Additive term (`+`, `-`). Lower precedence than `parse_factor`
 * (multiplicative) — `1 + 2 * 3` parses as `1 + (2 * 3)`.
 */
export function parse_term(s: ParserState): Expression {
  let left = parse_factor(s);

  while (ps_match(s, 'PLUS', 'MINUS')) {
    const operator = ps_previous(s).value as BinaryOperator;
    const right = parse_factor(s);
    left = {
      kind: 'BinaryExpression',
      operator,
      left,
      right,
      span: create_span(left.span.start, right.span.end),
    } as BinaryExpression;
  }

  return left;
}

/**
 * Multiplicative factor (`*`, `/`, `%`). Tighter than additive.
 */
export function parse_factor(s: ParserState): Expression {
  let left = parse_unary(s);

  while (ps_match(s, 'STAR', 'SLASH', 'PERCENT')) {
    const operator = ps_previous(s).value as BinaryOperator;
    const right = parse_unary(s);
    left = {
      kind: 'BinaryExpression',
      operator,
      left,
      right,
      span: create_span(left.span.start, right.span.end),
    } as BinaryExpression;
  }

  return left;
}

/**
 * Unary prefix (`!`, `-`). Right-associative — recurses into
 * `parse_unary` on the operand so `!!x` and `--x` parse cleanly.
 */
export function parse_unary(s: ParserState): Expression {
  if (ps_match(s, 'NOT', 'MINUS')) {
    const start = ps_previous(s).position;
    const operator = ps_previous(s).value as UnaryOperator;
    const operand = parse_unary(s);
    return {
      kind: 'UnaryExpression',
      operator,
      operand,
      span: create_span(start, operand.span.end),
    } as UnaryExpression;
  }

  return parse_postfix(s);
}

/**
 * Postfix accessors and function calls — left-associative chain over
 * `.prop`, `[index]`, and `(args)` applied to a primary expression.
 *
 * RISK #6 — when the callee for a function call is not an Identifier
 * (e.g. `(x)(args)`, `foo.bar(args)`), `ps_add_error` is invoked but
 * the FunctionCall node is STILL constructed with `expr` cast to
 * `Identifier`. There is no break or skip — the cursor still advances
 * past the args and the `)`. Preserve verbatim.
 */
export function parse_postfix(s: ParserState): Expression {
  let expr = parse_primary(s);

  while (true) {
    if (ps_match(s, 'DOT')) {
      const property = parse_identifier(s);
      expr = {
        kind: 'PropertyAccess',
        object: expr,
        property,
        span: create_span(expr.span.start, property.span.end),
      } as PropertyAccess;
    } else if (ps_match(s, 'LEFT_BRACKET')) {
      const index = parse_expression(s);
      ps_consume(s, 'RIGHT_BRACKET', "Expected ']'");
      const end = ps_previous(s).position;
      expr = {
        kind: 'IndexAccess',
        object: expr,
        index,
        span: create_span(expr.span.start, end),
      } as IndexAccess;
    } else if (ps_match(s, 'LEFT_PAREN')) {
      // Function call
      const args: Expression[] = [];
      if (!ps_check(s, 'RIGHT_PAREN')) {
        do {
          args.push(parse_expression(s));
        } while (ps_match(s, 'COMMA'));
      }
      ps_consume(s, 'RIGHT_PAREN', "Expected ')'");
      const end = ps_previous(s).position;

      if (expr.kind !== 'Identifier') {
        ps_add_error(s, 'Expected function name');
      }

      expr = {
        kind: 'FunctionCall',
        callee: expr as Identifier,
        arguments: args,
        span: create_span(expr.span.start, end),
      } as FunctionCall;
    } else {
      break;
    }
  }

  return expr;
}
