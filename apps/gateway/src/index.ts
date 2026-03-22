/**
 * ICE Gateway — API Entry Point
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

import { setupSocketService } from '@ice/shared';
import { createIamRouter, configurePassportOAuth } from '@ice/service-iam';
import { createCanvasRouter } from '@ice/service-canvas';
import { createDeployRouter, startDeployWorker, startCronJobs } from '@ice/service-deploy';
import { createAiRouter } from '@ice/service-ai';
import { createEngineRouter } from '@ice/service-engine';
import { createCredentialsRouter } from '@ice/service-credentials';
import { createBillingRouter } from '@ice/service-billing';

const app = express();
const httpServer = createServer(app);

const PORT = parseInt(process.env.PORT || '5001', 10);

// BE-13: Parse and validate CORS origins once at startup
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// ─── Socket.IO ──────────────────────────────────────────────────────────────

const io = new SocketServer(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  },
});

setupSocketService(io);

// ─── Middleware ──────────────────────────────────────────────────────────────

// BE-14: Scoped CSP for API gateway — no inline scripts needed
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
);
app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  }),
);
app.use(cookieParser());

// Stripe webhook needs raw body for signature verification — mount before express.json()
app.use('/api/billing/webhook/stripe', express.raw({ type: 'application/json' }));

// GitHub webhook needs raw body for HMAC verification — mount before express.json()
app.use('/api/webhooks/github', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));

// BE-8: Key by userId when authenticated, fall back to IP for anonymous requests
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).userId || req.ip || 'unknown';
  },
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
createBillingRouter().then((r) => app.use('/api', r));

// ─── Desktop Mode: serve web app static files ──────────────────────────────

if (process.env.ICE_DESKTOP === 'true') {
  const { join } = await import('path');
  const { fileURLToPath } = await import('url');
  const _dirname = join(fileURLToPath(import.meta.url), '..');
  const webDistPath = join(_dirname, '../../web/dist');

  const { existsSync } = await import('fs');
  if (existsSync(webDistPath)) {
    app.use(express.static(webDistPath));

    // SPA fallback — serve index.html for all non-API routes
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(join(webDistPath, 'index.html'));
    });
    console.log('[desktop] Serving web app from', webDistPath);
  } else {
    console.log('[desktop] No web dist found — renderer loads from Vite dev server');
  }
}

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

// ─── Graceful Shutdown ─────────────────────────────────────────────────────

function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down gracefully...`);

  // Stop accepting new connections
  httpServer.close(() => {
    console.log('HTTP server closed');
  });

  // Close Socket.IO connections
  io.close(() => {
    console.log('Socket.IO closed');
  });

  // Give in-flight requests time to complete (30s timeout)
  setTimeout(() => {
    console.log('Shutdown timeout — forcing exit');
    process.exit(1);
  }, 30_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { io };
