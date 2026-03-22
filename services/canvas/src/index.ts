import { Router } from 'express';
import canvasRoutes from './routes/canvas.js';
import environmentRoutes from './routes/environment.js';
import projectMemberRoutes from './routes/project-members.js';
export * from './services/canvas.service.js';
export * from './services/canvas-validation.service.js';
export * from './services/environment.service.js';

export function createCanvasRouter(): Router {
  const router = Router();
  router.use('/canvas', canvasRoutes);
  router.use('/environments', environmentRoutes);
  router.use('/project-members', projectMemberRoutes);
  return router;
}
