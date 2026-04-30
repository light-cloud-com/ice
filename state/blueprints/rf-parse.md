# Blueprint — `packages/core/src/graph/parser/parser.ts`

**Source**: 1061 LOC. **Decomposer run**: 2026-04-30.
**Public API**: `Parser` (class), `parse` (factory function), `ParserError`, `ParserResult`, `ParserOptions` — all re-exported from `packages/core/src/graph/parser/index.ts`. The `parse_source` convenience function in `index.ts` constructs `new Parser(...)` directly.

**Approach**: **B — standalone functions taking a shared `ParserState` argument**, applied to all method groups except `parse_program` / `parse_statement` (which stay in the orchestrator as a thin dispatch shell).

Rationale over A (keep class intact): would only extract ~150 LOC of types. The real maintainability pain is the 10-level expression grammar chain + 9 block/statement parsers in one 900-LOC scroll.
Rationale over C (separate sub-parser classes): plain interface is simpler than class hierarchy; eliminates `this` aliasing and constructor overhead.

## Modules (8 units)

### Layer 0 — types + token navigation

- **rf-parse-1** `parser-state.ts` (~75 LOC) — `ParserState` interface (`tokens`, `pos`, `errors`, `options`); `make_parser_state` factory; navigation helpers `ps_current`, `ps_previous`, `ps_advance`, `ps_check`, `ps_match`, `ps_consume`, `ps_is_at_end`, `ps_add_error`, `ps_synchronize`. Direct port of class methods L985–1048; `this.` → `s.`. **RISK #1** (consume no-advance on error). **RISK #2** (synchronize two exits — current keyword OR previous RIGHT_BRACE).

- **rf-parse-2** `parser-literals.ts` (~85 LOC) — `parse_identifier`, `parse_type_identifier`, `parse_string_literal`, `parse_boolean_literal`, `create_null_literal`, `create_span` (parser-internal 2-arg variant; NOT to be confused with `ast.ts::create_span` 6-arg variant — different functions, same name). **RISK #3** (silent dot-skip in type-identifier). **RISK #4** (name collision with ast.ts).

### Layer 1 — expression parsers

- **rf-parse-3** `parser-binary-exprs.ts` (~210 LOC) — 10-level expression grammar chain: `parse_expression` → `parse_conditional` → `parse_or` → `parse_and` → `parse_equality` → `parse_comparison` → `parse_term` → `parse_factor` → `parse_unary` → `parse_postfix`. Imports `parse_primary` from `parser-primary.ts`. **RISK #5** (operator ternary not cast). **RISK #6** (postfix error-but-continue for non-identifier callee). **RISK #7** (precedence chain order — every level calls exactly next).

- **rf-parse-4** `parser-primary.ts` (~215 LOC) — **HIGHEST-RISK UNIT.** `parse_primary`, `parse_array_expression`, `parse_object_expression`, `parse_for_expression`, `parse_reference`. **RISK #8** (pre-advance token snapshot). **RISK #9** (`key_expr === value_expr` map-comprehension identity — no second expression parsed after FAT_ARROW; do not add). **RISK #10** (path undefined vs `[]`).

### Layer 2 — block + statement parsers

- **rf-parse-5** `parser-block-body.ts` (~145 LOC) — `parse_resource_block`, `parse_data_block`, `parse_provider_block`, `parse_block`. Co-located because all four feed into `parse_block` recursion. **RISK #11** (zero-label nested-block path: LEFT_BRACE in outer condition + inner while exits immediately).

- **rf-parse-6** `parser-statements.ts` (~225 LOC) — `parse_variable_block`, `parse_output_block`, `parse_module_block`, `parse_locals_block`, `parse_import_statement`. **RISK #12** (unknown-attribute `parse_expression()` discard advances cursor — removing causes infinite loop). **RISK #13** (output missing-value: error AND synthetic null both emitted). **RISK #14** (import statement silent token discard for non-`"as"` identifier).

### Final

- **rf-parse-7** orchestrator slim-down (~110 LOC). `parser.ts` retains: `ParserError` / `ParserResult` / `ParserOptions` / `DEFAULT_OPTIONS`, `Parser` class with constructor + `parse()` + `parse_program()` + `parse_statement()` (thin dispatch shell), `parse` factory function. Class keeps `this.state: ParserState` field; methods pass `this.state` to imported functions.

- **rf-parse-8** final housekeeping. Verify no circular imports (`parser-binary-exprs` ↔ `parser-primary` cycle resolved by passing `parse_expression` as fn arg or via direct import). Confirm `index.ts` re-exports unchanged. `pnpm --filter @ice/core typecheck`.

## Behavior-risk flags (14 total)

1. **`ps_consume` no-advance** — on mismatch, calls `add_error` then returns `current()` WITHOUT advancing. Cursor stalls so caller decides recovery.
2. **`ps_synchronize` two exits** — advances at least once, then exits on (a) statement keyword at `current()` OR (b) RIGHT_BRACE at `previous()`. Both checks load-bearing.
3. **`parse_type_identifier` silent dot-skip** — after `.` if neither IDENTIFIER nor TYPE_IDENTIFIER follows, no error/no advance. Preserve.
4. **`create_span` name collision** — parser-internal 2-arg vs ast.ts 6-arg. Different functions, same name. Don't merge.
5. **`parse_equality` operator ternary** — explicit `=== '==' ? '==' : '!='` not cast. Preserve.
6. **`parse_postfix` error-but-continue** — non-identifier callee: `add_error` fires but FunctionCall node still constructed. No break/skip.
7. **Precedence chain order** — 10-level chain encodes operator precedence. Every level must call next.
8. **`parse_primary` pre-advance snapshot** — `const token = current()` then `match(...)` advances. All reads use snapshot.
9. **`parse_for_expression` key/value identity** — when FAT_ARROW matched, `key_expr === value_expr` (same object reference); no second expression parsed.
10. **`parse_reference` path undefined** — `path.length > 0 ? path : undefined` returns undefined, not `[]`.
11. **`parse_block` zero-label nested-block** — LEFT_BRACE in outer condition + inner while exits immediately when neither STRING nor IDENTIFIER. Both conditions load-bearing.
12. **Unknown-attribute `parse_expression()` discard** — advances cursor past unknown values; removing causes infinite loop in outer while.
13. **`parse_output_block` missing value** — both `add_error` AND `create_null_literal(start)` emitted. Error not suppressed by recovery.
14. **`parse_import_statement` silent discard** — non-`"as"` identifier after path is consumed by `match('IDENTIFIER')` and dropped. No error, no backtrack.

## Public API

| Export | Kind | Consumed by | Notes |
|---|---|---|---|
| `Parser` | class | `index.ts` L86 (`parse_source`); direct consumers | Constructor `(tokens, options?)` preserved. |
| `parse` | function | `index.ts` L74 | Factory `(tokens, options?) => ParserResult`. |
| `ParserError` | interface | `index.ts` L73 | `{ message, position, token? }`. |
| `ParserResult` | interface | `index.ts` L73, L96 | `{ program: Program \| null, errors: ParserError[] }`. |
| `ParserOptions` | interface | `index.ts` L73, L108 | `{ max_errors?, error_recovery? }`. |

All 5 exports remain on `parser.ts`. No re-export shims required. Internal modules (`parser-state.ts`, etc.) are not exported from `index.ts`.
