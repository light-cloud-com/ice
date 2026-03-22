/**
 * Environment Routes — Canvas Branching
 *
 * POST /api/environments/list          List environments for a project
 * POST /api/environments/create        Create new environment (clones production)
 * POST /api/environments/update        Update environment name/region
 * POST /api/environments/delete        Delete environment + card
 * POST /api/environments/compare       Diff two environments
 * POST /api/environments/promote       Promote source → production
 * POST /api/environments/pr-previews   Toggle PR preview setting
 */

import { Router, type Response } from 'express';
import { requireAuth, type AuthRequest } from '@ice/shared';
import * as envService from '../services/environment.service';

const router = Router();
router.use(requireAuth);

router.post('/list', async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId required' });
    const environments = await envService.listEnvironments(projectId);
    res.json({ success: true, environments });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/create', async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, name, type, region } = req.body;
    if (!projectId || !name) {
      return res.status(400).json({ success: false, error: 'projectId and name required' });
    }
    const env = await envService.createEnvironment(projectId, req.userId!, name, type || 'development', region);
    res.json({ success: true, environment: env });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/update', async (req: AuthRequest, res: Response) => {
  try {
    const { envId, name, region } = req.body;
    if (!envId) return res.status(400).json({ success: false, error: 'envId required' });
    const env = await envService.updateEnvironment(envId, { name, region });
    res.json({ success: true, environment: env });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/delete', async (req: AuthRequest, res: Response) => {
  try {
    const { envId } = req.body;
    if (!envId) return res.status(400).json({ success: false, error: 'envId required' });
    await envService.deleteEnvironment(envId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/compare', async (req: AuthRequest, res: Response) => {
  try {
    const { sourceEnvId, targetEnvId } = req.body;
    if (!sourceEnvId || !targetEnvId) {
      return res.status(400).json({ success: false, error: 'sourceEnvId and targetEnvId required' });
    }
    const diff = await envService.compareEnvironments(sourceEnvId, targetEnvId);
    res.json({ success: true, diff });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/promote', async (req: AuthRequest, res: Response) => {
  try {
    const { sourceEnvId, targetEnvId } = req.body;
    if (!sourceEnvId || !targetEnvId) {
      return res.status(400).json({ success: false, error: 'sourceEnvId and targetEnvId required' });
    }
    await envService.promoteEnvironment(sourceEnvId, targetEnvId, req.userId!);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/pr-previews', async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, enabled } = req.body;
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId required' });
    await envService.togglePrPreviews(projectId, !!enabled);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
