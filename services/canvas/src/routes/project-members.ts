/**
 * Project Member Routes
 *
 * POST /api/project-members/list        — List project members
 * POST /api/project-members/add         — Add member to project
 * POST /api/project-members/update-role — Change member's project role
 * POST /api/project-members/remove      — Remove member from project
 */

import { Router, type Response } from 'express';
import { requireAuth, type AuthRequest } from '@ice/shared';
import * as projectAccess from '@ice/service-iam';
import { sendProjectInviteEmail } from '@ice/service-iam';
import prisma from '@ice/db';

const router = Router();
router.use(requireAuth);

// ── List project members ─────────────────────────────────────────────────────

router.post('/list', async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ message: 'projectId is required' });

    const members = await projectAccess.listProjectMembers(projectId);
    res.json(
      members.map((m) => ({
        userId: m.user.id,
        email: m.user.email,
        name: m.user.name,
        avatar: m.user.avatar,
        role: m.role,
        grantedAt: m.granted_at,
      })),
    );
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to list project members' });
  }
});

// ── Add member ───────────────────────────────────────────────────────────────

router.post('/add', async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, userId, role = 'editor' } = req.body;
    if (!projectId || !userId) {
      return res.status(400).json({ message: 'projectId and userId are required' });
    }

    // Check caller has owner/admin access
    const hasAccess = await projectAccess.hasProjectAccess(req.userId!, projectId, 'owner');
    if (!hasAccess) {
      return res.status(403).json({ message: 'Only project owners can add members' });
    }

    const normalizedRole = role.toLowerCase();
    if (!['owner', 'editor', 'viewer'].includes(normalizedRole)) {
      return res.status(400).json({ message: 'Invalid role. Use: owner, editor, viewer' });
    }

    await projectAccess.addProjectMember(projectId, userId, normalizedRole, req.userId!);

    // Send notification email
    const [user, project] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
      prisma.canvasProject.findUnique({ where: { id: projectId }, select: { name: true } }),
    ]);
    if (user && project) {
      const inviter = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
      sendProjectInviteEmail({
        to: user.email,
        inviterName: inviter?.name || 'A team member',
        projectName: project.name,
        role: normalizedRole,
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Failed to add project member' });
  }
});

// ── Update role ──────────────────────────────────────────────────────────────

router.post('/update-role', async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, userId, role } = req.body;
    if (!projectId || !userId || !role) {
      return res.status(400).json({ message: 'projectId, userId, and role are required' });
    }

    const hasAccess = await projectAccess.hasProjectAccess(req.userId!, projectId, 'owner');
    if (!hasAccess) {
      return res.status(403).json({ message: 'Only project owners can change roles' });
    }

    if (userId === req.userId) {
      return res.status(400).json({ message: 'Cannot change your own project role' });
    }

    const normalizedRole = role.toLowerCase();
    if (!['owner', 'editor', 'viewer'].includes(normalizedRole)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    await projectAccess.updateProjectMemberRole(projectId, userId, normalizedRole);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Failed to update role' });
  }
});

// ── Remove member ────────────────────────────────────────────────────────────

router.post('/remove', async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, userId } = req.body;
    if (!projectId || !userId) {
      return res.status(400).json({ message: 'projectId and userId are required' });
    }

    const hasAccess = await projectAccess.hasProjectAccess(req.userId!, projectId, 'owner');
    if (!hasAccess) {
      return res.status(403).json({ message: 'Only project owners can remove members' });
    }

    if (userId === req.userId) {
      return res.status(400).json({ message: 'Cannot remove yourself from the project' });
    }

    await projectAccess.removeProjectMember(projectId, userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Failed to remove project member' });
  }
});

export default router;
