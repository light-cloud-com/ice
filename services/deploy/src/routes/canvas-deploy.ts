/**
 * Canvas Deploy Routes — Real deployment via deploy.service.ts
 *
 * POST /api/canvas/deploy/plan — Generate deployment plan
 * POST /api/canvas/deploy/apply — Execute deployment
 * POST /api/canvas/deploy/destroy — Tear down deployment
 * GET  /api/canvas/deploy/status/:deploymentId
 * GET  /api/canvas/deploy/resources/:cardId
 * GET  /api/canvas/deploy/history/:cardId
 */

import { requireAuth, requireProjectAccess, type AuthRequest } from '@ice/shared';
import { Router, type Router as RouterType, type Response } from 'express';
import * as deployService from '../services/deploy.service';
import * as deployEventLog from '../services/deploy-event-log.js';
import { cleanupOrphanedIceResources } from '../services/orphan-cleanup.service.js';
import { resolveForCard, loadPersistedStatuses } from '../services/requirements.service.js';

const router: RouterType = Router();
router.use(requireAuth);

router.post('/plan', requireProjectAccess('editor'), async (req: AuthRequest, res: Response) => {
  try {
    const { cardId, nodes, edges, options } = req.body;
    const result = await deployService.planDeployment(cardId, nodes, edges, options, req.userId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/apply', requireProjectAccess('owner'), async (req: AuthRequest, res: Response) => {
  // Phase 3: deployments can run 15–20 minutes for SQL instances, GKE clusters,
  // and large Cloud Build pipelines. 10 minutes wasn't enough; raising the
  // request timeout to 30 minutes covers the P99 case. True async execution
  // via a job queue lives in Phase 5.
  req.setTimeout(30 * 60 * 1000);
  res.setTimeout(30 * 60 * 1000);
  try {
    const { cardId, nodes, edges, options } = req.body;
    const result = await deployService.applyDeployment(cardId, nodes, edges, options, req.organisationId!, req.userId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/destroy', requireProjectAccess('owner'), async (req: AuthRequest, res: Response) => {
  req.setTimeout(30 * 60 * 1000);
  res.setTimeout(30 * 60 * 1000);
  try {
    const { cardId } = req.body;
    const result = await deployService.destroyDeployment(cardId, req.organisationId!, req.userId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Destroy ALL historical resources for this card — the "nuke everything
 * ICE has ever deployed for this project" action. Used when a normal
 * destroy can't find the failed-deploy leftovers, or when the user hits
 * GCP quota limits from accumulated orphans and wants a clean slate.
 */
router.post('/destroy-all', requireProjectAccess('owner'), async (req: AuthRequest, res: Response) => {
  req.setTimeout(30 * 60 * 1000);
  res.setTimeout(30 * 60 * 1000);
  try {
    const { cardId, gcpProject } = req.body;
    if (!cardId) return res.status(400).json({ success: false, error: 'cardId required' });
    const result = await deployService.destroyAllForCard(cardId, req.organisationId!, req.userId, {
      gcpProject,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Scan the org's GCP project for ICE-managed resources that are no
 * longer referenced by any active card, and delete them. Unblocks users
 * who have hit GCP quotas (most commonly the 3-backend-bucket default)
 * after iterating on the same template multiple times. Pass `?dry_run=1`
 * to preview without deleting.
 *
 * Not scoped to a specific card because orphans by definition aren't
 * attached to any card.
 */
router.post('/cleanup-orphans', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.organisationId) {
      return res.status(400).json({ success: false, error: 'No organisation context. Please re-login.' });
    }
    const gcpProject = (req.body?.gcpProject as string | undefined) || undefined;
    const dryRun = req.query.dry_run === '1' || req.body?.dryRun === true;
    const report = await cleanupOrphanedIceResources(req.organisationId, gcpProject, { dryRun });
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/cancel', requireProjectAccess('owner'), async (req: AuthRequest, res: Response) => {
  try {
    const { cardId } = req.body;
    if (!cardId) return res.status(400).json({ success: false, error: 'cardId is required' });
    const cancelled = deployService.requestDeployCancel(cardId);
    res.json({ success: true, cancelled });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/rollback', requireProjectAccess('owner'), async (req: AuthRequest, res: Response) => {
  req.setTimeout(30 * 60 * 1000);
  res.setTimeout(30 * 60 * 1000);
  try {
    const { deploymentId, cardId } = req.body;
    if (!deploymentId || !cardId) {
      return res.status(400).json({ success: false, error: 'deploymentId and cardId are required' });
    }
    const result = await deployService.rollbackDeployment(deploymentId, cardId, req.organisationId!, req.userId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/status/:deploymentId', async (req: AuthRequest, res: Response) => {
  const deployment = await deployService.getDeploymentStatus(req.params.deploymentId as string);
  if (!deployment) return res.status(404).json({ message: 'Deployment not found' });
  res.json(deployment);
});

router.post('/requirements', requireProjectAccess('viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const { cardId, nodes, options } = req.body;
    if (!cardId || !nodes) {
      return res.status(400).json({ success: false, error: 'cardId and nodes are required' });
    }
    const result = await resolveForCard({
      cardId,
      nodes,
      environment: options?.environment || 'development',
      orgId: req.organisationId!,
      gcpProject: options?.gcpProject,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/requirements/:cardId', requireProjectAccess('viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const environment = (req.query.environment as string) || 'development';
    const persisted = await loadPersistedStatuses(req.params.cardId as string, environment);
    res.json({ success: true, persisted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/drift-check', requireProjectAccess('viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const { cardId, nodes, environment } = req.body;
    if (!cardId || !nodes) {
      return res.status(400).json({ success: false, error: 'cardId and nodes are required' });
    }
    const result = await deployService.checkDrift(cardId, nodes, {
      environment: environment || 'development',
      orgId: req.organisationId,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/resources/:cardId', requireProjectAccess('viewer'), async (req: AuthRequest, res: Response) => {
  const resources = await deployService.getDeployedResources(req.params.cardId as string);
  res.json({ success: true, resources });
});

/**
 * Current in-flight deploy snapshot — used by any tab/window opening the
 * project mid-deploy to hydrate its deploy panel + canvas overlay without
 * having to wait for the next socket event.
 *
 * Fallback chain:
 *   1. In-memory snapshot (hot path, every active deploy).
 *   2. Persisted `CanvasDeployment.snapshot` column (survives gateway
 *      restart — the throttled writer in `deploy.service.ts` upserts
 *      this on every state transition).
 *   3. Most-recent 'deploying' / 'planning' row, reconstructed from
 *      the plain columns (last-resort: shows the user the deploy is
 *      still in flight even if we lost the snapshot entirely).
 */
router.get('/current/:cardId', requireProjectAccess('viewer'), async (req: AuthRequest, res: Response) => {
  const cardId = req.params.cardId as string;
  const snapshot = deployService.getCurrentDeploySnapshot(cardId);
  if (snapshot) {
    return res.json({ success: true, snapshot });
  }
  try {
    const latest = await deployService.getDeploymentHistory(cardId, { limit: 10 });
    const active = (latest as any[]).find(
      (d) => d.status === 'deploying' || d.status === 'planning',
    );
    if (active) {
      if (active.snapshot) {
        return res.json({ success: true, snapshot: active.snapshot });
      }
      return res.json({
        success: true,
        snapshot: {
          cardId,
          status: active.status,
          progress: 0,
          deploymentId: active.id,
          startedAt: active.created_at,
          updatedAt: active.updated_at,
          nodeStatuses: {},
        },
      });
    }
  } catch {}
  res.json({ success: true, snapshot: null });
});

/**
 * Event replay tape for a deploy. Returns every event recorded for the
 * most-recent deployment of the card with `seq > since`. The client uses
 * this on mount and on reconnect to catch up to the live state without
 * losing any intermediate log lines.
 *
 * Query params:
 *   - since: seq number to resume from (default 0 — full replay)
 *   - deployment_id: optionally target a specific deployment instead of
 *     the latest. Useful for history-view detail expansion.
 */
router.get('/stream/:cardId', requireProjectAccess('viewer'), async (req: AuthRequest, res: Response) => {
  const cardId = req.params.cardId as string;
  const since = Number(req.query.since || 0) || 0;
  const explicitDeploymentId = typeof req.query.deployment_id === 'string' ? req.query.deployment_id : null;

  try {
    const deploymentId = explicitDeploymentId || (await deployEventLog.findLatestDeploymentId(cardId));
    if (!deploymentId) {
      return res.json({ success: true, events: [], latestSeq: 0, deploymentId: null });
    }
    const { events, latestSeq } = await deployEventLog.loadDeployEvents(deploymentId, since);
    // DR-O1: event log is now retained longer than the deployment metadata.
    // If the deployment row was pruned but the events still exist, or if
    // both were pruned (empty result, deploymentId survived via client),
    // tell the client so it can show "events pruned" rather than a silent
    // empty list that looks like a UI bug.
    const deploymentExists = await deployService.getDeploymentStatus(deploymentId);
    const isPruned = !deploymentExists && events.length === 0;
    res.json({ success: true, deploymentId, events, latestSeq, isPruned });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Per-node deploy overlay — read-time projection of the latest successful
 * deployment's outputs onto each canvas node. The frontend calls this on
 * card load to hydrate block status/outputs without depending on live
 * socket events, so a user opening the project in a fresh tab immediately
 * sees URLs, domains, and deploy status on the blocks.
 */
router.get('/node-outputs/:cardId', requireProjectAccess('viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const environment = (req.query.environment as string) || 'development';
    const overlay = await deployService.getNodeDeploymentOverlay(req.params.cardId as string, environment);
    res.json({ success: true, overlay });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/history/:cardId', requireProjectAccess('viewer'), async (req: AuthRequest, res: Response) => {
  const { environment, action_type, limit } = req.query;
  const deployments = await deployService.getDeploymentHistory(req.params.cardId as string, {
    environment: typeof environment === 'string' ? environment : undefined,
    actionType:
      action_type === 'plan' || action_type === 'apply' || action_type === 'destroy' || action_type === 'rollback'
        ? action_type
        : undefined,
    limit: typeof limit === 'string' ? Number(limit) : undefined,
  });
  res.json(deployments);
});

export default router;
