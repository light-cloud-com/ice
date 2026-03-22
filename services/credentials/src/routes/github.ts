/**
 * GitHub Integration Routes — Real implementation via github.service.ts
 *
 * GET  /api/github/status — Check connection
 * GET  /api/github/user — Get connected user
 * POST /api/github/connect-pat — Connect with PAT
 * POST /api/github/device-flow/start — Start device flow
 * POST /api/github/device-flow/poll — Poll device flow
 * POST /api/github/disconnect — Disconnect
 * GET  /api/github/repos — List repos
 * GET  /api/github/repos/:owner/:repo/branches — List branches
 */

import { Router, type Response } from 'express';
import { requireAuth, type AuthRequest } from '@ice/shared';
import * as githubService from '../services/github.service';

const router = Router();
router.use(requireAuth);

router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const connected = await githubService.isConnected(req.userId!);
    res.json({ connected });
  } catch {
    res.json({ connected: false });
  }
});

router.get('/user', async (req: AuthRequest, res: Response) => {
  try {
    const user = await githubService.getStoredUser(req.userId!);
    res.json(user);
  } catch {
    res.json(null);
  }
});

router.post('/connect-pat', async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, error: 'Token is required' });
    const user = await githubService.connectWithPAT(req.userId!, token);
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/device-flow/start', async (_req: AuthRequest, res: Response) => {
  try {
    const response = await githubService.startDeviceFlow();
    res.json({ success: true, ...response });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/device-flow/poll', async (req: AuthRequest, res: Response) => {
  try {
    const { deviceCode, interval } = req.body;
    const user = await githubService.pollDeviceFlow(req.userId!, deviceCode, interval);
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/disconnect', async (req: AuthRequest, res: Response) => {
  try {
    await githubService.disconnect(req.userId!);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/repos', async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const repos = await githubService.listRepos(req.userId!, page);
    res.json({ success: true, repos });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/repos/:owner/:repo/branches', async (req: AuthRequest, res: Response) => {
  try {
    const owner = req.params.owner as string;
    const repo = req.params.repo as string;
    const branches = await githubService.listBranches(req.userId!, owner, repo);
    res.json({ success: true, branches });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
