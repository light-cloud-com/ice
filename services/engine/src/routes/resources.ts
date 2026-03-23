/**
 * Resource Routes — Serves high-level resource definitions from core engine
 *
 * GET /api/resources/categories
 * GET /api/resources/all
 * GET /api/resources/category/:categoryId
 * GET /api/resources/search?q=
 * GET /api/resources/low-level/:highLevelId
 */

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import * as resourceService from '../services/resource.service';

const router: RouterType = Router();

router.get('/categories', async (_req: Request, res: Response) => {
  try {
    res.json(await resourceService.getCategories());
  } catch (err: any) {
    console.error('Resource categories error:', err.message);
    res.json([]);
  }
});

router.get('/all', async (_req: Request, res: Response) => {
  try {
    res.json(await resourceService.getAll());
  } catch (err: any) {
    console.error('Resource all error:', err.message);
    res.json([]);
  }
});

router.get('/category/:categoryId', async (req: Request, res: Response) => {
  try {
    res.json(await resourceService.getByCategory(req.params.categoryId as string));
  } catch (err: any) {
    console.error('Resource category error:', err.message);
    res.json([]);
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string) || '';
    res.json(await resourceService.search(q));
  } catch (err: any) {
    console.error('Resource search error:', err.message);
    res.json([]);
  }
});

router.get('/low-level/:highLevelId', async (req: Request, res: Response) => {
  try {
    res.json(await resourceService.getLowLevel(req.params.highLevelId as string));
  } catch (err: any) {
    console.error('Resource low-level error:', err.message);
    res.json([]);
  }
});

export default router;
