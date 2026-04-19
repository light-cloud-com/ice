/**
 * Cron Service — Scheduled maintenance tasks
 *
 * - Hourly: clean expired refresh tokens
 * - Daily: prune old deployment records (keep last 50 per card)
 * - Every 5 min: detect stuck deploy jobs
 */

import prisma from '@ice/db';
import cron from 'node-cron';

export function startCronJobs() {
  // Every hour: clean expired refresh tokens
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await prisma.refreshToken.deleteMany({
        where: { expires_at: { lt: new Date() } },
      });
      if (result.count > 0) {
        console.log(`Cleaned ${result.count} expired refresh tokens`);
      }
    } catch (err: any) {
      console.error('Cron: token cleanup error:', err.message);
    }
  });

  // Every day at 3am: prune deployment history.
  //
  // Retention policy (Phase B revision — history surface):
  //
  //   1. Pinned deployments are never pruned.
  //   2. The most recent successful (or partial) deployment per
  //      (card_id, environment) is kept forever as a rollback baseline.
  //   3. For each (card_id, environment), keep the top 50 most-recent
  //      successful/partial deploys beyond the baseline. (Raised from 20 —
  //      history rows are tiny and the UI limit is 100 per query.)
  //   4. Failed/cancelled deploys older than 90 days are pruned. (Raised
  //      from 30 — users need a longer window to retro failed deploys.)
  //   5. Plan-only rows (status='planned', no apply follow-up) older than
  //      7 days are pruned — they're just drafts.
  cron.schedule('0 3 * * *', async () => {
    try {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Rule 4: prune old failed/cancelled deploys.
      const oldFailed = await prisma.canvasDeployment.deleteMany({
        where: {
          status: { in: ['failed', 'cancelled'] },
          pinned: false,
          created_at: { lt: ninetyDaysAgo },
        },
      });
      if (oldFailed.count > 0) {
        console.log(`Pruned ${oldFailed.count} old failed/cancelled deployments`);
      }

      // Rule 5: prune stale plan-only rows that never got applied.
      const stalePlans = await prisma.canvasDeployment.deleteMany({
        where: {
          status: 'planned',
          pinned: false,
          created_at: { lt: sevenDaysAgo },
        },
      });
      if (stalePlans.count > 0) {
        console.log(`Pruned ${stalePlans.count} stale plan-only rows`);
      }

      // Rule 1-3: per (card_id, environment) retention for success/partial.
      const buckets = await prisma.canvasDeployment.groupBy({
        by: ['card_id', 'environment'],
        _count: true,
        where: { status: { in: ['success', 'partial'] } },
        having: { card_id: { _count: { gt: 50 } } },
      });

      for (const bucket of buckets) {
        const keepCandidates = await prisma.canvasDeployment.findMany({
          where: {
            card_id: bucket.card_id,
            environment: bucket.environment,
            status: { in: ['success', 'partial'] },
          },
          orderBy: { created_at: 'desc' },
          take: 50,
          select: { id: true },
        });
        const keepIds = new Set(keepCandidates.map((d) => d.id));

        // Rule 2 is automatically satisfied: the `orderBy desc / take 50`
        // above always includes the most recent successful deploy.
        const removed = await prisma.canvasDeployment.deleteMany({
          where: {
            card_id: bucket.card_id,
            environment: bucket.environment,
            status: { in: ['success', 'partial'] },
            pinned: false,
            id: { notIn: [...keepIds] },
          },
        });
        if (removed.count > 0) {
          console.log(
            `Pruned ${removed.count} successful deployments for card ${bucket.card_id} env ${bucket.environment}`,
          );
        }
      }
    } catch (err: any) {
      console.error('Cron: deployment prune error:', err.message);
    }

    // DR-O1: DeployEvent rows are no longer cascade-deleted with their
    // parent CanvasDeployment, so they now need their own retention
    // schedule. Keep them twice as long as the deployment metadata so a
    // user can still open an old deploy's log after the deployment row
    // itself has been pruned, but don't let them grow unbounded.
    try {
      const oneEightyDaysAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
      const eventsPruned = await prisma.deployEvent.deleteMany({
        where: { created_at: { lt: oneEightyDaysAgo } },
      });
      if (eventsPruned.count > 0) {
        console.log(`Pruned ${eventsPruned.count} deploy_event rows older than 180 days`);
      }
    } catch (err: any) {
      console.error('Cron: deploy_event prune error:', err.message);
    }

    // DR-O2: prune DeployedResourceMapping rows for cards that no longer
    // exist. Without this, a deleted card's mappings linger, drift
    // detection reports them as "extra" cloud state, and users are
    // forced to run cleanup-orphans for phantom nodes. Card deletion
    // itself doesn't cascade into the mapping table because the table
    // is keyed by a plain card_id string with no FK (intentional — the
    // mapping outlives individual deploy rows).
    try {
      const staleMappings = await prisma.$executeRaw`
        DELETE FROM "deployed_resource_mapping"
         WHERE "card_id" NOT IN (SELECT "id" FROM "canvas_card")
      `;
      if (staleMappings > 0) {
        console.log(`Pruned ${staleMappings} deployed_resource_mapping rows for deleted cards`);
      }
    } catch (err: any) {
      console.error('Cron: deployed_resource_mapping prune error:', err.message);
    }
  });

  // Every 5 min: detect stuck deploy jobs (running > 30 min)
  cron.schedule('*/5 * * * *', async () => {
    try {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
      const result = await prisma.deployJob.updateMany({
        where: {
          status: 'processing',
          started_at: { lt: thirtyMinAgo },
        },
        data: { status: 'failed', error: 'Job timed out after 30 minutes' },
      });
      if (result.count > 0) {
        console.log(`Auto-failed ${result.count} stuck deploy jobs`);
      }
    } catch (err: any) {
      console.error('Cron: stuck job detection error:', err.message);
    }
  });

  // Every 5 min: detect stuck CanvasDeployment rows in 'deploying' state.
  // If a deploy has been running for > 30 minutes, either the gateway
  // crashed mid-deploy or the deploy genuinely exceeded its budget. Either
  // way the record needs to be marked failed so the UI can move on and the
  // baseline-lookup logic in Phase 1 doesn't pick a zombie row.
  cron.schedule('*/5 * * * *', async () => {
    try {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
      const result = await prisma.canvasDeployment.updateMany({
        where: {
          status: 'deploying',
          created_at: { lt: thirtyMinAgo },
        },
        data: {
          status: 'failed',
          error: 'Deploy exceeded 30 minute watchdog timeout — gateway may have crashed mid-deploy',
        },
      });
      if (result.count > 0) {
        console.warn(`[watchdog] marked ${result.count} stuck canvas deployments as failed`);
      }
    } catch (err: any) {
      console.error('Cron: stuck canvas deployment detection error:', err.message);
    }
  });

  // DB-5: Daily at 4am: delete webhook delivery records older than 7 days
  cron.schedule('0 4 * * *', async () => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const result = await prisma.webhookDelivery.deleteMany({
        where: { created_at: { lt: sevenDaysAgo } },
      });
      if (result.count > 0) {
        console.log(`Pruned ${result.count} old webhook delivery records`);
      }
    } catch (err: any) {
      console.error('Cron: webhook delivery prune error:', err.message);
    }
  });

  console.log('Cron jobs started');
}
