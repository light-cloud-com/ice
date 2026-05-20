import { Router } from 'express';
import aiRoutes from './routes/ai';
import aiConversationRoutes from './routes/ai-conversations';
export * from './services/ai.service';

export function createAiRouter(): Router {
  const router = Router();
  router.use('/ai', aiRoutes);
  router.use('/ai', aiConversationRoutes);
  return router;
}
