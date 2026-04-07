/**
 * ICE Gateway — Community Edition
 *
 * Composes all service routers into a single Express app.
 * Auto-seeds a local user on startup — no login required.
 */

import 'dotenv/config';
import { createServer } from 'http';
import { startLocalAiServer, stopLocalAiServer } from '@ice/ai';
import { createAiRouter } from '@ice/service-ai';
import { createCanvasRouter } from '@ice/service-canvas';
import { createCredentialsRouter } from '@ice/service-credentials';
import { createDeployRouter, startDeployWorker, startCronJobs } from '@ice/service-deploy';
import { createEngineRouter } from '@ice/service-engine';
import { createIamRouter } from '@ice/service-iam';
import { setupSocketService, setDesktopUser } from '@ice/shared';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { Server as SocketServer } from 'socket.io';

const app = express();
const httpServer = createServer(app);

const PORT = parseInt(process.env.PORT || '5001', 10);

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

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws://localhost:*', 'http://localhost:*'],
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

// GitHub webhook needs raw body for HMAC verification — mount before express.json()
app.use('/api/webhooks/github', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));

const isDevOrTest = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDevOrTest ? 1000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).userId || req.ip || 'unknown';
  },
});
app.use(limiter);

// ─── Health ─────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── System Stats (CPU / RAM for all ICE processes) ────────────────────────

import { execSync } from 'child_process';

/** Collect all descendant PIDs of our process */
function getTreePids(): number[] {
  const rootPid = process.pid;
  try {
    const out = execSync('ps -e -o pid=,ppid=', { timeout: 3000, encoding: 'utf-8' });
    const childrenOf = new Map<number, number[]>();
    for (const line of out.trim().split('\n')) {
      const [pidStr, ppidStr] = line.trim().split(/\s+/);
      const pid = parseInt(pidStr),
        ppid = parseInt(ppidStr);
      if (!childrenOf.has(ppid)) childrenOf.set(ppid, []);
      childrenOf.get(ppid)!.push(pid);
    }
    const pids: number[] = [];
    const queue = [rootPid];
    while (queue.length > 0) {
      const pid = queue.pop()!;
      pids.push(pid);
      for (const child of childrenOf.get(pid) || []) queue.push(child);
    }
    return pids;
  } catch {
    return [rootPid];
  }
}

/** Get RSS (KB) for a list of PIDs — snapshot, always accurate */
function getRssForPids(pids: number[]): number {
  try {
    const out = execSync(`ps -o rss= -p ${pids.join(',')}`, { timeout: 3000, encoding: 'utf-8' });
    return out
      .trim()
      .split('\n')
      .reduce((sum, l) => sum + (parseInt(l.trim()) || 0), 0);
  } catch {
    return 0;
  }
}

import { cpus } from 'os';
const NUM_CPUS = cpus().length || 1;

/** Get CPU% for a list of PIDs — ps reports per-core %, so divide by core count */
function getCpuForPids(pids: number[]): number {
  try {
    const out = execSync(`ps -o %cpu= -p ${pids.join(',')}`, { timeout: 3000, encoding: 'utf-8' });
    const perCore = out
      .trim()
      .split('\n')
      .reduce((sum, l) => sum + (parseFloat(l.trim()) || 0), 0);
    return perCore / NUM_CPUS;
  } catch {
    return 0;
  }
}

let cpuPercent = 0;

// Sample CPU every 5 seconds, smooth with exponential moving average
setInterval(() => {
  const pids = getTreePids();
  const raw = getCpuForPids(pids);
  cpuPercent = cpuPercent === 0 ? raw : raw * 0.4 + cpuPercent * 0.6;
}, 5000);

app.get('/api/system/stats', (_req, res) => {
  const pids = getTreePids();
  const rssKb = getRssForPids(pids);
  res.json({
    ram: Math.round(rssKb / 1024),
    cpu: Math.round(cpuPercent * 10) / 10,
  });
});

// ─── Service Routers ────────────────────────────────────────────────────────

app.use('/api', createIamRouter());
app.use('/api', createCanvasRouter());
app.use('/api', createDeployRouter());
app.use('/api', createAiRouter());
app.use('/api', createEngineRouter());
app.use('/api', createCredentialsRouter());

// ─── Auto-seed local user & serve web app ───────────────────────────────────

{
  const { join } = await import('path');
  const { fileURLToPath } = await import('url');
  const _dirname = join(fileURLToPath(import.meta.url), '..');
  const webDistPath = process.env.ICE_WEB_DIST_PATH || join(_dirname, '../../web/dist');

  // Community edition: auto-create local user (no login required)
  try {
    const { default: prisma } = await import('@ice/db');

    let user = await prisma.user.findFirst();
    if (!user) {
      const org = await prisma.organisation.create({ data: { name: 'Local' } });
      user = await prisma.user.create({
        data: {
          name: 'Local User',
          email: 'user@ice.local',
          password_hash: '@@local@@',
          organisation_id: org.id,
        },
      });
      await prisma.organisationMember.create({
        data: { user_id: user.id, organisation_id: org.id, role: 'owner' },
      });
      console.log('[gateway] Created local user:', user.id);
    } else {
      console.log('[gateway] Existing user:', user.id);
    }
    setDesktopUser(user.id, user.organisation_id || '');
  } catch (seedErr: any) {
    console.error('[gateway] User seed error:', seedErr.message);
  }

  const { existsSync } = await import('fs');
  if (existsSync(webDistPath)) {
    app.use(express.static(webDistPath));

    // SPA fallback — serve index.html for all non-API routes
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(join(webDistPath, 'index.html'));
    });
    console.log('[gateway] Serving web app from', webDistPath);
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
  console.log(`ICE Community gateway running on port ${PORT}`);

  // Start background services (non-blocking)
  startDeployWorker();
  startCronJobs();

  // Start local AI server if configured — non-blocking
  // Only starts when ICE_AI_PROVIDER is set to 'openai-compat' with a local URL
  startLocalAiServer().catch((err: Error) => {
    console.warn('[ICE AI] Auto-start failed:', err.message || err);
  });
});

// ─── Graceful Shutdown ─────────────────────────────────────────────────────

function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down gracefully...`);

  // Stop local AI server if we started it
  stopLocalAiServer().catch(() => {});

  httpServer.close(() => {
    console.log('HTTP server closed');
  });

  io.close(() => {
    console.log('Socket.IO closed');
  });

  setTimeout(() => {
    console.log('Shutdown timeout — forcing exit');
    process.exit(1);
  }, 30_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { io };
