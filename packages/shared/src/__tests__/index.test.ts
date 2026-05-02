/**
 * Top-level barrel re-exports.
 *
 * The package exposes auth/, crypto/, socket/ surfaces through a single
 * entry point. This test verifies the barrel forwards every named export
 * from each submodule — a missing export silently regresses every consumer
 * downstream because TypeScript's `export {} from '..'` is permissive about
 * what gets re-exported.
 */

import { describe, expect, it, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-for-shared-index';
  process.env.CREDENTIAL_ENCRYPTION_KEY = 'test-key-for-shared-index-32ch!';
});

describe('@ice/shared barrel', () => {
  it('re-exports the auth surface', async () => {
    const mod: any = await import('../index.js');
    expect(typeof mod.requireAuth).toBe('function');
    expect(typeof mod.requireProjectAccess).toBe('function');
    expect(typeof mod.requireOrgRole).toBe('function');
    expect(typeof mod.generateToken).toBe('function');
    expect(typeof mod.generateRefreshToken).toBe('function');
    expect(typeof mod.setDesktopUser).toBe('function');
    expect(typeof mod.isDesktopMode).toBe('function');
  });

  it('re-exports the crypto surface', async () => {
    const mod: any = await import('../index.js');
    expect(typeof mod.encryptCredentials).toBe('function');
    expect(typeof mod.decryptCredentials).toBe('function');
    expect(typeof mod.encryptString).toBe('function');
    expect(typeof mod.decryptString).toBe('function');
  });

  it('re-exports the socket surface', async () => {
    const mod: any = await import('../index.js');
    expect(typeof mod.setupSocketService).toBe('function');
    expect(typeof mod.getSocketServer).toBe('function');
    expect(typeof mod.emitDeployNodeStatus).toBe('function');
    expect(typeof mod.emitDeployNodeProgress).toBe('function');
    expect(typeof mod.emitDeployComplete).toBe('function');
    expect(typeof mod.emitDeployLog).toBe('function');
    expect(typeof mod.emitDeployRequirementVerified).toBe('function');
    expect(typeof mod.emitCanvasUpdate).toBe('function');
    expect(typeof mod.emitPipelineUpdate).toBe('function');
    expect(typeof mod.emitCardPipelineUpdate).toBe('function');
  });
});
