/**
 * Format Parsers
 *
 * Parsers for alternative input formats (YAML, JSON).
 * These convert from YAML/JSON to the internal AST representation.
 */

import type { SourcePosition, SourceSpan } from './tokens.js';
import type {
  Program,
  Statement,
  ResourceBlock,
  DataBlock,
  VariableBlock,
  OutputBlock,
  LocalsBlock,
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
  Block,
  Attribute,
  Reference,
} from './ast.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Format parser error.
 */
export interface FormatParserError {
  readonly message: string;
  readonly path?: string;
  readonly line?: number;
  readonly column?: number;
}

/**
 * Format parser result.
 */
export interface FormatParserResult {
  readonly program: Program | null;
  readonly errors: FormatParserError[];
}

/**
 * ICE YAML/JSON schema for resources.
 */
export interface IceYamlSchema {
  version?: string;
  providers?: Record<string, ProviderYaml>;
  resources?: Record<string, ResourceYaml>;
  data?: Record<string, DataYaml>;
  variables?: Record<string, VariableYaml>;
  outputs?: Record<string, OutputYaml>;
  locals?: Record<string, unknown>;
}

interface ProviderYaml {
  region?: string;
  [key: string]: unknown;
}

interface ResourceYaml {
  type: string;
  properties?: Record<string, unknown>;
  depends_on?: string[];
  count?: number | string;
  for_each?: unknown;
  provider?: string;
  lifecycle?: {
    create_before_destroy?: boolean;
    prevent_destroy?: boolean;
    ignore_changes?: string[];
  };
}

interface DataYaml {
  type: string;
  properties?: Record<string, unknown>;
}

interface VariableYaml {
  type?: string;
  default?: unknown;
  description?: string;
  sensitive?: boolean;
  validation?: {
    condition: string;
    error_message: string;
  }[];
}

interface OutputYaml {
  value: unknown;
  description?: string;
  sensitive?: boolean;
}

// =============================================================================
// JSON Parser
// =============================================================================

/**
 * Parse JSON input into an ICE AST.
 */
export function parse_json(input: string, file?: string): FormatParserResult {
  const errors: FormatParserError[] = [];

  try {
    const data = JSON.parse(input) as IceYamlSchema;
    const program = convert_schema_to_ast(data, file ?? '<json>');
    return { program, errors };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    errors.push({
      message: `JSON parse error: ${err.message}`,
    });
    return { program: null, errors };
  }
}

// =============================================================================
// YAML Parser
// =============================================================================

/**
 * Parse YAML input into an ICE AST.
 * Note: Requires js-yaml to be installed for actual YAML parsing.
 */
export async function parse_yaml(input: string, file?: string): Promise<FormatParserResult> {
  const errors: FormatParserError[] = [];

  try {
    // Dynamic import of js-yaml
    const yaml = await import('js-yaml').catch(() => null);

    if (!yaml) {
      errors.push({
        message: 'YAML parsing requires js-yaml package. Install with: npm install js-yaml',
      });
      return { program: null, errors };
    }

    const data = yaml.load(input) as IceYamlSchema;
    const program = convert_schema_to_ast(data, file ?? '<yaml>');
    return { program, errors };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    errors.push({
      message: `YAML parse error: ${err.message}`,
    });
    return { program: null, errors };
  }
}

// =============================================================================
// Schema to AST Conversion
// =============================================================================

/**
 * Convert YAML/JSON schema to AST.
 */
function convert_schema_to_ast(schema: IceYamlSchema, file: string): Program {
  const statements: Statement[] = [];
  const span = create_dummy_span(file);

  // Convert resources
  if (schema.resources) {
    for (const [name, resource] of Object.entries(schema.resources)) {
      statements.push(convert_resource(name, resource, file));
    }
  }

  // Convert data sources
  if (schema.data) {
    for (const [name, data] of Object.entries(schema.data)) {
      statements.push(convert_data(name, data, file));
    }
  }

  // Convert variables
  if (schema.variables) {
    for (const [name, variable] of Object.entries(schema.variables)) {
      statements.push(convert_variable(name, variable, file));
    }
  }

  // Convert outputs
  if (schema.outputs) {
    for (const [name, output] of Object.entries(schema.outputs)) {
      statements.push(convert_output(name, output, file));
    }
  }

  // Convert locals
  if (schema.locals && Object.keys(schema.locals).length > 0) {
    statements.push(convert_locals(schema.locals, file));
  }

  return {
    kind: 'Program',
    statements,
    span,
  };
}

/**
 * Convert resource YAML to AST.
 */
function convert_resource(name: string, resource: ResourceYaml, file: string): ResourceBlock {
  const span = create_dummy_span(file);

  const attributes: Attribute[] = [];

  if (resource.properties) {
    for (const [key, value] of Object.entries(resource.properties)) {
      attributes.push({
        kind: 'Attribute',
        name: create_identifier(key, file),
        value: convert_value(value, file),
        span,
      });
    }
  }

  const depends_on = resource.depends_on?.map((dep) => parse_reference_string(dep, file));

  return {
    kind: 'ResourceBlock',
    resource_type: create_type_identifier(resource.type, file),
    name: create_identifier(name, file),
    body: {
      kind: 'Block',
      attributes,
      blocks: [],
      span,
    },
    depends_on,
    span,
  };
}

/**
 * Convert data YAML to AST.
 */
