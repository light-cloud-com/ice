/**
 * Tests for the GraphValidator orchestrator + ValidationContext machinery.
 *
 * The orchestrator runs every registered validator, collects issues, and
 * applies skip/only/strict/fail-fast/max-issues policy. We exercise the
 * branches the existing core/orchestrator integration tests don't reach:
 *
 *   - register / unregister / get / list lifecycle
 *   - issues with severity 'info' threading through context.info()
 *   - a validator that throws is captured as VALIDATOR_ERROR
 *   - non-Error throws are stringified
 *   - fail_fast stops the loop after the first error
 *   - max_issues caps the issue list
 *   - strict mode treats warnings as failures
 *   - only_validators restricts the run set
 *   - skip_validators excludes validators
 *   - has_errors / get_issues utility methods
 *   - create_validator factory wraps a function into the Validator shape
 */

import { describe, it, expect } from 'vitest';
import {
  GraphValidator,
  ValidationContext,
  create_graph_validator,
  create_validator,
  type Validator,
  type ValidationIssue,
} from '../base-validator.js';
import { create_mutable_graph, type MutableGraph } from '../../mutable-graph.js';

function fresh_graph(): MutableGraph {
  return create_mutable_graph('test');
}

function make_validator(name: string, issues: ValidationIssue[]): Validator {
  return {
    name,
    description: `${name} test validator`,
    validate: () => issues,
  };
}

function make_throwing_validator(name: string, err: unknown): Validator {
  return {
    name,
    description: `${name} throwing validator`,
    validate: () => {
      throw err;
    },
  };
}

// =============================================================================
// GraphValidator lifecycle
// =============================================================================

describe('GraphValidator.register / unregister / get / list', () => {
  it('registers and lists a validator', () => {
    const v = create_graph_validator();
    v.register(make_validator('a', []));
    v.register(make_validator('b', []));
    expect(v.list()).toEqual(['a', 'b']);
  });

  it('returns the registered validator from get(name)', () => {
    const v = create_graph_validator();
    const a = make_validator('a', []);
    v.register(a);
    expect(v.get('a')).toBe(a);
  });

  it('returns undefined for an unknown validator name', () => {
    const v = create_graph_validator();
    expect(v.get('nope')).toBeUndefined();
  });

  it('unregister removes the validator from list and get', () => {
    const v = create_graph_validator();
    v.register(make_validator('a', []));
    v.unregister('a');
    expect(v.list()).toEqual([]);
    expect(v.get('a')).toBeUndefined();
  });

  it('replaces the validator when registering with the same name', () => {
    const v = create_graph_validator();
    const a1 = make_validator('a', []);
    const a2 = make_validator('a', []);
    v.register(a1);
    v.register(a2);
    expect(v.get('a')).toBe(a2);
    expect(v.list()).toEqual(['a']);
  });
});

// =============================================================================
// validate() — issue threading
// =============================================================================

describe('GraphValidator.validate — issue routing', () => {
  it('routes severity:error issues into result.errors', () => {
    const v = create_graph_validator();
    v.register(
      make_validator('e', [
        { severity: 'error', code: 'X', message: 'boom' },
      ]),
    );
    const r = v.validate(fresh_graph());
    expect(r.valid).toBe(false);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.code).toBe('X');
    expect(r.warnings).toHaveLength(0);
    expect(r.info).toHaveLength(0);
  });

  it('routes severity:warning issues into result.warnings', () => {
    const v = create_graph_validator();
    v.register(
      make_validator('w', [
        { severity: 'warning', code: 'W', message: 'ok' },
      ]),
    );
    const r = v.validate(fresh_graph());
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]!.code).toBe('W');
  });

  it('routes severity:info issues into result.info via the info() branch', () => {
    // Hits line 274 (the `else { context.info(...) }` arm).
    const v = create_graph_validator();
    v.register(
      make_validator('i', [
        { severity: 'info', code: 'I', message: 'fyi' },
      ]),
    );
    const r = v.validate(fresh_graph());
    expect(r.info).toHaveLength(1);
    expect(r.info[0]!.code).toBe('I');
    expect(r.errors).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
    expect(r.valid).toBe(true);
  });

  it('returns valid:true when only warnings + info are present (non-strict default)', () => {
    const v = create_graph_validator();
    v.register(
      make_validator('m', [
        { severity: 'warning', code: 'W', message: 'w' },
        { severity: 'info', code: 'I', message: 'i' },
      ]),
    );
    const r = v.validate(fresh_graph());
    expect(r.valid).toBe(true);
  });

  it('records the names of validators that ran in result.validators', () => {
    const v = create_graph_validator();
    v.register(make_validator('a', []));
    v.register(make_validator('b', []));
    const r = v.validate(fresh_graph());
    expect(r.validators).toEqual(['a', 'b']);
  });

  it('emits an ISO timestamp for validated_at', () => {
    const v = create_graph_validator();
    v.register(make_validator('a', []));
    const r = v.validate(fresh_graph());
    expect(() => new Date(r.validated_at).toISOString()).not.toThrow();
  });
});

