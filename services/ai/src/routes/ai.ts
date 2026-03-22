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

import { Router, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireAuth, type AuthRequest } from '@ice/shared';
import { processCanvasIntent, streamCanvasIntent } from '../services/ai.service';
import { validateCanvas } from '../services/canvas-validation.service';
import { dryRunDeploy } from '../services/deploy-dryrun.service';
import { listAuditEntries, getAuditEntry } from '../services/ai-audit.service';
import prisma from '@ice/db';
import type { AiCanvasIntentRequest } from '@ice/types';

const router = Router();

// AI-specific rate limiter: 10 requests per minute per user
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req: AuthRequest) => req.userId || req.ip || 'unknown',
  message: { message: 'Too many AI requests. Please wait a moment.' },
});

router.use(requireAuth);
router.use(aiLimiter);

// ── Canvas Intent ────────────────────────────────────────────────────────────

router.post('/canvas-intent', async (req: AuthRequest, res: Response) => {
  const { intent, canvasContext, cardId } = req.body as AiCanvasIntentRequest;

  if (!intent || typeof intent !== 'string') {
    return res.status(400).json({ message: 'Missing intent' });
  }

  if (!canvasContext) {
    return res.status(400).json({ message: 'Missing canvas context' });
  }

  // Check if ANTHROPIC_API_KEY is configured
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ message: 'AI service not configured. Set ANTHROPIC_API_KEY.' });
  }

  try {
    // Check Accept header for SSE preference
    const wantsStream = req.headers.accept?.includes('text/event-stream');

    if (wantsStream) {
      await streamCanvasIntent(intent, canvasContext, res);
    } else {
      const result = await processCanvasIntent(intent, canvasContext);
      res.json(result);
    }
  } catch (err: any) {
    console.error('AI canvas-intent error:', err);
    res.status(500).json({ message: err.message || 'AI processing failed' });
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

router.get('/audit/list', async (_req: AuthRequest, res: Response) => {
  try {
    const entries = await listAuditEntries();
    res.json({ entries });
  } catch (err: any) {
    console.error('Audit list error:', err);
    res.status(500).json({ message: err.message || 'Failed to list audit entries' });
  }
});

router.get('/audit/:id', async (req: AuthRequest, res: Response) => {
  try {
    const entry = await getAuditEntry(req.params.id as string);
    if (!entry) {
      return res.status(404).json({ message: 'Audit entry not found' });
    }
    res.json(entry);
  } catch (err: any) {
    console.error('Audit get error:', err);
    res.status(500).json({ message: err.message || 'Failed to get audit entry' });
  }
});

// ── Inspect ──────────────────────────────────────────────────────────────────

router.get('/inspect/:cardId/summary', async (req: AuthRequest, res: Response) => {
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

router.get('/inspect/:cardId/state', async (req: AuthRequest, res: Response) => {
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
