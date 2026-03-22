/**
 * Profile Routes
 *
 * PUT /api/profile/name — Update name
 * PUT /api/profile/password — Change password
 */

import { Router, type Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '@ice/db';
import { requireAuth, type AuthRequest } from '@ice/shared';

const router = Router();
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
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to update name' });
  }
});

router.put('/password', async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (currentPassword) {
      const valid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!valid) return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const password_hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.userId },
      data: { password_hash },
    });

    res.json({ message: 'Password updated successfully' });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to update password' });
  }
});

export default router;
