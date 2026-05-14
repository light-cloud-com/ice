/**
 * Tests for `terraform/hcl-formatter.ts` (rf-tfexp-5).
 *
 * Pure-function helpers, hit 100% with input/output pinning.
 * Behaviour preserved verbatim from pre-extraction L433-545 of
 * `terraform-exporter.ts`.
 *
 * The output format is byte-identical — these tests serve as
 * snapshot regression guards.
 */
import { describe, expect, it } from 'vitest';
import { format_hcl_value, to_hcl, to_json } from '../hcl-formatter';
import type { TerraformConfig } from '../types';

describe('format_hcl_value', () => {
  describe('null and undefined', () => {
    it('null -> "null"', () => {
      expect(format_hcl_value(null)).toBe('null');
    });

    it('undefined -> "null"', () => {
      expect(format_hcl_value(undefined)).toBe('null');
    });
  });

  describe('strings', () => {
    it('wraps in double-quotes', () => {
      expect(format_hcl_value('hello')).toBe('"hello"');
    });

    it('escapes backslashes', () => {
      expect(format_hcl_value('a\\b')).toBe('"a\\\\b"');
    });

    it('escapes double-quotes', () => {
      expect(format_hcl_value('a"b')).toBe('"a\\"b"');
    });

    it('escapes both backslash and quote (order matters)', () => {
      // Backslashes first, then quotes; otherwise the new backslashes get re-escaped.
      expect(format_hcl_value('a\\"b')).toBe('"a\\\\\\"b"');
    });

    it('handles empty string', () => {
      expect(format_hcl_value('')).toBe('""');
    });
  });

  describe('numbers', () => {
    it('integers', () => {
      expect(format_hcl_value(42)).toBe('42');
    });

    it('floats', () => {
      expect(format_hcl_value(3.14)).toBe('3.14');
    });

    it('zero', () => {
      expect(format_hcl_value(0)).toBe('0');
    });

    it('negatives', () => {
      expect(format_hcl_value(-1)).toBe('-1');
    });
  });

  describe('booleans', () => {
    it('true -> "true"', () => {
      expect(format_hcl_value(true)).toBe('true');
    });

    it('false -> "false"', () => {
      expect(format_hcl_value(false)).toBe('false');
    });
  });

  describe('arrays', () => {
    it('empty array -> "[]"', () => {
      expect(format_hcl_value([])).toBe('[]');
    });

    it('formats single-item array with newlines', () => {
      const out = format_hcl_value(['a'], 2);
      expect(out).toBe('[\n    "a"\n  ]');
    });

    it('formats multi-item array with comma-newline separator', () => {
      const out = format_hcl_value(['a', 'b'], 2);
      expect(out).toBe('[\n    "a",\n    "b"\n  ]');
    });

    it('handles nested arrays', () => {
      const out = format_hcl_value([[1]], 2);
      expect(out).toContain('1');
    });
  });

  describe('objects', () => {
    it('empty object -> "{}"', () => {
      expect(format_hcl_value({})).toBe('{}');
    });

    it('formats object entries with key = value (HCL style, not JSON)', () => {
      const out = format_hcl_value({ a: 1 }, 2);
      expect(out).toBe('{\n    a = 1\n  }');
    });

    it('handles multiple keys', () => {
      const out = format_hcl_value({ a: 1, b: 'x' }, 2);
      expect(out).toContain('a = 1');
      expect(out).toContain('b = "x"');
    });

    it('handles nested objects', () => {
      const out = format_hcl_value({ outer: { inner: 'v' } }, 2);
      expect(out).toContain('outer =');
      expect(out).toContain('inner = "v"');
    });
  });

  describe('default indent', () => {
    it('defaults to indent=2', () => {
      expect(format_hcl_value({ a: 1 })).toBe(format_hcl_value({ a: 1 }, 2));
    });
  });
});

