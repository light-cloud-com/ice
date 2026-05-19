/**
 * Unit tests for `services/ai/src/services/ai/operation-validation.ts`
 * — the closed-set op-type / group-iceType / blueprint-iceType
 * gatekeepers extracted in rf-aisvc-6 from `ai.service.ts`.
 *
 * Per `deploy-service-tests-must-import-vitest-explicitly`, vitest
 * globals are imported explicitly. Per
 * `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`,
 * the console.warn spy is reset every test via vi.restoreAllMocks
 * + a fresh mockImplementation in beforeEach.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VALID_GROUP_TYPES, VALID_OPS, validateOperations } from '../operation-validation';

describe('VALID_OPS', () => {
  it('contains the expected closed set of op types', () => {
    expect(VALID_OPS.has('addNode')).toBe(true);
    expect(VALID_OPS.has('addEdge')).toBe(true);
    expect(VALID_OPS.has('updateNodeData')).toBe(true);
    expect(VALID_OPS.has('updateNodePosition')).toBe(true);
    expect(VALID_OPS.has('resizeNode')).toBe(true);
    expect(VALID_OPS.has('reparentNode')).toBe(true);
    expect(VALID_OPS.has('deleteNode')).toBe(true);
    expect(VALID_OPS.has('deleteEdge')).toBe(true);
    expect(VALID_OPS.has('updateEdgeData')).toBe(true);
    expect(VALID_OPS.has('autoOrganize')).toBe(true);
    expect(VALID_OPS.has('addBlueprint')).toBe(true);
  });

  it("rejects look-alike op types that aren't in the closed set", () => {
    expect(VALID_OPS.has('addNodes')).toBe(false);
    expect(VALID_OPS.has('createNode')).toBe(false);
    expect(VALID_OPS.has('removeEdge')).toBe(false);
    expect(VALID_OPS.has('addBlueprintNode')).toBe(false);
  });
});

describe('VALID_GROUP_TYPES', () => {
  it('contains the expected container iceTypes', () => {
    expect(VALID_GROUP_TYPES.has('Network.VPC')).toBe(true);
    expect(VALID_GROUP_TYPES.has('Network.Subnet')).toBe(true);
    expect(VALID_GROUP_TYPES.has('Group.Frontend')).toBe(true);
    expect(VALID_GROUP_TYPES.has('Group.Services')).toBe(true);
    expect(VALID_GROUP_TYPES.has('Group.Data')).toBe(true);
    expect(VALID_GROUP_TYPES.has('Group.Messaging')).toBe(true);
    expect(VALID_GROUP_TYPES.has('Group.Monitoring')).toBe(true);
    expect(VALID_GROUP_TYPES.has('Group.External')).toBe(true);
    expect(VALID_GROUP_TYPES.has('Group.Custom')).toBe(true);
  });

  it('does NOT contain resource iceTypes (group set is for containers only)', () => {
    expect(VALID_GROUP_TYPES.has('Database.PostgreSQL')).toBe(false);
    expect(VALID_GROUP_TYPES.has('Compute.Container')).toBe(false);
    expect(VALID_GROUP_TYPES.has('Network.Gateway')).toBe(false);
  });
});

describe('validateOperations', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns an empty array for an empty input', () => {
    expect(validateOperations([])).toEqual([]);
  });

  it('drops null / undefined / non-object entries silently', () => {
    const out = validateOperations([null, undefined, 42, 'string', true]);
    expect(out).toEqual([]);
    // No iceType-style warns fire for these — just silent drops.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('drops entries with no `op` field or a non-string `op`', () => {
    const out = validateOperations([{}, { op: 123 }, { op: null }]);
    expect(out).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('drops entries whose op is a string but not in VALID_OPS', () => {
    const out = validateOperations([{ op: 'createNode' }, { op: 'noSuchOp' }]);
    expect(out).toEqual([]);
    // Unknown-op rejections are silent — only iceType rejections warn.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('passes valid op types through unchanged', () => {
    const ops = [
      { op: 'autoOrganize' },
      { op: 'deleteNode', nodeId: 'n1' },
      { op: 'addEdge', edge: { id: 'e1', source: 'a', target: 'b' } },
    ];
    expect(validateOperations(ops)).toEqual(ops);
  });

  describe('addBlueprint iceType gating', () => {
    it('rejects when the iceType is missing and allowedBlockTypes is provided', () => {
      const out = validateOperations([{ op: 'addBlueprint' }], new Set(['Database.PostgreSQL']));
      expect(out).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith('[AI] Rejected unknown iceType: "undefined"');
    });

    it('rejects when the iceType is not in allowedBlockTypes', () => {
      const out = validateOperations(
        [{ op: 'addBlueprint', iceType: 'InventedThing' }],
        new Set(['Database.PostgreSQL']),
      );
      expect(out).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith('[AI] Rejected unknown iceType: "InventedThing"');
    });

    it('passes when the iceType is in allowedBlockTypes', () => {
      const op = { op: 'addBlueprint', iceType: 'Database.PostgreSQL', label: 'Users DB' };
      const out = validateOperations([op], new Set(['Database.PostgreSQL']));
      expect(out).toEqual([op]);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does NOT gate on iceType when allowedBlockTypes is undefined (skip path)', () => {
      // Source: `if (opType === 'addBlueprint' && allowedBlockTypes)` —
      // when the registry is missing, the check is bypassed and the op passes.
      const op = { op: 'addBlueprint', iceType: 'AnythingGoes' };
      const out = validateOperations([op]);
      expect(out).toEqual([op]);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('rejects an addBlueprint with empty-string iceType (the !iceType guard)', () => {
      const out = validateOperations([{ op: 'addBlueprint', iceType: '' }], new Set(['Database.PostgreSQL']));
      expect(out).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith('[AI] Rejected unknown iceType: ""');
    });
  });

  describe('addNode group iceType gating', () => {
    it('passes addNode resource ops without inspecting iceType', () => {
      const op = {
        op: 'addNode',
        node: { id: 'n1', type: 'resource', data: { iceType: 'Anything.Goes' } },
      };
      const out = validateOperations([op]);
      expect(out).toEqual([op]);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('rejects addNode group ops whose iceType is not a registered container', () => {
      const out = validateOperations([
        {
          op: 'addNode',
          node: { id: 'n1', type: 'group', data: { iceType: 'Group.Invented' } },
        },
      ]);
      expect(out).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith('[AI] Rejected unknown group iceType: "Group.Invented"');
    });

    it('passes addNode group ops with a registered container iceType', () => {
      const op = {
        op: 'addNode',
        node: { id: 'vpc-1', type: 'group', data: { iceType: 'Network.VPC' } },
      };
      const out = validateOperations([op]);
      expect(out).toEqual([op]);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('passes addNode group ops with NO iceType (the falsy-iceType short-circuit)', () => {
      // Source: `if (iceType && !VALID_GROUP_TYPES.has(iceType))` — no
      // iceType means the gate is bypassed (the AI is allowed to omit it
      // for transient groups; the canvas handles the default).
      const op = {
        op: 'addNode',
        node: { id: 'n1', type: 'group', data: {} },
      };
      const out = validateOperations([op]);
      expect(out).toEqual([op]);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('passes addNode group ops with NO data field at all', () => {
      const op = {
        op: 'addNode',
        node: { id: 'n1', type: 'group' },
      };
      const out = validateOperations([op]);
      expect(out).toEqual([op]);
    });

    it('passes addNode ops with no node field (the optional-chain branch)', () => {
      // `node?.type === 'group'` is false when node is undefined.
      const op = { op: 'addNode' };
      const out = validateOperations([op]);
      expect(out).toEqual([op]);
    });
  });

  it('preserves order across a mixed batch and reports counts for each rejection', () => {
    const ops = [
      { op: 'autoOrganize' },
      { op: 'addBlueprint', iceType: 'BadOne' },
      { op: 'deleteEdge', edgeId: 'e1' },
      { op: 'addBlueprint', iceType: 'Database.PostgreSQL' },
      { op: 'addNode', node: { type: 'group', data: { iceType: 'Group.Bogus' } } },
      { op: 'addNode', node: { type: 'group', data: { iceType: 'Network.VPC' } } },
    ];
    const out = validateOperations(ops, new Set(['Database.PostgreSQL']));

    expect(out.map((o) => (o as { op: string }).op)).toEqual(['autoOrganize', 'deleteEdge', 'addBlueprint', 'addNode']);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenNthCalledWith(1, '[AI] Rejected unknown iceType: "BadOne"');
    expect(warnSpy).toHaveBeenNthCalledWith(2, '[AI] Rejected unknown group iceType: "Group.Bogus"');
  });
});
