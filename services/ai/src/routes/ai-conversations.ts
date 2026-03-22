/**
 * AI Conversation Routes
 *
 * CRUD for persisted AI chat conversations, scoped per org → project → user.
 *
 * GET    /api/ai/conversations?projectId=xxx  — List conversations
 * POST   /api/ai/conversations                — Create conversation
 * GET    /api/ai/conversations/:id            — Get conversation + messages
 * POST   /api/ai/conversations/:id/messages   — Append messages
 * DELETE /api/ai/conversations/:id            — Delete conversation
 */

import { Router, type Response } from 'express';
import prisma from '@ice/db';
import { requireAuth, type AuthRequest } from '@ice/shared';

const router = Router();
router.use(requireAuth);

// ── List conversations for a project ─────────────────────────────────────────

router.get('/conversations', async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.query;
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ message: 'projectId query param required' });
    }

    const conversations = await prisma.aiConversation.findMany({
      where: {
        project_id: projectId,
        user_id: req.userId!,
        organisation_id: req.organisationId!,
      },
      orderBy: { updated_at: 'desc' },
      select: {
        id: true,
        title: true,
        card_id: true,
        created_at: true,
        updated_at: true,
        _count: { select: { messages: true } },
      },
    });

    res.json(conversations);
  } catch (err: any) {
    console.error('List conversations error:', err);
    res.status(500).json({ message: 'Failed to list conversations' });
  }
});

// ── Create conversation ──────────────────────────────────────────────────────

router.post('/conversations', async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, cardId, title } = req.body;
    if (!projectId) {
      return res.status(400).json({ message: 'projectId is required' });
    }

    const conversation = await prisma.aiConversation.create({
      data: {
        project_id: projectId,
        card_id: cardId || null,
        user_id: req.userId!,
        organisation_id: req.organisationId!,
        title: title || null,
      },
    });

    res.json(conversation);
  } catch (err: any) {
    console.error('Create conversation error:', err);
    res.status(500).json({ message: 'Failed to create conversation' });
  }
});

// ── Get conversation with messages ───────────────────────────────────────────

router.get('/conversations/:id', async (req: AuthRequest, res: Response) => {
  try {
    const conversation = await prisma.aiConversation.findFirst({
      where: {
        id: req.params.id as string,
        user_id: req.userId!,
      },
      include: {
        messages: {
          orderBy: { created_at: 'asc' },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    res.json(conversation);
  } catch (err: any) {
    console.error('Get conversation error:', err);
    res.status(500).json({ message: 'Failed to get conversation' });
  }
});

// ── Append messages ──────────────────────────────────────────────────────────

router.post('/conversations/:id/messages', async (req: AuthRequest, res: Response) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ message: 'messages array is required' });
    }

    // Verify ownership
    const conversation = await prisma.aiConversation.findFirst({
      where: { id: req.params.id as string, user_id: req.userId! },
    });
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Auto-set title from first user message if not set
    const needsTitle = !conversation.title;
    const firstUserMsg = needsTitle
      ? messages.find((m: any) => m.role === 'user')
      : null;

    const created = await prisma.aiMessage.createMany({
      data: messages.map((m: any) => ({
        conversation_id: req.params.id as string,
        role: m.role,
        content: m.content,
        operations: m.operations || null,
        operation_count: m.operationCount || 0,
        suggestions: m.suggestions || null,
      })),
    });

    // Update title + timestamp
    await prisma.aiConversation.update({
      where: { id: req.params.id as string },
      data: {
        updated_at: new Date(),
        ...(firstUserMsg ? { title: firstUserMsg.content.slice(0, 80) } : {}),
      },
    });

    res.json({ count: created.count });
  } catch (err: any) {
    console.error('Append messages error:', err);
    res.status(500).json({ message: 'Failed to append messages' });
  }
});

// ── Delete conversation ──────────────────────────────────────────────────────

router.delete('/conversations/:id', async (req: AuthRequest, res: Response) => {
  try {
    // Verify ownership before delete
    const conversation = await prisma.aiConversation.findFirst({
      where: { id: req.params.id as string, user_id: req.userId! },
    });
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    await prisma.aiConversation.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (err: any) {
    console.error('Delete conversation error:', err);
    res.status(500).json({ message: 'Failed to delete conversation' });
  }
});

export default router;
