import { Router } from 'express';
import canvasRoutes from './routes/canvas';
import environmentRoutes from './routes/environment';
import projectMemberRoutes from './routes/project-members';
export * from './services/canvas.service';
export * from './services/canvas-validation.service';
export * from './services/environment.service';

export function createCanvasRouter(): Router {
  const router = Router();
  router.use('/canvas', canvasRoutes);
  router.use('/environments', environmentRoutes);
  router.use('/project-members', projectMemberRoutes);
  return router;
}
