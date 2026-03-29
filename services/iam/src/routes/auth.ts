/**
 * Auth Routes — Community Edition
 *
 * GET  /api/auth/me — Get current user profile
 * POST /api/auth/switch-org — Switch active organisation
 */

import { requireAuth, type AuthRequest } from '@ice/shared';
import { Router, type Router as RouterType, type Response } from 'express';
import jwt from 'jsonwebtoken';
import * as authService from '../services/auth.service';
import { AuthError } from '../services/auth.service';

const router: RouterType = Router();
const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === 'test'
    ? 'test-secret'
    : (() => {
        throw new Error('JWT_SECRET is required');
      })());

// ── Switch Organisation ──────────────────────────────────────────────────────

router.post('/switch-org', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { organisationId } = req.body;
    if (!organisationId) {
      return res.status(400).json({ message: 'organisationId is required' });
    }

    const prisma = (await import('@ice/db')).default;
    const membership = await prisma.organisationMember.findUnique({
      where: { user_id_organisation_id: { user_id: req.userId!, organisation_id: organisationId } },
    });
    if (!membership) {
      return res.status(403).json({ message: 'Not a member of this organisation' });
    }

    const token = jwt.sign({ userId: req.userId!, organisationId }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch {
    res.status(500).json({ message: 'Failed to switch organisation' });
  }
});

// ── Me ───────────────────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await authService.getProfile(req.userId!);
    res.json(profile);
  } catch (err: any) {
    if (err instanceof AuthError) {
      return res.status(err.status).json({ message: err.message });
    }
    res.status(500).json({ message: 'Failed to get profile' });
  }
});

export default router;
