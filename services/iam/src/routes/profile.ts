/**
 * Profile Routes — Community Edition
 *
 * PUT  /api/profile/name             — Update display name
 * GET  /api/profile/preferences      — Load the UI prefs blob (panels,
 *                                      split-view, expanded folders, …).
 *                                      Replaces the localStorage cache;
 *                                      DB is the single source of truth.
 * PUT  /api/profile/preferences      — Persist the prefs blob (debounced
 *                                      by the client; the server just
 *                                      stringifies the body and stores it).
 * POST /api/profile/reset-workspace  — Wipe ALL workspace data for the
 *                                      authenticated user: projects, cards,
 *                                      environments, deployments, deploy
 *                                      state, pipelines, encrypted provider
 *                                      credentials, GitHub tokens, AI history,
 *                                      and the user's completed-tours +
 *                                      onboarding flags. Preserves the User
 *                                      row + their Organisation membership
 *                                      so the desktop user stays authenticated
 *                                      across the reset.
 */

import prisma from '@ice/db';
import { requireAuth, type AuthRequest } from '@ice/shared';
import { Router, type Router as RouterType, type Response } from 'express';
import { seedAcmeDemo } from '../services/seed-demo.service';

const router: RouterType = Router();
router.use(requireAuth);

router.get('/preferences', async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { preferences: true },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.preferences) return res.json(null);
    try {
      res.json(JSON.parse(user.preferences));
    } catch {
      // Corrupt write — surface null so the client falls back to slice
      // defaults rather than 500ing.
      res.json(null);
    }
  } catch (err) {
    console.error('[profile/preferences:get] failed:', err);
    res.status(500).json({ message: 'Failed to load preferences' });
  }
});

router.put('/preferences', async (req: AuthRequest, res: Response) => {
  try {
    const payload = req.body;
    // We accept any JSON-serialisable blob. The shape is owned by the
    // frontend (ui-slice + project-list-slice); the server just stores
    // it verbatim so schema drift doesn't require a backend deploy.
    const stringified = payload == null ? null : JSON.stringify(payload);
    await prisma.user.update({
      where: { id: req.userId },
      data: { preferences: stringified },
    });
    res.json({ message: 'Preferences saved' });
  } catch (err) {
    console.error('[profile/preferences:put] failed:', err);
    res.status(500).json({ message: 'Failed to save preferences' });
  }
});

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

router.post('/reset-workspace', async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const memberships = await prisma.organisationMember.findMany({
      where: { user_id: userId },
      select: { organisation_id: true },
    });
    const orgIds = memberships.map((m) => m.organisation_id);

    // Most child tables have `onDelete: Cascade` in schema.prisma, so we
    // only have to wipe the top-level parents the user can reach.
    // - canvasProject → cascades cards, environments, project members,
    //                   deployments, deploy events, deployed resource
    //                   mappings, block requirement statuses, ai
    //                   conversations / messages
    // - deploymentRule (org-scoped) → cascades webhook deliveries
    // - providerCredential (org-scoped)
    // - gitHubToken / refreshToken / aiAuditLog (user-scoped, SetNull or
    //                   no cascade — wipe explicitly)
    await prisma.$transaction(async (tx) => {
      await tx.canvasProject.deleteMany({ where: { organisation_id: { in: orgIds } } });
      await tx.deploymentRule.deleteMany({ where: { organisation_id: { in: orgIds } } });
      await tx.providerCredential.deleteMany({ where: { organisation_id: { in: orgIds } } });
      await tx.invitation.deleteMany({ where: { organisation_id: { in: orgIds } } });
      await tx.gitHubToken.deleteMany({ where: { user_id: userId } });
      await tx.refreshToken.deleteMany({ where: { user_id: userId } });
      await tx.aiAuditLog.deleteMany({ where: { user_id: userId } });

      // Reset user-level tour state so the tour replays on the next
      // session (canvas tour autoStart relies on empty completedTours).
      // Also nuke saved UI preferences — a reset is a "clean slate"
      // request; panel layout etc. should go back to defaults.
      await tx.user.update({
        where: { id: userId },
        data: {
          completed_tours: JSON.stringify([]),
          preferences: null,
          onboarding_completed: false,
          onboarding_step: 1,
          default_provider: null,
          default_region: null,
        },
      });
    });

    // Re-seed the ACME demo so the user doesn't land on an empty
    // workspace after reset. Failure is logged but doesn't fail the
    // request — the wipe already succeeded; an empty canvas is fine.
    try {
      const orgIdForSeed = orgIds[0];
      if (orgIdForSeed) {
        const seeded = await seedAcmeDemo(prisma, userId, orgIdForSeed);
        if (seeded) console.log('[profile/reset] Re-seeded ACME demo:', seeded.projectId);
      }
    } catch (seedErr) {
      console.error('[profile/reset] Failed to re-seed ACME demo:', seedErr);
    }

    res.json({ message: 'Workspace reset' });
  } catch (err) {
    console.error('[profile/reset-workspace] failed:', err);
    res.status(500).json({ message: 'Failed to reset workspace' });
  }
});

export default router;
