/**
 * Schema Routes — Serves ICE schema/resource data from core engine
 *
 * GET /api/schemas/categories
 * GET /api/schemas/query?q=&category=&provider=
 * GET /api/schemas/:iceType
 */

import { Router, type Request, type Response } from 'express';
import * as schemaService from '../services/schema.service';

const router = Router();

router.get('/categories', async (_req: Request, res: Response) => {
  try {
    res.json(await schemaService.getCategories());
  } catch (err: any) {
    console.error('Schema categories error:', err.message);
    res.json([
      { id: 'compute', name: 'Compute', icon: 'cpu', count: 0 },
      { id: 'network', name: 'Network', icon: 'globe', count: 0 },
      { id: 'data', name: 'Data', icon: 'database', count: 0 },
      { id: 'storage', name: 'Storage', icon: 'hard-drive', count: 0 },
      { id: 'security', name: 'Security', icon: 'shield', count: 0 },
      { id: 'monitoring', name: 'Monitoring', icon: 'activity', count: 0 },
      { id: 'messaging', name: 'Messaging', icon: 'message-square', count: 0 },
      { id: 'external', name: 'External', icon: 'external-link', count: 0 },
    ]);
  }
});

router.get('/query', async (req: Request, res: Response) => {
  try {
    const { q, category, provider } = req.query as Record<string, string>;
    res.json(await schemaService.querySchemas({ search: q, category, provider }));
  } catch (err: any) {
    console.error('Schema query error:', err.message);
    res.json([]);
  }
});

router.get('/:iceType', async (req: Request, res: Response) => {
  try {
    const schema = await schemaService.getSchema(req.params.iceType as string);
    if (!schema) return res.status(404).json({ message: 'Schema not found' });
    res.json(schema);
  } catch (err: any) {
    console.error('Schema get error:', err.message);
    res.json({ iceType: req.params.iceType, properties: {} });
  }
});

export default router;
