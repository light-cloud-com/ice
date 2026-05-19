import { Router } from 'express';
import aiConversationRoutes from './routes/ai-conversations';
import aiRoutes from './routes/ai';
export * from './services/ai.service';

export function createAiRouter(): Router {
  const router = Router();
  router.use('/ai', aiRoutes);
  router.use('/ai', aiConversationRoutes);
  return router;
}
