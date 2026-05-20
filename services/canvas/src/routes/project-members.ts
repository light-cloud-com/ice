/**
 * Project Member Routes
 *
 * POST /api/project-members/list        — List project members
 * POST /api/project-members/add         — Add member to project
 * POST /api/project-members/update-role — Change member's project role
 * POST /api/project-members/remove      — Remove member from project
 */

import prisma from '@ice/db';
import * as projectAccess from '@ice/service-iam';
import { sendProjectInviteEmail } from '@ice/service-iam';
import { requireAuth, requireProjectAccess, type AuthRequest } from '@ice/shared';
import { Router, type Router as RouterType, type Response } from 'express';

const router: RouterType = Router();
router.use(requireAuth);

// ── List project members ─────────────────────────────────────────────────────

router.post('/list', requireProjectAccess('viewer'), async (req: AuthRequest, res: Response) => {
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
  } catch {
    res.status(500).json({ message: 'Failed to list project members' });
  }
});

// ── Add member ───────────────────────────────────────────────────────────────

// findings.md #44 — owner-gating is now done by the shared
// `requireProjectAccess('owner')` middleware (the same one canvas.ts
// uses). The previous inline `hasProjectAccess(req.userId, projectId,
// 'owner')` re-implemented the same check with a slightly different
// 403 message and skipped the middleware's project-existence 404.
router.post('/add', requireProjectAccess('owner'), async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, userId, role = 'editor' } = req.body;
    if (!projectId || !userId) {
      return res.status(400).json({ message: 'projectId and userId are required' });
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

// findings.md #44 — owner-gating delegated to the shared middleware.
router.post('/update-role', requireProjectAccess('owner'), async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, userId, role } = req.body;
    if (!projectId || !userId || !role) {
      return res.status(400).json({ message: 'projectId, userId, and role are required' });
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

// findings.md #44 — owner-gating delegated to the shared middleware.
router.post('/remove', requireProjectAccess('owner'), async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, userId } = req.body;
    if (!projectId || !userId) {
      return res.status(400).json({ message: 'projectId and userId are required' });
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
