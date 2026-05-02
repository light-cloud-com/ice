/**
 * Unit tests for `services/ai/src/services/canvas-validation.service.ts`.
 *
 * The SUT is a thin wrapper over `@ice/core`'s `validateCanvas`. We mock
 * `@ice/core` so each scenario can shape the issue list independently and
 * so the catch arm (engine-unavailable fallback) is reachable. Vitest
 * globals are imported explicitly per the project's
 * `deploy-service-tests-must-import-vitest-explicitly` learning, and
 * mocks are reset in `beforeEach` per
 * `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@ice/core', () => ({
  validateCanvas: vi.fn(),
}));

import { validateCanvas } from '../canvas-validation.service.js';
// @ts-ignore — workspace-resolved at runtime; mocked above
import * as core from '@ice/core';

const coreValidateMock = (core as any).validateCanvas as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  coreValidateMock.mockReturnValue({ issues: [] });
});

describe('validateCanvas', () => {
  it('returns valid=true with empty errors and a node-count summary on an empty canvas', async () => {
    const result = await validateCanvas([], []);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.summary).toContain('Canvas valid');
    expect(result.summary).toContain('0 nodes');
    expect(result.summary).toContain('0 edges');
  });

  it('returns valid=true with a no-issues summary when core reports no issues for a populated canvas', async () => {
    const nodes = [{ id: 'n1', type: 'resource', data: {} }];
    const edges = [{ id: 'e1', source: 'n1', target: 'n2' }];

    const result = await validateCanvas(nodes, edges);

    expect(result.valid).toBe(true);
    expect(result.summary).toContain('1 nodes');
    expect(result.summary).toContain('1 edges');
    expect(result.summary).toContain('no issues found');
  });

  it('passes mapped node + edge shapes (id/type/data/parentId) and design-mode option to core.validateCanvas', async () => {
    const nodes = [
      { id: 'n1', type: 'group', data: { foo: 1 }, parentId: 'p1' },
      { id: 'n2', data: undefined, parentNode: 'p2' },
    ];
    const edges = [{ id: 'e1', source: 's', target: 't', data: { kind: 'wire' } }];

    await validateCanvas(nodes, edges);

    expect(coreValidateMock).toHaveBeenCalledTimes(1);
    const args = coreValidateMock.mock.calls[0]!;
    expect(args[0]).toEqual([
      { id: 'n1', type: 'group', data: { foo: 1 }, parentId: 'p1' },
      { id: 'n2', type: 'resource', data: {}, parentId: 'p2' },
    ]);
    expect(args[1]).toEqual([{ id: 'e1', source: 's', target: 't', data: { kind: 'wire' } }]);
    expect(args[2]).toEqual({ mode: 'design' });
  });

  it('defaults parentId to undefined when both parentId and parentNode are missing', async () => {
    await validateCanvas([{ id: 'n1' }], []);

    const args = coreValidateMock.mock.calls[0]!;
    expect(args[0][0]).toEqual({ id: 'n1', type: 'resource', data: {}, parentId: undefined });
  });

  it('returns valid=false and accumulates errors when core reports error issues', async () => {
    coreValidateMock.mockReturnValue({
      issues: [
        {
          severity: 'error',
          code: 'MISSING_REQUIRED',
          nodeId: 'n1',
          propertyPath: 'name',
          message: 'name is required',
        },
        {
          severity: 'error',
          code: 'TYPE_MISMATCH',
          nodeId: 'n2',
          propertyPath: 'cpu',
          message: 'cpu must be number',
        },
      ],
    });

    const result = await validateCanvas([{ id: 'n1' }], []);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toEqual({
      type: 'missing_property',
      nodeId: 'n1',
      edgeId: undefined,
      field: 'name',
      message: 'name is required',
    });
    expect(result.errors[1]?.type).toBe('invalid_type');
    expect(result.summary).toContain('Canvas invalid');
    expect(result.summary).toContain('2 error(s)');
    expect(result.summary).toContain('0 warning(s)');
  });

  it('routes warning issues into warnings, not errors (still valid=true)', async () => {
    coreValidateMock.mockReturnValue({
      issues: [
        { severity: 'warning', nodeId: 'n9', message: 'consider adding a label' },
      ],
    });

    const result = await validateCanvas([], []);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([{ nodeId: 'n9', message: 'consider adding a label' }]);
  });

  it('ignores issues with unknown severity (neither error nor warning)', async () => {
    coreValidateMock.mockReturnValue({
      issues: [
        { severity: 'info', nodeId: 'n1', message: 'fyi' },
        { severity: 'error', code: 'MISSING_REQUIRED', nodeId: 'n2', message: 'bad' },
      ],
    });

    const result = await validateCanvas([], []);

    expect(result.errors).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);
  });

  it('returns the safe fallback (valid=true, engine-unavailable summary) when core throws', async () => {
    coreValidateMock.mockImplementation(() => {
      throw new Error('core engine missing');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await validateCanvas([{ id: 'a' }, { id: 'b' }], [{ id: 'e' }]);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.summary).toContain('validation skipped');
    expect(result.summary).toContain('2 nodes');
    expect(result.summary).toContain('1 edges');
    // findings.md #16 — frontends need to tell "engine ran clean" from
    // "engine couldn't run". Both look like valid:true; validatedBy
    // disambiguates so deploy gates don't fire on an unvalidated canvas.
    expect(result.validatedBy).toBe('skipped');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('reports validatedBy:"engine" on the happy path (findings #16)', async () => {
    coreValidateMock.mockReturnValue({ issues: [] });
    const result = await validateCanvas([{ id: 'a' }], []);
    expect(result.validatedBy).toBe('engine');
  });

  describe('mapIssueCodeToType', () => {
    it.each([
      ['MISSING_REQUIRED', 'missing_property'],
      ['TYPE_MISMATCH', 'invalid_type'],
      ['INVALID_OPTION', 'invalid_option'],
      ['DANGLING_EDGE_SOURCE', 'invalid_edge_ref'],
      ['DANGLING_EDGE_TARGET', 'invalid_edge_ref'],
      ['INVALID_CONNECTION', 'invalid_relationship'],
      ['INVALID_PARENT_REF', 'invalid_parent'],
      ['PARENT_NOT_CONTAINER', 'invalid_parent'],
      ['MISSING_ICE_TYPE', 'missing_resource'],
      ['SOMETHING_UNKNOWN', 'missing_resource'],
    ])('maps issue code %s to error type %s', async (code, expectedType) => {
      coreValidateMock.mockReturnValue({
        issues: [{ severity: 'error', code, message: 'msg', nodeId: 'n1' }],
      });

      const result = await validateCanvas([], []);

      expect(result.errors[0]?.type).toBe(expectedType);
    });
  });

  it('forwards edgeId on issues that target an edge', async () => {
    coreValidateMock.mockReturnValue({
      issues: [
        {
          severity: 'error',
          code: 'DANGLING_EDGE_TARGET',
          edgeId: 'e1',
          message: 'target missing',
        },
      ],
    });

    const result = await validateCanvas([], []);

    expect(result.errors[0]?.edgeId).toBe('e1');
    expect(result.errors[0]?.type).toBe('invalid_edge_ref');
    expect(result.errors[0]?.nodeId).toBeUndefined();
  });

  it('builds the invalid-summary with both error and warning counts', async () => {
    coreValidateMock.mockReturnValue({
      issues: [
        { severity: 'error', code: 'MISSING_REQUIRED', message: 'e1' },
        { severity: 'error', code: 'MISSING_REQUIRED', message: 'e2' },
        { severity: 'warning', message: 'w1' },
      ],
    });

    const result = await validateCanvas([], []);

    expect(result.valid).toBe(false);
    expect(result.summary).toBe('Canvas invalid: 2 error(s), 1 warning(s)');
  });
});
