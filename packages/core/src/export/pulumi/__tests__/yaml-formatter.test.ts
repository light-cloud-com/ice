/**
 * Tests for `pulumi/yaml-formatter.ts` (rf-pulumi-5).
 *
 * Output format MUST stay byte-identical to pre-extraction
 * `pulumi-exporter.ts::toYAML` (L393-454) and `formatYAMLValue`
 * (L459-501). The byte-pinning tests (`expect(out).toBe(...)`)
 * are the line of defense for any future regression — substring
 * or regex matching is intentionally avoided.
 *
 * Special cases pinned:
 *  - Empty program (no description / config / resources / outputs)
 *    still emits the leading two `name:` / `runtime:` lines + a
 *    blank-line separator before the (absent) config/resources.
 *  - String quoting: only `:`, `#`, `\n` trigger quotes; `-` does
 *    NOT (so dashes go through unquoted, valid YAML in this
 *    formatter's output).
 *  - Trailing-blank-line behaviour from the resources loop is
 *    preserved (intra-loop `lines.push('')` runs once per resource).
 */
import { describe, expect, it } from 'vitest';
import { format_yaml_value, to_yaml } from '../yaml-formatter.js';
import type { PulumiProgram } from '../types.js';

describe('format_yaml_value — primitives', () => {
  it('returns "null" for null', () => {
    expect(format_yaml_value(null)).toBe('null');
  });

  it('returns "null" for undefined', () => {
    expect(format_yaml_value(undefined)).toBe('null');
  });

  it('passes through plain strings unquoted', () => {
    expect(format_yaml_value('hello')).toBe('hello');
    expect(format_yaml_value('us-east-1')).toBe('us-east-1');
  });

  it('quotes strings containing colons', () => {
    expect(format_yaml_value('foo:bar')).toBe('"foo:bar"');
  });

  it('quotes strings containing hash (yaml comment marker)', () => {
    expect(format_yaml_value('foo#bar')).toBe('"foo#bar"');
  });

  it('quotes strings containing newline', () => {
    expect(format_yaml_value('foo\nbar')).toBe('"foo\nbar"');
  });

  it('escapes embedded double quotes when wrapping', () => {
    expect(format_yaml_value('foo"bar:baz')).toBe('"foo\\"bar:baz"');
  });

  it('does not quote strings containing dashes only', () => {
    expect(format_yaml_value('foo-bar')).toBe('foo-bar');
  });

  it('returns numbers as bare strings (no quotes)', () => {
    expect(format_yaml_value(42)).toBe('42');
    expect(format_yaml_value(3.14)).toBe('3.14');
    expect(format_yaml_value(0)).toBe('0');
  });

  it('returns booleans as lowercase literals', () => {
    expect(format_yaml_value(true)).toBe('true');
    expect(format_yaml_value(false)).toBe('false');
  });

  it('returns BigInt via String() coercion', () => {
    expect(format_yaml_value(BigInt(5))).toBe('5');
  });
});

describe('format_yaml_value — arrays', () => {
  it('returns "[]" for empty array', () => {
    expect(format_yaml_value([])).toBe('[]');
  });

  it('emits leading newline + dash-prefixed lines for non-empty array', () => {
    expect(format_yaml_value(['a', 'b'])).toBe('\n  - a\n  - b');
  });

  it('uses indent param to compute hyphen indentation', () => {
    expect(format_yaml_value(['a'], 4)).toBe('\n      - a');
  });

  it('recurses with indent + 4 for nested values', () => {
    // Nested arrays start at indent + 4 = 4 in the recursive call
    expect(format_yaml_value([['a']])).toBe('\n  - \n      - a');
  });

  it('handles mixed-type arrays', () => {
    expect(format_yaml_value([1, true, 'x'])).toBe('\n  - 1\n  - true\n  - x');
  });
});

describe('format_yaml_value — objects', () => {
  it('returns "{}" for empty object', () => {
    expect(format_yaml_value({})).toBe('{}');
  });

  it('emits leading newline + indent-prefixed lines for non-empty object', () => {
    expect(format_yaml_value({ a: 1, b: 2 })).toBe('\n  a: 1\n  b: 2');
  });

  it('uses indent param for entry indentation', () => {
    expect(format_yaml_value({ a: 1 }, 4)).toBe('\n      a: 1');
  });

  it('recurses with indent + 2 for nested values', () => {
    // Nested objects start at indent + 2 = 2 in the recursive call
    expect(format_yaml_value({ outer: { inner: 1 } })).toBe(
      '\n  outer: \n    inner: 1',
    );
  });
});

describe('to_yaml — minimal program', () => {
  it('emits name + runtime + trailing blank line for an empty program', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [],
    };
    expect(to_yaml(program, { provider: 'gcp' })).toBe('name: test\nruntime: nodejs\n');
  });

  it('emits description when set', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      description: 'a test app',
      resources: [],
    };
    expect(to_yaml(program, { provider: 'gcp' })).toBe(
      'name: test\nruntime: nodejs\ndescription: a test app\n',
    );
  });

  it('skips description when empty/undefined', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [],
    };
    expect(to_yaml(program, { provider: 'gcp' })).not.toContain('description:');
  });
});

