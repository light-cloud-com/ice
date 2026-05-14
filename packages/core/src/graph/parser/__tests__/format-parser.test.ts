/**
 * Tests for `format-parser.ts` — JSON / YAML / auto-detect parsing of
 * the ICE schema into the internal AST.
 *
 * Covers every Schema → AST conversion branch: resources, data sources,
 * variables, outputs, locals (including the empty-locals skip), every
 * value-conversion branch (null, undefined, string, reference, number,
 * boolean, array, nested object, and the unreachable `unknown` fallback
 * driven via `Symbol`), and every reference-string branch (var/local/
 * module/path with and without trailing path, data with and without
 * trailing path, the resource default, and the <2-parts identifier
 * fallback). Format selection: explicit JSON, explicit YAML, auto-detect
 * for both, JSON parse error, YAML parse error.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parse_json, parse_yaml, parse_auto } from '../format-parser';
import type {
  Program,
  ResourceBlock,
  DataBlock,
  VariableBlock,
  OutputBlock,
  LocalsBlock,
  StringLiteral,
  NumberLiteral,
  BooleanLiteral,
  NullLiteral,
  ArrayExpression,
  ObjectExpression,
  Reference,
} from '../ast';

// -----------------------------------------------------------------------------
// parse_json — happy path + every block type
// -----------------------------------------------------------------------------

describe('parse_json', () => {
  it('returns a Program with no statements for an empty schema object', () => {
    const result = parse_json('{}');

    expect(result.errors).toHaveLength(0);
    expect(result.program).not.toBeNull();
    expect(result.program?.kind).toBe('Program');
    expect(result.program?.statements).toEqual([]);
  });

  it('threads the supplied file name into the program span', () => {
    const result = parse_json('{}', 'inline.json');

    expect(result.program?.span.start.file).toBe('inline.json');
  });

  it('falls back to "<json>" when no file name is supplied', () => {
    const result = parse_json('{}');

    expect(result.program?.span.start.file).toBe('<json>');
  });

  it('returns a JSON parse error for malformed input', () => {
    const result = parse_json('{ not valid json');

    expect(result.program).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('JSON parse error');
  });

  it('converts a resource entry to a ResourceBlock with attributes from properties', () => {
    const result = parse_json(
      JSON.stringify({
        resources: {
          web: {
            type: 'aws.ec2.instance',
            properties: { ami: 'ami-123', count: 3 },
          },
        },
      }),
    );

    const program = result.program as Program;
    expect(program.statements).toHaveLength(1);
    const block = program.statements[0] as ResourceBlock;
    expect(block.kind).toBe('ResourceBlock');
    expect(block.resource_type.name).toBe('aws.ec2.instance');
    expect(block.name.name).toBe('web');
    expect(block.body.attributes).toHaveLength(2);
    expect(block.body.attributes[0]?.name.name).toBe('ami');
    expect((block.body.attributes[0]?.value as StringLiteral).value).toBe('ami-123');
    expect((block.body.attributes[1]?.value as NumberLiteral).value).toBe(3);
  });

  it('omits attributes when properties is missing', () => {
    const result = parse_json(
      JSON.stringify({
        resources: {
          empty: { type: 'aws.s3.bucket' },
        },
      }),
    );

    const block = (result.program as Program).statements[0] as ResourceBlock;
    expect(block.body.attributes).toHaveLength(0);
  });

  it('parses depends_on entries into Reference nodes', () => {
    const result = parse_json(
      JSON.stringify({
        resources: {
          web: {
            type: 'aws.ec2.instance',
            depends_on: ['var.region', 'aws.iam.role.app.arn'],
          },
        },
      }),
    );

    const block = (result.program as Program).statements[0] as ResourceBlock;
    expect(block.depends_on).toHaveLength(2);
    expect(block.depends_on?.[0]?.ref_type).toBe('var');
    expect(block.depends_on?.[0]?.name).toBe('region');
    expect(block.depends_on?.[1]?.ref_type).toBe('resource');
    expect(block.depends_on?.[1]?.type_name).toBe('aws');
  });

  it('omits depends_on when not provided', () => {
    const result = parse_json(
      JSON.stringify({
        resources: {
          web: { type: 'aws.ec2.instance' },
        },
      }),
    );

    const block = (result.program as Program).statements[0] as ResourceBlock;
    expect(block.depends_on).toBeUndefined();
  });

  it('converts data entries to DataBlock with attributes', () => {
    const result = parse_json(
      JSON.stringify({
        data: {
          ami: {
            type: 'aws.ami',
            properties: { name: 'amzn2' },
          },
        },
      }),
    );

    const block = (result.program as Program).statements[0] as DataBlock;
    expect(block.kind).toBe('DataBlock');
    expect(block.data_type.name).toBe('aws.ami');
    expect(block.name.name).toBe('ami');
    expect(block.body.attributes).toHaveLength(1);
    expect(block.body.attributes[0]?.name.name).toBe('name');
  });

  it('omits data attributes when properties is missing', () => {
    const result = parse_json(
      JSON.stringify({
        data: {
          empty: { type: 'aws.ami' },
        },
      }),
    );

    const block = (result.program as Program).statements[0] as DataBlock;
    expect(block.body.attributes).toHaveLength(0);
  });

  it('converts a variable with default + description + sensitive', () => {
    const result = parse_json(
      JSON.stringify({
        variables: {
          region: {
            default: 'us-east-1',
            description: 'AWS region',
            sensitive: true,
          },
        },
      }),
    );

    const block = (result.program as Program).statements[0] as VariableBlock;
    expect(block.kind).toBe('VariableBlock');
    expect(block.name.name).toBe('region');
    expect((block.default_value as StringLiteral).value).toBe('us-east-1');
    expect(block.description?.value).toBe('AWS region');
    expect(block.sensitive).toBe(true);
  });

  it('omits variable optional fields when absent', () => {
    const result = parse_json(
      JSON.stringify({
        variables: {
          region: {},
        },
      }),
    );

    const block = (result.program as Program).statements[0] as VariableBlock;
    expect(block.default_value).toBeUndefined();
    expect(block.description).toBeUndefined();
    expect(block.sensitive).toBeUndefined();
  });

  it('preserves a variable default of null as a NullLiteral (default !== undefined)', () => {
    // The conversion checks `variable.default !== undefined`, so an
    // explicit `null` default still produces a NullLiteral.
    const result = parse_json(
      JSON.stringify({
        variables: {
          region: { default: null },
        },
      }),
    );

    const block = (result.program as Program).statements[0] as VariableBlock;
    expect(block.default_value?.kind).toBe('NullLiteral');
  });

  it('converts an output with description + sensitive', () => {
    const result = parse_json(
      JSON.stringify({
        outputs: {
          url: {
            value: 'https://example.com',
            description: 'Public URL',
            sensitive: false,
          },
        },
      }),
    );

    const block = (result.program as Program).statements[0] as OutputBlock;
    expect(block.kind).toBe('OutputBlock');
    expect(block.name.name).toBe('url');
    expect((block.value as StringLiteral).value).toBe('https://example.com');
    expect(block.description?.value).toBe('Public URL');
    expect(block.sensitive).toBe(false);
  });

  it('omits output optional fields when absent', () => {
    const result = parse_json(
      JSON.stringify({
        outputs: {
          url: { value: 'x' },
        },
      }),
    );

    const block = (result.program as Program).statements[0] as OutputBlock;
    expect(block.description).toBeUndefined();
    expect(block.sensitive).toBeUndefined();
  });

  it('converts non-empty locals into a single LocalsBlock', () => {
    const result = parse_json(
      JSON.stringify({
        locals: {
          name: 'app',
          tags: { env: 'prod' },
        },
      }),
    );

    const program = result.program as Program;
    expect(program.statements).toHaveLength(1);
    const block = program.statements[0] as LocalsBlock;
    expect(block.kind).toBe('LocalsBlock');
    expect(Object.keys(block.values)).toEqual(['name', 'tags']);
  });

  it('skips locals when the locals object is empty', () => {
    const result = parse_json(JSON.stringify({ locals: {} }));

    expect((result.program as Program).statements).toHaveLength(0);
  });

  it('skips locals when the locals key is absent', () => {
    const result = parse_json(JSON.stringify({}));

    expect((result.program as Program).statements).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// convert_value — every literal branch via property values
// -----------------------------------------------------------------------------

describe('convert_value branches (driven via resource properties)', () => {
  it('converts null to NullLiteral', () => {
    const result = parse_json(
      JSON.stringify({
        resources: { r: { type: 't', properties: { v: null } } },
      }),
    );

    const block = (result.program as Program).statements[0] as ResourceBlock;
    expect(block.body.attributes[0]?.value.kind).toBe('NullLiteral');
  });

  it('converts a plain string to StringLiteral', () => {
    const result = parse_json(
      JSON.stringify({
        resources: { r: { type: 't', properties: { v: 'hello' } } },
      }),
    );

    const block = (result.program as Program).statements[0] as ResourceBlock;
    const value = block.body.attributes[0]?.value as StringLiteral;
    expect(value.kind).toBe('StringLiteral');
    expect(value.value).toBe('hello');
  });

  it('converts a ${...} interpolation string to a Reference', () => {
    const result = parse_json(
      JSON.stringify({
        resources: { r: { type: 't', properties: { v: '${var.foo}' } } },
      }),
    );

    const block = (result.program as Program).statements[0] as ResourceBlock;
    const value = block.body.attributes[0]?.value as Reference;
    expect(value.kind).toBe('Reference');
    expect(value.ref_type).toBe('var');
    expect(value.name).toBe('foo');
  });

  it('converts a number to NumberLiteral', () => {
    const result = parse_json(
      JSON.stringify({
        resources: { r: { type: 't', properties: { v: 42 } } },
      }),
    );

    const block = (result.program as Program).statements[0] as ResourceBlock;
    const value = block.body.attributes[0]?.value as NumberLiteral;
    expect(value.kind).toBe('NumberLiteral');
    expect(value.value).toBe(42);
  });

  it('converts a boolean to BooleanLiteral', () => {
    const result = parse_json(
      JSON.stringify({
        resources: { r: { type: 't', properties: { v: true } } },
      }),
    );

    const block = (result.program as Program).statements[0] as ResourceBlock;
    const value = block.body.attributes[0]?.value as BooleanLiteral;
    expect(value.kind).toBe('BooleanLiteral');
    expect(value.value).toBe(true);
  });

  it('converts an array of mixed values to an ArrayExpression', () => {
    const result = parse_json(
      JSON.stringify({
        resources: { r: { type: 't', properties: { v: [1, 'two', false, null] } } },
      }),
    );

    const block = (result.program as Program).statements[0] as ResourceBlock;
    const arr = block.body.attributes[0]?.value as ArrayExpression;
    expect(arr.kind).toBe('ArrayExpression');
    expect(arr.elements).toHaveLength(4);
    expect(arr.elements[0]?.kind).toBe('NumberLiteral');
    expect(arr.elements[1]?.kind).toBe('StringLiteral');
    expect(arr.elements[2]?.kind).toBe('BooleanLiteral');
    expect(arr.elements[3]?.kind).toBe('NullLiteral');
  });

  it('converts a nested object to ObjectExpression with each entry preserved', () => {
    const result = parse_json(
      JSON.stringify({
        resources: { r: { type: 't', properties: { v: { a: 1, b: 'x' } } } },
      }),
    );

    const block = (result.program as Program).statements[0] as ResourceBlock;
    const obj = block.body.attributes[0]?.value as ObjectExpression;
    expect(obj.kind).toBe('ObjectExpression');
    expect(obj.properties).toHaveLength(2);
    expect((obj.properties[0]?.key as StringLiteral).value).toBe('a');
    expect((obj.properties[0]?.value as NumberLiteral).value).toBe(1);
    expect((obj.properties[1]?.key as StringLiteral).value).toBe('b');
    expect((obj.properties[1]?.value as StringLiteral).value).toBe('x');
  });

 });

// -----------------------------------------------------------------------------
// parse_reference_string — every branch in the switch
// -----------------------------------------------------------------------------

describe('reference string parsing (via depends_on entries)', () => {
  it('falls back to a var-shaped Reference when ref has < 2 parts', () => {
    const result = parse_json(
      JSON.stringify({
        resources: {
          r: { type: 't', depends_on: ['lonely'] },
        },
      }),
    );

    const block = (result.program as Program).statements[0] as ResourceBlock;
    const ref = block.depends_on?.[0] as Reference;
    expect(ref.ref_type).toBe('var');
    expect(ref.name).toBe('lonely');
  });

  it('parses a var.<name> reference', () => {
    const result = parse_json(
      JSON.stringify({
        resources: { r: { type: 't', depends_on: ['var.region'] } },
      }),
    );

    const ref = (result.program as Program).statements[0] as ResourceBlock;
    expect(ref.depends_on?.[0]?.ref_type).toBe('var');
    expect(ref.depends_on?.[0]?.name).toBe('region');
    expect(ref.depends_on?.[0]?.path).toBeUndefined();
  });

  it('parses a var.<name>.<path...> reference with the trailing path captured', () => {
    const result = parse_json(
      JSON.stringify({
        resources: { r: { type: 't', depends_on: ['var.region.zone.id'] } },
      }),
    );

    const ref = (result.program as Program).statements[0] as ResourceBlock;
    expect(ref.depends_on?.[0]?.ref_type).toBe('var');
    expect(ref.depends_on?.[0]?.name).toBe('region');
    expect(ref.depends_on?.[0]?.path).toEqual(['zone', 'id']);
  });

  it('parses local.<name> through the same var-style branch', () => {
    const result = parse_json(
      JSON.stringify({
        resources: { r: { type: 't', depends_on: ['local.config'] } },
      }),
    );

    const ref = (result.program as Program).statements[0] as ResourceBlock;
    expect(ref.depends_on?.[0]?.ref_type).toBe('local');
    expect(ref.depends_on?.[0]?.name).toBe('config');
  });

  it('parses module.<name> through the same var-style branch', () => {
    const result = parse_json(
      JSON.stringify({
        resources: { r: { type: 't', depends_on: ['module.network'] } },
      }),
    );

    const ref = (result.program as Program).statements[0] as ResourceBlock;
    expect(ref.depends_on?.[0]?.ref_type).toBe('module');
    expect(ref.depends_on?.[0]?.name).toBe('network');
  });

  it('parses path.<name> through the same var-style branch', () => {
    const result = parse_json(
      JSON.stringify({
        resources: { r: { type: 't', depends_on: ['path.module'] } },
      }),
    );

    const ref = (result.program as Program).statements[0] as ResourceBlock;
    expect(ref.depends_on?.[0]?.ref_type).toBe('path');
    expect(ref.depends_on?.[0]?.name).toBe('module');
  });

  it('parses data.<type>.<name> as a data reference', () => {
    const result = parse_json(
      JSON.stringify({
        resources: { r: { type: 't', depends_on: ['data.aws.ami.amzn'] } },
      }),
    );

    const ref = (result.program as Program).statements[0] as ResourceBlock;
    expect(ref.depends_on?.[0]?.ref_type).toBe('data');
    // `data.aws.ami.amzn` → data + type=aws + name=ami + path=[amzn]
    expect(ref.depends_on?.[0]?.type_name).toBe('aws');
    expect(ref.depends_on?.[0]?.name).toBe('ami');
    expect(ref.depends_on?.[0]?.path).toEqual(['amzn']);
  });

  it('parses data.<type> with no name slot as a data reference with empty name', () => {
    const result = parse_json(
      JSON.stringify({
        resources: { r: { type: 't', depends_on: ['data.aws'] } },
      }),
    );

    const ref = (result.program as Program).statements[0] as ResourceBlock;
    expect(ref.depends_on?.[0]?.ref_type).toBe('data');
    expect(ref.depends_on?.[0]?.type_name).toBe('aws');
    expect(ref.depends_on?.[0]?.name).toBe('');
  });

  it('parses data.<type>.<name> with no trailing path as a data reference (path undefined)', () => {
    const result = parse_json(
      JSON.stringify({
        resources: { r: { type: 't', depends_on: ['data.aws.ami'] } },
      }),
    );

    const ref = (result.program as Program).statements[0] as ResourceBlock;
    expect(ref.depends_on?.[0]?.ref_type).toBe('data');
    expect(ref.depends_on?.[0]?.path).toBeUndefined();
  });

  it('parses an unknown leading segment as a resource-style reference', () => {
    const result = parse_json(
      JSON.stringify({
        resources: { r: { type: 't', depends_on: ['aws_instance.web.id'] } },
      }),
    );

    const ref = (result.program as Program).statements[0] as ResourceBlock;
    expect(ref.depends_on?.[0]?.ref_type).toBe('resource');
    expect(ref.depends_on?.[0]?.type_name).toBe('aws_instance');
    expect(ref.depends_on?.[0]?.name).toBe('web');
    expect(ref.depends_on?.[0]?.path).toEqual(['id']);
  });

  it('parses a 2-part resource-style reference with no trailing path (path undefined)', () => {
    const result = parse_json(
      JSON.stringify({
        resources: { r: { type: 't', depends_on: ['aws_instance.web'] } },
      }),
    );

    const ref = (result.program as Program).statements[0] as ResourceBlock;
    expect(ref.depends_on?.[0]?.ref_type).toBe('resource');
    expect(ref.depends_on?.[0]?.path).toBeUndefined();
  });

  it('parses ${var.x} interpolation strings via the same reference path', () => {
    const result = parse_json(
      JSON.stringify({
        resources: {
          r: { type: 't', properties: { v: '${var.x}' } },
        },
      }),
    );

    const block = (result.program as Program).statements[0] as ResourceBlock;
    const ref = block.body.attributes[0]?.value as Reference;
    expect(ref.kind).toBe('Reference');
    expect(ref.ref_type).toBe('var');
    expect(ref.name).toBe('x');
  });

  it('trims whitespace inside ${...} before parsing the reference', () => {
    const result = parse_json(
      JSON.stringify({
        resources: {
          r: { type: 't', properties: { v: '${  var.region  }' } },
        },
      }),
    );

    const block = (result.program as Program).statements[0] as ResourceBlock;
    const ref = block.body.attributes[0]?.value as Reference;
    expect(ref.ref_type).toBe('var');
    expect(ref.name).toBe('region');
  });

  it('parses var with no name slot as ref_type=var and name=""', () => {
    const result = parse_json(
      JSON.stringify({
        resources: {
          r: { type: 't', depends_on: ['var.'] },
        },
      }),
    );

    // `var.` splits to ['var', ''] → length === 2, var branch, name = ''.
    const ref = (result.program as Program).statements[0] as ResourceBlock;
    expect(ref.depends_on?.[0]?.ref_type).toBe('var');
    expect(ref.depends_on?.[0]?.name).toBe('');
  });
});

// -----------------------------------------------------------------------------
// parse_yaml — via real js-yaml + the no-loader path
// -----------------------------------------------------------------------------

describe('parse_yaml', () => {
  it('parses a YAML document using the real js-yaml loader', async () => {
    const yaml = `
resources:
  web:
    type: aws.ec2.instance
    properties:
      ami: ami-123
`;
    const result = await parse_yaml(yaml, 'site.yaml');

    expect(result.errors).toHaveLength(0);
    const program = result.program as Program;
    expect(program.statements).toHaveLength(1);
    expect(program.span.start.file).toBe('site.yaml');
    const block = program.statements[0] as ResourceBlock;
    expect(block.resource_type.name).toBe('aws.ec2.instance');
  });

  it('falls back to "<yaml>" when no file name is supplied', async () => {
    const result = await parse_yaml('resources: {}');

    expect(result.program?.span.start.file).toBe('<yaml>');
  });

  it('returns a YAML parse error for malformed input', async () => {
    // A clearly invalid YAML document (mapping key with unterminated flow).
    const result = await parse_yaml('foo: [unterminated');

    expect(result.program).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('YAML parse error');
  });

});

// -----------------------------------------------------------------------------
// parse_yaml — module-mock-driven tests
//
// These two tests are isolated at the bottom of the file (and use
// per-test vi.resetModules + vi.doUnmock) because they swap js-yaml at
// the dynamic-import boundary. Running them earlier leaves a tainted
// module registry for downstream tests that load real js-yaml.
// -----------------------------------------------------------------------------

describe('parse_yaml — module-mock paths', () => {
  afterEach(async () => {
    vi.doUnmock('js-yaml');
    vi.resetModules();
  });

  it('returns a "requires js-yaml" error when the dynamic import fails', async () => {
    vi.doMock('js-yaml', () => {
      throw new Error('module-not-found');
    });

    vi.resetModules();
    const mod = await import('../format-parser');
    const result = await mod.parse_yaml('resources: {}');

    expect(result.program).toBeNull();
    expect(result.errors[0]?.message).toContain('YAML parsing requires js-yaml package');
  });

  it('falls through to NullLiteral for unsupported value types (Symbol)', async () => {
    // JSON.parse can't produce a Symbol/bigint/function; YAML can't
    // either through ordinary inputs. Drive the convert_value default
    // branch via a stub yaml.load that hands back a Symbol value.
    vi.doMock('js-yaml', () => ({
      load: () => ({
        resources: {
          r: {
            type: 't',
            properties: { v: Symbol('weird') },
          },
        },
      }),
    }));
    vi.resetModules();
    const mod = await import('../format-parser');
    const result = await mod.parse_yaml('ignored');

    expect(result.errors).toHaveLength(0);
    const block = (result.program as Program).statements[0] as ResourceBlock;
    expect(block.body.attributes[0]?.value.kind).toBe('NullLiteral');
  });
});

// -----------------------------------------------------------------------------
// parse_auto — JSON vs YAML detection by leading char
// -----------------------------------------------------------------------------

describe('parse_auto', () => {
  it('detects JSON when input begins with { and routes to parse_json', async () => {
    const result = await parse_auto('{"resources": {}}');

    expect(result.errors).toHaveLength(0);
    expect(result.program?.span.start.file).toBe('<json>');
  });

  it('detects JSON when input begins with [ and routes to parse_json', async () => {
    // A bare array isn't a valid IceYamlSchema, but parse_json still
    // produces a Program (with no statements) — the json detection branch
    // only checks the leading char.
    const result = await parse_auto('[]');

    expect(result.errors).toHaveLength(0);
    expect(result.program?.span.start.file).toBe('<json>');
  });

  it('uses the supplied file name through the JSON path', async () => {
    const result = await parse_auto('{}', 'in.json');

    expect(result.program?.span.start.file).toBe('in.json');
  });

  it('falls through to YAML for anything else', async () => {
    const result = await parse_auto('resources:\n  web:\n    type: aws.ec2.instance\n');

    expect(result.errors).toHaveLength(0);
    const program = result.program as Program;
    expect(program.statements).toHaveLength(1);
    expect(program.span.start.file).toBe('<yaml>');
  });

  it('passes the supplied file name through the YAML path', async () => {
    const result = await parse_auto('resources: {}', 'site.yaml');

    expect(result.program?.span.start.file).toBe('site.yaml');
  });

  it('trims whitespace before format detection', async () => {
    const result = await parse_auto('   \n  {"resources": {}}');

    expect(result.errors).toHaveLength(0);
    expect(result.program?.span.start.file).toBe('<json>');
  });
});
