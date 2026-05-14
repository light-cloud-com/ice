/**
 * Tests for `customization/example-files.ts` (rf-cload-1).
 *
 * Behaviour pinned (preserved from `create_example_files` private method):
 *  - Each `_example.<ext>.disabled` file is created under its respective
 *    directory.
 *  - Existing files are not overwritten.
 *  - Provider JSON is pretty-printed with 2-space indent and contains
 *    the `_comment` instructing users to rename.
 *  - YAML files are byte-identical to the original inline strings.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CUSTOM_RESOURCE_EXAMPLE_YAML,
  OVERRIDE_EXAMPLE_YAML,
  PROVIDER_EXAMPLE_JSON,
  RELATIONSHIPS_EXAMPLE_YAML,
  create_example_files,
} from '../customization/example-files';
import type { CustomizationPaths } from '../customization/paths';

describe('example-file content constants', () => {
  it('PROVIDER_EXAMPLE_JSON has _comment pointing to .disabled rename', () => {
    expect(PROVIDER_EXAMPLE_JSON).toContain('Remove .disabled extension to enable this file');
    expect(JSON.parse(PROVIDER_EXAMPLE_JSON)).toMatchObject({
      provider_name: 'mycompany/internal',
      resources: { mycompany_api_endpoint: expect.any(Object) },
    });
  });

  it('PROVIDER_EXAMPLE_JSON is pretty-printed with 2-space indent', () => {
    expect(PROVIDER_EXAMPLE_JSON).toContain('\n  "');
  });

  it('OVERRIDE_EXAMPLE_YAML mentions overrides for aws.ec2.instance', () => {
    expect(OVERRIDE_EXAMPLE_YAML).toContain('ice_type: aws.ec2.instance');
    expect(OVERRIDE_EXAMPLE_YAML).toContain('overrides:');
    expect(OVERRIDE_EXAMPLE_YAML).toContain('allowed_values:');
  });

  it('CUSTOM_RESOURCE_EXAMPLE_YAML defines mycompany.api.gateway', () => {
    expect(CUSTOM_RESOURCE_EXAMPLE_YAML).toContain('ice_type: mycompany.api.gateway');
    expect(CUSTOM_RESOURCE_EXAMPLE_YAML).toContain('display_name: "API Gateway"');
  });

  it('RELATIONSHIPS_EXAMPLE_YAML lists multiple relationships', () => {
    expect(RELATIONSHIPS_EXAMPLE_YAML).toContain('relationships:');
    expect(RELATIONSHIPS_EXAMPLE_YAML).toContain('source: aws.lambda.function');
    expect(RELATIONSHIPS_EXAMPLE_YAML).toContain('source: aws.ec2.instance');
  });
});

describe('create_example_files', () => {
  let tmp: string;
  let paths: CustomizationPaths;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-cload-ex-'));
    paths = {
      providers_dir: path.join(tmp, 'providers'),
      overrides_dir: path.join(tmp, 'overrides'),
      custom_dir: path.join(tmp, 'custom'),
      relationships_dir: path.join(tmp, 'relationships'),
    };
    for (const dir of Object.values(paths)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('writes the four .disabled example files into their respective dirs', async () => {
    await create_example_files(paths);
    expect(fs.existsSync(path.join(paths.providers_dir, '_example.json.disabled'))).toBe(true);
    expect(fs.existsSync(path.join(paths.overrides_dir, '_example.yaml.disabled'))).toBe(true);
    expect(fs.existsSync(path.join(paths.custom_dir, '_example.yaml.disabled'))).toBe(true);
    expect(fs.existsSync(path.join(paths.relationships_dir, '_example.yaml.disabled'))).toBe(true);
  });

  it('the provider JSON file matches PROVIDER_EXAMPLE_JSON byte for byte', async () => {
    await create_example_files(paths);
    const written = fs.readFileSync(path.join(paths.providers_dir, '_example.json.disabled'), 'utf-8');
    expect(written).toBe(PROVIDER_EXAMPLE_JSON);
  });

  it('does not overwrite an existing file', async () => {
    const provider_path = path.join(paths.providers_dir, '_example.json.disabled');
    fs.writeFileSync(provider_path, '{"custom":"sentinel"}');
    await create_example_files(paths);
    expect(fs.readFileSync(provider_path, 'utf-8')).toBe('{"custom":"sentinel"}');
  });
});
