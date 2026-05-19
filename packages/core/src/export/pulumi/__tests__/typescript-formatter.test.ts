/**
 * Tests for `pulumi/typescript-formatter.ts` (rf-pulumi-6).
 *
 * Output format MUST stay byte-identical to pre-extraction
 * `pulumi-exporter.ts::toTypeScript` (L506-571) and `formatTSValue`
 * (L620-647). Byte-pinning tests (`expect(out).toBe(...)`) protect
 * against any future format drift.
 *
 * Special cases pinned:
 *  - Backslash-escape order: `\\` first, then `\"` — reversed order
 *    would double-escape (`\"` -> `\\"` -> `\\\\\"`).
 *  - The unconditional `import * as pulumi from "@pulumi/pulumi";`
 *    line, even for empty programs.
 *  - Provider import alias substitution (`-` -> `_`) but package
 *    path keeps the hyphenated form.
 *  - `config.require` for strings vs `config.requireObject` for
 *    everything else — strict typeof check.
 *  - `const var = new ClassPath("name", { ... });` shape per
 *    resource (4-space property indent, trailing comma on each
 *    property line, terminating `});`).
 *  - Blank line after each resource via `lines.push('')` inside
 *    the loop.
 *  - Property keys are emitted as-is (NOT re-camelCased).
 */
import { describe, expect, it } from 'vitest';
import { format_ts_value, to_typescript } from '../typescript-formatter';
import type { PulumiProgram } from '../types';

describe('format_ts_value — primitives', () => {
  it('returns "undefined" for null', () => {
    expect(format_ts_value(null)).toBe('undefined');
  });

  it('returns "undefined" for undefined', () => {
    expect(format_ts_value(undefined)).toBe('undefined');
  });

  it('quotes plain strings', () => {
    expect(format_ts_value('hello')).toBe('"hello"');
  });

  it('escapes backslashes (doubled)', () => {
    expect(format_ts_value('a\\b')).toBe('"a\\\\b"');
  });

  it('escapes double quotes', () => {
    expect(format_ts_value('a"b')).toBe('"a\\"b"');
  });

  it('escape order: backslash first, then quote (combined input)', () => {
    // Input: '\foo"bar'  (raw chars: \, f, o, o, ", b, a, r)
    // After /\\/ replace: '\\foo"bar' (4 chars expanded to 5)
    // After /"/  replace: '\\foo\"bar'
    // Wrapped:            '"\\foo\"bar"'
    // JS literal:         '"\\\\foo\\"bar"'
    expect(format_ts_value('\\foo"bar')).toBe('"\\\\foo\\"bar"');
  });

  it('returns numbers as bare strings', () => {
    expect(format_ts_value(42)).toBe('42');
    expect(format_ts_value(3.14)).toBe('3.14');
    expect(format_ts_value(0)).toBe('0');
  });

  it('returns booleans as lowercase literals', () => {
    expect(format_ts_value(true)).toBe('true');
    expect(format_ts_value(false)).toBe('false');
  });
});

describe('format_ts_value — arrays', () => {
  it('returns "[]" for empty array', () => {
    expect(format_ts_value([])).toBe('[]');
  });

  it('emits comma-and-space-joined inline for non-empty', () => {
    expect(format_ts_value([1, 2, 3])).toBe('[1, 2, 3]');
  });

  it('recursively formats string elements (with quotes)', () => {
    expect(format_ts_value(['a', 'b'])).toBe('["a", "b"]');
  });

  it('handles mixed types', () => {
    expect(format_ts_value([1, 'a', true])).toBe('[1, "a", true]');
  });

  it('recursively formats nested arrays', () => {
    expect(format_ts_value([[1, 2], [3]])).toBe('[[1, 2], [3]]');
  });
});

describe('format_ts_value — objects', () => {
  it('returns "{}" for empty object', () => {
    expect(format_ts_value({})).toBe('{}');
  });

  it('emits inline `{ key: value }` form (with spaces)', () => {
    expect(format_ts_value({ a: 1 })).toBe('{ a: 1 }');
  });

  it('joins multiple entries with `, `', () => {
    expect(format_ts_value({ a: 1, b: 2 })).toBe('{ a: 1, b: 2 }');
  });

  it('emits keys verbatim (NOT re-camelCased)', () => {
    expect(format_ts_value({ snake_case: 1 })).toBe('{ snake_case: 1 }');
  });

  it('recursively formats nested objects', () => {
    expect(format_ts_value({ outer: { inner: 1 } })).toBe(
      '{ outer: { inner: 1 } }',
    );
  });
});

describe('to_typescript — imports', () => {
  it('always includes the pulumi import even when there are no resources', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [],
    };
    expect(to_typescript(program, { provider: 'gcp' })).toBe(
      'import * as pulumi from "@pulumi/pulumi";\n',
    );
  });

  it('emits a provider import with alias substitution', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [{ type: 'azure-native:storage/account:Account', name: 'a', properties: {} }],
    };
    const out = to_typescript(program, { provider: 'azure-native' });
    expect(out).toContain(
      'import * as azure_native from "@pulumi/azure-native";',
    );
  });

  it('deduplicates providers across multiple resources', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [
        { type: 'gcp:compute/instance:Instance', name: 'a', properties: {} },
        { type: 'gcp:compute/instance:Instance', name: 'b', properties: {} },
      ],
    };
    const out = to_typescript(program, { provider: 'gcp' });
    const matches = out.match(/import \* as gcp from "@pulumi\/gcp";/g);
    expect(matches?.length).toBe(1);
  });

  it('preserves Set insertion order for provider imports', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [
        { type: 'gcp:compute/instance:Instance', name: 'a', properties: {} },
        { type: 'aws:ec2/instance:Instance', name: 'b', properties: {} },
      ],
    };
    const out = to_typescript(program, { provider: 'gcp' });
    const gcpIdx = out.indexOf('@pulumi/gcp');
    const awsIdx = out.indexOf('@pulumi/aws');
    expect(gcpIdx).toBeGreaterThan(0);
    expect(awsIdx).toBeGreaterThan(gcpIdx);
  });
});

