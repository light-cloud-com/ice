/**
 * Reducer + selector tests for validation-slice.
 *
 * Covers the three reducer actions and every exported selector.
 * No external state — selectors take a synthetic root with the
 * validation key.
 */

import { describe, it, expect } from 'vitest';
import validationReducer, {
  setValidationResult,
  setValidating,
  clearValidation,
  selectValidationIssues,
  selectIsValid,
  selectIsDeployable,
  selectValidationSummary,
  selectNodeIssues,
  selectEdgeIssues,
  selectNodeSeverity,
  selectPropertyIssues,
  selectIsValidating,
  type CanvasIssue,
  type ValidationState,
} from '../validation-slice';

function init(): ValidationState {
  return validationReducer(undefined, { type: '@@INIT' });
}

function issue(overrides: Partial<CanvasIssue> = {}): CanvasIssue {
  return {
    id: 'i-1',
    severity: 'error',
    category: 'property',
    code: 'X',
    message: 'm',
    ...overrides,
  };
}

describe('validation-slice — initial state', () => {
  it('seeds empty issues + valid/deployable=true', () => {
    expect(init()).toEqual({
      issues: [],
      valid: true,
      deployable: true,
      summary: { errors: 0, warnings: 0, info: 0 },
      validatedAt: null,
      isValidating: false,
    });
  });
});

describe('setValidationResult', () => {
  it('writes every field and clears isValidating', () => {
    let s = validationReducer(init(), setValidating(true));
    s = validationReducer(
      s,
      setValidationResult({
        issues: [issue({ id: 'a' }), issue({ id: 'b', severity: 'warning' })],
        valid: false,
        deployable: false,
        summary: { errors: 1, warnings: 1, info: 0 },
        validatedAt: '2026-05-03T00:00:00Z',
      }),
    );
    expect(s.issues).toHaveLength(2);
    expect(s.valid).toBe(false);
    expect(s.deployable).toBe(false);
    expect(s.summary).toEqual({ errors: 1, warnings: 1, info: 0 });
    expect(s.validatedAt).toBe('2026-05-03T00:00:00Z');
    expect(s.isValidating).toBe(false);
  });
});

describe('setValidating', () => {
  it('flips the in-progress flag', () => {
    let s = validationReducer(init(), setValidating(true));
    expect(s.isValidating).toBe(true);
    s = validationReducer(s, setValidating(false));
    expect(s.isValidating).toBe(false);
  });
});

describe('clearValidation', () => {
  it('returns to initial-shaped state regardless of prior issues', () => {
    let s = validationReducer(
      init(),
      setValidationResult({
        issues: [issue()],
        valid: false,
        deployable: false,
        summary: { errors: 1, warnings: 0, info: 0 },
        validatedAt: '2026-05-03T00:00:00Z',
      }),
    );
    s = validationReducer(s, clearValidation());
    expect(s).toEqual(init());
  });
});

// ─── Selectors ───────────────────────────────────────────────────────────────

describe('selectors', () => {
  function makeRoot(issues: CanvasIssue[] = [], extras: Partial<ValidationState> = {}) {
    return {
      validation: {
        ...init(),
        issues,
        ...extras,
      },
    };
  }

  it('selectValidationIssues returns issues array', () => {
    const root = makeRoot([issue()]);
    expect(selectValidationIssues(root)).toHaveLength(1);
  });

  it('selectIsValid + selectIsDeployable + selectValidationSummary + selectIsValidating', () => {
    const root = makeRoot([], {
      valid: false,
      deployable: false,
      summary: { errors: 2, warnings: 1, info: 0 },
      isValidating: true,
    });
    expect(selectIsValid(root)).toBe(false);
    expect(selectIsDeployable(root)).toBe(false);
    expect(selectValidationSummary(root)).toEqual({ errors: 2, warnings: 1, info: 0 });
    expect(selectIsValidating(root)).toBe(true);
  });

  it('selectNodeIssues filters by nodeId', () => {
    const root = makeRoot([
      issue({ id: 'a', nodeId: 'n1' }),
      issue({ id: 'b', nodeId: 'n2' }),
      issue({ id: 'c', nodeId: 'n1' }),
    ]);
    expect(selectNodeIssues(root, 'n1')).toHaveLength(2);
    expect(selectNodeIssues(root, 'unknown')).toEqual([]);
  });

  it('selectEdgeIssues filters by edgeId', () => {
    const root = makeRoot([
      issue({ id: 'a', edgeId: 'e1' }),
      issue({ id: 'b', edgeId: 'e2' }),
    ]);
    expect(selectEdgeIssues(root, 'e1')).toHaveLength(1);
  });

  describe('selectNodeSeverity', () => {
    it('returns "error" when any node issue is an error', () => {
      const root = makeRoot([
        issue({ severity: 'warning', nodeId: 'n1' }),
        issue({ severity: 'error', nodeId: 'n1' }),
      ]);
      expect(selectNodeSeverity(root, 'n1')).toBe('error');
    });

    it('returns "warning" when no errors but at least one warning', () => {
      const root = makeRoot([
        issue({ severity: 'warning', nodeId: 'n1' }),
        issue({ severity: 'info', nodeId: 'n1' }),
      ]);
      expect(selectNodeSeverity(root, 'n1')).toBe('warning');
    });

    it('returns "info" when only info-level issues exist', () => {
      const root = makeRoot([issue({ severity: 'info', nodeId: 'n1' })]);
      expect(selectNodeSeverity(root, 'n1')).toBe('info');
    });

    it('returns null when no issues exist for the node', () => {
      const root = makeRoot([issue({ severity: 'error', nodeId: 'other' })]);
      expect(selectNodeSeverity(root, 'n1')).toBeNull();
    });
  });

  it('selectPropertyIssues narrows by both nodeId and propertyPath', () => {
    const root = makeRoot([
      issue({ id: 'a', nodeId: 'n1', propertyPath: 'name' }),
      issue({ id: 'b', nodeId: 'n1', propertyPath: 'memory' }),
      issue({ id: 'c', nodeId: 'n2', propertyPath: 'name' }),
    ]);
    expect(selectPropertyIssues(root, 'n1', 'name')).toHaveLength(1);
    expect(selectPropertyIssues(root, 'n1', 'name')[0]!.id).toBe('a');
  });
});
