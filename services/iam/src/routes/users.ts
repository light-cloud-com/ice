/**
 * User Management Routes
 *
 * POST   /api/users              — List members in org (with roles)
 * POST   /api/users/invite       — Create invitation (stores in DB, returns token)
 * POST   /api/users/invite/accept — Accept invitation by token
 * GET    /api/users/invitations  — List pending invitations for org
 * POST   /api/users/update-role  — Update member role
 * POST   /api/users/remove       — Remove member from org
 */

import crypto from 'crypto';
import prisma from '@ice/db';
import { requireAuth, type AuthRequest } from '@ice/shared';
import { Router, type Router as RouterType, type Response } from 'express';
import { sendOrgInviteEmail } from '../services/email.service';

const router: RouterType = Router();
router.use(requireAuth);

// ── Helper: get caller's role in org ─────────────────────────────────────────

async function getCallerRole(userId: string, orgId: string): Promise<string | null> {
  const member = await prisma.organisationMember.findUnique({
    where: { user_id_organisation_id: { user_id: userId, organisation_id: orgId } },
  });
  return member?.role || null;
}

const ADMIN_ROLES = new Set(['owner', 'admin']);

// ── List members ─────────────────────────────────────────────────────────────

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { targetOrganisationId, page = 1, limit = 50 } = req.body;
    const orgId = targetOrganisationId || req.organisationId || '';

    // Check org role — admin+ required to list members
    const callerRole = await getCallerRole(req.userId!, orgId);
    if (!callerRole || !ADMIN_ROLES.has(callerRole)) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const [members, total] = await Promise.all([
      prisma.organisationMember.findMany({
        where: { organisation_id: orgId },
        include: { user: { select: { id: true, email: true, name: true, avatar: true, created_at: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { joined_at: 'asc' },
      }),
      prisma.organisationMember.count({ where: { organisation_id: orgId } }),
    ]);

    const items = members.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      name: m.user.name,
      avatar: m.user.avatar,
      roleName: m.role.charAt(0).toUpperCase() + m.role.slice(1),
      role: m.role,
      status: 1,
      lastLogin: m.user.created_at,
    }));

    res.json({
      items,
      totalItems: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    });
  } catch (err: any) {
    console.error('List users error:', err);
    res.status(500).json({ message: 'Failed to list users' });
  }
});

// ── Invite user ──────────────────────────────────────────────────────────────

router.post('/invite', async (req: AuthRequest, res: Response) => {
  try {
    const { email, role = 'member', targetOrganisationId } = req.body;
    const orgId = targetOrganisationId || req.organisationId || '';

    if (!email) return res.status(400).json({ message: 'Email is required' });

    // Only admin/owner can invite
    const callerRole = await getCallerRole(req.userId!, orgId);
    if (!callerRole || !ADMIN_ROLES.has(callerRole)) {
      return res.status(403).json({ message: 'Only admins can invite users' });
    }

    // Check if user already a member
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const existingMember = await prisma.organisationMember.findUnique({
        where: { user_id_organisation_id: { user_id: existingUser.id, organisation_id: orgId } },
      });
      if (existingMember) {
        return res.status(409).json({ message: 'User is already a member of this team' });
      }
    }

    // Check for existing pending invite
    const existingInvite = await prisma.invitation.findFirst({
      where: { email, organisation_id: orgId, accepted_at: null, expires_at: { gt: new Date() } },
    });
    if (existingInvite) {
      return res.status(409).json({ message: 'An invitation has already been sent to this email' });
    }

    // Create invitation
    const token = crypto.randomBytes(32).toString('hex');
    const invitation = await prisma.invitation.create({
      data: {
        email,
        organisation_id: orgId,
        role: role === 'Admin' ? 'admin' : 'member',
        token,
        invited_by: req.userId!,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // If user already exists, add them to the org immediately
    if (existingUser) {
      await prisma.organisationMember.create({
        data: {
          user_id: existingUser.id,
          organisation_id: orgId,
          role: role === 'Admin' ? 'admin' : 'member',
        },
      });
      // Update their default org if they don't have one
      if (!existingUser.organisation_id) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { organisation_id: orgId },
        });
      }
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { accepted_at: new Date() },
      });

      return res.json({ success: true, message: 'User added to team', immediate: true });
    }

    // Send invite email (logs to console in dev, real email in prod)
    const inviterUser = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
    const org = await prisma.organisation.findUnique({ where: { id: orgId }, select: { name: true } });
    sendOrgInviteEmail({
      to: email,
      inviterName: inviterUser?.name || 'A team member',
      orgName: org?.name || 'your team',
      token: invitation.token,
    });

    res.json({
      success: true,
      message: 'Invitation created',
      token: invitation.token,
      expiresAt: invitation.expires_at,
    });
  } catch (err: any) {
    console.error('Invite user error:', err);
    res.status(500).json({ message: 'Failed to invite user' });
  }
});

