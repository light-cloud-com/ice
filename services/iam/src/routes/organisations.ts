/**
 * Organisation Routes
 *
 * POST /api/organisations/create — Create new org
 */

import { Router, type Response } from 'express';
import prisma from '@ice/db';
import { requireAuth, type AuthRequest } from '@ice/shared';

const router = Router();
router.use(requireAuth);

router.post('/create', async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ message: 'Team name must be at least 2 characters' });
    }

    const org = await prisma.organisation.create({
      data: { name: name.trim() },
    });

    // Create membership as owner
    await prisma.organisationMember.create({
      data: { user_id: req.userId!, organisation_id: org.id, role: 'owner' },
    });

    // If user has no org yet, link them to this one
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { organisation_id: true } });
    if (!user?.organisation_id) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { organisation_id: org.id },
      });
    }

    res.json({ id: org.id, name: org.name, role: 'owner' });
  } catch (err: any) {
    console.error('Create org error:', err);
    res.status(500).json({ message: 'Failed to create team' });
  }
});

export default router;
