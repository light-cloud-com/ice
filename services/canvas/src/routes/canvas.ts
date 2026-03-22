/**
 * Canvas Routes — CRUD for folders, projects, and cards
 *
 * POST /api/canvas/projects         — List projects/folders in org
 * POST /api/canvas/projects/create  — Create project or folder
 * POST /api/canvas/projects/get     — Get project with cards
 * POST /api/canvas/projects/update  — Update project/folder name
 * POST /api/canvas/projects/delete  — Delete project/folder (recursive)
 * POST /api/canvas/projects/move    — Move project/folder to different parent
 * POST /api/canvas/cards/create     — Create card in project
 * POST /api/canvas/cards/get        — Get card
 * POST /api/canvas/cards/update     — Update card (full node/edge sync)
 * POST /api/canvas/cards/delete     — Delete card
 */

import { Router, type Response } from 'express';
import { requireAuth, requireProjectAccess, type AuthRequest } from '@ice-saas/shared';
import * as canvasService from '../services/canvas.service';
import { grantCreatorAccess } from '@ice-saas/service-iam';

const router = Router();
router.use(requireAuth);

function getOrgId(req: AuthRequest): string {
  return req.body?.organisationId || req.organisationId || '';
}

// ── Projects & Folders ──────────────────────────────────────────────────────

router.post('/projects', async (req: AuthRequest, res: Response) => {
  const orgId = getOrgId(req);
  const { parentId, search } = req.body;
  const projects = await canvasService.listProjects(orgId, parentId, search);
  res.json(projects);
});

router.post('/projects/create', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, type, parentId } = req.body;
    const project = await canvasService.createProject(getOrgId(req), req.userId!, name, type, parentId, description);

    // Auto-grant creator as project owner
    if (type !== 'folder') {
      await grantCreatorAccess(project.id, req.userId!);
    }

    res.json(project);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/projects/get', requireProjectAccess('viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const project = await canvasService.getProject(req.body.projectId);
    res.json(project);
  } catch {
    res.status(404).json({ message: 'Project not found' });
  }
});

router.post('/projects/update', requireProjectAccess('editor'), async (req: AuthRequest, res: Response) => {
  const { projectId, name, description, provider, region } = req.body;
  const result = await canvasService.updateProject(projectId, { name, description, provider, region });
  res.json(result);
});

router.post('/projects/delete', requireProjectAccess('owner'), async (req: AuthRequest, res: Response) => {
  try {
    await canvasService.deleteProject(req.body.projectId, getOrgId(req));
    res.json({ success: true });
  } catch {
    res.status(500).json({ message: 'Failed to delete' });
  }
});

router.post('/projects/move', requireProjectAccess('owner'), async (req: AuthRequest, res: Response) => {
  try {
    await canvasService.moveProject(req.body.projectId, req.body.parentId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// ── Cards ───────────────────────────────────────────────────────────────────

router.post('/cards/create', requireProjectAccess('editor'), async (req: AuthRequest, res: Response) => {
  const { name, projectId } = req.body;
  const card = await canvasService.createCard(projectId, getOrgId(req), req.userId!, name);
  res.json(card);
});

router.post('/cards/get', async (req: AuthRequest, res: Response) => {
  try {
    const card = await canvasService.getCard(req.body.cardId);
    res.json(card);
  } catch {
    res.status(404).json({ message: 'Card not found' });
  }
});

router.post('/cards/update', requireProjectAccess('editor'), async (req: AuthRequest, res: Response) => {
  try {
    const { cardId, name, nodes, edges, viewport } = req.body;
    const card = await canvasService.updateCard(cardId, { name, nodes, edges, viewport });
    res.json(card);
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ message: 'Card not found' });
    } else {
      res.status(500).json({ message: err.message || 'Update failed' });
    }
  }
});

router.post('/cards/delete', requireProjectAccess('editor'), async (req: AuthRequest, res: Response) => {
  await canvasService.deleteCard(req.body.cardId);
  res.json({ success: true });
});

export default router;