describe('to_hcl', () => {
  const empty_config: TerraformConfig = {
    providers: [],
    resources: [],
  };

  it('emits empty output for empty config (just blank lines)', () => {
    const out = to_hcl(empty_config, { provider: 'gcp' });
    // No terraform block, no providers, no resources -> empty string
    expect(out).toBe('');
  });

  it('emits terraform block when required_providers present', () => {
    const cfg: TerraformConfig = {
      terraform: {
        required_providers: {
          google: { source: 'hashicorp/google', version: '~> 4.0' },
        },
      },
      providers: [],
      resources: [],
    };
    const out = to_hcl(cfg, { provider: 'gcp' });
    expect(out).toContain('terraform {');
    expect(out).toContain('required_providers {');
    expect(out).toContain('google = {');
    expect(out).toContain('source  = "hashicorp/google"');
    expect(out).toContain('version = "~> 4.0"');
  });

  it('omits version line when not provided', () => {
    const cfg: TerraformConfig = {
      terraform: {
        required_providers: {
          google: { source: 'hashicorp/google' },
        },
      },
      providers: [],
      resources: [],
    };
    const out = to_hcl(cfg, { provider: 'gcp' });
    expect(out).toContain('source  = "hashicorp/google"');
    expect(out).not.toContain('version =');
  });

  it('emits provider blocks', () => {
    const cfg: TerraformConfig = {
      providers: [{ name: 'google', config: { project: 'my-project', region: 'us-east1' } }],
      resources: [],
    };
    const out = to_hcl(cfg, { provider: 'gcp' });
    expect(out).toContain('provider "google" {');
    expect(out).toContain('project = "my-project"');
    expect(out).toContain('region = "us-east1"');
  });

  it('emits resource blocks', () => {
    const cfg: TerraformConfig = {
      providers: [],
      resources: [
        {
          type: 'google_compute_instance',
          name: 'web',
          properties: { name: 'web-server', machine_type: 'e2-medium' },
        },
      ],
    };
    const out = to_hcl(cfg, { provider: 'gcp' });
    expect(out).toContain('resource "google_compute_instance" "web" {');
    expect(out).toContain('name = "web-server"');
    expect(out).toContain('machine_type = "e2-medium"');
  });

  it('skips null/undefined property values', () => {
    const cfg: TerraformConfig = {
      providers: [],
      resources: [
        {
          type: 'google_compute_instance',
          name: 'web',
          properties: { name: 'web-server', skipped: null, also_skipped: undefined },
        },
      ],
    };
    const out = to_hcl(cfg, { provider: 'gcp' });
    expect(out).toContain('name = "web-server"');
    expect(out).not.toContain('skipped');
    expect(out).not.toContain('also_skipped');
  });

  it('emits comments when include_comments is true', () => {
    const cfg: TerraformConfig = {
      providers: [],
      resources: [
        {
          type: 'google_compute_instance',
          name: 'web',
          properties: {},
        },
      ],
    };
    const out = to_hcl(cfg, { provider: 'gcp', include_comments: true });
    expect(out).toContain('# Resource: web');
  });

  it('omits comments when include_comments is false', () => {
    const cfg: TerraformConfig = {
      providers: [],
      resources: [
        {
          type: 'google_compute_instance',
          name: 'web',
          properties: {},
        },
      ],
    };
    const out = to_hcl(cfg, { provider: 'gcp' });
    expect(out).not.toContain('# Resource: web');
  });

  it('emits depends_on block', () => {
    const cfg: TerraformConfig = {
      providers: [],
      resources: [
        {
          type: 'google_compute_instance',
          name: 'web',
          properties: { name: 'web' },
          depends_on: ['# vpc-1', '# subnet-1'],
        },
      ],
    };
    const out = to_hcl(cfg, { provider: 'gcp' });
    expect(out).toContain('depends_on = [');
    expect(out).toContain('# vpc-1,');
    expect(out).toContain('# subnet-1,');
  });

  it('omits depends_on block when empty array', () => {
    const cfg: TerraformConfig = {
      providers: [],
      resources: [
        {
          type: 'google_compute_instance',
          name: 'web',
          properties: { name: 'web' },
          depends_on: [],
        },
      ],
    };
    const out = to_hcl(cfg, { provider: 'gcp' });
    expect(out).not.toContain('depends_on');
  });

  it('produces byte-identical output for the same input (regression guard)', () => {
    const cfg: TerraformConfig = {
      terraform: {
        required_providers: {
          google: { source: 'hashicorp/google', version: '~> 4.0' },
        },
      },
      providers: [{ name: 'google', config: { project: 'p1' } }],
      resources: [
        {
          type: 'google_compute_instance',
          name: 'vm',
          properties: { name: 'vm' },
        },
      ],
    };
    const out = to_hcl(cfg, { provider: 'gcp' });
    // Snapshot the exact output to catch any future formatting drift.
    expect(out).toBe(
      'terraform {\n' +
        '  required_providers {\n' +
        '    google = {\n' +
        '      source  = "hashicorp/google"\n' +
        '      version = "~> 4.0"\n' +
        '    }\n' +
        '  }\n' +
        '}\n' +
        '\n' +
        'provider "google" {\n' +
        '  project = "p1"\n' +
        '}\n' +
        '\n' +
        'resource "google_compute_instance" "vm" {\n' +
        '  name = "vm"\n' +
        '}\n' +
        '',
    );
  });
});

describe('to_json', () => {
  it('serialises config with 2-space indent', () => {
    const cfg: TerraformConfig = {
      providers: [],
      resources: [
        {
          type: 'google_compute_instance',
          name: 'web',
          properties: { name: 'web' },
        },
      ],
    };
    const out = to_json(cfg);
    const parsed = JSON.parse(out);
    expect(parsed).toEqual(cfg);
    // Verify indentation is 2 spaces
    expect(out).toContain('  "providers"');
  });

  it('handles empty config', () => {
    const cfg: TerraformConfig = { providers: [], resources: [] };
    const out = to_json(cfg);
    expect(out).toBe('{\n  "providers": [],\n  "resources": []\n}');
  });
});
