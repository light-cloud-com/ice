/**
 * Pipeline Routes — CRUD for deployment rules + framework detection
 *
 * GET    /api/pipeline/rules/:cardId/:nodeId     — List rules for a node
 * POST   /api/pipeline/rules                      — Create a rule
 * PUT    /api/pipeline/rules/:ruleId              — Update a rule
 * DELETE /api/pipeline/rules/:ruleId              — Delete a rule
 * GET    /api/pipeline/events/:cardId/:nodeId     — List deployment events for a node
 * POST   /api/pipeline/detect-framework           — Detect framework from repo
 * POST   /api/pipeline/trigger                    — Manual deploy trigger
 */

import { requireAuth, requireProjectAccess, type AuthRequest } from '@ice/shared';
import { Router, type Router as RouterType, type Response } from 'express';
import * as pipelineService from '../services/pipeline.service';

const router: RouterType = Router();
router.use(requireAuth);

/**
 * Middleware: resolve ruleId → cardId so requireProjectAccess can check permissions.
 * Attaches cardId to req.body if not already present.
 */
async function resolveRuleToCard(req: AuthRequest, _res: Response, next: import('express').NextFunction) {
  const ruleId = req.params.ruleId || req.body?.ruleId;
  if (ruleId && !req.body?.cardId) {
    const prisma = (await import('@ice/db')).default;
    const rule = await prisma.deploymentRule.findUnique({ where: { id: ruleId }, select: { card_id: true } });
    if (rule) {
      if (!req.body) req.body = {};
      req.body.cardId = rule.card_id;
    }
  }
  next();
}

/**
 * Middleware: resolve eventId → cardId so requireProjectAccess can check permissions.
 */
async function resolveEventToCard(req: AuthRequest, _res: Response, next: import('express').NextFunction) {
  const eventId = req.body?.eventId;
  if (eventId && !req.body?.cardId) {
    const prisma = (await import('@ice/db')).default;
    const event = await prisma.deploymentEvent.findUnique({
      where: { id: eventId },
      select: { rule: { select: { card_id: true } } },
    });
    if (event?.rule) {
      req.body.cardId = event.rule.card_id;
    }
  }
  next();
}

// ─── Rules CRUD ─────────────────────────────────────────────────────────────

