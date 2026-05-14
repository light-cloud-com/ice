/**
 * Tests for Pulumi state parsing helpers (rf-pimp-1 extraction).
 */

import { describe, it, expect } from 'vitest';
import {
  get_deployment,
  get_stack_info,
  extract_name_from_urn,
  is_secret_value,
  unwrap_secret,
  create_empty_metadata,
} from '../parsing';
import type { PulumiStackExport, PulumiStackState, PulumiDeployment } from '../types';

const sample_deployment: PulumiDeployment = {
  manifest: { time: '2024-01-15T10:30:00.000Z', magic: 'm', version: 'v3.100.0' },
  resources: [],
};

describe('get_deployment', () => {
  it('returns the deployment from a stack export', () => {
    const exp: PulumiStackExport = { version: 3, deployment: sample_deployment };
    expect(get_deployment(exp)).toBe(sample_deployment);
  });

  it('returns the latest deployment from a stack state checkpoint', () => {
    const state: PulumiStackState = {
      version: 3,
      checkpoint: { stack: 'org/p/dev', latest: sample_deployment },
    };
    expect(get_deployment(state)).toBe(sample_deployment);
  });

  it('returns null when neither shape carries a deployment', () => {
    const exp = { version: 3 } as unknown as PulumiStackExport;
    expect(get_deployment(exp)).toBeNull();
  });

  it('returns null when checkpoint has no latest', () => {
    const state: PulumiStackState = {
      version: 3,
      checkpoint: { stack: 'org/p/dev' },
    };
    expect(get_deployment(state)).toBeNull();
  });
});

describe('get_stack_info', () => {
  it('reads stack and project from checkpoint format', () => {
    const state: PulumiStackState = {
      version: 3,
      checkpoint: { stack: 'organization/myproject' },
    };
    expect(get_stack_info(state)).toEqual({
      stack: 'organization/myproject',
      project: 'myproject',
    });
  });

  it('returns the trailing slash-segment as project when checkpoint stack has no slashes', () => {
    const state: PulumiStackState = {
      version: 3,
      checkpoint: { stack: 'mystack' },
    };
    expect(get_stack_info(state)).toEqual({ stack: 'mystack', project: 'mystack' });
  });

  it('parses URN of stack resource for an export without checkpoint', () => {
    const exp: PulumiStackExport = {
      version: 3,
      deployment: {
        manifest: sample_deployment.manifest,
        resources: [
          {
            urn: 'urn:pulumi:dev::my-project::pulumi:pulumi:Stack::my-project-dev',
            type: 'pulumi:pulumi:Stack',
          },
        ],
      },
    };
    expect(get_stack_info(exp)).toEqual({ stack: 'dev', project: 'my-project' });
  });

  it('returns unknown/unknown when nothing matches', () => {
    const exp = { version: 3 } as unknown as PulumiStackExport;
    expect(get_stack_info(exp)).toEqual({ stack: 'unknown', project: 'unknown' });
  });

  it('returns unknown/unknown when deployment has no stack resource', () => {
    const exp: PulumiStackExport = {
      version: 3,
      deployment: { manifest: sample_deployment.manifest, resources: [] },
    };
    expect(get_stack_info(exp)).toEqual({ stack: 'unknown', project: 'unknown' });
  });
});

describe('extract_name_from_urn', () => {
  it('returns the trailing :: segment', () => {
    expect(extract_name_from_urn('urn:pulumi:dev::p::aws:ec2/vpc:Vpc::main')).toBe('main');
  });

  it('returns the original urn when no :: separator is present', () => {
    expect(extract_name_from_urn('plain-string')).toBe('plain-string');
  });
});

describe('is_secret_value', () => {
  it('detects the Pulumi secret sentinel', () => {
    expect(
      is_secret_value({
        '4dabf18193072939515e22aab3b80af9': '1b47061264138c4ac30d75fd1eb44270',
        plaintext: 'p',
      }),
    ).toBe(true);
  });

  it('returns false for objects with the wrong sentinel value', () => {
    expect(is_secret_value({ '4dabf18193072939515e22aab3b80af9': 'wrong' })).toBe(false);
  });

  it('returns false for objects without the sentinel key', () => {
    expect(is_secret_value({ value: 'x' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(is_secret_value(null)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(is_secret_value('s')).toBe(false);
    expect(is_secret_value(42)).toBe(false);
    expect(is_secret_value(undefined)).toBe(false);
  });
});

describe('unwrap_secret', () => {
  it('returns ciphertext when present', () => {
    const v = {
      '4dabf18193072939515e22aab3b80af9': '1b47061264138c4ac30d75fd1eb44270',
      ciphertext: 'cipher',
      plaintext: 'plain',
    };
    expect(unwrap_secret(v)).toBe('cipher');
  });

  it('falls back to plaintext when ciphertext is missing', () => {
    const v = {
      '4dabf18193072939515e22aab3b80af9': '1b47061264138c4ac30d75fd1eb44270',
      plaintext: 'plain',
    };
    expect(unwrap_secret(v)).toBe('plain');
  });

  it('returns the wrapper when neither is present', () => {
    const v = { '4dabf18193072939515e22aab3b80af9': '1b47061264138c4ac30d75fd1eb44270' };
    expect(unwrap_secret(v)).toBe(v);
  });

  it('passes non-secret values through unchanged', () => {
    expect(unwrap_secret('plain')).toBe('plain');
    expect(unwrap_secret(7)).toBe(7);
    expect(unwrap_secret(null)).toBe(null);
  });
});

describe('create_empty_metadata', () => {
  it('returns the unknown sentinel shape', () => {
    const m = create_empty_metadata();
    expect(m.pulumi_version).toBe('unknown');
    expect(m.stack).toBe('unknown');
    expect(m.project).toBe('unknown');
    expect(m.resource_count).toBe(0);
    expect(m.output_count).toBe(0);
    // ISO 8601 timestamps for both deployment_time and imported_at.
    expect(m.deployment_time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(m.imported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
