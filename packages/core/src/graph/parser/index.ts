/**
 * ICE Parser Module
 *
 * Parsers for the ICE language and alternative formats (YAML, JSON).
 */

// Token types
export type { TokenType, Token, SourcePosition, SourceSpan } from './tokens';

export {
  KEYWORDS,
  is_keyword,
  get_keyword_type,
  create_token,
  create_position,
  is_token_type,
  is_one_of,
  describe_token,
} from './tokens';

// AST types
export type {
  AstNode,
  AstNodeKind,
  Program,
  Statement,
  ResourceBlock,
  DataBlock,
  VariableBlock,
  OutputBlock,
  ProviderBlock,
  ModuleBlock,
  LocalsBlock,
  ImportStatement,
  Expression,
  Identifier,
  TypeIdentifier,
  StringLiteral,
  NumberLiteral,
  BooleanLiteral,
  NullLiteral,
  ArrayExpression,
  ObjectExpression,
  ObjectProperty,
  PropertyAccess,
  IndexAccess,
  FunctionCall,
  BinaryExpression,
  UnaryExpression,
  ConditionalExpression,
  ForExpression,
  Interpolation,
  Reference,
  SplatExpression,
  Block,
  Attribute,
  NestedBlock,
  BinaryOperator,
  UnaryOperator,
  LifecycleConfig,
  ValidationRule,
  TypeExpression,
} from './ast';

export { is_node_kind, create_span, visit_ast } from './ast';

// Lexer
export type { LexerError, LexerResult, LexerOptions } from './lexer';

export { Lexer, tokenize } from './lexer';

// Parser
export type { ParserError, ParserResult, ParserOptions } from './parser';

export { Parser, parse } from './parser';

// Format parsers (YAML, JSON)
export type { FormatParserError, FormatParserResult, IceYamlSchema } from './format-parser';

export { parse_json, parse_yaml, parse_auto } from './format-parser';

// =============================================================================
// Convenience Functions
// =============================================================================

import { Lexer } from './lexer';
import { Parser } from './parser';
import type { Program } from './ast';
import type { LexerError, LexerOptions } from './lexer';
import type { ParserError, ParserOptions } from './parser';

/**
 * Combined result from lexing and parsing.
 */
interface ParseSourceResult {
  readonly program: Program | null;
  readonly lexer_errors: LexerError[];
  readonly parser_errors: ParserError[];
  readonly success: boolean;
}

/**
 * Parse ICE source code into an AST.
 */
export function parse_source(
  source: string,
  lexer_options?: Partial<LexerOptions>,
  parser_options?: Partial<ParserOptions>,
): ParseSourceResult {
  const lexer = new Lexer(source, lexer_options);
  const lexer_result = lexer.tokenize();

  if (lexer_result.errors.length > 0 && lexer_result.errors.some((e) => !e.recoverable)) {
    return {
      program: null,
      lexer_errors: lexer_result.errors,
      parser_errors: [],
      success: false,
    };
  }

  const parser = new Parser(lexer_result.tokens, parser_options);
  const parser_result = parser.parse();

  const has_errors = lexer_result.errors.length > 0 || parser_result.errors.length > 0;

  return {
    program: parser_result.program,
    lexer_errors: lexer_result.errors,
    parser_errors: parser_result.errors,
    success: !has_errors,
  };
}
