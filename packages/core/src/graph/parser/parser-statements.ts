/**
 * Parser Statements (rf-parse-6, landed atomically with rf-parse-5)
 *
 * Statement-level parsers extracted from the `Parser` class:
 * `parse_variable_block`, `parse_output_block`, `parse_module_block`,
 * `parse_locals_block`, and `parse_import_statement`. Bodies are
 * direct ports of the class methods on parser.ts pre-extraction
 * (L227-L316, L335-L438 pre-extraction); `this.X(...)` calls are
 * rewritten to `X(s, ...)` per the rf-parse-1/2/3/4 pattern.
 *
 * Three of the five statement parsers (`variable`, `output`,
 * `module`) walk an attribute loop with a `default` branch that
 * calls `parse_expression(s)` purely for its side effect of
 * advancing the cursor — see RISK #12. `parse_locals_block` does
 * the same implicitly because every attribute has a value.
 *
 * RISK #12 — Unknown-attribute `parse_expression(s)` discard. In
 *            `parse_variable_block` / `parse_output_block` /
 *            `parse_module_block`, the `default:` branch of the
 *            attr-name switch calls `parse_expression(s)` and
 *            ignores the return. The call's side effect is
 *            advancing the cursor PAST the unknown value; without
 *            it, the outer `while` re-enters with the cursor still
 *            on the bad value's first token and loops forever.
 *            Removing the discard regresses to an infinite loop on
 *            any block with an unknown attribute.
 *
 * RISK #13 — `parse_output_block` missing-value recovery. After the
 *            attribute loop, if `value` is still undefined, BOTH a
 *            `ps_add_error` AND a synthetic `create_null_literal`
 *            are emitted. The error is NOT suppressed by the
 *            recovery; downstream callers see both an error in the
 *            errors array AND a NullLiteral in the OutputBlock's
 *            `value` field.
 *
 * RISK #14 — `parse_import_statement` silent token discard. After
 *            the path string, `ps_match(s, 'IDENTIFIER')` consumes
 *            ANY identifier. The "is it `as`?" check happens AFTER
 *            the consume — so a non-`as` identifier (e.g. `notas`,
 *            `foo`) is silently dropped. No error, no backtrack.
 *            Preserve verbatim: the lookahead-then-discard shape is
 *            load-bearing for callers that have used arbitrary
 *            trailing words as comments.
 */
import type {
  Attribute,
  Expression,
  Identifier,
  ImportStatement,
  LocalsBlock,
  ModuleBlock,
  OutputBlock,
  StringLiteral,
  VariableBlock,
} from './ast.js';
import {
  type ParserState,
  ps_add_error,
  ps_check,
  ps_consume,
  ps_current,
  ps_is_at_end,
  ps_match,
  ps_previous,
} from './parser-state.js';
import {
  create_null_literal,
  create_span,
  parse_boolean_literal,
  parse_identifier,
  parse_string_literal,
} from './parser-literals.js';
import { parse_expression } from './parser-binary-exprs.js';

/**
 * `variable <name> { description?, default?, sensitive?, ... }`. The
 * loop walks the attribute body until `}` and dispatches on the
 * attribute name; unknown attributes go through a discard path that
 * still consumes their value via `parse_expression(s)` (RISK #12).
 */
export function parse_variable_block(s: ParserState): VariableBlock {
  const start = ps_current(s).position;
  ps_consume(s, 'VARIABLE', "Expected 'variable'");

  const name = parse_identifier(s);
  ps_consume(s, 'LEFT_BRACE', "Expected '{'");

  let description: StringLiteral | undefined;
  let default_value: Expression | undefined;
  let sensitive: boolean | undefined;

  while (!ps_check(s, 'RIGHT_BRACE') && !ps_is_at_end(s)) {
    const attr_name = parse_identifier(s);
    ps_consume(s, 'EQUALS', "Expected '='");

    switch (attr_name.name) {
      case 'description':
        description = parse_string_literal(s);
        break;
      case 'default':
        default_value = parse_expression(s);
        break;
      case 'sensitive':
        sensitive = parse_boolean_literal(s)?.value;
        break;
      default:
        parse_expression(s); // Skip unknown attributes
    }
  }

  ps_consume(s, 'RIGHT_BRACE', "Expected '}'");
  const end = ps_previous(s).position;

  return {
    kind: 'VariableBlock',
    name,
    description,
    default_value,
    sensitive,
    span: create_span(start, end),
  };
}

/**
 * `output <name> { value, description?, sensitive?, ... }`.
 *
 * RISK #13 — when `value` is missing after the loop, BOTH an error
 * (`"Output block requires 'value' attribute"`) AND a synthetic
 * `create_null_literal` are emitted. The recovery does NOT suppress
 * the error; both are observable.
 */
