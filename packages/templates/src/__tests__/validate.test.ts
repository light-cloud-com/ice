/**
 * Validation script coverage.
 *
 * `validate.ts` is a SCRIPT — it runs at module-import time, walks every
 * template via the rule helpers, prints a report, and `process.exit(1)`s
 * on errors. We control its inputs via mocked `ALL_TEMPLATES` (from `.`),
 * mocked `@ice/core` `validateTemplate`, mocked `@ice/blocks` getBlueprint
 * + expandBlueprint, and stub `process.exit`.
 *
 * Each `it` reimports the module after `vi.resetModules()`. The mocked
 * registry mutates between tests via the hoisted `h` bag, so each scenario
 * loads with a fresh ALL_TEMPLATES while reusing the same mock factories.
 *
 * Branch coverage targets every rule helper:
 *   checkCore       — error vs warn fan-out, MISSING_ICE_TYPE downgrade
 *   checkBlueprints — R1 missing-blueprint
 *   checkBounds     — R2 out-of-bounds inside group, OOB block index
 *   checkUngrouped  — R3 ungrouped blocks above maxGroupBottom
 *   checkVpcSubnet  — R5 missing groups, missing VPC, non-empty VPC,
 *                     missing Subnet, missing parentGroupIndex,
 *                     parentGroupIndex pointing at non-VPC, quick-start skip
 *   checkProperties — R6 missing required prop
 *   checkColors     — R7 wrong group color, parenthetical-stripped match
 *   checkMetadata   — R10 missing required field, missing optional fields
 *   checkExpansion  — Expand returns 0 nodes, throws, providerUnsupported
 *
 * Plus the script-level branches: warnings-only path, errors-present path,
 * clean path (no issues at all).
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComposedTemplate } from '../types';

// Hoisted mock state — every mock factory reads from this bag, every test
// mutates it before the SUT module loads.
const h = vi.hoisted(() => ({
  templates: [] as any[],
  coreIssues: [] as any[], // emitted by validateTemplate mock
  blueprints: new Map<string, any>(),
  expandResult: null as any | (() => any), // set per-test
  expandThrows: null as any | null,
  requiredProps: {} as Record<string, string[]>,
  groupColors: {} as Record<string, string>,
}));

// validate.ts imports `from '.'` which resolves to src/index.ts. The test
// file lives in src/__tests__/, so the mock spec must point at the relative
// path the SUT module sees (one level up).
vi.mock('../index', () => ({
  get ALL_TEMPLATES() {
    return h.templates;
  },
}));

vi.mock('@ice/core', () => ({
  validateTemplate: () => h.coreIssues,
}));

vi.mock('@ice/blocks', () => ({
  getBlueprint: (iceType: string) => h.blueprints.get(iceType),
  expandBlueprint: () => ({
    node: {
      id: 'unused',
      type: 'resource',
      position: { x: 0, y: 0 },
      width: 220,
      height: 56,
      data: { name: 'x' },
    },
  }),
}));

// expand-template depends on @ice/blocks above; mock the wrapper directly
// so we control checkExpansion's branches without recreating provider logic.
vi.mock('../expand-template', () => ({
  expandComposedTemplate: (_t: any, _p: any) => {
    if (h.expandThrows) throw h.expandThrows;
    if (typeof h.expandResult === 'function') return h.expandResult();
    return h.expandResult ?? { nodes: [], edges: [] };
  },
}));

vi.mock('@ice/constants', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    get REQUIRED_PROPS() {
      return h.requiredProps;
    },
    get GROUP_COLORS() {
      return h.groupColors;
    },
    CARD_WIDTH: 220,
    CARD_HEIGHT: 56,
  };
});

let exitSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  process.env.NODE_ENV = 'test';
});

beforeEach(() => {
  // Reset the entire mock state; every test installs its own.
  h.templates = [];
  h.coreIssues = [];
  h.blueprints.clear();
  h.expandResult = {
    nodes: [{ id: 'n', type: 'resource', position: { x: 0, y: 0 }, width: 220, height: 56, data: { name: 'x' } }],
    edges: [],
  };
  h.expandThrows = null;
  h.requiredProps = {};
  h.groupColors = {};
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => undefined) as any);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// findings.md #45 — validate.ts no longer self-runs at import time;
// the SUT now exposes runValidation + printReport as named exports
// and the CLI driver is gated behind an isMain() check that stays
// dormant under vitest. The helper imports the module fresh (so
// h.templates is read from the matching mocked '../index'), invokes
// runValidation, prints the report — and surfaces process.exit(1)
// behaviour for tests that asserted on it via the existing exitSpy.
async function loadValidate() {
  vi.resetModules();
  const mod = await import('../validate');
  const issues = mod.runValidation(h.templates);
  const { errors } = mod.printReport(issues, h.templates.length);
  if (errors.length > 0) process.exit(1);
}

function makeTemplate(overrides: Partial<ComposedTemplate> = {}): ComposedTemplate {
  return {
    id: 'tpl-1',
    name: 'Tpl 1',
    description: 'd',
    icon: 'I',
    estimatedCost: '$1',
    category: 'quick-start',
    tags: ['x'],
    securityLevel: 'basic',
    environmentPresets: [{ type: 'production', name: 'p', region: 'r', securityLevel: 'basic' }],
    blocks: [],
    connections: [],
    difficulty: 'starter',
    trust: 'official',
    author: { name: 'a' },
    ...overrides,
  };
}

describe('validate.ts — clean run (no templates)', () => {
  it('logs success and does not call process.exit when no issues are found', async () => {
    h.templates = []; // empty registry
    await loadValidate();
    const allLogs = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogs).toMatch(/Validated 0 templates/);
    expect(allLogs).toMatch(/All templates pass validation/);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe('validate.ts — checkCore', () => {
  it('passes through a structural error from @ice/core untouched', async () => {
    h.templates = [makeTemplate()];
    h.coreIssues = [{ severity: 'error', code: 'DANGLING_EDGE_SOURCE', message: 'bad edge' }];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/Core:DANGLING_EDGE_SOURCE/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('downgrades MISSING_ICE_TYPE to warning when the iceType has a registered blueprint', async () => {
    h.templates = [makeTemplate()];
    h.coreIssues = [
      {
        severity: 'error',
        code: 'MISSING_ICE_TYPE',
        message: 'unknown iceType "Compute.OK"',
      },
    ];
    h.blueprints.set('Compute.OK', { iceType: 'Compute.OK', providers: ['gcp'] });
    await loadValidate();
    // Warning bucket should contain the line; errors should not.
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/⚠.*warning/);
    expect(out).toMatch(/Core:MISSING_ICE_TYPE/);
    // No error path → no process.exit.
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('keeps MISSING_ICE_TYPE as error when no blueprint matches', async () => {
    h.templates = [makeTemplate()];
    h.coreIssues = [
      {
        severity: 'error',
        code: 'MISSING_ICE_TYPE',
        message: 'unknown iceType "Compute.Real"',
      },
    ];
    // Blueprint registry is empty, so the downgrade path is not taken.
    await loadValidate();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('keeps MISSING_ICE_TYPE as error when message regex does not match', async () => {
    h.templates = [makeTemplate()];
    h.coreIssues = [
      {
        severity: 'error',
        code: 'MISSING_ICE_TYPE',
        message: 'unparseable message without quotes',
      },
    ];
    await loadValidate();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('passes through warnings as warnings (no severity flip needed)', async () => {
    h.templates = [makeTemplate()];
    h.coreIssues = [{ severity: 'warning', code: 'INVALID_CONNECTION', message: 'soft warn' }];
    await loadValidate();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe('validate.ts — checkBlueprints (R1)', () => {
  it('emits an error when no blueprint exists for a block iceType', async () => {
    h.templates = [
      makeTemplate({
        blocks: [{ iceType: 'Compute.Phantom', label: 'Phantom', position: { x: 0, y: 0 } }],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/R1:blueprint/);
    expect(out).toMatch(/Compute.Phantom/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('does not emit when blueprint is present for every block', async () => {
    h.blueprints.set('Compute.OK', { iceType: 'Compute.OK', providers: ['gcp'] });
    h.templates = [
      makeTemplate({
        blocks: [{ iceType: 'Compute.OK', label: 'OK', position: { x: 0, y: 0 } }],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).not.toMatch(/R1:blueprint/);
  });
});

describe('validate.ts — checkBounds (R2)', () => {
  it('emits when a block overflows its group bounds', async () => {
    h.templates = [
      makeTemplate({
        blocks: [
          { iceType: 'X', label: 'A', position: { x: 999, y: 999 } }, // far outside
        ],
        groups: [
          {
            subtype: 'Stack',
            label: 'Stack',
            position: { x: 0, y: 0 },
            width: 200,
            height: 200,
            blockIndices: [0],
          },
        ],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/R2:bounds/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('does not emit when block is inside group bounds', async () => {
    h.templates = [
      makeTemplate({
        blocks: [{ iceType: 'X', label: 'A', position: { x: 30, y: 60 } }],
        groups: [
          {
            subtype: 'Stack',
            label: 'Stack',
            position: { x: 0, y: 0 },
            width: 600,
            height: 400,
            blockIndices: [0],
          },
        ],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).not.toMatch(/R2:bounds/);
  });

  it('skips out-of-bounds block indices (already caught by core)', async () => {
    h.templates = [
      makeTemplate({
        blocks: [{ iceType: 'X', label: 'A', position: { x: 30, y: 60 } }],
        groups: [
          {
            subtype: 'Stack',
            label: 'Stack',
            position: { x: 0, y: 0 },
            width: 200,
            height: 200,
            blockIndices: [99], // OOB
          },
        ],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).not.toMatch(/R2:bounds/);
  });

  it('returns early when template has no groups', async () => {
    h.templates = [makeTemplate({ blocks: [], groups: undefined })];
    await loadValidate();
    // No throw / no error.
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe('validate.ts — checkUngrouped (R3)', () => {
  it('warns when an ungrouped block sits above the bottom of the lowest group', async () => {
    h.templates = [
      makeTemplate({
        // Use the quick-start template-data path (no VPC required for R5).
        blocks: [
          { iceType: 'X', label: 'In', position: { x: 30, y: 60 } },
          { iceType: 'Y', label: 'Free', position: { x: 30, y: 50 } }, // ungrouped, above bottom
        ],
        groups: [
          {
            subtype: 'Stack',
            label: 'Stack',
            position: { x: 0, y: 0 },
            width: 600,
            height: 400, // bottom = 400
            blockIndices: [0],
          },
        ],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/R3:ungrouped/);
  });

  it('does not warn when ungrouped block sits below all groups', async () => {
    h.templates = [
      makeTemplate({
        blocks: [
          { iceType: 'X', label: 'In', position: { x: 30, y: 60 } },
          { iceType: 'Y', label: 'Below', position: { x: 30, y: 500 } },
        ],
        groups: [
          {
            subtype: 'Stack',
            label: 'Stack',
            position: { x: 0, y: 0 },
            width: 600,
            height: 400,
            blockIndices: [0],
          },
        ],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).not.toMatch(/R3:ungrouped/);
  });

  it('returns early when groups is empty', async () => {
    h.templates = [makeTemplate({ blocks: [{ iceType: 'X', label: 'A', position: { x: 0, y: 0 } }], groups: [] })];
    await loadValidate();
    expect(exitSpy).toHaveBeenCalledWith(1); // R1:blueprint will fire
  });

  it('returns early when groups is undefined', async () => {
    h.templates = [makeTemplate({ blocks: [], groups: undefined })];
    await loadValidate();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe('validate.ts — checkVpcSubnet (R5)', () => {
  it('skips quickstart templates (early return)', async () => {
    h.templates = [makeTemplate({ category: 'quick-start' })];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).not.toMatch(/R5:/);
  });

  it('errors when a non-quickstart template has no groups', async () => {
    h.templates = [makeTemplate({ category: 'full-stack', groups: undefined })];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/R5:vpc/);
    expect(out).toMatch(/must have VPC with Subnets/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('errors when a non-quickstart template has groups but no VPC', async () => {
    h.templates = [
      makeTemplate({
        category: 'full-stack',
        groups: [
          {
            subtype: 'Stack',
            label: 'Stack',
            position: { x: 0, y: 0 },
            width: 200,
            height: 200,
            blockIndices: [],
          },
        ],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/No VPC group found/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('errors when VPC has blockIndices populated', async () => {
    h.templates = [
      makeTemplate({
        category: 'full-stack',
        blocks: [{ iceType: 'X', label: 'A', position: { x: 30, y: 60 } }],
        groups: [
          {
            subtype: 'VPC',
            iceType: 'Network.VPC',
            label: 'VPC',
            position: { x: 0, y: 0 },
            width: 600,
            height: 600,
            blockIndices: [0], // illegal — VPC must be empty
          },
          {
            subtype: 'Subnet',
            iceType: 'Network.Subnet',
            label: 'Subnet',
            position: { x: 50, y: 50 },
            width: 200,
            height: 200,
            blockIndices: [],
            parentGroupIndex: 0,
          },
        ],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/R5:vpc-empty/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('errors when no Subnet groups exist inside the VPC', async () => {
    h.templates = [
      makeTemplate({
        category: 'full-stack',
        groups: [
          {
            subtype: 'VPC',
            iceType: 'Network.VPC',
            label: 'VPC',
            position: { x: 0, y: 0 },
            width: 600,
            height: 600,
            blockIndices: [],
          },
        ],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/R5:subnet/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('errors when a Subnet group has no parentGroupIndex', async () => {
    h.templates = [
      makeTemplate({
        category: 'full-stack',
        groups: [
          {
            subtype: 'VPC',
            iceType: 'Network.VPC',
            label: 'VPC',
            position: { x: 0, y: 0 },
            width: 600,
            height: 600,
            blockIndices: [],
          },
          {
            subtype: 'Subnet',
            iceType: 'Network.Subnet',
            label: 'Subnet',
            position: { x: 50, y: 50 },
            width: 200,
            height: 200,
            blockIndices: [],
            // parentGroupIndex deliberately omitted
          },
        ],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/Subnet "Subnet" missing parentGroupIndex/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('errors when a Subnet parentGroupIndex points at a non-VPC group', async () => {
    h.templates = [
      makeTemplate({
        category: 'full-stack',
        groups: [
          {
            subtype: 'Stack',
            label: 'Other',
            position: { x: 0, y: 0 },
            width: 600,
            height: 600,
            blockIndices: [],
          },
          {
            subtype: 'VPC',
            iceType: 'Network.VPC',
            label: 'VPC',
            position: { x: 0, y: 0 },
            width: 600,
            height: 600,
            blockIndices: [],
          },
          {
            subtype: 'Subnet',
            iceType: 'Network.Subnet',
            label: 'Subnet',
            position: { x: 50, y: 50 },
            width: 200,
            height: 200,
            blockIndices: [],
            parentGroupIndex: 0, // points at non-VPC
          },
        ],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/parentGroupIndex points to non-VPC/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('errors when Subnet parentGroupIndex points at a non-existent group', async () => {
    h.templates = [
      makeTemplate({
        category: 'full-stack',
        groups: [
          {
            subtype: 'VPC',
            iceType: 'Network.VPC',
            label: 'VPC',
            position: { x: 0, y: 0 },
            width: 600,
            height: 600,
            blockIndices: [],
          },
          {
            subtype: 'Subnet',
            iceType: 'Network.Subnet',
            label: 'Subnet',
            position: { x: 50, y: 50 },
            width: 200,
            height: 200,
            blockIndices: [],
            parentGroupIndex: 99, // out of bounds
          },
        ],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/non-VPC|R5:parent/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('passes when VPC + Subnet structure is valid', async () => {
    h.templates = [
      makeTemplate({
        category: 'full-stack',
        groups: [
          {
            subtype: 'VPC',
            iceType: 'Network.VPC',
            label: 'VPC',
            position: { x: 0, y: 0 },
            width: 600,
            height: 600,
            blockIndices: [],
          },
          {
            subtype: 'Subnet',
            iceType: 'Network.Subnet',
            label: 'Subnet',
            position: { x: 50, y: 50 },
            width: 200,
            height: 200,
            blockIndices: [],
            parentGroupIndex: 0,
          },
        ],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).not.toMatch(/R5:/);
  });
});

describe('validate.ts — checkProperties (R6)', () => {
  it('errors when a block is missing a required property', async () => {
    h.requiredProps = { 'Database.PostgreSQL': ['size', 'storage'] };
    h.blueprints.set('Database.PostgreSQL', { iceType: 'Database.PostgreSQL', providers: ['gcp'] });
    h.templates = [
      makeTemplate({
        blocks: [
          {
            iceType: 'Database.PostgreSQL',
            label: 'DB',
            position: { x: 30, y: 60 },
            data: { size: 'small' }, // missing 'storage'
          },
        ],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/R6:prop/);
    expect(out).toMatch(/missing required property "storage"/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('skips check when iceType has no required-props entry', async () => {
    h.requiredProps = {}; // empty → required is undefined for every iceType
    h.blueprints.set('X', { iceType: 'X', providers: ['gcp'] });
    h.templates = [
      makeTemplate({
        blocks: [{ iceType: 'X', label: 'A', position: { x: 30, y: 60 }, data: {} }],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).not.toMatch(/R6:prop/);
  });

  it('skips check when block.data is undefined', async () => {
    h.requiredProps = { Y: ['name'] };
    h.blueprints.set('Y', { iceType: 'Y', providers: ['gcp'] });
    h.templates = [
      makeTemplate({
        blocks: [
          { iceType: 'Y', label: 'B', position: { x: 30, y: 60 } }, // no data
        ],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).not.toMatch(/R6:prop/);
  });

  it('passes when all required props are present', async () => {
    h.requiredProps = { Z: ['size'] };
    h.blueprints.set('Z', { iceType: 'Z', providers: ['gcp'] });
    h.templates = [
      makeTemplate({
        blocks: [
          {
            iceType: 'Z',
            label: 'C',
            position: { x: 30, y: 60 },
            data: { size: 'big' },
          },
        ],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).not.toMatch(/R6:prop/);
  });
});

describe('validate.ts — checkColors (R7)', () => {
  it('warns when a group color does not match the convention', async () => {
    h.groupColors = { Frontend: '#ff0000' };
    h.templates = [
      makeTemplate({
        groups: [
          {
            subtype: 'Frontend',
            label: 'Frontend',
            position: { x: 0, y: 0 },
            width: 200,
            height: 200,
            blockIndices: [],
            color: '#000000', // wrong color
          },
        ],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/R7:color/);
  });

  it('matches via parenthetical-stripped label fallback', async () => {
    // GROUP_COLORS keyed on "Frontend" matches "Frontend (production)" via the
    // .replace(/ \(.*\)/, '') fallback.
    h.groupColors = { Frontend: '#3b82f6' };
    h.templates = [
      makeTemplate({
        groups: [
          {
            subtype: 'Frontend',
            label: 'Frontend (production)',
            position: { x: 0, y: 0 },
            width: 200,
            height: 200,
            blockIndices: [],
            color: '#3b82f6', // matches
          },
        ],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).not.toMatch(/R7:color/);
  });

  it('does not warn for a label not in GROUP_COLORS at all', async () => {
    h.groupColors = {};
    h.templates = [
      makeTemplate({
        groups: [
          {
            subtype: 'Whatever',
            label: 'Whatever',
            position: { x: 0, y: 0 },
            width: 200,
            height: 200,
            blockIndices: [],
            color: '#aaaaaa',
          },
        ],
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).not.toMatch(/R7:color/);
  });

  it('returns early when no groups at all', async () => {
    h.templates = [makeTemplate({ groups: undefined })];
    await loadValidate();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe('validate.ts — checkMetadata (R10)', () => {
  it('errors when a required metadata field is missing (string)', async () => {
    const t = makeTemplate({});
    delete (t as any).description;
    h.templates = [t];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/R10:meta/);
    expect(out).toMatch(/Missing required metadata field "description"/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('errors when a required array field is empty', async () => {
    h.templates = [makeTemplate({ tags: [] })];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/R10:meta/);
    expect(out).toMatch(/Missing required metadata field "tags"/);
  });

  it('warns when optional difficulty is missing', async () => {
    h.templates = [makeTemplate({ difficulty: undefined })];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/Missing optional metadata field "difficulty"/);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('warns when optional trust is missing', async () => {
    h.templates = [makeTemplate({ trust: undefined })];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/Missing optional metadata field "trust"/);
  });

  it('warns when optional author is missing', async () => {
    h.templates = [makeTemplate({ author: undefined })];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/Missing optional metadata field "author"/);
  });

  it('passes when all metadata fields are present', async () => {
    h.templates = [makeTemplate()];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).not.toMatch(/R10:meta/);
  });
});

describe('validate.ts — checkExpansion', () => {
  it('errors when expansion produces zero nodes', async () => {
    h.expandResult = { nodes: [], edges: [] };
    h.templates = [makeTemplate()];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/Expansion for provider .* produced zero nodes/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('errors when expansion throws', async () => {
    h.expandThrows = new Error('boom');
    h.templates = [makeTemplate()];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/Expansion failed for provider .*: Error: boom/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('warns when nodes carry providerUnsupported = true (using node.data.name)', async () => {
    h.expandResult = {
      nodes: [
        {
          id: 'n1',
          type: 'resource',
          position: { x: 0, y: 0 },
          width: 220,
          height: 56,
          data: { name: 'Bad', providerUnsupported: true },
        },
      ],
      edges: [],
    };
    h.templates = [makeTemplate()];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/unsupported on provider .*: Bad/);
  });

  it('falls back to data.iceType in unsupported-list when name is missing', async () => {
    h.expandResult = {
      nodes: [
        {
          id: 'n1',
          type: 'resource',
          position: { x: 0, y: 0 },
          width: 220,
          height: 56,
          data: { iceType: 'Compute.Foo', providerUnsupported: true }, // no name
        },
      ],
      edges: [],
    };
    h.templates = [makeTemplate()];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/Compute\.Foo/);
  });

  it('iterates each provider in template.providers', async () => {
    let callCount = 0;
    h.expandResult = () => {
      callCount++;
      return {
        nodes: [{ id: 'n', type: 'resource', position: { x: 0, y: 0 }, width: 220, height: 56, data: {} }],
        edges: [],
      };
    };
    h.templates = [makeTemplate({ providers: ['gcp', 'aws', 'azure'] })];
    await loadValidate();
    expect(callCount).toBe(3);
  });

  it('uses [provider] when providers is absent and provider is set', async () => {
    let callCount = 0;
    h.expandResult = () => {
      callCount++;
      return {
        nodes: [{ id: 'n', type: 'resource', position: { x: 0, y: 0 }, width: 220, height: 56, data: {} }],
        edges: [],
      };
    };
    h.templates = [makeTemplate({ provider: 'aws', providers: undefined })];
    await loadValidate();
    expect(callCount).toBe(1);
  });

  it('defaults to ["gcp"] when both providers and provider are absent', async () => {
    let callCount = 0;
    h.expandResult = () => {
      callCount++;
      return {
        nodes: [{ id: 'n', type: 'resource', position: { x: 0, y: 0 }, width: 220, height: 56, data: {} }],
        edges: [],
      };
    };
    h.templates = [makeTemplate({ provider: undefined, providers: undefined })];
    await loadValidate();
    expect(callCount).toBe(1);
  });
});

describe('validate.ts — script-level reporting', () => {
  it('prints the warnings section when only warnings are present', async () => {
    h.templates = [makeTemplate({ trust: undefined })]; // R10 trust warn
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/⚠.*1 warning/);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('prints both warnings and errors when both kinds are present', async () => {
    h.templates = [
      makeTemplate({
        category: 'full-stack',
        trust: undefined, // optional warn
        groups: undefined, // R5 error
      }),
    ];
    await loadValidate();
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toMatch(/warning/);
    expect(out).toMatch(/error/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
