/**
 * Cron Service — Scheduled maintenance tasks
 *
 * - Hourly: clean expired refresh tokens
 * - Daily: prune old deployment records (keep last 50 per card)
 * - Every 5 min: detect stuck deploy jobs
 */

import cron from 'node-cron';
import prisma from '@ice-saas/db';

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

  // Every day at 3am: prune old deployment records (keep last 50 per card)
  cron.schedule('0 3 * * *', async () => {
    try {
      const cards = await prisma.canvasDeployment.groupBy({
        by: ['card_id'],
        _count: true,
        having: { card_id: { _count: { gt: 50 } } },
      });

      for (const card of cards) {
        const toKeep = await prisma.canvasDeployment.findMany({
          where: { card_id: card.card_id },
          orderBy: { created_at: 'desc' },
          take: 50,
          select: { id: true },
        });
        const result = await prisma.canvasDeployment.deleteMany({
          where: {
            card_id: card.card_id,
            id: { notIn: toKeep.map((d) => d.id) },
          },
        });
        if (result.count > 0) {
          console.log(`Pruned ${result.count} old deployments for card ${card.card_id}`);
        }
      }
    } catch (err: any) {
      console.error('Cron: deployment prune error:', err.message);
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

  console.log('Cron jobs started');
}