// ── Accept invitation ────────────────────────────────────────────────────────

router.post('/invite/accept', async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'Token is required' });

    const invitation = await prisma.invitation.findUnique({ where: { token } });
    if (!invitation) return res.status(404).json({ message: 'Invalid invitation' });
    if (invitation.accepted_at) return res.status(400).json({ message: 'Invitation already accepted' });
    if (invitation.expires_at < new Date()) return res.status(400).json({ message: 'Invitation expired' });

    // Add the current user to the org
    await prisma.organisationMember.upsert({
      where: {
        user_id_organisation_id: { user_id: req.userId!, organisation_id: invitation.organisation_id },
      },
      update: { role: invitation.role },
      create: {
        user_id: req.userId!,
        organisation_id: invitation.organisation_id,
        role: invitation.role,
      },
    });

    // Mark invitation as accepted
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { accepted_at: new Date() },
    });

    // Set user's default org if not set
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user?.organisation_id) {
      await prisma.user.update({
        where: { id: req.userId! },
        data: { organisation_id: invitation.organisation_id },
      });
    }

    const org = await prisma.organisation.findUnique({
      where: { id: invitation.organisation_id },
      select: { id: true, name: true },
    });

    res.json({ success: true, organisation: org });
  } catch (err: any) {
    console.error('Accept invitation error:', err);
    res.status(500).json({ message: 'Failed to accept invitation' });
  }
});

// ── List pending invitations ─────────────────────────────────────────────────

router.get('/invitations', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = (req.query.organisationId as string) || req.organisationId || '';

    // Check org role — admin+ required to list invitations
    const callerRole = await getCallerRole(req.userId!, orgId);
    if (!callerRole || !ADMIN_ROLES.has(callerRole)) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const invitations = await prisma.invitation.findMany({
      where: { organisation_id: orgId, accepted_at: null, expires_at: { gt: new Date() } },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        created_at: true,
        expires_at: true,
      },
    });

    res.json(invitations);
  } catch {
    res.status(500).json({ message: 'Failed to list invitations' });
  }
});

// ── Update role ──────────────────────────────────────────────────────────────

router.post('/update-role', async (req: AuthRequest, res: Response) => {
  try {
    const { userId, role, targetOrganisationId } = req.body;
    const orgId = targetOrganisationId || req.organisationId || '';

    if (!userId || !role) return res.status(400).json({ message: 'userId and role are required' });

    const normalizedRole = role.toLowerCase();
    if (!['owner', 'admin', 'member', 'viewer'].includes(normalizedRole)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // Only admin/owner can change roles
    const callerRole = await getCallerRole(req.userId!, orgId);
    if (!callerRole || !ADMIN_ROLES.has(callerRole)) {
      return res.status(403).json({ message: 'Only admins can change roles' });
    }

    // Can't change your own role
    if (userId === req.userId) {
      return res.status(400).json({ message: 'Cannot change your own role' });
    }

    // Only owners can promote to owner/admin
    if (['owner', 'admin'].includes(normalizedRole) && callerRole !== 'owner') {
      return res.status(403).json({ message: 'Only owners can promote to admin or owner' });
    }

    await prisma.organisationMember.update({
      where: { user_id_organisation_id: { user_id: userId, organisation_id: orgId } },
      data: { role: normalizedRole },
    });

    res.json({ success: true, message: 'Role updated' });
  } catch (err: any) {
    console.error('Update role error:', err);
    res.status(500).json({ message: 'Failed to update role' });
  }
});

// ── Remove member ────────────────────────────────────────────────────────────

router.post('/remove', async (req: AuthRequest, res: Response) => {
  try {
    const { userId, targetOrganisationId } = req.body;
    const orgId = targetOrganisationId || req.organisationId || '';

    if (!userId) return res.status(400).json({ message: 'userId is required' });

    // Only admin/owner can remove
    const callerRole = await getCallerRole(req.userId!, orgId);
    if (!callerRole || !ADMIN_ROLES.has(callerRole)) {
      return res.status(403).json({ message: 'Only admins can remove members' });
    }

    // Can't remove yourself
    if (userId === req.userId) {
      return res.status(400).json({ message: 'Cannot remove yourself' });
    }

    // Can't remove owners unless you're an owner
    const targetRole = await getCallerRole(userId, orgId);
    if (targetRole === 'owner' && callerRole !== 'owner') {
      return res.status(403).json({ message: 'Cannot remove an owner' });
    }

    // Remove membership
    await prisma.organisationMember.deleteMany({
      where: { user_id: userId, organisation_id: orgId },
    });

    // If this was their default org, clear it
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.organisation_id === orgId) {
      await prisma.user.update({
        where: { id: userId },
        data: { organisation_id: null },
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('Remove user error:', err);
    res.status(500).json({ message: 'Failed to remove user' });
  }
});

export default router;
