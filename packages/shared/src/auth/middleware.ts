/**
 * JWT Auth Middleware
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export interface AuthRequest extends Request {
  userId?: string;
  organisationId?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing authorization token' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      organisationId: string;
    };
    req.userId = payload.userId;
    req.organisationId = payload.organisationId;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/**
 * Project-level access middleware.
 * Reads projectId from req.body.projectId or resolves from req.body.cardId.
 */
export function requireProjectAccess(minRole: 'viewer' | 'editor' | 'owner') {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Lazy-import to avoid circular deps at startup
    const prisma = (await import('@ice-saas/db')).default;

    let projectId = req.body?.projectId;

    // Resolve from cardId if no projectId
    if (!projectId && req.body?.cardId) {
      const card = await prisma.canvasCard.findUnique({
        where: { id: req.body.cardId },
        select: { project_id: true },
      });
      projectId = card?.project_id;
    }

    if (!projectId) {
      return res.status(400).json({ message: 'projectId is required' });
    }

    const ROLE_LEVEL: Record<string, number> = { viewer: 1, editor: 2, owner: 3 };
    const ORG_ADMIN_ROLES = new Set(['owner', 'admin']);

    // Get the project's org to check org-level role
    const project = await prisma.canvasProject.findUnique({
      where: { id: projectId },
      select: { organisation_id: true },
    });
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Org admins/owners always have full access
    const orgMember = await prisma.organisationMember.findUnique({
      where: { user_id_organisation_id: { user_id: req.userId!, organisation_id: project.organisation_id } },
    });
    if (orgMember?.role && ORG_ADMIN_ROLES.has(orgMember.role)) {
      return next();
    }

    // Check project-level membership
    const pm = await prisma.projectMember.findUnique({
      where: { project_id_user_id: { project_id: projectId, user_id: req.userId! } },
    });
    if (!pm?.role || (ROLE_LEVEL[pm.role] || 0) < (ROLE_LEVEL[minRole] || 0)) {
      return res.status(403).json({ message: 'Insufficient project permissions' });
    }
    next();
  };
}

export function generateToken(userId: string, organisationId: string): string {
  return jwt.sign({ userId, organisationId }, JWT_SECRET, { expiresIn: '1h' });
}

export function generateRefreshToken(userId: string, organisationId: string): string {
  return jwt.sign({ userId, organisationId, type: 'refresh' }, JWT_SECRET, { expiresIn: '30d' });
}