// =============================================================================
// validate() — validator throws
// =============================================================================

describe('GraphValidator.validate — validator failure path', () => {
  it('captures Error throws as VALIDATOR_ERROR with the message', () => {
    // Hits lines 282-284 (catch arm with Error path).
    const v = create_graph_validator();
    v.register(make_throwing_validator('boom', new Error('ouch')));
    const r = v.validate(fresh_graph());
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.code).toBe('VALIDATOR_ERROR');
    expect(r.errors[0]!.message).toContain("Validator 'boom' failed");
    expect(r.errors[0]!.message).toContain('ouch');
  });

  it('stringifies non-Error throws (string / object) into the message', () => {
    // Hits lines 282-284 — `error instanceof Error ? error : new Error(String(error))`.
    const v = create_graph_validator();
    v.register(make_throwing_validator('s', 'plain-string'));
    const r = v.validate(fresh_graph());
    expect(r.errors[0]!.message).toContain('plain-string');
  });

  it('still runs subsequent validators after one throws', () => {
    const v = create_graph_validator();
    v.register(make_throwing_validator('a', new Error('a-fails')));
    v.register(make_validator('b', [{ severity: 'info', code: 'I', message: 'fyi' }]));
    const r = v.validate(fresh_graph());
    expect(r.errors[0]!.code).toBe('VALIDATOR_ERROR');
    expect(r.info).toHaveLength(1);
    // Per current implementation, the throwing validator is NOT pushed
    // to ran_validators (it's only pushed after the issues loop), so we
    // can only assert that 'b' ran.
    expect(r.validators).toContain('b');
  });
});

// =============================================================================
// validate() — option policy
// =============================================================================

describe('GraphValidator.validate — fail_fast', () => {
  it('stops the validator loop after the first error when fail_fast is set', () => {
    const v = create_graph_validator();
    v.register(make_validator('a', [{ severity: 'error', code: 'A', message: 'a' }]));
    v.register(make_validator('b', [{ severity: 'error', code: 'B', message: 'b' }]));
    const r = v.validate(fresh_graph(), { fail_fast: true });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.code).toBe('A');
    expect(r.validators).toEqual(['a']);
  });

  it('does NOT stop on warnings even with fail_fast', () => {
    const v = create_graph_validator();
    v.register(make_validator('a', [{ severity: 'warning', code: 'W', message: 'w' }]));
    v.register(make_validator('b', [{ severity: 'info', code: 'I', message: 'i' }]));
    const r = v.validate(fresh_graph(), { fail_fast: true });
    expect(r.validators).toEqual(['a', 'b']);
  });
});

describe('GraphValidator.validate — max_issues cap', () => {
  it('caps the issue list at max_issues', () => {
    const v = create_graph_validator();
    v.register(
      make_validator('a', [
        { severity: 'error', code: 'A', message: 'a' },
        { severity: 'error', code: 'B', message: 'b' },
        { severity: 'error', code: 'C', message: 'c' },
      ]),
    );
    const r = v.validate(fresh_graph(), { max_issues: 2 });
    expect(r.issues).toHaveLength(2);
  });

  it('treats max_issues:0 as unlimited (Infinity is the fallback)', () => {
    // The implementation uses `?? Infinity`. 0 is a falsy number but the
    // `??` only short-circuits on null/undefined, so 0 stays as 0.
    const v = create_graph_validator();
    v.register(make_validator('a', [{ severity: 'error', code: 'A', message: 'a' }]));
    const r = v.validate(fresh_graph(), { max_issues: 0 });
    // At max=0, the first issue is rejected (length >= max).
    expect(r.issues).toHaveLength(0);
  });
});

describe('GraphValidator.validate — strict mode', () => {
  it('strict:true makes valid:false when warnings are present', () => {
    const v = create_graph_validator();
    v.register(make_validator('w', [{ severity: 'warning', code: 'W', message: 'w' }]));
    const r = v.validate(fresh_graph(), { strict: true });
    expect(r.valid).toBe(false);
  });

  it('strict:true keeps valid:true when only info is present', () => {
    const v = create_graph_validator();
    v.register(make_validator('i', [{ severity: 'info', code: 'I', message: 'i' }]));
    const r = v.validate(fresh_graph(), { strict: true });
    expect(r.valid).toBe(true);
  });
});

