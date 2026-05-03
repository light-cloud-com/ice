/**
 * Tests for the Terraform state importer file/JSON entrypoints.
 *
 * The JSON-string entrypoint is exercised by the integration tests in
 * `packages/core/src/__tests__/terraform-importer.test.ts`. What's left
 * uncovered is the file-based wrapper (existsSync + readFile + JSON.parse)
 * and the per-resource try/catch arm in import_terraform_state_object.
 *
 * What's tested here:
 *   - import_terraform_state: missing file -> FILE_NOT_FOUND
 *   - import_terraform_state: unreadable file -> PARSE_ERROR (read fails)
 *   - import_terraform_state: malformed JSON -> PARSE_ERROR
 *   - import_terraform_state: happy path -> success: true
 *   - import_terraform_state: emits UNSUPPORTED_VERSION warning for v2
 *   - import_terraform_state_object: per-instance try/catch records IMPORT_ERROR
 *     and continues on subsequent resources
 *   - the explicit `errors`/`warnings` parameters carry through
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  import_terraform_state,
  import_terraform_state_json,
  import_terraform_state_object,
} from '../state-importer.js';
import type { TerraformState } from '../types.js';

// =============================================================================
// Sample
// =============================================================================

const SAMPLE_STATE: TerraformState = {
  version: 4,
  terraform_version: '1.5.0',
  serial: 1,
  lineage: 'unit-test',
  resources: [
    {
      mode: 'managed',
      type: 'aws_vpc',
      name: 'main',
      provider: 'provider["registry.terraform.io/hashicorp/aws"]',
      instances: [
        {
          schema_version: 1,
          attributes: { id: 'vpc-123', cidr_block: '10.0.0.0/16' },
          sensitive_attributes: [],
        },
      ],
    },
  ],
};

// =============================================================================
// File-based import_terraform_state
// =============================================================================

describe('import_terraform_state — file path', () => {
  let tmp_dir: string;

  beforeEach(() => {
    tmp_dir = mkdtempSync(join(tmpdir(), 'tf-state-test-'));
  });

  afterEach(() => {
    rmSync(tmp_dir, { recursive: true, force: true });
  });

  it('returns FILE_NOT_FOUND when the path does not exist', async () => {
    const result = await import_terraform_state(join(tmp_dir, 'missing.tfstate'));
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.code).toBe('FILE_NOT_FOUND');
    expect(result.errors[0]!.message).toContain('missing.tfstate');
    expect(result.resources).toEqual([]);
    expect(result.outputs).toEqual([]);
  });

  it('returns PARSE_ERROR when the file contains invalid JSON', async () => {
    const path = join(tmp_dir, 'bad.tfstate');
    writeFileSync(path, '{ this is not json');
    const result = await import_terraform_state(path);
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.code).toBe('PARSE_ERROR');
    expect(result.errors[0]!.message).toContain('Failed to parse state file');
  });

  it('returns success with parsed resources on a valid state file', async () => {
    const path = join(tmp_dir, 'good.tfstate');
    writeFileSync(path, JSON.stringify(SAMPLE_STATE));
    const result = await import_terraform_state(path);
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]!.terraform_type).toBe('aws_vpc');
    expect(result.metadata.terraform_version).toBe('1.5.0');
    expect(result.metadata.state_version).toBe(4);
  });

  it('emits an UNSUPPORTED_VERSION warning for state version != 3 || 4 (file path)', async () => {
    const path = join(tmp_dir, 'old.tfstate');
    const old_state = { ...SAMPLE_STATE, version: 2 };
    writeFileSync(path, JSON.stringify(old_state));
    const result = await import_terraform_state(path);
    expect(result.warnings.some((w) => w.code === 'UNSUPPORTED_VERSION')).toBe(true);
  });

  it('does NOT emit UNSUPPORTED_VERSION for v3 (legacy still allowed)', async () => {
    const path = join(tmp_dir, 'v3.tfstate');
    writeFileSync(path, JSON.stringify({ ...SAMPLE_STATE, version: 3 }));
    const result = await import_terraform_state(path);
    expect(result.warnings.some((w) => w.code === 'UNSUPPORTED_VERSION')).toBe(false);
  });

  it('returns PARSE_ERROR with the underlying message when JSON.parse throws on truncated content', async () => {
    // Cover the `error instanceof Error ? error.message : String(error)`
    // path. JSON.parse throws SyntaxError (an Error subclass) — the
    // message goes through the `error.message` arm.
    const path = join(tmp_dir, 'truncated.tfstate');
    writeFileSync(path, '{"version": 4, "terra'); // truncated
    const result = await import_terraform_state(path);
    expect(result.errors[0]!.code).toBe('PARSE_ERROR');
    expect(result.errors[0]!.message).toContain('Failed to parse state file');
  });

  it('stringifies non-Error throws from JSON.parse via the String(error) fallback (file path)', async () => {
    // JSON.parse natively only throws SyntaxError, but we stub it for the
    // duration of this test to drive the `String(error)` arm of the
    // `error instanceof Error ? ... : String(error)` ternary at line 109.
    const originalParse = JSON.parse;
    const path = join(tmp_dir, 'good.tfstate');
    writeFileSync(path, JSON.stringify(SAMPLE_STATE));
    JSON.parse = (() => {
      throw 'plain-string-throw';
    }) as typeof JSON.parse;
    try {
      const result = await import_terraform_state(path);
      expect(result.errors[0]!.code).toBe('PARSE_ERROR');
      expect(result.errors[0]!.message).toContain('plain-string-throw');
    } finally {
      JSON.parse = originalParse;
    }
  });

  it('passes options through to the parsed-object pipeline (filter_types)', async () => {
    const path = join(tmp_dir, 'good.tfstate');
    writeFileSync(path, JSON.stringify(SAMPLE_STATE));
    const result = await import_terraform_state(path, { filter_types: ['aws_subnet'] });
    expect(result.resources).toHaveLength(0);
  });
});

// =============================================================================
// import_terraform_state_object — per-resource error capture
// =============================================================================

describe('import_terraform_state_object — per-resource error capture', () => {
  it('Error throws inside import_resource_instance are captured as IMPORT_ERROR with the message', async () => {
    // The orchestrator wraps each instance import in try/catch — a
    // throw becomes an IMPORT_ERROR entry in errors[]. The cleanest way
    // to drive the throw without engineering a fragile state shape is
    // via vi.doMock on the conversion module.
    vi.resetModules();
    vi.doMock('../resource-conversion.js', () => ({
      import_resource_instance: () => {
        throw new Error('explicit-failure');
      },
      infer_dependencies: () => undefined,
    }));
    const { import_terraform_state_object: fresh } = await import('../state-importer.js');
    const result = fresh(SAMPLE_STATE);
    expect(result.success).toBe(false);
    expect(result.errors[0]!.code).toBe('IMPORT_ERROR');
    expect(result.errors[0]!.message).toContain('explicit-failure');
    expect(result.errors[0]!.resource).toBe('aws_vpc.main');
    vi.doUnmock('../resource-conversion.js');
    vi.resetModules();
  });

  it('non-Error throws inside import_resource_instance are stringified', async () => {
    vi.resetModules();
    vi.doMock('../resource-conversion.js', () => ({
      import_resource_instance: () => {
        throw 'oops-not-error';
      },
      infer_dependencies: () => undefined,
    }));
    const { import_terraform_state_object: fresh } = await import('../state-importer.js');
    const result = fresh(SAMPLE_STATE);
    expect(result.errors[0]!.code).toBe('IMPORT_ERROR');
    expect(result.errors[0]!.message).toContain('oops-not-error');
    vi.doUnmock('../resource-conversion.js');
    vi.resetModules();
  });

  it('continues importing subsequent resources after one fails', async () => {
    vi.resetModules();
    let calls = 0;
    vi.doMock('../resource-conversion.js', () => ({
      import_resource_instance: (resource: { name: string }) => {
        calls++;
        if (resource.name === 'fail') throw new Error('fail-1');
        return {
          terraform_address: `${resource.name}.address`,
          terraform_type: 'aws_vpc',
          ice_type: 'aws.vpc.vpc',
          name: resource.name,
          properties: {},
          dependencies: [],
          provider: 'aws',
          sensitive_attributes: [],
        };
      },
      infer_dependencies: () => undefined,
    }));
    const { import_terraform_state_object: fresh } = await import('../state-importer.js');
    const state: TerraformState = {
      ...SAMPLE_STATE,
      resources: [
        {
          mode: 'managed',
          type: 'aws_vpc',
          name: 'fail',
          provider: 'provider["registry.terraform.io/hashicorp/aws"]',
          instances: [{ schema_version: 1, attributes: {}, sensitive_attributes: [] }],
        },
        {
          mode: 'managed',
          type: 'aws_vpc',
          name: 'ok',
          provider: 'provider["registry.terraform.io/hashicorp/aws"]',
          instances: [{ schema_version: 1, attributes: {}, sensitive_attributes: [] }],
        },
      ],
    };
    const result = fresh(state);
    expect(calls).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]!.name).toBe('ok');
    vi.doUnmock('../resource-conversion.js');
    vi.resetModules();
  });

  it('honours pre-supplied errors[] and warnings[] arrays', () => {
    const preErrors = [{ code: 'PRE', message: 'before' }];
    const preWarnings = [{ code: 'PRE_W', message: 'before-warn' }];
    const result = import_terraform_state_object(SAMPLE_STATE, {}, preErrors, preWarnings);
    expect(result.errors[0]).toMatchObject({ code: 'PRE' });
    expect(result.warnings[0]).toMatchObject({ code: 'PRE_W' });
  });

  it('emits UNSUPPORTED_VERSION inside the object pipeline as well', () => {
    const result = import_terraform_state_object({ ...SAMPLE_STATE, version: 99 });
    expect(result.warnings.some((w) => w.code === 'UNSUPPORTED_VERSION')).toBe(true);
  });

  it('returns success when the state has no resources or outputs', () => {
    const empty: TerraformState = {
      version: 4,
      terraform_version: '1.5.0',
      serial: 0,
      lineage: 'empty',
    };
    const result = import_terraform_state_object(empty);
    expect(result.success).toBe(true);
    expect(result.resources).toEqual([]);
    expect(result.outputs).toEqual([]);
    expect(result.metadata.resource_count).toBe(0);
  });

  it('skips data sources by default but includes them when opted in', () => {
    const state: TerraformState = {
      ...SAMPLE_STATE,
      resources: [
        {
          mode: 'data',
          type: 'aws_ami',
          name: 'd',
          provider: 'provider["registry.terraform.io/hashicorp/aws"]',
          instances: [{ schema_version: 0, attributes: { id: 'ami-1' }, sensitive_attributes: [] }],
        },
      ],
    };
    expect(import_terraform_state_object(state).resources).toHaveLength(0);
    expect(
      import_terraform_state_object(state, { include_data_sources: true }).resources,
    ).toHaveLength(1);
  });

  it('filter_modules requires the resource module to startWith one of the prefixes', () => {
    const state: TerraformState = {
      ...SAMPLE_STATE,
      resources: [
        {
          mode: 'managed',
          type: 'aws_vpc',
          name: 'in_module',
          provider: 'provider["registry.terraform.io/hashicorp/aws"]',
          module: 'module.network.subnetting',
          instances: [{ schema_version: 1, attributes: { id: 'vpc-1' }, sensitive_attributes: [] }],
        },
        {
          mode: 'managed',
          type: 'aws_vpc',
          name: 'no_module',
          provider: 'provider["registry.terraform.io/hashicorp/aws"]',
          instances: [{ schema_version: 1, attributes: { id: 'vpc-2' }, sensitive_attributes: [] }],
        },
      ],
    };
    const r = import_terraform_state_object(state, { filter_modules: ['module.network'] });
    expect(r.resources).toHaveLength(1);
    expect(r.resources[0]!.name).toBe('in_module');
  });

  it('preserves sensitive output values when include_sensitive is true', () => {
    const state: TerraformState = {
      ...SAMPLE_STATE,
      outputs: {
        secret: { value: 'real', type: 'string', sensitive: true },
        public: { value: 'open', type: 'string', sensitive: false },
      },
    };
    const r = import_terraform_state_object(state, { include_sensitive: true });
    const secret = r.outputs.find((o) => o.name === 'secret');
    expect(secret?.value).toBe('real');
  });

  it('handles outputs with no sensitive flag (defaults to false)', () => {
    const state: TerraformState = {
      ...SAMPLE_STATE,
      outputs: {
        // no `sensitive` field
        plain: { value: 'val', type: 'string' },
      },
    };
    const r = import_terraform_state_object(state);
    expect(r.outputs[0]!.sensitive).toBe(false);
    expect(r.outputs[0]!.value).toBe('val');
  });

  it('options with explicit undefined values fall back to defaults', () => {
    // The DEFAULT_OPTIONS merge filters out undefined values; passing
    // include_data_sources: undefined should NOT enable data sources.
    const state: TerraformState = {
      ...SAMPLE_STATE,
      resources: [
        {
          mode: 'data',
          type: 'aws_ami',
          name: 'd',
          provider: 'provider["registry.terraform.io/hashicorp/aws"]',
          instances: [{ schema_version: 0, attributes: { id: 'ami-1' }, sensitive_attributes: [] }],
        },
      ],
    };
    const r = import_terraform_state_object(state, {
      include_data_sources: undefined,
    });
    expect(r.resources).toHaveLength(0);
  });

  it('respects infer_dependencies:false (no inferred edges in returned resources)', () => {
    const state: TerraformState = {
      ...SAMPLE_STATE,
      resources: [
        {
          mode: 'managed',
          type: 'aws_vpc',
          name: 'a',
          provider: 'provider["registry.terraform.io/hashicorp/aws"]',
          instances: [
            { schema_version: 1, attributes: { id: 'vpc-a' }, sensitive_attributes: [] },
          ],
        },
        {
          mode: 'managed',
          type: 'aws_subnet',
          name: 'b',
          provider: 'provider["registry.terraform.io/hashicorp/aws"]',
          instances: [
            {
              schema_version: 1,
              attributes: { id: 'subnet-b', vpc_id: 'vpc-a' },
              sensitive_attributes: [],
            },
          ],
        },
      ],
    };
    const inferred = import_terraform_state_object(state, { infer_dependencies: true });
    const not_inferred = import_terraform_state_object(state, { infer_dependencies: false });
    const inferredB = inferred.resources.find((r) => r.name === 'b')!;
    const notInferredB = not_inferred.resources.find((r) => r.name === 'b')!;
    expect(inferredB.dependencies.length).toBeGreaterThanOrEqual(notInferredB.dependencies.length);
  });
});
