/**
 * Token Definitions
 *
 * Token types and structures for the ICE language lexer.
 */

// =============================================================================
// Token Types
// =============================================================================

/**
 * All token types in the ICE language.
 */
export type TokenType =
  // Literals
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'NULL'

  // Identifiers
  | 'IDENTIFIER'
  | 'TYPE_IDENTIFIER'

  // Keywords
  | 'RESOURCE'
  | 'DATA'
  | 'VARIABLE'
  | 'OUTPUT'
  | 'PROVIDER'
  | 'MODULE'
  | 'LOCALS'
  | 'IMPORT'
  | 'FOR'
  | 'IN'
  | 'IF'
  | 'ELSE'
  | 'TRUE'
  | 'FALSE'
  | 'NULL_KEYWORD'

  // Operators
  | 'EQUALS'
  | 'EQUALS_EQUALS'
  | 'NOT_EQUALS'
  | 'LESS_THAN'
  | 'LESS_THAN_EQUALS'
  | 'GREATER_THAN'
  | 'GREATER_THAN_EQUALS'
  | 'PLUS'
  | 'MINUS'
  | 'STAR'
  | 'SLASH'
  | 'PERCENT'
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'QUESTION'
  | 'COLON'
  | 'ARROW'
  | 'FAT_ARROW'
  | 'DOT'
  | 'DOTDOT'
  | 'SPREAD'

  // Delimiters
  | 'LEFT_PAREN'
  | 'RIGHT_PAREN'
  | 'LEFT_BRACE'
  | 'RIGHT_BRACE'
  | 'LEFT_BRACKET'
  | 'RIGHT_BRACKET'
  | 'COMMA'
  | 'SEMICOLON'
  | 'NEWLINE'

  // Special
  | 'INTERPOLATION_START'
  | 'INTERPOLATION_END'
  | 'HEREDOC_START'
  | 'HEREDOC_END'
  | 'COMMENT'
  | 'EOF'
  | 'ERROR';

/**
 * Token with position information.
 */
export interface Token {
  /** Token type */
  readonly type: TokenType;

  /** Token value (lexeme) */
  readonly value: string;

  /** Parsed literal value for literals */
  readonly literal?: unknown;

  /** Source position */
  readonly position: SourcePosition;
}

/**
 * Source position for error reporting.
 */
export interface SourcePosition {
  /** Line number (1-indexed) */
  readonly line: number;

  /** Column number (1-indexed) */
  readonly column: number;

  /** Character offset from start */
  readonly offset: number;

  /** Length of the token */
  readonly length: number;

  /** Source file path */
  readonly file?: string;
}

/**
 * Source span covering multiple positions.
 */
export interface SourceSpan {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

// =============================================================================
// Keywords
// =============================================================================

/**
 * Reserved keywords in the ICE language.
 */
export const KEYWORDS: Record<string, TokenType> = {
  resource: 'RESOURCE',
  data: 'DATA',
  variable: 'VARIABLE',
  output: 'OUTPUT',
  provider: 'PROVIDER',
  module: 'MODULE',
  locals: 'LOCALS',
  import: 'IMPORT',
  for: 'FOR',
  in: 'IN',
  if: 'IF',
  else: 'ELSE',
  true: 'TRUE',
  false: 'FALSE',
  null: 'NULL_KEYWORD',
};

/**
 * Check if a string is a keyword.
 */
export function is_keyword(value: string): boolean {
  return value in KEYWORDS;
}

/**
 * Get the token type for a keyword.
 */
export function get_keyword_type(value: string): TokenType | undefined {
  return KEYWORDS[value];
}

// =============================================================================
// Token Utilities
// =============================================================================

/**
 * Create a token.
 */
export function create_token(type: TokenType, value: string, position: SourcePosition, literal?: unknown): Token {
  return {
    type,
    value,
    position,
    literal,
  };
}

/**
 * Create a source position.
 */
export function create_position(
  line: number,
  column: number,
  offset: number,
  length: number,
  file?: string,
): SourcePosition {
  return { line, column, offset, length, file };
}

/**
 * Check if a token is of a specific type.
 */
export function is_token_type(token: Token, type: TokenType): boolean {
  return token.type === type;
}

/**
 * Check if a token is one of several types.
 */
export function is_one_of(token: Token, ...types: TokenType[]): boolean {
  return types.includes(token.type);
}

/**
 * Get a human-readable token description.
 */
export function describe_token(type: TokenType): string {
  const descriptions: Record<TokenType, string> = {
    STRING: 'string',
    NUMBER: 'number',
    BOOLEAN: 'boolean',
    NULL: 'null',
    IDENTIFIER: 'identifier',
    TYPE_IDENTIFIER: 'type identifier',
    RESOURCE: "'resource'",
    DATA: "'data'",
    VARIABLE: "'variable'",
    OUTPUT: "'output'",
    PROVIDER: "'provider'",
    MODULE: "'module'",
    LOCALS: "'locals'",
    IMPORT: "'import'",
    FOR: "'for'",
    IN: "'in'",
    IF: "'if'",
    ELSE: "'else'",
    TRUE: "'true'",
    FALSE: "'false'",
    NULL_KEYWORD: "'null'",
    EQUALS: "'='",
    EQUALS_EQUALS: "'=='",
    NOT_EQUALS: "'!='",
    LESS_THAN: "'<'",
    LESS_THAN_EQUALS: "'<='",
    GREATER_THAN: "'>'",
    GREATER_THAN_EQUALS: "'>='",
    PLUS: "'+'",
    MINUS: "'-'",
    STAR: "'*'",
    SLASH: "'/'",
    PERCENT: "'%'",
    AND: "'&&'",
    OR: "'||'",
    NOT: "'!'",
    QUESTION: "'?'",
    COLON: "':'",
    ARROW: "'->'",
    FAT_ARROW: "'=>'",
    DOT: "'.'",
    DOTDOT: "'..'",
    SPREAD: "'...'",
    LEFT_PAREN: "'('",
    RIGHT_PAREN: "')'",
    LEFT_BRACE: "'{'",
    RIGHT_BRACE: "'}'",
    LEFT_BRACKET: "'['",
    RIGHT_BRACKET: "']'",
    COMMA: "','",
    SEMICOLON: "';'",
    NEWLINE: 'newline',
    INTERPOLATION_START: "'${'",
    INTERPOLATION_END: "'}'",
    HEREDOC_START: 'heredoc start',
    HEREDOC_END: 'heredoc end',
    COMMENT: 'comment',
    EOF: 'end of file',
    ERROR: 'error',
  };

  return descriptions[type] ?? type;
}
