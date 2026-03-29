/**
 * Profile Routes — Community Edition
 *
 * PUT /api/profile/name — Update display name
 */

import prisma from '@ice/db';
import { requireAuth, type AuthRequest } from '@ice/shared';
import { Router, type Router as RouterType, type Response } from 'express';

const router: RouterType = Router();
router.use(requireAuth);

router.put('/name', async (req: AuthRequest, res: Response) => {
  try {
    const { firstName, lastName } = req.body;
    const name = `${firstName || ''} ${lastName || ''}`.trim();

    await prisma.user.update({
      where: { id: req.userId },
      data: { name },
    });

    res.json({ message: 'Name updated successfully' });
  } catch {
    res.status(500).json({ message: 'Failed to update name' });
  }
});

export default router;
