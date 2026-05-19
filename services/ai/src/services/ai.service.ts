/**
 * AI Service — Multi-Provider AI Integration
 *
 * Processes natural language intents against canvas context,
 * returning structured canvas operations as JSON.
 *
 * Supports Anthropic (cloud, default) and any OpenAI-compatible endpoint.
 */

import { runPostProcessing } from './ai/post-processing';
import { getAiProvider, getAiProviderSync } from './ai/provider';
import { parseAiResponse } from './ai/response-parsing';
import { detectSkill } from './ai/skill-detection';
import { buildSystemPrompt } from './ai/system-prompt';
import { createAuditEntry, finalizeAuditEntry, writeAuditEntry } from './ai-audit.service';
import type { AiResponse, SerializedCanvas, AiStreamEvent } from '@ice/types';
import type { Response } from 'express';

// =============================================================================
// AI Provider — re-export from ./ai/provider so external consumers
// (routes/ai.ts, diagnose-deploy.service.ts) keep working through the
// orchestrator's public surface.
// =============================================================================

export { getAiProvider, getAiProviderSync };

// =============================================================================
// Non-Streaming Response
// =============================================================================

export async function processCanvasIntent(
  intent: string,
  canvas: SerializedCanvas,
  cardId?: string,
  orgId?: string,
): Promise<AiResponse> {
  const provider = await getAiProvider(orgId);
  const audit = createAuditEntry(intent, canvas);
  const startTime = Date.now();

  try {
    const systemPrompt = await buildSystemPrompt(canvas, intent, cardId);
    const isArchitectMode = detectSkill(intent) === 'cloud-architect';

    const response = await provider.chat({
      systemPrompt,
      messages: [{ role: 'user', content: intent }],
      maxTokens: isArchitectMode ? 8192 : 4096,
    });

    const rawResponse = response.content;
    if (!rawResponse) {
      finalizeAuditEntry(audit, {
        rawResponse: '',
        parseSuccess: false,
        durationMs: Date.now() - startTime,
        error: 'No text content in response',
      });
      writeAuditEntry(audit);
      return { explanation: 'No response generated', operations: [] };
    }
    const allowedBlocks = new Set(canvas.availableBlockTypes);
    const parsed = parseAiResponse(rawResponse, allowedBlocks);

    console.log('[AI] Canvas intent processed:', {
      intent,
      operationCount: parsed.operations.length,
      explanation: parsed.explanation?.slice(0, 100),
      hasCloudOps: parsed.operations.some((op) => op.op === 'addBlueprint' || op.op === 'addNode'),
      rawResponseLength: rawResponse.length,
    });

    // Run validation and dry-run in background (fire-and-forget audit enrichment)
    runPostProcessing(audit, parsed, canvas, rawResponse, startTime);

    return parsed;
  } catch (err: any) {
    finalizeAuditEntry(audit, {
      durationMs: Date.now() - startTime,
      error: err.message,
    });
    writeAuditEntry(audit);
    throw err;
  }
}

// =============================================================================
// Streaming Response (SSE)
// =============================================================================

export async function streamCanvasIntent(
  intent: string,
  canvas: SerializedCanvas,
  res: Response,
  cardId?: string,
  orgId?: string,
): Promise<void> {
  const provider = await getAiProvider(orgId);
  const audit = createAuditEntry(intent, canvas);
  const startTime = Date.now();
  const systemPrompt = await buildSystemPrompt(canvas, intent, cardId);

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const sendEvent = (event: AiStreamEvent) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };

  const isArchitectMode = detectSkill(intent) === 'cloud-architect';
  sendEvent({
    type: 'thinking',
    status: isArchitectMode ? 'Designing your cloud architecture...' : 'Analyzing your canvas...',
  });

  try {
    let fullText = '';

    for await (const chunk of provider.streamChat({
      systemPrompt,
      messages: [{ role: 'user', content: intent }],
      maxTokens: isArchitectMode ? 8192 : 4096,
    })) {
      fullText += chunk.content;
    }

    // Parse the complete response — validate against block registry
    const allowedBlocks = new Set(canvas.availableBlockTypes);
    const parsed = parseAiResponse(fullText, allowedBlocks);

    // Stream individual operations
    for (const op of parsed.operations) {
      sendEvent({ type: 'operation', operation: op });
    }

    if (parsed.explanation) {
      sendEvent({ type: 'explanation', text: parsed.explanation });
    }

    if (parsed.suggestions && parsed.suggestions.length > 0) {
      sendEvent({ type: 'suggestions', items: parsed.suggestions });
    }

    if (parsed.clarification) {
      sendEvent({ type: 'clarification', clarification: parsed.clarification });
    }

    sendEvent({ type: 'done' });

    // Run validation and dry-run in background (fire-and-forget audit enrichment)
    runPostProcessing(audit, parsed, canvas, fullText, startTime);
  } catch (err) {
    finalizeAuditEntry(audit, {
      durationMs: Date.now() - startTime,
      error: (err as Error).message,
    });
    writeAuditEntry(audit);
    sendEvent({ type: 'error', message: (err as Error).message });
  } finally {
    res.end();
  }
}
