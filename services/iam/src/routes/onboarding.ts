/**
 * Onboarding Routes
 *
 * GET  /api/onboarding/status                  — Get current onboarding state
 * PUT  /api/onboarding/step                    — Save step data + advance
 * PUT  /api/onboarding/complete                — Mark onboarding as complete
 * PUT  /api/onboarding/skip                    — Skip all remaining steps
 * PUT  /api/onboarding/completed-tours/:id     — Append a completed tour id (idempotent)
 */

import prisma from '@ice/db';
import { requireAuth, type AuthRequest } from '@ice/shared';
import { Router, type Router as RouterType, type Response } from 'express';

const router: RouterType = Router();
router.use(requireAuth);

// SQLite stores `completed_tours` as a JSON-encoded string. Surface it to
// callers as `string[]` and never let the raw column shape escape this file.
// Empty/null/malformed → `[]` so a corrupt write can't break the read path.
function parseCompletedTours(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

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
        completed_tours: true,
      },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    const { completed_tours, ...rest } = user;
    res.json({
      ...rest,
      completedTours: parseCompletedTours(completed_tours),
    });
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
    res.status(500).json({ message: 'Failed to skip onboarding' });
  }
});

// ── Append a completed tour id ───────────────────────────────────────────────
//
// Idempotent: appends `id` only if absent (set semantics). Returns the full
// updated array so callers don't need a follow-up GET.
//
// URL param validation (1–64 chars, [a-z0-9-], must start alphanumeric):
const TOUR_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/i;

router.put('/completed-tours/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (typeof id !== 'string' || !TOUR_ID_RE.test(id)) {
      return res.status(400).json({ message: 'Invalid tour id' });
    }

    const current = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { completed_tours: true },
    });
    if (!current) return res.status(404).json({ message: 'User not found' });

    const tours = parseCompletedTours(current.completed_tours);
    const next = tours.includes(id) ? tours : [...tours, id];

    if (next !== tours) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { completed_tours: JSON.stringify(next) },
      });
    }

    res.json({ completedTours: next });
  } catch {
    res.status(500).json({ message: 'Failed to update completed tours' });
  }
});

export default router;
