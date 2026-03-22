/**
 * ICE SaaS Gateway — API Entry Point
 *
 * Composes all service routers into a single Express app with
 * shared middleware, Socket.IO, rate limiting, and Passport OAuth.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { rateLimit } from 'express-rate-limit';

import { setupSocketService } from '@ice-saas/shared';
import { createIamRouter, configurePassportOAuth } from '@ice-saas/service-iam';
import { createCanvasRouter } from '@ice-saas/service-canvas';
import { createDeployRouter, startDeployWorker, startCronJobs } from '@ice-saas/service-deploy';
import { createAiRouter } from '@ice-saas/service-ai';
import { createEngineRouter } from '@ice-saas/service-engine';
import { createCredentialsRouter } from '@ice-saas/service-credentials';
import { createBillingRouter } from '@ice-saas/service-billing';

const app = express();
const httpServer = createServer(app);

const PORT = parseInt(process.env.PORT || '5001', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ─── Socket.IO ──────────────────────────────────────────────────────────────

const io = new SocketServer(httpServer, {
  cors: {
    origin: FRONTEND_URL.split(','),
    credentials: true,
  },
});

setupSocketService(io);

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: FRONTEND_URL.split(','),
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ─── Passport OAuth ─────────────────────────────────────────────────────────

app.use(passport.initialize());
configurePassportOAuth();

// ─── Health ─────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Service Routers ────────────────────────────────────────────────────────

app.use('/api', createIamRouter());
app.use('/api', createCanvasRouter());
app.use('/api', createDeployRouter());
app.use('/api', createAiRouter());
app.use('/api', createEngineRouter());
app.use('/api', createCredentialsRouter());
app.use('/api', createBillingRouter());

// ─── Error handler ──────────────────────────────────────────────────────────

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
  });
});

// ─── Start ──────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`ICE SaaS gateway running on port ${PORT}`);

  // Start background services (non-blocking)
  startDeployWorker();
  startCronJobs();
});

export { io };