function convert_data(name: string, data: DataYaml, file: string): DataBlock {
  const span = create_dummy_span(file);

  const attributes: Attribute[] = [];

  if (data.properties) {
    for (const [key, value] of Object.entries(data.properties)) {
      attributes.push({
        kind: 'Attribute',
        name: create_identifier(key, file),
        value: convert_value(value, file),
        span,
      });
    }
  }

  return {
    kind: 'DataBlock',
    data_type: create_type_identifier(data.type, file),
    name: create_identifier(name, file),
    body: {
      kind: 'Block',
      attributes,
      blocks: [],
      span,
    },
    span,
  };
}

/**
 * Convert variable YAML to AST.
 */
function convert_variable(name: string, variable: VariableYaml, file: string): VariableBlock {
  const span = create_dummy_span(file);

  return {
    kind: 'VariableBlock',
    name: create_identifier(name, file),
    default_value: variable.default !== undefined ? convert_value(variable.default, file) : undefined,
    description: variable.description ? create_string_literal(variable.description, file) : undefined,
    sensitive: variable.sensitive,
    span,
  };
}

/**
 * Convert output YAML to AST.
 */
function convert_output(name: string, output: OutputYaml, file: string): OutputBlock {
  const span = create_dummy_span(file);

  return {
    kind: 'OutputBlock',
    name: create_identifier(name, file),
    value: convert_value(output.value, file),
    description: output.description ? create_string_literal(output.description, file) : undefined,
    sensitive: output.sensitive,
    span,
  };
}

/**
 * Convert locals YAML to AST.
 */
function convert_locals(locals: Record<string, unknown>, file: string): LocalsBlock {
  const span = create_dummy_span(file);
  const values: Record<string, Expression> = {};

  for (const [key, value] of Object.entries(locals)) {
    values[key] = convert_value(value, file);
  }

  return {
    kind: 'LocalsBlock',
    values,
    span,
  };
}

/**
 * Convert a value to an expression.
 */
function convert_value(value: unknown, file: string): Expression {
  const span = create_dummy_span(file);

  if (value === null || value === undefined) {
    return { kind: 'NullLiteral', span } as NullLiteral;
  }

  if (typeof value === 'string') {
    // Check if it's a reference expression
    if (value.startsWith('${') && value.endsWith('}')) {
      const ref_content = value.slice(2, -1).trim();
      return parse_reference_string(ref_content, file);
    }
    return create_string_literal(value, file);
  }

  if (typeof value === 'number') {
    return { kind: 'NumberLiteral', value, span } as NumberLiteral;
  }

  if (typeof value === 'boolean') {
    return { kind: 'BooleanLiteral', value, span } as BooleanLiteral;
  }

  if (Array.isArray(value)) {
    const elements = value.map((v) => convert_value(v, file));
    return { kind: 'ArrayExpression', elements, span } as ArrayExpression;
  }

  if (typeof value === 'object') {
    const properties: ObjectProperty[] = [];
    for (const [key, val] of Object.entries(value)) {
      properties.push({
        key: create_string_literal(key, file),
        value: convert_value(val, file),
      });
    }
    return { kind: 'ObjectExpression', properties, span } as ObjectExpression;
  }

  return { kind: 'NullLiteral', span } as NullLiteral;
}

/**
 * Parse a reference string (e.g., "var.name", "resource.type.name.attr").
 */
function parse_reference_string(ref: string, file: string): Reference {
  const span = create_dummy_span(file);
  const parts = ref.split('.');

  if (parts.length < 2) {
    // Not a valid reference, return as identifier
    return {
      kind: 'Reference',
      ref_type: 'var',
      name: ref,
      span,
    } as Reference;
  }

  const ref_type = parts[0];
  let type_name: string | undefined;
  let name: string;
  let path: string[] | undefined;

  switch (ref_type) {
    case 'var':
    case 'local':
    case 'module':
    case 'path':
      name = parts[1] ?? '';
      if (parts.length > 2) {
        path = parts.slice(2);
      }
      break;

    case 'data':
      type_name = parts[1] ?? '';
      name = parts[2] ?? '';
      if (parts.length > 3) {
        path = parts.slice(3);
      }
      break;

    default:
      // Assume it's a resource reference: resource_type.name.attr
      return {
        kind: 'Reference',
        ref_type: 'resource',
        type_name: parts[0] ?? '',
        name: parts[1] ?? '',
        path: parts.length > 2 ? parts.slice(2) : undefined,
        span,
      } as Reference;
  }

  return {
    kind: 'Reference',
    ref_type: ref_type as Reference['ref_type'],
    type_name,
    name,
    path,
    span,
  } as Reference;
}

// =============================================================================
// Helper Functions
// =============================================================================

function create_identifier(name: string, file: string): Identifier {
  return {
    kind: 'Identifier',
    name,
    span: create_dummy_span(file),
  };
}

function create_type_identifier(name: string, file: string): TypeIdentifier {
  return {
    kind: 'TypeIdentifier',
    name,
    span: create_dummy_span(file),
  };
}

function create_string_literal(value: string, file: string): StringLiteral {
  return {
    kind: 'StringLiteral',
    value,
    span: create_dummy_span(file),
  };
}

function create_dummy_span(file: string): SourceSpan {
  const pos: SourcePosition = {
    line: 1,
    column: 1,
    offset: 0,
    length: 0,
    file,
  };
  return { start: pos, end: pos };
}

// =============================================================================
// Auto-Detection
// =============================================================================

/**
 * Detect format and parse accordingly.
 */
export async function parse_auto(input: string, file?: string): Promise<FormatParserResult> {
  const trimmed = input.trim();

  // Try JSON first (starts with { or [)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parse_json(input, file);
  }

  // Try YAML for anything else
  return parse_yaml(input, file);
}
