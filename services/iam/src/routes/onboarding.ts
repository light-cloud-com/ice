/**
 * Onboarding Routes
 *
 * GET  /api/onboarding/status   — Get current onboarding state
 * PUT  /api/onboarding/step     — Save step data + advance
 * PUT  /api/onboarding/complete — Mark onboarding as complete
 * PUT  /api/onboarding/skip     — Skip all remaining steps
 */

import { Router, type Response } from 'express';
import prisma from '@ice-saas/db';
import { requireAuth, type AuthRequest } from '@ice-saas/shared';

const router = Router();
router.use(requireAuth);

// ── Get onboarding status ────────────────────────────────────────────────────

router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        onboarding_completed: true,
        onboarding_step: true,
        default_provider: true,
        default_region: true,
      },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to get onboarding status' });
  }
});

// ── Update step data ─────────────────────────────────────────────────────────

router.put('/step', async (req: AuthRequest, res: Response) => {
  try {
    const { step, defaultProvider, defaultRegion } = req.body;

    const data: Record<string, any> = {};
    if (typeof step === 'number' && step >= 1 && step <= 6) {
      data.onboarding_step = step;
    }
    if (defaultProvider !== undefined) {
      data.default_provider = defaultProvider;
    }
    if (defaultRegion !== undefined) {
      data.default_region = defaultRegion;
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data,
      select: {
        onboarding_completed: true,
        onboarding_step: true,
        default_provider: true,
        default_region: true,
      },
    });

    res.json(user);
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to update onboarding step' });
  }
});

// ── Complete onboarding ──────────────────────────────────────────────────────

router.put('/complete', async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { onboarding_completed: true },
      select: {
        onboarding_completed: true,
        onboarding_step: true,
        default_provider: true,
        default_region: true,
      },
    });
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to complete onboarding' });
  }
});

// ── Skip all ─────────────────────────────────────────────────────────────────

router.put('/skip', async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { onboarding_completed: true, onboarding_step: 6 },
      select: {
        onboarding_completed: true,
        onboarding_step: true,
        default_provider: true,
        default_region: true,
      },
    });
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to skip onboarding' });
  }
});

export default router;
