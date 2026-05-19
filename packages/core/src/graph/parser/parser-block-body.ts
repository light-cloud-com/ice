/**
 * Parser Block Body (rf-parse-5, landed atomically with rf-parse-6)
 *
 * Block-body parsers extracted from the `Parser` class:
 * `parse_resource_block`, `parse_data_block`, `parse_provider_block`,
 * and `parse_block` (the recursion shared by all three). Bodies are
 * direct ports of the class methods on parser.ts pre-extraction
 * (L189-L226, L318-L333, L440-L491 pre-extraction); `this.X(...)`
 * calls are rewritten to `X(s, ...)` per the rf-parse-1/2/3/4
 * pattern.
 *
 * Co-located in this file because all three block parsers (resource,
 * data, provider) feed into `parse_block` for body recursion. Pulling
 * the four together avoids a fifth file just for the shared helper.
 *
 * RISK #11 — `parse_block` zero-label nested-block path. The outer
 *            condition admits LEFT_BRACE *or* STRING *or* IDENTIFIER
 *            as the start of a nested block. When the start is a
 *            LEFT_BRACE (zero labels), the inner `while` loop guard
 *            is `STRING || IDENTIFIER` — neither matches, so the loop
 *            exits immediately, `labels` stays `[]`, and the
 *            `parse_block(s)` recursion eats the LEFT_BRACE itself.
 *            Both conditions are load-bearing: dropping LEFT_BRACE
 *            from the outer disjunction would route a zero-label
 *            nested block down the "Unexpected token" branch and
 *            synchronize past it.
 */
import type {
  Attribute,
  Block,
  DataBlock,
  NestedBlock,
  ProviderBlock,
  ResourceBlock,
} from './ast';
import {
  type ParserState,
  ps_add_error,
  ps_advance,
  ps_check,
  ps_consume,
  ps_current,
  ps_is_at_end,
  ps_previous,
  ps_synchronize,
} from './parser-state';
import {
  create_span,
  parse_identifier,
  parse_type_identifier,
} from './parser-literals';
import { parse_expression } from './parser-binary-exprs';

/**
 * `resource <Type> <name> { ... }` — the body recurses through
 * `parse_block` so attributes and nested blocks compose. `start` is
 * snapped from `ps_current(s)` BEFORE consuming `RESOURCE`; `end`
 * is read from `ps_previous(s)` AFTER `parse_block` has consumed
 * the trailing `}`.
 */
export function parse_resource_block(s: ParserState): ResourceBlock {
  const start = ps_current(s).position;
  ps_consume(s, 'RESOURCE', "Expected 'resource'");

  const resource_type = parse_type_identifier(s);
  const name = parse_identifier(s);
  const body = parse_block(s);

  const end = ps_previous(s).position;

  return {
    kind: 'ResourceBlock',
    resource_type,
    name,
    body,
    span: create_span(start, end),
  };
}

/**
 * `data <Type> <name> { ... }` — same shape as `parse_resource_block`,
 * just a different leading keyword and node kind. The body recurses
 * through `parse_block` exactly the same way.
 */
export function parse_data_block(s: ParserState): DataBlock {
  const start = ps_current(s).position;
  ps_consume(s, 'DATA', "Expected 'data'");

  const data_type = parse_type_identifier(s);
  const name = parse_identifier(s);
  const body = parse_block(s);

  const end = ps_previous(s).position;

  return {
    kind: 'DataBlock',
    data_type,
    name,
    body,
    span: create_span(start, end),
  };
}

/**
 * `provider <name> { ... }` — no type identifier; the provider name
 * is a bare identifier. Body recurses through `parse_block`.
 */
export function parse_provider_block(s: ParserState): ProviderBlock {
  const start = ps_current(s).position;
  ps_consume(s, 'PROVIDER', "Expected 'provider'");

  const provider_name = parse_identifier(s);
  const body = parse_block(s);

  const end = ps_previous(s).position;

  return {
    kind: 'ProviderBlock',
    provider_name,
    body,
    span: create_span(start, end),
  };
}

/**
 * Block body: `{ <attrs-or-nested-blocks> }`. The opening `{` is
 * consumed here (NOT by the caller); pairs with the trailing `}`
 * consumed via `ps_consume`.
 *
 * Three branches inside the loop:
 *   1. After an identifier, `=` follows  -> attribute assignment.
 *   2. After an identifier, LEFT_BRACE / STRING / IDENTIFIER follows
 *      -> nested block (with optional labels).
 *   3. Otherwise -> error + synchronize.
 *
 * RISK #11 — In branch 2, the outer condition admits LEFT_BRACE as
 * the start of a zero-label nested block. The inner label loop
 * (`while (STRING || IDENTIFIER)`) exits immediately because neither
 * matches LEFT_BRACE, so `labels` stays `[]` and the recursive
 * `parse_block(s)` call consumes the LEFT_BRACE itself. Dropping
 * LEFT_BRACE from the outer disjunction would route zero-label
 * nested blocks down the "Unexpected token" branch and synchronize
 * past them.
 */
export function parse_block(s: ParserState): Block {
  const start = ps_current(s).position;
  ps_consume(s, 'LEFT_BRACE', "Expected '{'");

  const attributes: Attribute[] = [];
  const blocks: NestedBlock[] = [];

  while (!ps_check(s, 'RIGHT_BRACE') && !ps_is_at_end(s)) {
    const name = parse_identifier(s);

    if (ps_check(s, 'EQUALS')) {
      // Attribute
      ps_advance(s);
      const value = parse_expression(s);
      attributes.push({
        kind: 'Attribute',
        name,
        value,
        span: create_span(name.span.start, ps_previous(s).position),
      });
    } else if (
      ps_check(s, 'LEFT_BRACE') ||
      ps_check(s, 'STRING') ||
      ps_check(s, 'IDENTIFIER')
    ) {
      // Nested block
      const labels: string[] = [];
      while (ps_check(s, 'STRING') || ps_check(s, 'IDENTIFIER')) {
        if (ps_check(s, 'STRING')) {
          labels.push(ps_advance(s).literal as string);
        } else {
          labels.push(ps_advance(s).value);
        }
      }
      const nested_body = parse_block(s);
      blocks.push({
        type: name.name,
        labels,
        body: nested_body,
      });
    } else {
      ps_add_error(s, `Unexpected token after identifier '${name.name}'`);
      ps_synchronize(s);
    }
  }

  ps_consume(s, 'RIGHT_BRACE', "Expected '}'");
  const end = ps_previous(s).position;

  return {
    kind: 'Block',
    attributes,
    blocks,
    span: create_span(start, end),
  };
}