export function parse_output_block(s: ParserState): OutputBlock {
  const start = ps_current(s).position;
  ps_consume(s, 'OUTPUT', "Expected 'output'");

  const name = parse_identifier(s);
  ps_consume(s, 'LEFT_BRACE', "Expected '{'");

  let value: Expression | undefined;
  let description: StringLiteral | undefined;
  let sensitive: boolean | undefined;

  while (!ps_check(s, 'RIGHT_BRACE') && !ps_is_at_end(s)) {
    const attr_name = parse_identifier(s);
    ps_consume(s, 'EQUALS', "Expected '='");

    switch (attr_name.name) {
      case 'value':
        value = parse_expression(s);
        break;
      case 'description':
        description = parse_string_literal(s);
        break;
      case 'sensitive':
        sensitive = parse_boolean_literal(s)?.value;
        break;
      default:
        parse_expression(s);
    }
  }

  ps_consume(s, 'RIGHT_BRACE', "Expected '}'");
  const end = ps_previous(s).position;

  if (!value) {
    ps_add_error(s, "Output block requires 'value' attribute");
    value = create_null_literal(s, start);
  }

  return {
    kind: 'OutputBlock',
    name,
    value,
    description,
    sensitive,
    span: create_span(start, end),
  };
}

/**
 * `module <name> { source = "...", version?, ... }`. Unknown
 * attributes are accumulated into `attributes[]` (NOT discarded
 * like in `parse_variable_block` / `parse_output_block`); the
 * `body.blocks` field is always `[]`.
 *
 * If `source` is missing after the loop, an error is emitted AND
 * a synthetic empty-string literal is filled in (mirrors RISK #13's
 * shape but for `source` rather than `value`).
 */
export function parse_module_block(s: ParserState): ModuleBlock {
  const start = ps_current(s).position;
  ps_consume(s, 'MODULE', "Expected 'module'");

  const name = parse_identifier(s);
  ps_consume(s, 'LEFT_BRACE', "Expected '{'");

  let source: StringLiteral | undefined;
  let version: StringLiteral | undefined;
  const attributes: Attribute[] = [];

  while (!ps_check(s, 'RIGHT_BRACE') && !ps_is_at_end(s)) {
    const attr_name = parse_identifier(s);
    ps_consume(s, 'EQUALS', "Expected '='");

    if (attr_name.name === 'source') {
      source = parse_string_literal(s);
    } else if (attr_name.name === 'version') {
      version = parse_string_literal(s);
    } else {
      const value = parse_expression(s);
      attributes.push({
        kind: 'Attribute',
        name: attr_name,
        value,
        span: create_span(attr_name.span.start, ps_previous(s).position),
      });
    }
  }

  ps_consume(s, 'RIGHT_BRACE', "Expected '}'");
  const end = ps_previous(s).position;

  if (!source) {
    ps_add_error(s, "Module block requires 'source' attribute");
    source = {
      kind: 'StringLiteral',
      value: '',
      span: create_span(start, start),
    };
  }

  return {
    kind: 'ModuleBlock',
    name,
    source,
    version,
    body: {
      kind: 'Block',
      attributes,
      blocks: [],
      span: create_span(start, end),
    },
    span: create_span(start, end),
  };
}

/**
 * `locals { <name> = <expr>, ... }`. Each entry is collected into
 * a string-keyed record; later definitions of the same name shadow
 * earlier ones (object-assignment semantics).
 */
export function parse_locals_block(s: ParserState): LocalsBlock {
  const start = ps_current(s).position;
  ps_consume(s, 'LOCALS', "Expected 'locals'");
  ps_consume(s, 'LEFT_BRACE', "Expected '{'");

  const values: Record<string, Expression> = {};

  while (!ps_check(s, 'RIGHT_BRACE') && !ps_is_at_end(s)) {
    const name = parse_identifier(s);
    ps_consume(s, 'EQUALS', "Expected '='");
    const value = parse_expression(s);
    values[name.name] = value;
  }

  ps_consume(s, 'RIGHT_BRACE', "Expected '}'");
  const end = ps_previous(s).position;

  return {
    kind: 'LocalsBlock',
    values,
    span: create_span(start, end),
  };
}

/**
 * `import "<path>"` or `import "<path>" as <alias>`.
 *
 * RISK #14 — `ps_match(s, 'IDENTIFIER')` consumes ANY identifier
 * after the path string; the "is it `as`?" check happens AFTER the
 * consume via `ps_previous(s).value === 'as'`. A non-`as` identifier
 * (e.g. `notas`, `foo`) is therefore silently swallowed and `alias`
 * stays undefined. No error, no backtrack. Preserve verbatim.
 */
export function parse_import_statement(s: ParserState): ImportStatement {
  const start = ps_current(s).position;
  ps_consume(s, 'IMPORT', "Expected 'import'");

  const path = parse_string_literal(s);

  let alias: Identifier | undefined;
  if (ps_match(s, 'IDENTIFIER')) {
    // Check for "as" keyword
    if (ps_previous(s).value === 'as') {
      alias = parse_identifier(s);
    }
  }

  const end = ps_previous(s).position;

  return {
    kind: 'ImportStatement',
    path,
    alias,
    span: create_span(start, end),
  };
}
