/**
 * Tests for FEAT-10: Rollback deployment validation logic
 *
 * Tests the validation gates in rollbackDeployment (not the actual deploy).
 */

import prisma from '@ice/db';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('@ice/db', () => ({
  default: {
    canvasDeployment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock provider service
vi.mock('@ice/service-credentials', () => ({
  getDecryptedCredentials: vi.fn(),
  getValidGCPAccessToken: vi.fn(),
}));

// Mock shared — pdl-4 split the legacy `emitDeployProgress` into five
// per-type emitters. The rollback validation tests below only assert
// that emits HAPPEN (none of them inspect what was emitted), so all
// five are simple `vi.fn()` stubs.
vi.mock('@ice/shared', () => ({
  emitDeployNodeStatus: vi.fn(),
  emitDeployNodeProgress: vi.fn(),
  emitDeployComplete: vi.fn(),
  emitDeployLog: vi.fn(),
  emitDeployRequirementVerified: vi.fn(),
  emitPipelineUpdate: vi.fn(),
  requireAuth: vi.fn(),
  requireProjectAccess: vi.fn(),
}));

describe('Rollback Deployment — Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function getRollbackDeployment() {
    const mod = await import('../services/deploy.service.js');
    return mod.rollbackDeployment;
  }

  it('should reject when target deployment not found', async () => {
    (prisma.canvasDeployment.findUnique as any).mockResolvedValue(null);
    const rollbackDeployment = await getRollbackDeployment();

    await expect(rollbackDeployment('nonexistent-id', 'card-1', 'org-1')).rejects.toThrow(
      'Target deployment not found',
    );
  });

  it('should reject when deployment belongs to different card', async () => {
    (prisma.canvasDeployment.findUnique as any).mockResolvedValue({
      id: 'deploy-1',
      card_id: 'card-other',
      status: 'success',
      results: { resources: [] },
    });

    const rollbackDeployment = await getRollbackDeployment();

    await expect(rollbackDeployment('deploy-1', 'card-1', 'org-1')).rejects.toThrow(
      'Deployment does not belong to this card',
    );
  });

  it('should reject when target deployment was not successful', async () => {
    (prisma.canvasDeployment.findUnique as any).mockResolvedValue({
      id: 'deploy-1',
      card_id: 'card-1',
      status: 'failed',
      results: { resources: [] },
    });

    const rollbackDeployment = await getRollbackDeployment();

    await expect(rollbackDeployment('deploy-1', 'card-1', 'org-1')).rejects.toThrow(
      'Can only roll back to a successful deployment',
    );
  });

  it('should reject when target deployment has no resource data', async () => {
    (prisma.canvasDeployment.findUnique as any).mockResolvedValue({
      id: 'deploy-1',
      card_id: 'card-1',
      status: 'success',
      results: null,
    });

    const rollbackDeployment = await getRollbackDeployment();

    await expect(rollbackDeployment('deploy-1', 'card-1', 'org-1')).rejects.toThrow(
      'Target deployment has no resource data',
    );
  });

  it('should reject when provider credentials are missing', async () => {
    (prisma.canvasDeployment.findUnique as any).mockResolvedValue({
      id: 'deploy-1',
      card_id: 'card-1',
      status: 'success',
      provider: 'gcp',
      results: { resources: [{ success: true, resource_id: 'r1' }] },
    });

    const { getDecryptedCredentials } = await import('@ice/service-credentials');
    (getDecryptedCredentials as any).mockResolvedValue(null);

    const rollbackDeployment = await getRollbackDeployment();

    await expect(rollbackDeployment('deploy-1', 'card-1', 'org-1')).rejects.toThrow('Provider not connected');
  });
});