describe('to_typescript — config block', () => {
  it('skips config block when undefined', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [],
    };
    expect(to_typescript(program, { provider: 'gcp' })).not.toContain('// Configuration');
  });

  it('skips config block when empty', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      config: {},
      resources: [],
    };
    expect(to_typescript(program, { provider: 'gcp' })).not.toContain('// Configuration');
  });

  it('uses config.require for string values', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      config: { region: 'us' },
      resources: [],
    };
    const out = to_typescript(program, { provider: 'gcp' });
    expect(out).toContain('const region = config.require("region");');
  });

  it('uses config.requireObject for non-string values', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      config: { tags: ['a', 'b'], port: 8080 },
      resources: [],
    };
    const out = to_typescript(program, { provider: 'gcp' });
    expect(out).toContain('const tags = config.requireObject("tags");');
    expect(out).toContain('const port = config.requireObject("port");');
  });

  it('camelCases config variable names', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      config: { my_region: 'us' },
      resources: [],
    };
    const out = to_typescript(program, { provider: 'gcp' });
    expect(out).toContain('const myRegion = config.require("my_region");');
  });
});

describe('to_typescript — resources block', () => {
  it('emits an empty resource block correctly', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [
        { type: 'gcp:compute/instance:Instance', name: 'web', properties: {} },
      ],
    };
    expect(to_typescript(program, { provider: 'gcp' })).toContain(
      'const web = new gcp.compute.Instance("web", {\n});',
    );
  });

  it('emits property lines with 4-space indent and trailing comma', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [
        {
          type: 'gcp:compute/instance:Instance',
          name: 'web',
          properties: { machineType: 'e2-medium' },
        },
      ],
    };
    expect(to_typescript(program, { provider: 'gcp' })).toContain(
      'const web = new gcp.compute.Instance("web", {\n    machineType: "e2-medium",\n});',
    );
  });

  it('skips properties with null or undefined values', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [
        {
          type: 't:m/r:C',
          name: 'x',
          properties: { kept: 'v', dropped: null, also: undefined },
        },
      ],
    };
    const out = to_typescript(program, { provider: 'gcp' });
    expect(out).toContain('kept: "v",');
    expect(out).not.toContain('dropped:');
    expect(out).not.toContain('also:');
  });

  it('uses sanitize_var_name on resource variable name', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [
        { type: 't:m/r:C', name: 'my-resource', properties: {} },
      ],
    };
    const out = to_typescript(program, { provider: 'gcp' });
    // 'my-resource' -> 'my_resource' (sanitize_var_name replaces - with _)
    expect(out).toContain('const my_resource = new');
    // The original name is still used as the new constructor's first arg.
    expect(out).toContain('new t.m.C("my-resource", {');
  });

  it('emits a "// Resources" comment when include_comments is true', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [{ type: 't:m/r:C', name: 'a', properties: {} }],
    };
    expect(to_typescript(program, { provider: 'gcp', include_comments: true })).toContain(
      '// Resources',
    );
  });

  it('emits per-resource name comment when include_comments is true', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [
        { type: 't:m/r:C', name: 'web', properties: {} },
      ],
    };
    const out = to_typescript(program, { provider: 'gcp', include_comments: true });
    expect(out).toContain('// web');
  });

  it('inserts a blank line after each resource', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [
        { type: 't:m/r:C', name: 'a', properties: {} },
        { type: 't:m/r:C', name: 'b', properties: {} },
      ],
    };
    // Each resource has a `});` line followed by `''` (blank).
    const out = to_typescript(program, { provider: 'gcp' });
    expect(out).toContain('const a = new t.m.C("a", {\n});\n\nconst b = new t.m.C("b"');
  });
});

describe('to_typescript — outputs block', () => {
  it('skips outputs block when undefined', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [],
    };
    expect(to_typescript(program, { provider: 'gcp' })).not.toContain('// Outputs');
  });

  it('emits an export const for each output', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [],
      outputs: { url: 'http://example.com' },
    };
    const out = to_typescript(program, { provider: 'gcp' });
    expect(out).toContain('// Outputs');
    expect(out).toContain('export const url = "http://example.com";');
  });

  it('camelCases output variable names', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [],
      outputs: { primary_endpoint: 'x' },
    };
    expect(to_typescript(program, { provider: 'gcp' })).toContain(
      'export const primaryEndpoint = "x";',
    );
  });
});

describe('to_typescript — full program byte-identity', () => {
  it('emits a complete program byte-identical to pre-extraction', () => {
    const program: PulumiProgram = {
      name: 'app',
      runtime: 'nodejs',
      config: { region: 'us', port: 8080 },
      resources: [
        {
          type: 'gcp:compute/instance:Instance',
          name: 'web',
          properties: { machineType: 'e2-medium' },
        },
      ],
      outputs: { ip: 'pub-ip' },
    };
    const expected = [
      'import * as pulumi from "@pulumi/pulumi";',
      'import * as gcp from "@pulumi/gcp";',
      '',
      '// Configuration',
      'const config = new pulumi.Config();',
      'const region = config.require("region");',
      'const port = config.requireObject("port");',
      '',
      'const web = new gcp.compute.Instance("web", {',
      '    machineType: "e2-medium",',
      '});',
      '',
      '// Outputs',
      'export const ip = "pub-ip";',
    ].join('\n');
    expect(to_typescript(program, { provider: 'gcp' })).toBe(expected);
  });
});
