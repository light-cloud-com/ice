/**
 * JWT Auth Middleware
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV !== 'test') {
    throw new Error('JWT_SECRET environment variable is required. Refusing to start with a default secret.');
  }
  return secret || 'test-secret';
}

const JWT_SECRET = getJwtSecret();

export interface AuthRequest extends Request {
  userId?: string;
  organisationId?: string;
}

// Desktop mode IDs — set by auto-seeded local user
let _desktopUserId: string | null = null;
let _desktopOrgId: string | null = null;

export function setDesktopUser(userId: string, orgId: string) {
  _desktopUserId = userId;
  _desktopOrgId = orgId;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  // Community edition: skip JWT validation, use auto-seeded local user
  if (_desktopUserId) {
    req.userId = _desktopUserId;
    req.organisationId = _desktopOrgId || '';
    return next();
  }

  // Fallback: JWT validation (for SaaS edition, if re-enabled)
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
 * Reads projectId/cardId from req.body, req.params, or req.query (supports both POST and GET routes).
 */
export function requireProjectAccess(minRole: 'viewer' | 'editor' | 'owner') {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Lazy-import to avoid circular deps at startup
    const prisma = (await import('@ice/db')).default;

    // Read projectId/cardId from body, params, or query (supports POST and GET routes)
    let projectId = req.body?.projectId || req.params?.projectId || (req.query?.projectId as string);

    const cardId = req.body?.cardId || req.params?.cardId || (req.query?.cardId as string);

    // Resolve from cardId if no projectId
    if (!projectId && cardId) {
      const card = await prisma.canvasCard.findUnique({
        where: { id: cardId },
        select: { project_id: true },
      });
      projectId = card?.project_id;
    }

    if (!projectId) {
      return res.status(400).json({ message: 'projectId is required' });
    }

    const ROLE_LEVEL: Record<string, number> = { viewer: 1, editor: 2, owner: 3 };
    const ORG_ADMIN_ROLES = new Set(['owner', 'admin']);

    // BE-10: Single query — fetch project with org membership and project membership in one round trip
    const project = await prisma.canvasProject.findUnique({
      where: { id: projectId },
      select: {
        organisation_id: true,
        members: {
          where: { user_id: req.userId! },
          select: { role: true },
          take: 1,
        },
      },
    });
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check org-level role (admins/owners bypass project-level check)
    const orgMember = await prisma.organisationMember.findUnique({
      where: { user_id_organisation_id: { user_id: req.userId!, organisation_id: project.organisation_id } },
    });
    if (orgMember?.role && ORG_ADMIN_ROLES.has(orgMember.role)) {
      return next();
    }

    // Check project-level membership (already fetched with the project query)
    const pm = project.members[0];
    if (!pm?.role || (ROLE_LEVEL[pm.role] || 0) < (ROLE_LEVEL[minRole] || 0)) {
      return res.status(403).json({ message: 'Insufficient project permissions' });
    }
    next();
  };
}

/**
 * Org-level role middleware.
 * Checks the authenticated user's org membership role against the allowed list.
 * Use for org-scoped routes that don't have a projectId (billing, credentials, etc.).
 */
export function requireOrgRole(...allowedRoles: string[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const orgId = req.organisationId;
    if (!orgId) {
      return res.status(401).json({ message: 'No organisation context' });
    }

    // Lazy-import to avoid circular deps at startup
    const prisma = (await import('@ice/db')).default;

    const member = await prisma.organisationMember.findUnique({
      where: { user_id_organisation_id: { user_id: req.userId!, organisation_id: orgId } },
    });
    if (!member || !allowedRoles.includes(member.role)) {
      return res.status(403).json({ message: 'Insufficient organisation permissions' });
    }
    next();
  };
}

export function generateToken(userId: string, organisationId: string): string {
  return jwt.sign({ userId, organisationId }, JWT_SECRET, { expiresIn: '1h' });
}

export function generateRefreshToken(userId: string, organisationId: string): string {
  return jwt.sign({ userId, organisationId, type: 'refresh', jti: crypto.randomUUID() }, JWT_SECRET, {
    expiresIn: '30d',
  });
}
