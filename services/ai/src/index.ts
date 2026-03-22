import { Router } from 'express';
import aiRoutes from './routes/ai.js';
import aiConversationRoutes from './routes/ai-conversations.js';
export * from './services/ai.service.js';

export function createAiRouter(): Router {
  const router = Router();
  router.use('/ai', aiRoutes);
  router.use('/ai', aiConversationRoutes);
  return router;
}
