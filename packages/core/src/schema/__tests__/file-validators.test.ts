/**
 * Tests for `customization/file-validators.ts` (rf-cload-2).
 *
 * Behaviour pinned (preserved from `validate_*_file` private methods):
 *  - JSON parse failures -> single "Invalid JSON: ..." error.
 *  - YAML parse failures -> single "Invalid YAML: ..." error.
 *  - validate_provider_file: requires provider_name + resources object;
 *    each resource without properties emits a warning (not an error).
 *  - validate_override_file: requires ice_type + overrides object.
 *  - validate_custom_resource_file: requires ice_type + display_name +
 *    category; missing properties emits a warning.
 *  - validate_relationships_file: requires `relationships` array; each
 *    entry must have source, target, type (1-indexed in messages).
 *
 * Tests write tmp files to drive the FS reads end-to-end (no mocking),
 * matching the integration the original methods did.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  validate_custom_resource_file,
  validate_override_file,
  validate_provider_file,
  validate_relationships_file,
} from '../customization/file-validators';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-cload-fv-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function write(content: string, name = 'input'): string {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, content);
  return p;
}

describe('validate_provider_file', () => {
  it('valid file emits no errors / no warnings', async () => {
    const p = write(
      JSON.stringify({
        provider_name: 'mycompany/internal',
        resources: { foo: { properties: { name: { type: 'string' } } } },
      }),
    );
    const r = await validate_provider_file(p);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('missing provider_name -> error', async () => {
    const p = write(JSON.stringify({ resources: { foo: { properties: {} } } }));
    const r = await validate_provider_file(p);
    expect(r.errors[0]?.message).toBe('Missing required field: provider_name');
  });

  it('missing resources -> error', async () => {
    const p = write(JSON.stringify({ provider_name: 'mc' }));
    const r = await validate_provider_file(p);
    expect(r.errors.find((e) => e.message.includes('resources'))).toBeTruthy();
  });

  it('resource without properties emits a warning, not an error', async () => {
    const p = write(JSON.stringify({ provider_name: 'mc', resources: { foo: {} } }));
    const r = await validate_provider_file(p);
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]?.message).toBe('Resource "foo" has no properties defined');
  });

  it('invalid JSON -> single error with Invalid JSON: prefix', async () => {
    const p = write('not-json{');
    const r = await validate_provider_file(p);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.message).toMatch(/^Invalid JSON: /);
  });
});

describe('validate_override_file', () => {
  it('valid YAML -> no issues', async () => {
    const p = write(
      `ice_type: aws.ec2.instance
overrides:
  display_name: foo
`,
    );
    const r = await validate_override_file(p);
    expect(r.errors).toEqual([]);
  });

  it('missing ice_type -> error', async () => {
    const p = write(`overrides: {display_name: foo}\n`);
    const r = await validate_override_file(p);
    expect(r.errors.find((e) => e.message.includes('ice_type'))).toBeTruthy();
  });

  it('missing overrides -> error', async () => {
    const p = write(`ice_type: aws.s3.bucket\n`);
    const r = await validate_override_file(p);
    expect(r.errors.find((e) => e.message.includes('overrides'))).toBeTruthy();
  });

  it('invalid YAML -> Invalid YAML: prefix', async () => {
    const p = write(`ice_type: x\noverrides:\n  - [unbalanced`);
    const r = await validate_override_file(p);
    expect(r.errors[0]?.message).toMatch(/^Invalid YAML: /);
  });
});

describe('validate_custom_resource_file', () => {
  it('valid YAML -> no issues (with properties)', async () => {
    const p = write(
      `ice_type: x.y.z
display_name: Z
category: c
properties:
  name: {type: string}
`,
    );
    const r = await validate_custom_resource_file(p);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('all three required fields missing -> three errors', async () => {
    const p = write(`properties: {name: {type: string}}\n`);
    const r = await validate_custom_resource_file(p);
    expect(r.errors.map((e) => e.message)).toEqual([
      'Missing required field: ice_type',
      'Missing required field: display_name',
      'Missing required field: category',
    ]);
  });

  it('no properties -> warning', async () => {
    const p = write(
      `ice_type: x
display_name: X
category: c
`,
    );
    const r = await validate_custom_resource_file(p);
    expect(r.warnings[0]?.message).toBe('No properties defined');
  });
});

describe('validate_relationships_file', () => {
  it('valid YAML -> no issues', async () => {
    const p = write(
      `relationships:
  - source: a
    target: b
    type: depends_on
`,
    );
    const r = await validate_relationships_file(p);
    expect(r.errors).toEqual([]);
  });

  it('missing relationships array -> error', async () => {
    const p = write(`other: thing\n`);
    const r = await validate_relationships_file(p);
    expect(r.errors[0]?.message).toBe('Missing or invalid field: relationships (must be array)');
  });

  it('non-array relationships -> error', async () => {
    const p = write(`relationships: "string"\n`);
    const r = await validate_relationships_file(p);
    expect(r.errors[0]?.message).toBe('Missing or invalid field: relationships (must be array)');
  });

  it('1-indexed error messages for entries missing fields', async () => {
    const p = write(
      `relationships:
  - source: a
    target: b
  - target: y
    type: t
`,
    );
    const r = await validate_relationships_file(p);
    // Entry 1 missing type. Entry 2 missing source.
    const messages = r.errors.map((e) => e.message);
    expect(messages).toContain('Relationship 1: missing required field: type');
    expect(messages).toContain('Relationship 2: missing required field: source');
  });
});
