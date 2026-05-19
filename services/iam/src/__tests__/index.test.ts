/**
 * Smoke test for the services/iam barrel + createIamRouter.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@ice/db', () => ({
  default: {},
}));

import * as Iam from '..';

describe('services/iam barrel', () => {
  it('exposes createIamRouter as a function (or default export)', () => {
    // Look for any router-creator function in the barrel.
    const routerCreator = (Iam as any).createIamRouter || (Iam as any).createIAMRouter || (Iam as any).default;
    expect(typeof routerCreator).toBe('function');
  });

  it('re-exports AuthError class', () => {
    expect(typeof (Iam as any).AuthError).toBe('function');
  });

  it('re-exports project-access helpers (e.g. hasProjectAccess)', () => {
    expect(typeof (Iam as any).hasProjectAccess).toBe('function');
  });

  it('re-exports email-service helpers', () => {
    // The email service exports several send functions; at least one
    // should resolve through the barrel.
    const exportNames = Object.keys(Iam);
    const hasEmailExport = exportNames.some((n) => n.toLowerCase().includes('email') || n.startsWith('send'));
    expect(hasEmailExport).toBe(true);
  });
});
