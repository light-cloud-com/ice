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

  // Every 5 min: detect *genuinely stalled* CanvasDeployment rows.
  //
  // The old watchdog killed everything in 'deploying' state once it
  // crossed 30 min from `created_at` — but Cloud SQL alone can take
  // 20+ min, so a sequential plan with two SQL instances would routinely
  // get nuked mid-flight even though the gateway was actively making
  // progress. The replacement uses the deploy_event tape as a heartbeat:
  //
  //   1. Candidate rows: status='deploying' AND created_at > 30 min ago.
  //   2. For each, look up the most recent deploy_event row.
  //   3. If the last event is < idle_threshold (5 min) old → still
  //      progressing — leave it alone.
  //   4. Otherwise → gateway actually died mid-deploy. Mark failed and
  //      include the last log line(s) so the user has a starting point
  //      instead of "may have crashed".
  cron.schedule('*/5 * * * *', async () => {
    try {
      const STALE_RUNTIME_MS = 30 * 60 * 1000;
      const IDLE_THRESHOLD_MS = 5 * 60 * 1000;
      const candidates = await prisma.canvasDeployment.findMany({
        where: {
          status: 'deploying',
          created_at: { lt: new Date(Date.now() - STALE_RUNTIME_MS) },
        },
        select: { id: true, created_at: true, card_id: true, environment: true },
      });

      let killed = 0;
      for (const dep of candidates) {
        // Most recent event for this deployment; if there's a brand-new
        // log line within IDLE_THRESHOLD_MS the deploy is still alive.
        const lastEvent = await prisma.deployEvent.findFirst({
          where: { deployment_id: dep.id },
          orderBy: { created_at: 'desc' },
          select: { created_at: true, type: true, payload: true },
        });
        const lastTs = lastEvent?.created_at ?? dep.created_at;
        const idleMs = Date.now() - lastTs.getTime();
        if (idleMs < IDLE_THRESHOLD_MS) {
          // Still emitting events — don't touch.
          continue;
        }

        // Pull the tail (last ~10 log/progress events) so the failure
        // message tells the user what was last happening before the
        // gateway went silent. Without this the user sees only the
        // generic watchdog text and has nowhere to look.
        const tailEvents = await prisma.deployEvent.findMany({
          where: { deployment_id: dep.id, type: { in: ['log', 'progress', 'resource_result'] } },
          orderBy: { created_at: 'desc' },
          take: 10,
          select: { type: true, payload: true, created_at: true },
        });
        const tailLines = tailEvents
          .reverse()
          .map((e) => {
            const p = (e.payload || {}) as Record<string, unknown>;
            const msg =
              (p.message as string) ||
              (typeof p.resource === 'string' && typeof p.status === 'string' ? `${p.status}: ${p.resource}` : '') ||
              ((p.result as { error?: string } | undefined)?.error ?? '') ||
              '';
            return msg ? `[${e.type}] ${msg}` : '';
          })
          .filter(Boolean);

        const ageMin = Math.round((Date.now() - dep.created_at.getTime()) / 60_000);
        const idleMin = Math.round(idleMs / 60_000);
        const header =
          `Deploy stopped emitting events ${idleMin}m ago (started ${ageMin}m ago). ` +
          `The gateway likely crashed or the active operation is wedged. ` +
          `Cancel + redeploy, or inspect the gateway logs for the failure.`;
        const body = tailLines.length > 0 ? `\n--- Last activity (${tailLines.length} events) ---\n${tailLines.join('\n')}` : '';

        await prisma.canvasDeployment.update({
          where: { id: dep.id },
          data: { status: 'failed', error: `${header}${body}` },
        });
        killed++;
      }

      if (killed > 0) {
        console.warn(`[watchdog] marked ${killed}/${candidates.length} stalled deployments as failed`);
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
