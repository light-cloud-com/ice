/**
 * AI Routes
 *
 * POST /api/ai/canvas-intent   — Process natural language canvas intent
 * POST /api/ai/validate        — Validate canvas JSON against schemas
 * POST /api/ai/dryrun          — Deploy dry-run (no credentials)
 * GET  /api/ai/audit/list      — List recent audit entries
 * GET  /api/ai/audit/:id       — Get single audit entry
 * GET  /api/ai/inspect/:cardId/summary — Human-readable canvas summary
 * GET  /api/ai/inspect/:cardId/state   — Raw canvas JSON
 */

import prisma from '@ice/db';
import { requireAuth, requireProjectAccess, type AuthRequest } from '@ice/shared';
import { Router, type Router as RouterType, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { listAuditEntries, getAuditEntry } from '../services/ai-audit.service';
import { processCanvasIntent, streamCanvasIntent, getAiProvider } from '../services/ai.service';
import { validateCanvas } from '../services/canvas-validation.service';
import { dryRunDeploy } from '../services/deploy-dryrun.service';
import { diagnoseDeploy } from '../services/diagnose-deploy.service';
import type { AiCanvasIntentRequest, DiagnoseDeployRequest } from '@ice/types';

const router: RouterType = Router();

// Rate limiter only for AI generation requests (not health checks or read-only endpoints)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req: AuthRequest) => req.userId || req.ip || 'unknown',
  message: { message: 'Too many AI requests. Please wait a moment.' },
});

router.use(requireAuth);

// ── Health (no rate limit) ──────────────────────────────────────────────────

router.get('/health', async (_req: AuthRequest, res: Response) => {
  try {
    const provider = await getAiProvider();
    const health = await provider.healthCheck();
    res.json(health);
  } catch (err: any) {
    res.json({ ok: false, provider: 'unknown', error: err.message });
  }
});

// ── Canvas Intent ────────────────────────────────────────────────────────────

router.post('/canvas-intent', aiLimiter, async (req: AuthRequest, res: Response) => {
  const { intent, canvasContext, cardId } = req.body as AiCanvasIntentRequest;

  if (!intent || typeof intent !== 'string') {
    return res.status(400).json({ message: 'Missing intent' });
  }

  if (!canvasContext) {
    return res.status(400).json({ message: 'Missing canvas context' });
  }

  try {
    // Check Accept header for SSE preference
    const wantsStream = req.headers.accept?.includes('text/event-stream');

    if (wantsStream) {
      await streamCanvasIntent(intent, canvasContext, res, cardId);
    } else {
      const result = await processCanvasIntent(intent, canvasContext, cardId);
      res.json(result);
    }
  } catch (err: any) {
    console.error('AI canvas-intent error:', err);
    res.status(500).json({ message: err.message || 'AI processing failed' });
  }
});

// ── Diagnose Deploy (AI-Native #2) ───────────────────────────────────────────

router.post('/diagnose-deploy', aiLimiter, async (req: AuthRequest, res: Response) => {
  const body = req.body as DiagnoseDeployRequest;
  if (!body?.error || !body?.canvasContext) {
    return res.status(400).json({ message: 'Missing error or canvasContext' });
  }
  try {
    const result = await diagnoseDeploy(body);
    res.json(result);
  } catch (err: any) {
    console.error('AI diagnose-deploy error:', err);
    res.status(500).json({ message: err.message || 'Diagnosis failed' });
  }
});

// ── Validate ─────────────────────────────────────────────────────────────────

router.post('/validate', async (req: AuthRequest, res: Response) => {
  const { nodes, edges } = req.body;

  if (!Array.isArray(nodes)) {
    return res.status(400).json({ message: 'Missing or invalid nodes array' });
  }

  try {
    const result = await validateCanvas(nodes, edges || []);
    res.json(result);
  } catch (err: any) {
    console.error('Canvas validation error:', err);
    res.status(500).json({ message: err.message || 'Validation failed' });
  }
});

// ── Dry Run ──────────────────────────────────────────────────────────────────

router.post('/dryrun', async (req: AuthRequest, res: Response) => {
  const { nodes, edges, options } = req.body;

  if (!Array.isArray(nodes)) {
    return res.status(400).json({ message: 'Missing or invalid nodes array' });
  }

  try {
    const result = await dryRunDeploy(nodes, edges || [], options);
    res.json(result);
  } catch (err: any) {
    console.error('Deploy dry-run error:', err);
    res.status(500).json({ message: err.message || 'Dry-run failed' });
  }
});

// ── Audit ────────────────────────────────────────────────────────────────────

router.get('/audit/list', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organisationId;
    if (!orgId) {
      return res.status(400).json({ message: 'Organisation context required' });
    }
    const entries = await listAuditEntries(50, orgId);
    res.json({ entries });
  } catch (err: any) {
    console.error('Audit list error:', err);
    res.status(500).json({ message: err.message || 'Failed to list audit entries' });
  }
});

router.get('/audit/:id', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organisationId;
    if (!orgId) {
      return res.status(400).json({ message: 'Organisation context required' });
    }
    const entry = await getAuditEntry(req.params.id as string);
    if (!entry) {
      return res.status(404).json({ message: 'Audit entry not found' });
    }
    // Verify audit entry belongs to the requesting user's org
    const row = await prisma.aiAuditLog.findUnique({
      where: { id: req.params.id as string },
      select: { organisation_id: true },
    });
    if (row?.organisation_id && row.organisation_id !== orgId) {
      return res.status(404).json({ message: 'Audit entry not found' });
    }
    res.json(entry);
  } catch (err: any) {
    console.error('Audit get error:', err);
    res.status(500).json({ message: err.message || 'Failed to get audit entry' });
  }
});

// ── Inspect ──────────────────────────────────────────────────────────────────

router.get('/inspect/:cardId/summary', requireProjectAccess('viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const card = await prisma.canvasCard.findUnique({
      where: { id: req.params.cardId as string },
    });

    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    const nodes = (card.nodes as any[]) || [];
    const edges = (card.edges as any[]) || [];

    const nodeLines = nodes.map((n: any, i: number) => {
      const label = n.data?.label || n.label || 'Untitled';
      const iceType = n.data?.iceType || n.iceType || 'unknown';
      const provider = n.data?.provider || n.provider || '?';
      return `  ${i + 1}. "${label}" [${iceType}] (${provider}) - id: ${n.id}`;
    });

    const edgeLines = edges.map((e: any) => {
      const relationship = e.data?.relationship || e.relationship || '?';
      return `  - ${e.source} → ${e.target} (${relationship})`;
    });

    const summary = [
      `Canvas: "${card.name}" (card ${card.id})`,
      `Nodes (${nodes.length}):`,
      nodeLines.length > 0 ? nodeLines.join('\n') : '  (none)',
      `Connections (${edges.length}):`,
      edgeLines.length > 0 ? edgeLines.join('\n') : '  (none)',
    ].join('\n');

    res.type('text/plain').send(summary);
  } catch (err: any) {
    console.error('Inspect summary error:', err);
    res.status(500).json({ message: err.message || 'Failed to inspect card' });
  }
});

router.get('/inspect/:cardId/state', requireProjectAccess('viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const card = await prisma.canvasCard.findUnique({
      where: { id: req.params.cardId as string },
    });

    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    res.json({
      id: card.id,
      name: card.name,
      nodes: card.nodes,
      edges: card.edges,
      viewport: card.viewport,
    });
  } catch (err: any) {
    console.error('Inspect state error:', err);
    res.status(500).json({ message: err.message || 'Failed to get card state' });
  }
});

export default router;
