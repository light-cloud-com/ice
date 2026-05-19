# Blueprint — `packages/core/src/graph/parser/lexer.ts`

**Source**: 647 LOC. **Decomposer run**: 2026-04-30.
**Public API**: `Lexer` (class), `tokenize` (factory function), `LexerError`, `LexerResult`, `LexerOptions` — all re-exported from `packages/core/src/graph/parser/index.ts`.

**Approach**: **B — standalone functions taking a shared `LexerState` argument**, mirroring rf-parse decomposition. The `Lexer` class becomes a constructor + delegation shell.

## Modules (5 units)

### Layer 0 — types + navigation

- **rf-lex-1** `lexer-state.ts` (~90 LOC) — `LexerState` interface; `make_lexer_state` factory; navigation `ls_is_at_end`, `ls_peek`, `ls_peek_next`, `ls_advance`, `ls_match`, `ls_skip_whitespace`; token-construction `ls_add_token`, `ls_add_token_with_literal`, `ls_add_error`, `ls_current_position`. Port from L547–634. **RISK #1** (block-comment newline `column = 0` then `advance()` → 1; preserve sequence). **RISK #2** (`add_error` snapshots `pos - 1`, not `pos`).

### Layer 1 — simple scanners

- **rf-lex-2** `lexer-scanners.ts` (~160 LOC) — `scan_number`, `scan_identifier`, `scan_line_comment`, `scan_block_comment`. Character predicates `is_digit`/`is_alpha`/`is_alphanumeric` are module-private. **RISK #3** (`scan_number._negative` unused but preserve signature). **RISK #4** (3-branch keyword dispatch: TRUE/FALSE/NULL_KEYWORD). **RISK #5** (TYPE_IDENTIFIER regex `includes('.') || /^[A-Z]/.test(value)`). **RISK #6** (block-comment nested-depth counter both directions).

### Layer 2 — complex scanner

- **rf-lex-3** `lexer-heredoc.ts` (~100 LOC) — **HIGHEST-RISK UNIT.** `scan_heredoc` only. Has its own internal backtrack via `this.pos = check_start`. **RISK #7** (terminator backtrack to `check_start` not `line_start`). **RISK #8** (`content_end = line_start` + later `trimEnd()`). **RISK #9** (EOF without closing delim is silent — no error). **RISK #10** (two separate newline accounting sites — opening-line + content-line — both `s.line++; s.column = 1`).

### Final

- **rf-lex-4** orchestrator slim-down (~110 LOC). `lexer.ts` retains types, `DEFAULT_OPTIONS`, `Lexer` class with constructor + `tokenize()` + `scan_token()` dispatch (kept here as it's pure routing), `tokenize` factory.

- **rf-lex-5** final housekeeping. Verify no circular imports; confirm `index.ts` re-exports unchanged; `pnpm --filter @ice/core typecheck`.

## Behavior-risk flags (10 total)

1. **Block-comment `column = 0` not 1** — on newline inside `/*...*/`. "Correcting" to `1` drifts column tracking by +1 for all tokens after multi-line block comments.
2. **`add_error` `pos - 1` snapshot** — error token stamped after advance consumed bad char.
3. **`scan_number` unused `_negative` param** — leading `-` consumed before dispatch; signature preserved.
4. **3-branch keyword dispatch** — TRUE→BOOLEAN(true), FALSE→BOOLEAN(false), NULL_KEYWORD→NULL(null). Don't collapse.
5. **TYPE_IDENTIFIER regex** — `value.includes('.') || /^[A-Z]/.test(value)` exact form.
6. **Block-comment depth counter** — both `/*` increment and `*/` decrement load-bearing.
7. **Heredoc backtrack to `check_start`** — leading whitespace consumed for indentation check is NOT restored on terminator-match failure.
8. **`content_end = line_start` + `trimEnd()`** — content boundary set before indentation; trim applied later.
9. **EOF without closing delimiter is silent** — no `add_error` call. Don't add one.
10. **Two newline accounting sites in heredoc** — opening + content; both `s.line++; s.column = 1`.

## Public API

| Export | Kind | Consumed by | Notes |
|---|---|---|---|
| `Lexer` | class | `index.ts` L86, L110 | Constructor `(source, options?)` preserved. |
| `tokenize` | function | `index.ts` L70 | Factory `(source, options?) => LexerResult`. |
| `LexerError` | interface | `index.ts` L68, L89 | `{ message, position, recoverable }`. |
| `LexerResult` | interface | `index.ts` L68 | `{ tokens, errors }`. |
| `LexerOptions` | interface | `index.ts` L68, L89 | `{ file?, include_comments?, include_newlines?, max_errors? }`. |

All 5 exports remain on `lexer.ts`. Internal modules not exported from `index.ts`.
