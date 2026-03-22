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

import { Router, type Response } from 'express';
import { requireAuth, requireProjectAccess, type AuthRequest } from '@ice/shared';
import * as deployService from '../services/deploy.service';

const router = Router();
router.use(requireAuth);

router.post('/plan', async (req: AuthRequest, res: Response) => {
  try {
    const { cardId, nodes, edges, options } = req.body;
    const result = await deployService.planDeployment(cardId, nodes, edges, options, req.userId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/apply', async (req: AuthRequest, res: Response) => {
  // Deployments can take several minutes (container builds, API enabling, etc.)
  req.setTimeout(10 * 60 * 1000); // 10 minutes
  res.setTimeout(10 * 60 * 1000);
  try {
    const { cardId, nodes, edges, options } = req.body;
    const result = await deployService.applyDeployment(cardId, nodes, edges, options, req.organisationId!, req.userId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/destroy', async (req: AuthRequest, res: Response) => {
  req.setTimeout(10 * 60 * 1000);
  res.setTimeout(10 * 60 * 1000);
  try {
    const { cardId } = req.body;
    const result = await deployService.destroyDeployment(cardId, req.organisationId!, req.userId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/status/:deploymentId', async (req: AuthRequest, res: Response) => {
  const deployment = await deployService.getDeploymentStatus(req.params.deploymentId as string);
  if (!deployment) return res.status(404).json({ message: 'Deployment not found' });
  res.json(deployment);
});

router.get('/resources/:cardId', requireProjectAccess('viewer'), async (req: AuthRequest, res: Response) => {
  const resources = await deployService.getDeployedResources(req.params.cardId as string);
  res.json({ success: true, resources });
});

router.get('/history/:cardId', requireProjectAccess('viewer'), async (req: AuthRequest, res: Response) => {
  const deployments = await deployService.getDeploymentHistory(req.params.cardId as string);
  res.json(deployments);
});

export default router;