describe('to_yaml — config block', () => {
  it('omits the config block when config is undefined', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [],
    };
    expect(to_yaml(program, { provider: 'gcp' })).not.toContain('config:');
  });

  it('omits the config block when config is empty {}', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      config: {},
      resources: [],
    };
    expect(to_yaml(program, { provider: 'gcp' })).not.toContain('config:');
  });

  it('emits config entries with indent=4', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      config: { region: 'us-east-1', port: 8080 },
      resources: [],
    };
    expect(to_yaml(program, { provider: 'gcp' })).toBe(
      'name: test\nruntime: nodejs\n\nconfig:\n  region: us-east-1\n  port: 8080\n',
    );
  });
});

describe('to_yaml — resources block', () => {
  it('omits the resources block when resources is empty', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [],
    };
    expect(to_yaml(program, { provider: 'gcp' })).not.toContain('resources:');
  });

  it('emits a single resource with its type', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [
        {
          type: 'gcp:compute/instance:Instance',
          name: 'web',
          properties: {},
        },
      ],
    };
    expect(to_yaml(program, { provider: 'gcp' })).toBe(
      'name: test\nruntime: nodejs\n\nresources:\n  web:\n    type: gcp:compute/instance:Instance\n',
    );
  });

  it('emits resource properties with indent=8', () => {
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
    expect(to_yaml(program, { provider: 'gcp' })).toBe(
      'name: test\nruntime: nodejs\n\nresources:\n  web:\n    type: gcp:compute/instance:Instance\n    properties:\n      machineType: e2-medium\n',
    );
  });

  it('skips properties whose value is null or undefined', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [
        {
          type: 't',
          name: 'x',
          properties: { kept: 'v', dropped: null, alsoDropped: undefined },
        },
      ],
    };
    const out = to_yaml(program, { provider: 'gcp' });
    expect(out).toContain('kept: v');
    expect(out).not.toContain('dropped:');
    expect(out).not.toContain('alsoDropped:');
  });

  it('emits dependsOn block with ${} interpolation when options.depends_on is non-empty', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [
        {
          type: 't',
          name: 'web',
          properties: {},
          options: { depends_on: ['vpc', 'subnet'] },
        },
      ],
    };
    const out = to_yaml(program, { provider: 'gcp' });
    expect(out).toContain('    options:\n      dependsOn:\n        - ${vpc}\n        - ${subnet}');
  });

  it('omits options block when depends_on is empty array', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [
        {
          type: 't',
          name: 'web',
          properties: {},
          options: { depends_on: [] },
        },
      ],
    };
    expect(to_yaml(program, { provider: 'gcp' })).not.toContain('options:');
  });

  it('emits a comment line when include_comments is true', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [
        {
          type: 't',
          name: 'web',
          properties: {},
        },
      ],
    };
    expect(to_yaml(program, { provider: 'gcp', include_comments: true })).toContain('  # web');
  });

  it('preserves blank-line separator between multiple resources', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [
        { type: 't', name: 'a', properties: {} },
        { type: 't', name: 'b', properties: {} },
      ],
    };
    // Each resource gets a trailing blank line via lines.push('').
    expect(to_yaml(program, { provider: 'gcp' })).toBe(
      'name: test\nruntime: nodejs\n\nresources:\n  a:\n    type: t\n\n  b:\n    type: t\n',
    );
  });
});

describe('to_yaml — outputs block', () => {
  it('omits outputs block when outputs is undefined', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [],
    };
    expect(to_yaml(program, { provider: 'gcp' })).not.toContain('outputs:');
  });

  it('omits outputs block when outputs is empty {}', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [],
      outputs: {},
    };
    expect(to_yaml(program, { provider: 'gcp' })).not.toContain('outputs:');
  });

  it('emits outputs entries with indent=4 (no trailing blank line)', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [],
      outputs: { url: 'pub-ip' },
    };
    expect(to_yaml(program, { provider: 'gcp' })).toBe(
      'name: test\nruntime: nodejs\n\noutputs:\n  url: pub-ip',
    );
  });

  it('quotes a URL value because it contains a colon', () => {
    const program: PulumiProgram = {
      name: 'test',
      runtime: 'nodejs',
      resources: [],
      outputs: { url: 'http://example.com' },
    };
    // The URL has `:` so format_yaml_value wraps it in double quotes.
    expect(to_yaml(program, { provider: 'gcp' })).toBe(
      'name: test\nruntime: nodejs\n\noutputs:\n  url: "http://example.com"',
    );
  });
});

describe('to_yaml — full program byte-identity', () => {
  it('emits a complete program with config + resources + outputs', () => {
    const program: PulumiProgram = {
      name: 'app',
      runtime: 'nodejs',
      description: 'demo',
      config: { region: 'us' },
      resources: [
        {
          type: 'gcp:compute/instance:Instance',
          name: 'web',
          properties: { machineType: 'e2-medium' },
          options: { depends_on: ['net'] },
        },
      ],
      outputs: { ip: 'pub-ip' },
    };
    const expected = [
      'name: app',
      'runtime: nodejs',
      'description: demo',
      '',
      'config:',
      '  region: us',
      '',
      'resources:',
      '  web:',
      '    type: gcp:compute/instance:Instance',
      '    properties:',
      '      machineType: e2-medium',
      '    options:',
      '      dependsOn:',
      '        - ${net}',
      '',
      'outputs:',
      '  ip: pub-ip',
    ].join('\n');
    expect(to_yaml(program, { provider: 'gcp' })).toBe(expected);
  });
});
