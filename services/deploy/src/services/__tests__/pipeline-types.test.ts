/**
 * Unit tests for `services/deploy/src/services/pipeline/types.ts` —
 * the shared types and GitHub API constants extracted from
 * pipeline.service.ts in rf-pipe-1.
 *
 * The types themselves are validated via the typecheck (compile-time)
 * rather than runtime assertions, but the constants are runtime values
 * that the rule-management and framework-detection modules depend on.
 */

import { describe, it, expect } from 'vitest';
import {
  GITHUB_API,
  GITHUB_HEADERS,
  type CreateRuleInput,
  type DeployStep,
  type FrameworkDetection,
  type WebhookRegistrationResult,
} from '../pipeline/types';

describe('pipeline/types: GitHub API constants', () => {
  it('GITHUB_API points at api.github.com root', () => {
    expect(GITHUB_API).toBe('https://api.github.com');
  });

  it('GITHUB_HEADERS includes Accept and Api-Version', () => {
    expect(GITHUB_HEADERS).toEqual({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    });
  });

  it('GITHUB_HEADERS does not include Authorization or Content-Type', () => {
    // Each callsite layers on auth + content-type as needed; the shared
    // header bundle stays minimal so it can be spread into both GET and
    // POST/DELETE without forcing a body content-type on read-only calls.
    expect(Object.keys(GITHUB_HEADERS)).toEqual(['Accept', 'X-GitHub-Api-Version']);
  });
});

describe('pipeline/types: type-shape compile checks', () => {
  // These checks live as `it.skip` blocks so they document the expected
  // shapes without polluting the test count — the real verification is
  // that the file typechecks at all. If the structural test suite is
  // ever extended to walk types via tsc-emit, these become live.
  it('CreateRuleInput accepts a minimal repository binding', () => {
    const input: CreateRuleInput = {
      cardId: 'card-1',
      nodeId: 'node-1',
      repository: 'owner/repo',
    };
    expect(input.repository).toBe('owner/repo');
  });

  it('DeployStep timestamps a started/completed/failed lifecycle', () => {
    const step: DeployStep = {
      step: 'install',
      status: 'started',
      message: 'pnpm install',
      timestamp: new Date().toISOString(),
    };
    expect(step.status).toBe('started');
  });

  it('FrameworkDetection allows the all-null fallback shape', () => {
    const det: FrameworkDetection = {
      framework: null,
      runtime: null,
      buildCommand: null,
      installCommand: null,
      outputDirectory: null,
      packageManager: null,
      confidence: 'low',
      detectedFiles: [],
    };
    expect(det.confidence).toBe('low');
    expect(det.detectedFiles).toEqual([]);
  });

  it('WebhookRegistrationResult discriminates by status', () => {
    const ok: WebhookRegistrationResult = { status: 'registered', webhookId: 42 };
    const fail: WebhookRegistrationResult = { status: 'failed', error: 'GitHub denied' };
    const skip: WebhookRegistrationResult = { status: 'skipped' };
    expect(ok.webhookId).toBe(42);
    expect(fail.error).toContain('denied');
    expect(skip.webhookId).toBeUndefined();
  });
});
