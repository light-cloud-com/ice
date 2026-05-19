/**
 * Unit tests for project-access service
 *
 * Branch coverage targets:
 *  - hasProjectAccess: project missing, org-admin shortcut, no project membership,
 *    role hierarchy ladders (viewer/editor/owner), unknown role default-zero
 *  - removeProjectMember: last-owner guard hits/misses
 */

import prisma from '@ice/db';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@ice/db', () => ({
  default: {
    canvasProject: {
      findUnique: vi.fn(),
    },
    organisationMember: {
      findUnique: vi.fn(),
    },
    projectMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('project-access.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hasProjectAccess', () => {
    it('returns false when the project does not exist', async () => {
      (prisma.canvasProject.findUnique as any).mockResolvedValue(null);
      const { hasProjectAccess } = await import('../services/project-access.service');

      const result = await hasProjectAccess('user-1', 'missing-project', 'viewer');
      expect(result).toBe(false);
      expect(prisma.organisationMember.findUnique).not.toHaveBeenCalled();
    });

    it('grants access to org owners regardless of project membership', async () => {
      (prisma.canvasProject.findUnique as any).mockResolvedValue({ organisation_id: 'org-1' });
      (prisma.organisationMember.findUnique as any).mockResolvedValue({ role: 'owner' });

      const { hasProjectAccess } = await import('../services/project-access.service');

      const result = await hasProjectAccess('user-1', 'p-1', 'owner');
      expect(result).toBe(true);
      // Org-admin shortcut: project membership lookup never runs.
      expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
    });

    it('grants access to org admins regardless of project membership', async () => {
      (prisma.canvasProject.findUnique as any).mockResolvedValue({ organisation_id: 'org-1' });
      (prisma.organisationMember.findUnique as any).mockResolvedValue({ role: 'admin' });

      const { hasProjectAccess } = await import('../services/project-access.service');

      const result = await hasProjectAccess('user-1', 'p-1', 'editor');
      expect(result).toBe(true);
    });

    it('returns false when the user has no org membership and no project membership', async () => {
      (prisma.canvasProject.findUnique as any).mockResolvedValue({ organisation_id: 'org-1' });
      (prisma.organisationMember.findUnique as any).mockResolvedValue(null);
      (prisma.projectMember.findUnique as any).mockResolvedValue(null);

      const { hasProjectAccess } = await import('../services/project-access.service');

      const result = await hasProjectAccess('user-1', 'p-1', 'viewer');
      expect(result).toBe(false);
    });

    it('returns false for non-admin org member without a project membership row', async () => {
      (prisma.canvasProject.findUnique as any).mockResolvedValue({ organisation_id: 'org-1' });
      (prisma.organisationMember.findUnique as any).mockResolvedValue({ role: 'member' });
      (prisma.projectMember.findUnique as any).mockResolvedValue(null);

      const { hasProjectAccess } = await import('../services/project-access.service');

      const result = await hasProjectAccess('user-1', 'p-1', 'viewer');
      expect(result).toBe(false);
    });

    it('grants viewer access when the project role is viewer', async () => {
      (prisma.canvasProject.findUnique as any).mockResolvedValue({ organisation_id: 'org-1' });
      (prisma.organisationMember.findUnique as any).mockResolvedValue({ role: 'member' });
      (prisma.projectMember.findUnique as any).mockResolvedValue({ role: 'viewer' });

      const { hasProjectAccess } = await import('../services/project-access.service');

      expect(await hasProjectAccess('u', 'p', 'viewer')).toBe(true);
    });

    it('denies editor access when the project role is only viewer', async () => {
      (prisma.canvasProject.findUnique as any).mockResolvedValue({ organisation_id: 'org-1' });
      (prisma.organisationMember.findUnique as any).mockResolvedValue({ role: 'member' });
      (prisma.projectMember.findUnique as any).mockResolvedValue({ role: 'viewer' });

      const { hasProjectAccess } = await import('../services/project-access.service');

      expect(await hasProjectAccess('u', 'p', 'editor')).toBe(false);
    });

    it('grants editor access at the editor role', async () => {
      (prisma.canvasProject.findUnique as any).mockResolvedValue({ organisation_id: 'org-1' });
      (prisma.organisationMember.findUnique as any).mockResolvedValue({ role: 'member' });
      (prisma.projectMember.findUnique as any).mockResolvedValue({ role: 'editor' });

      const { hasProjectAccess } = await import('../services/project-access.service');

      expect(await hasProjectAccess('u', 'p', 'editor')).toBe(true);
    });

    it('denies owner-tier access for an editor', async () => {
      (prisma.canvasProject.findUnique as any).mockResolvedValue({ organisation_id: 'org-1' });
      (prisma.organisationMember.findUnique as any).mockResolvedValue({ role: 'member' });
      (prisma.projectMember.findUnique as any).mockResolvedValue({ role: 'editor' });

      const { hasProjectAccess } = await import('../services/project-access.service');

      expect(await hasProjectAccess('u', 'p', 'owner')).toBe(false);
    });

    it('grants owner-tier access for a project owner', async () => {
      (prisma.canvasProject.findUnique as any).mockResolvedValue({ organisation_id: 'org-1' });
      (prisma.organisationMember.findUnique as any).mockResolvedValue({ role: 'member' });
      (prisma.projectMember.findUnique as any).mockResolvedValue({ role: 'owner' });

      const { hasProjectAccess } = await import('../services/project-access.service');

      expect(await hasProjectAccess('u', 'p', 'owner')).toBe(true);
    });

    it('treats an unknown stored project role as level 0 (denies everything)', async () => {
      // Default-zero branch in `(ROLE_LEVEL[projectRole] || 0)` when projectRole
      // is non-empty but not one of viewer/editor/owner.
      (prisma.canvasProject.findUnique as any).mockResolvedValue({ organisation_id: 'org-1' });
      (prisma.organisationMember.findUnique as any).mockResolvedValue({ role: 'member' });
      (prisma.projectMember.findUnique as any).mockResolvedValue({ role: 'gibberish' });

      const { hasProjectAccess } = await import('../services/project-access.service');

      expect(await hasProjectAccess('u', 'p', 'viewer')).toBe(false);
    });

    it('treats an unknown minRole as level 0 (any defined project role passes)', async () => {
      // Default-zero branch on the right-hand side of the comparison —
      // structurally unreachable via the TS type but defensive at runtime.
      (prisma.canvasProject.findUnique as any).mockResolvedValue({ organisation_id: 'org-1' });
      (prisma.organisationMember.findUnique as any).mockResolvedValue({ role: 'member' });
      (prisma.projectMember.findUnique as any).mockResolvedValue({ role: 'viewer' });

      const { hasProjectAccess } = await import('../services/project-access.service');

      // Cast through unknown — TS type forbids 'foo' but runtime accepts it.
      expect(await hasProjectAccess('u', 'p', 'foo' as unknown as 'viewer')).toBe(true);
    });
  });

  describe('grantCreatorAccess', () => {
    it('upserts the creator as project owner', async () => {
      (prisma.projectMember.upsert as any).mockResolvedValue({});
      const { grantCreatorAccess } = await import('../services/project-access.service');

      await grantCreatorAccess('p-1', 'u-1');

      expect(prisma.projectMember.upsert).toHaveBeenCalledWith({
        where: { project_id_user_id: { project_id: 'p-1', user_id: 'u-1' } },
        update: { role: 'owner' },
        create: { project_id: 'p-1', user_id: 'u-1', role: 'owner', granted_by: 'u-1' },
      });
    });
  });

  describe('listProjectMembers', () => {
    it('returns project members ordered by granted_at ascending with user fields', async () => {
      const fixture = [{ id: 'pm-1', user: { id: 'u-1', email: 'a@b.com', name: 'A', avatar: null } }];
      (prisma.projectMember.findMany as any).mockResolvedValue(fixture);
      const { listProjectMembers } = await import('../services/project-access.service');

      const result = await listProjectMembers('p-1');

      expect(result).toEqual(fixture);
      expect(prisma.projectMember.findMany).toHaveBeenCalledWith({
        where: { project_id: 'p-1' },
        include: { user: { select: { id: true, email: true, name: true, avatar: true } } },
        orderBy: { granted_at: 'asc' },
      });
    });
  });

  describe('addProjectMember', () => {
    it('upserts the member with the given role and grantedBy', async () => {
      (prisma.projectMember.upsert as any).mockResolvedValue({ id: 'pm-1' });
      const { addProjectMember } = await import('../services/project-access.service');

      await addProjectMember('p-1', 'u-1', 'editor', 'admin-1');

      expect(prisma.projectMember.upsert).toHaveBeenCalledWith({
        where: { project_id_user_id: { project_id: 'p-1', user_id: 'u-1' } },
        update: { role: 'editor' },
        create: { project_id: 'p-1', user_id: 'u-1', role: 'editor', granted_by: 'admin-1' },
      });
    });
  });

  describe('updateProjectMemberRole', () => {
    it('updates a non-owner member without checking owner count', async () => {
      // findings.md #6 — when promoting TO owner the guard short-
      // circuits without a count call (the operation can only add
      // owners). When the target ISN'T currently an owner, demoting
      // to a non-owner role is also safe — `isLastOwner` returns false
      // early on `pm?.role !== 'owner'`.
      (prisma.projectMember.findUnique as any).mockResolvedValue({ role: 'editor' });
      (prisma.projectMember.update as any).mockResolvedValue({ id: 'pm-1' });
      const { updateProjectMemberRole } = await import('../services/project-access.service');

      await updateProjectMemberRole('p-1', 'u-1', 'viewer');

      expect(prisma.projectMember.count).not.toHaveBeenCalled();
      expect(prisma.projectMember.update).toHaveBeenCalledWith({
        where: { project_id_user_id: { project_id: 'p-1', user_id: 'u-1' } },
        data: { role: 'viewer' },
      });
    });

    it('skips the count check when promoting TO owner', async () => {
      // newRole === 'owner' short-circuits before `isLastOwner` —
      // adding owners can never reduce the count.
      (prisma.projectMember.update as any).mockResolvedValue({ id: 'pm-1' });
      const { updateProjectMemberRole } = await import('../services/project-access.service');

      await updateProjectMemberRole('p-1', 'u-1', 'owner');

      expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
      expect(prisma.projectMember.update).toHaveBeenCalled();
    });

    it('throws when demoting the last project owner (findings #6)', async () => {
      (prisma.projectMember.findUnique as any).mockResolvedValue({ role: 'owner' });
      (prisma.projectMember.count as any).mockResolvedValue(1);
      const { updateProjectMemberRole } = await import('../services/project-access.service');

      await expect(updateProjectMemberRole('p-1', 'u-1', 'editor')).rejects.toThrow(
        /Cannot demote the last project owner/,
      );
      expect(prisma.projectMember.update).not.toHaveBeenCalled();
    });

    it('demotes an owner when other owners remain (findings #6)', async () => {
      (prisma.projectMember.findUnique as any).mockResolvedValue({ role: 'owner' });
      (prisma.projectMember.count as any).mockResolvedValue(2);
      (prisma.projectMember.update as any).mockResolvedValue({ id: 'pm-1' });
      const { updateProjectMemberRole } = await import('../services/project-access.service');

      await updateProjectMemberRole('p-1', 'u-1', 'editor');

      expect(prisma.projectMember.update).toHaveBeenCalled();
    });
  });

  describe('removeProjectMember', () => {
    it('throws when removing the last project owner', async () => {
      (prisma.projectMember.findUnique as any).mockResolvedValue({ role: 'owner' });
      (prisma.projectMember.count as any).mockResolvedValue(1);

      const { removeProjectMember } = await import('../services/project-access.service');

      await expect(removeProjectMember('p-1', 'u-1')).rejects.toThrow(/Cannot remove the last project owner/);
      expect(prisma.projectMember.delete).not.toHaveBeenCalled();
    });

    it('removes a non-owner member without checking owner count', async () => {
      // isLastOwner returns false on the early `pm?.role !== 'owner'` branch.
      (prisma.projectMember.findUnique as any).mockResolvedValue({ role: 'editor' });
      (prisma.projectMember.delete as any).mockResolvedValue({});

      const { removeProjectMember } = await import('../services/project-access.service');

      await removeProjectMember('p-1', 'u-1');

      expect(prisma.projectMember.count).not.toHaveBeenCalled();
      expect(prisma.projectMember.delete).toHaveBeenCalledWith({
        where: { project_id_user_id: { project_id: 'p-1', user_id: 'u-1' } },
      });
    });

    it('removes an owner when other owners remain', async () => {
      (prisma.projectMember.findUnique as any).mockResolvedValue({ role: 'owner' });
      (prisma.projectMember.count as any).mockResolvedValue(2);
      (prisma.projectMember.delete as any).mockResolvedValue({});

      const { removeProjectMember } = await import('../services/project-access.service');

      await removeProjectMember('p-1', 'u-1');

      expect(prisma.projectMember.delete).toHaveBeenCalledWith({
        where: { project_id_user_id: { project_id: 'p-1', user_id: 'u-1' } },
      });
    });

    it('does not throw when the membership row is missing (treats as not-an-owner)', async () => {
      // pm is null — `pm?.role !== 'owner'` evaluates true (undefined !== 'owner'),
      // so isLastOwner returns false and delete proceeds.
      (prisma.projectMember.findUnique as any).mockResolvedValue(null);
      (prisma.projectMember.delete as any).mockResolvedValue({});

      const { removeProjectMember } = await import('../services/project-access.service');

      await removeProjectMember('p-1', 'u-1');
      expect(prisma.projectMember.delete).toHaveBeenCalled();
    });
  });
});