router.get('/rules/:cardId/:nodeId', requireProjectAccess('viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const rules = await pipelineService.getRulesForNode(req.params.cardId as string, req.params.nodeId as string);
    res.json({ success: true, rules });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/rules', requireProjectAccess('editor'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.body.cardId || !req.body.nodeId || !req.body.repository) {
      return res.status(400).json({
        success: false,
        error:
          `Missing required fields: ${!req.body.cardId ? 'cardId ' : ''}${!req.body.nodeId ? 'nodeId ' : ''}${!req.body.repository ? 'repository' : ''}`.trim(),
      });
    }
    if (!req.organisationId) {
      return res.status(400).json({ success: false, error: 'No organisation context. Please re-login.' });
    }
    const rule = await pipelineService.createRule(req.body, req.organisationId, req.userId!);
    res.json({ success: true, rule });
  } catch (err: any) {
    console.error('Pipeline rule creation failed:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

router.put(
  '/rules/:ruleId',
  resolveRuleToCard,
  requireProjectAccess('editor'),
  async (req: AuthRequest, res: Response) => {
    try {
      const rule = await pipelineService.updateRule(req.params.ruleId as string, req.body, req.organisationId!);
      res.json({ success: true, rule });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  },
);

router.delete(
  '/rules/:ruleId',
  resolveRuleToCard,
  requireProjectAccess('owner'),
  async (req: AuthRequest, res: Response) => {
    try {
      await pipelineService.deleteRule(req.params.ruleId as string, req.userId!, req.organisationId!);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  },
);

// ─── Deployment Events ──────────────────────────────────────────────────────

router.get('/events/:cardId/:nodeId', requireProjectAccess('viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const events = await pipelineService.getEventsForNode(req.params.cardId as string, req.params.nodeId as string);
    res.json({ success: true, events });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Framework Detection ────────────────────────────────────────────────────

// No cardId/projectId in body — requireAuth only
router.post('/detect-framework', async (req: AuthRequest, res: Response) => {
  try {
    const { repository, branch } = req.body;
    if (!repository) {
      return res.status(400).json({ success: false, error: 'repository is required' });
    }

    const detection = await pipelineService.detectFramework(req.userId!, repository, branch);
    res.json({ success: true, detection });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ─── Manual Deploy Trigger ──────────────────────────────────────────────────

router.post('/trigger', resolveRuleToCard, requireProjectAccess('editor'), async (req: AuthRequest, res: Response) => {
  try {
    const { ruleId, commitSha, branch, commitMessage } = req.body;
    if (!ruleId) {
      return res.status(400).json({ success: false, error: 'ruleId is required' });
    }

    const event = await pipelineService.createDeploymentEvent(
      ruleId,
      'manual',
      commitSha || 'HEAD',
      branch || 'main',
      commitMessage || 'Manual deploy',
      req.userId,
    );

    // Queue the pipeline job
    const { getDeployQueue } = await import('../services/queue.service');
    const rule = await (
      await import('@ice/db')
    ).default.deploymentRule.findUnique({
      where: { id: ruleId },
    });

    if (!rule) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    const queue = getDeployQueue();
    await queue.add(
      'pipeline',
      {
        type: 'pipeline',
        eventId: event.id,
        ruleId: rule.id,
        cardId: rule.card_id,
        nodeId: rule.node_id,
        repository: rule.repository,
        branch: branch || rule.branch_pattern,
        commitSha: commitSha || 'HEAD',
        commitMessage: commitMessage || 'Manual deploy',
        commitAuthor: req.userId,
        environment: rule.environment,
        buildCommand: rule.build_command,
        installCommand: rule.install_command,
        outputDir: rule.output_dir,
        framework: rule.framework,
      },
      {
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );

    res.json({ success: true, event });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Retry Failed Deploy ─────────────────────────────────────────────────────

router.post('/retry', resolveEventToCard, requireProjectAccess('editor'), async (req: AuthRequest, res: Response) => {
  try {
    const { eventId } = req.body;
    if (!eventId) return res.status(400).json({ success: false, error: 'eventId is required' });

    const prisma = (await import('@ice/db')).default;
    const oldEvent = await prisma.deploymentEvent.findUnique({
      where: { id: eventId },
      include: { rule: true },
    });
    if (!oldEvent) return res.status(404).json({ success: false, error: 'Event not found' });
    if (oldEvent.status !== 'failed')
      return res.status(400).json({ success: false, error: 'Can only retry failed events' });

    const rule = oldEvent.rule;
    const event = await pipelineService.createDeploymentEvent(
      rule.id,
      'manual',
      oldEvent.commit_sha,
      oldEvent.branch,
      `Retry: ${oldEvent.commit_message || ''}`,
      req.userId,
    );

    const { getDeployQueue } = await import('../services/queue.service');
    const queue = getDeployQueue();
    await queue.add(
      'pipeline',
      {
        type: 'pipeline',
        eventId: event.id,
        ruleId: rule.id,
        cardId: rule.card_id,
        nodeId: rule.node_id,
        repository: rule.repository,
        branch: oldEvent.branch,
        commitSha: oldEvent.commit_sha,
        environment: rule.environment,
        buildCommand: rule.build_command,
        installCommand: rule.install_command,
        outputDir: rule.output_dir,
        framework: rule.framework,
      },
      { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
    );

    res.json({ success: true, event });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Cancel Active Deploy ────────────────────────────────────────────────────

router.post('/cancel', resolveEventToCard, requireProjectAccess('editor'), async (req: AuthRequest, res: Response) => {
  try {
    const { eventId } = req.body;
    if (!eventId) return res.status(400).json({ success: false, error: 'eventId is required' });

    await pipelineService.updateEventProgress(eventId, 'cancelled', 'Cancelled by user');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
