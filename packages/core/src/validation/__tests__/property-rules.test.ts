/**
 * Property Validation Rule Tests
 *
 * Drives validateProperties through every type/select/range/cross-field
 * branch. The schema-bridge is mocked so the property catalogue is
 * deterministic — we want behaviour over the validation logic, not over
 * the live HIGH_LEVEL_CATEGORIES data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HighLevelProperty } from '../../resources/high-level-resources';

const propertyMap = new Map<string, HighLevelProperty[]>();

vi.mock('../schema-bridge', () => ({
  getPropertiesForIceType: (iceType: string): HighLevelProperty[] => propertyMap.get(iceType) ?? [],
  isKnownIceType: () => true,
  getResourceForIceType: () => undefined,
  getSupportedProviders: () => [],
}));

import { validateProperties } from '../property-rules';
import type { ValidatableNode, ValidationContext } from '../types';

const ctx: ValidationContext = { mode: 'design' };

const setProps = (iceType: string, props: HighLevelProperty[]) => {
  propertyMap.set(iceType, props);
};

const node = (id: string, iceType: string, data: Record<string, unknown> = {}): ValidatableNode => ({
  id,
  type: 'resource',
  data: { iceType, ...data },
});

beforeEach(() => {
  vi.clearAllMocks();
  propertyMap.clear();
});

describe('validateProperties', () => {
  it('returns no issues when no nodes have iceType', () => {
    expect(validateProperties([{ id: 'a', type: 'resource', data: {} }], ctx)).toEqual([]);
  });

  it('skips containers and groups', () => {
    setProps('Group.Backend', [{ name: 'x', label: 'X', type: 'string', required: true, description: '' }]);
    const issues = validateProperties(
      [
        node('g1', 'Group.Backend'),
        { id: 'g2', type: 'group', data: { iceType: 'Whatever' } },
        { id: 'g3', type: 'container', data: { iceType: 'Whatever' } },
      ],
      ctx,
    );
    expect(issues).toEqual([]);
  });

  it('returns no issues when the schema has zero properties', () => {
    setProps('X.Empty', []);
    expect(validateProperties([node('a', 'X.Empty')], ctx)).toEqual([]);
  });

  it('flags a missing required property', () => {
    setProps('X.Service', [{ name: 'name', label: 'Name', type: 'string', required: true, description: '' }]);
    const issues = validateProperties([node('a', 'X.Service')], ctx);
    expect(issues.find((i) => i.code === 'MISSING_REQUIRED')?.propertyPath).toBe('name');
  });

  it('treats a whitespace-only string as missing for required checks', () => {
    setProps('X.Service', [{ name: 'name', label: 'Name', type: 'string', required: true, description: '' }]);
    const issues = validateProperties([node('a', 'X.Service', { name: '  ' })], ctx);
    expect(issues.find((i) => i.code === 'MISSING_REQUIRED')).toBeTruthy();
  });

  it('skips further checks on a missing required property (only the MISSING_REQUIRED issue fires)', () => {
    setProps('X.Service', [{ name: 'count', label: 'Count', type: 'number', required: true, description: '' }]);
    const issues = validateProperties([node('a', 'X.Service', { count: undefined })], ctx);
    expect(issues.filter((i) => i.propertyPath === 'count')).toHaveLength(1);
  });

  it('skips further checks when a non-required value is undefined or null', () => {
    setProps('X.Service', [{ name: 'count', label: 'Count', type: 'number', required: false, description: '' }]);
    const issues = validateProperties(
      [node('a', 'X.Service', { count: null }), node('b', 'X.Service', { count: undefined })],
      ctx,
    );
    expect(issues).toEqual([]);
  });

  it('flags a string property with non-string value', () => {
    setProps('X.Service', [{ name: 'name', label: 'Name', type: 'string', required: false, description: '' }]);
    const issues = validateProperties([node('a', 'X.Service', { name: 42 })], ctx);
    expect(issues.find((i) => i.code === 'TYPE_MISMATCH')?.message).toContain('text');
  });

  it('flags a number property with non-number value', () => {
    setProps('X.Service', [{ name: 'count', label: 'Count', type: 'number', required: false, description: '' }]);
    const issues = validateProperties([node('a', 'X.Service', { count: 'lots' })], ctx);
    expect(issues.find((i) => i.code === 'TYPE_MISMATCH')?.message).toContain('number');
  });

  it('flags a boolean property with non-boolean value', () => {
    setProps('X.Service', [{ name: 'flag', label: 'Flag', type: 'boolean', required: false, description: '' }]);
    const issues = validateProperties([node('a', 'X.Service', { flag: 'yes' })], ctx);
    expect(issues.find((i) => i.code === 'TYPE_MISMATCH')?.message).toContain('true/false');
  });

  it('flags a list property with non-array value', () => {
    setProps('X.Service', [{ name: 'tags', label: 'Tags', type: 'list', required: false, description: '' }]);
    const issues = validateProperties([node('a', 'X.Service', { tags: 'nope' })], ctx);
    expect(issues.find((i) => i.code === 'TYPE_MISMATCH')?.message).toContain('list');
  });

  it('does not flag valid string / number / boolean / list values (type-check passes)', () => {
    setProps('X.Service', [
      { name: 's', label: 'S', type: 'string', required: false, description: '' },
      { name: 'n', label: 'N', type: 'number', required: false, description: '' },
      { name: 'b', label: 'B', type: 'boolean', required: false, description: '' },
      { name: 'l', label: 'L', type: 'list', required: false, description: '' },
    ]);
    const issues = validateProperties([node('a', 'X.Service', { s: 'ok', n: 42, b: true, l: ['x'] })], ctx);
    expect(issues.filter((i) => i.code === 'TYPE_MISMATCH')).toEqual([]);
  });

  it('treats a non-empty string and a non-null value as not-missing for required checks', () => {
    setProps('X.Service', [
      { name: 's', label: 'S', type: 'string', required: true, description: '' },
      { name: 'n', label: 'N', type: 'number', required: true, description: '' },
    ]);
    const issues = validateProperties([node('a', 'X.Service', { s: 'value', n: 0 })], ctx);
    expect(issues.filter((i) => i.code === 'MISSING_REQUIRED')).toEqual([]);
  });

  it('does not flag select values for type mismatch (selects are typed at the option level)', () => {
    setProps('X.Service', [
      {
        name: 'size',
        label: 'Size',
        type: 'select',
        required: false,
        description: '',
        options: ['small', 'large'],
      },
    ]);
    const issues = validateProperties([node('a', 'X.Service', { size: 'small' })], ctx);
    expect(issues.filter((i) => i.code === 'TYPE_MISMATCH')).toEqual([]);
  });

  it('passes select validation for the special "custom" sentinel', () => {
    setProps('X.Service', [
      {
        name: 'size',
        label: 'Size',
        type: 'select',
        required: false,
        description: '',
        options: ['small'],
      },
    ]);
    const issues = validateProperties([node('a', 'X.Service', { size: 'custom' })], ctx);
    expect(issues.find((i) => i.code === 'INVALID_OPTION')).toBeUndefined();
  });

  it('flags an invalid option against the simple options array', () => {
    setProps('X.Service', [
      {
        name: 'size',
        label: 'Size',
        type: 'select',
        required: false,
        description: '',
        options: ['small', 'large'],
      },
    ]);
    const issues = validateProperties([node('a', 'X.Service', { size: 'xl' })], ctx);
    expect(issues.find((i) => i.code === 'INVALID_OPTION')?.message).toContain('xl');
  });

  it('passes when the value is in the simple options array', () => {
    setProps('X.Service', [
      {
        name: 'size',
        label: 'Size',
        type: 'select',
        required: false,
        description: '',
        options: ['small'],
      },
    ]);
    expect(validateProperties([node('a', 'X.Service', { size: 'small' })], ctx)).toEqual([]);
  });

  it('does not run the simple options check when options is empty', () => {
    setProps('X.Service', [
      {
        name: 'size',
        label: 'Size',
        type: 'select',
        required: false,
        description: '',
        options: [],
      },
    ]);
    const issues = validateProperties([node('a', 'X.Service', { size: 'whatever' })], ctx);
    expect(issues.find((i) => i.code === 'INVALID_OPTION')).toBeUndefined();
  });

  it('does not run the simple options check when options is missing entirely', () => {
    setProps('X.Service', [
      {
        name: 'size',
        label: 'Size',
        type: 'select',
        required: false,
        description: '',
      },
    ]);
    const issues = validateProperties([node('a', 'X.Service', { size: 'whatever' })], ctx);
    expect(issues.find((i) => i.code === 'INVALID_OPTION')).toBeUndefined();
  });

  it('uses optionDetails over options when both are present and respects provider filtering', () => {
    setProps('X.Service', [
      {
        name: 'size',
        label: 'Size',
        type: 'select',
        required: false,
        description: '',
        options: ['shouldNotMatter'],
        optionDetails: [
          { value: 'small', label: 'Small', provider: 'aws' },
          { value: 'mini', label: 'Mini', provider: 'gcp' },
        ],
      },
    ]);
    // node.provider takes precedence over ctx.provider
    const issues = validateProperties([node('a', 'X.Service', { size: 'small', provider: 'aws' })], {
      mode: 'design',
      provider: 'gcp',
    });
    expect(issues.find((i) => i.code === 'INVALID_OPTION')).toBeUndefined();
  });

  it('flags an option that is not valid for the selected provider', () => {
    setProps('X.Service', [
      {
        name: 'size',
        label: 'Size',
        type: 'select',
        required: false,
        description: '',
        optionDetails: [
          { value: 'tiny', label: 'Tiny', provider: 'gcp' },
          { value: 'small', label: 'Small', provider: 'aws' },
        ],
      },
    ]);
    // gcp provider, value 'small' (which is aws-only) — should fail
    const issues = validateProperties([node('a', 'X.Service', { size: 'small' })], { mode: 'design', provider: 'gcp' });
    const opt = issues.find((i) => i.code === 'INVALID_OPTION');
    expect(opt?.message).toContain('GCP');
  });

  it('uses a generic provider label when no provider is set on the node or context', () => {
    setProps('X.Service', [
      {
        name: 'size',
        label: 'Size',
        type: 'select',
        required: false,
        description: '',
        // Provider-agnostic option (no `provider` field) so validOptions is non-empty
        optionDetails: [{ value: 'small', label: 'Small' }],
      },
    ]);
    const issues = validateProperties([node('a', 'X.Service', { size: 'whatever' })], { mode: 'design' });
    expect(issues.find((i) => i.code === 'INVALID_OPTION')?.message).toContain('this provider');
  });

  it('skips the optionDetails branch when no options are valid for the provider (validOptions empty)', () => {
    setProps('X.Service', [
      {
        name: 'size',
        label: 'Size',
        type: 'select',
        required: false,
        description: '',
        optionDetails: [{ value: 'small', label: 'Small', provider: 'aws' }],
      },
    ]);
    // Provider 'azure' filters out the only option, so validOptions is empty
    // and the INVALID_OPTION rule short-circuits. The contract: "if no options
    // are valid for this provider, don't accuse the user".
    const issues = validateProperties([node('a', 'X.Service', { size: 'whatever', provider: 'azure' })], {
      mode: 'design',
    });
    expect(issues.find((i) => i.code === 'INVALID_OPTION')).toBeUndefined();
  });

  it('flags numeric values below customInput.min', () => {
    setProps('X.Service', [
      {
        name: 'storage',
        label: 'Storage',
        type: 'number',
        required: false,
        description: '',
        customInput: { type: 'number', unit: 'GB', min: 10, max: 100 },
      },
    ]);
    const issues = validateProperties([node('a', 'X.Service', { storage: 5 })], ctx);
    const r = issues.find((i) => i.code === 'VALUE_OUT_OF_RANGE');
    expect(r?.message).toContain('10 GB');
  });

  it('flags numeric values above customInput.max', () => {
    setProps('X.Service', [
      {
        name: 'storage',
        label: 'Storage',
        type: 'number',
        required: false,
        description: '',
        customInput: { type: 'number', unit: 'GB', max: 100 },
      },
    ]);
    const issues = validateProperties([node('a', 'X.Service', { storage: 999 })], ctx);
    expect(issues.find((i) => i.code === 'VALUE_OUT_OF_RANGE')?.message).toContain('100 GB');
  });

  it('does not flag when customInput min/max are undefined', () => {
    setProps('X.Service', [
      {
        name: 'storage',
        label: 'Storage',
        type: 'number',
        required: false,
        description: '',
        customInput: { type: 'number', unit: 'GB' },
      },
    ]);
    expect(validateProperties([node('a', 'X.Service', { storage: 0 })], ctx)).toEqual([]);
  });

  it('does not run range checks for non-customInput number properties', () => {
    setProps('X.Service', [{ name: 'storage', label: 'Storage', type: 'number', required: false, description: '' }]);
    expect(validateProperties([node('a', 'X.Service', { storage: -100 })], ctx)).toEqual([]);
  });

  // The cross-field and duplicate-name checks live inside the per-node block
  // and only run when the iceType has at least one property in the schema. Use
  // a single innocuous property so the per-property loop is a no-op but the
  // post-loop checks still execute. This mirrors how every real iceType is
  // shaped (none have an empty property catalogue).
  const trivial: HighLevelProperty = {
    name: 'unused',
    label: 'Unused',
    type: 'string',
    required: false,
    description: '',
  };

  it('flags minInstances > maxInstances cross-field violation', () => {
    setProps('X.Service', [trivial]);
    const issues = validateProperties([node('a', 'X.Service', { minInstances: 5, maxInstances: 2 })], ctx);
    const r = issues.find((i) => i.code === 'VALUE_OUT_OF_RANGE' && i.propertyPath === 'minInstances');
    expect(r?.message).toContain('5');
  });

  it('does not flag the cross-field rule when both values are equal or undefined', () => {
    setProps('X.Service', [trivial]);
    const issues = validateProperties(
      [node('a', 'X.Service', { minInstances: 1, maxInstances: 1 }), node('b', 'X.Service', { minInstances: 1 })],
      ctx,
    );
    expect(issues.find((i) => i.code === 'VALUE_OUT_OF_RANGE' && i.propertyPath === 'minInstances')).toBeUndefined();
  });

  it('flags duplicate names across nodes', () => {
    setProps('X.Service', [trivial]);
    const issues = validateProperties(
      [
        node('a', 'X.Service', { name: 'database' }),
        node('b', 'X.Service', { name: 'Database' }), // case-insensitive
      ],
      ctx,
    );
    const dups = issues.filter((i) => i.code === 'DUPLICATE_NAME');
    expect(dups).toHaveLength(1);
    expect(dups[0]!.nodeId).toBe('b');
  });

  it('falls back to label when name is absent and counts that for duplicate detection', () => {
    setProps('X.Service', [trivial]);
    const issues = validateProperties(
      [node('a', 'X.Service', { label: 'API' }), node('b', 'X.Service', { label: 'api' })],
      ctx,
    );
    expect(issues.find((i) => i.code === 'DUPLICATE_NAME')?.nodeId).toBe('b');
  });

  it('ignores empty / whitespace name strings for duplicate detection', () => {
    setProps('X.Service', [trivial]);
    const issues = validateProperties(
      [node('a', 'X.Service', { name: '   ' }), node('b', 'X.Service', { name: '   ' })],
      ctx,
    );
    expect(issues.find((i) => i.code === 'DUPLICATE_NAME')).toBeUndefined();
  });

  it('ignores non-string name values for duplicate detection', () => {
    setProps('X.Service', [trivial]);
    const issues = validateProperties(
      [node('a', 'X.Service', { name: 42 }), node('b', 'X.Service', { name: 42 })],
      ctx,
    );
    expect(issues.find((i) => i.code === 'DUPLICATE_NAME')).toBeUndefined();
  });
});