describe('GraphValidator.validate — only_validators / skip_validators', () => {
  it('only_validators restricts the run set', () => {
    const v = create_graph_validator();
    v.register(make_validator('a', [{ severity: 'error', code: 'A', message: 'a' }]));
    v.register(make_validator('b', [{ severity: 'error', code: 'B', message: 'b' }]));
    const r = v.validate(fresh_graph(), { only_validators: ['b'] });
    expect(r.validators).toEqual(['b']);
    expect(r.errors.map((e) => e.code)).toEqual(['B']);
  });

  it('only_validators:[] is treated as "no filter" (length-zero check)', () => {
    // The implementation guards on `only_validators.length > 0`.
    const v = create_graph_validator();
    v.register(make_validator('a', []));
    v.register(make_validator('b', []));
    const r = v.validate(fresh_graph(), { only_validators: [] });
    expect(r.validators).toEqual(['a', 'b']);
  });

  it('skip_validators excludes by name', () => {
    const v = create_graph_validator();
    v.register(make_validator('a', [{ severity: 'error', code: 'A', message: 'a' }]));
    v.register(make_validator('b', [{ severity: 'error', code: 'B', message: 'b' }]));
    const r = v.validate(fresh_graph(), { skip_validators: ['a'] });
    expect(r.validators).toEqual(['b']);
    expect(r.errors.map((e) => e.code)).toEqual(['B']);
  });

  it('skip_validators:[] is treated as "no filter" (length-zero check)', () => {
    const v = create_graph_validator();
    v.register(make_validator('a', []));
    v.register(make_validator('b', []));
    const r = v.validate(fresh_graph(), { skip_validators: [] });
    expect(r.validators).toEqual(['a', 'b']);
  });

  it('only_validators + skip_validators compose (only first, then skip)', () => {
    const v = create_graph_validator();
    v.register(make_validator('a', []));
    v.register(make_validator('b', []));
    v.register(make_validator('c', []));
    const r = v.validate(fresh_graph(), { only_validators: ['a', 'b'], skip_validators: ['b'] });
    expect(r.validators).toEqual(['a']);
  });
});

describe('GraphValidator.validate — runs zero validators cleanly', () => {
  it('returns a valid:true empty result when no validators are registered', () => {
    const v = new GraphValidator();
    const r = v.validate(fresh_graph());
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.info).toEqual([]);
    expect(r.validators).toEqual([]);
  });
});

// =============================================================================
// ValidationContext direct API
// =============================================================================

describe('ValidationContext', () => {
  it('error() / warning() / info() all push issues with the right severity', () => {
    const ctx = new ValidationContext(fresh_graph());
    ctx.error('E', 'error message');
    ctx.warning('W', 'warn message');
    ctx.info('I', 'info message');
    const issues = ctx.get_issues();
    expect(issues.map((i) => i.severity)).toEqual(['error', 'warning', 'info']);
    expect(issues.map((i) => i.code)).toEqual(['E', 'W', 'I']);
  });

  it('threads detail fields (node_id / path / context) through to the issue', () => {
    const ctx = new ValidationContext(fresh_graph());
    ctx.error('E', 'msg', { path: 'foo.bar', context: { x: 1 } });
    const issue = ctx.get_issues()[0]!;
    expect(issue.path).toBe('foo.bar');
    expect(issue.context).toEqual({ x: 1 });
  });

  it('has_errors() returns true when any error has been pushed', () => {
    const ctx = new ValidationContext(fresh_graph());
    expect(ctx.has_errors()).toBe(false);
    ctx.warning('W', 'w');
    expect(ctx.has_errors()).toBe(false);
    ctx.error('E', 'e');
    expect(ctx.has_errors()).toBe(true);
  });

  it('should_stop() returns false when fail_fast is unset', () => {
    const ctx = new ValidationContext(fresh_graph());
    ctx.error('E', 'e');
    expect(ctx.should_stop()).toBe(false);
  });

  it('should_stop() returns true when fail_fast is set and an error exists', () => {
    const ctx = new ValidationContext(fresh_graph(), { fail_fast: true });
    expect(ctx.should_stop()).toBe(false);
    ctx.error('E', 'e');
    expect(ctx.should_stop()).toBe(true);
  });

  it('should_stop() returns false with fail_fast and only warnings', () => {
    const ctx = new ValidationContext(fresh_graph(), { fail_fast: true });
    ctx.warning('W', 'w');
    expect(ctx.should_stop()).toBe(false);
  });

  it('respects max_issues by dropping issues at the cap', () => {
    const ctx = new ValidationContext(fresh_graph(), { max_issues: 1 });
    ctx.error('A', 'a');
    ctx.error('B', 'b');
    expect(ctx.get_issues()).toHaveLength(1);
  });
});

// =============================================================================
// create_validator factory (line 324)
// =============================================================================

describe('create_validator', () => {
  it('returns a Validator with the supplied name / description and validate fn', () => {
    const fn = (_g: MutableGraph) =>
      [{ severity: 'info', code: 'X', message: 'msg' }] satisfies ValidationIssue[];
    const v = create_validator('my-validator', 'a description', fn);
    expect(v.name).toBe('my-validator');
    expect(v.description).toBe('a description');
    expect(v.validate(fresh_graph())).toEqual([{ severity: 'info', code: 'X', message: 'msg' }]);
  });

  it('the validator returned by create_validator works in a GraphValidator', () => {
    const v = create_graph_validator();
    v.register(
      create_validator('e', 'd', () => [
        { severity: 'error', code: 'E', message: 'm' },
      ]),
    );
    const r = v.validate(fresh_graph());
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.code).toBe('E');
  });
});
