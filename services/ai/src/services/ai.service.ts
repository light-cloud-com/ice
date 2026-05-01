/**
 * AI Service — Multi-Provider AI Integration
 *
 * Processes natural language intents against canvas context,
 * returning structured canvas operations as JSON.
 *
 * Supports Anthropic (cloud, default) and any OpenAI-compatible endpoint.
 */

import { validateOperations } from './ai/operation-validation';
import { getAiProvider, getAiProviderSync } from './ai/provider';
import { detectSkill } from './ai/skill-detection';
import { buildSystemPrompt } from './ai/system-prompt';
import { createAuditEntry, finalizeAuditEntry, writeAuditEntry } from './ai-audit.service';
import { validateCanvas } from './canvas-validation.service';
import { dryRunDeploy } from './deploy-dryrun.service';
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
): Promise<AiResponse> {
  const provider = await getAiProvider();
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
): Promise<void> {
  const provider = await getAiProvider();
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

// =============================================================================
// Post-Processing (Audit Enrichment)
// =============================================================================

async function runPostProcessing(
  audit: ReturnType<typeof createAuditEntry>,
  parsed: AiResponse,
  canvas: SerializedCanvas,
  rawResponse: string,
  startTime: number,
): Promise<void> {
  try {
    // Run validation + dry-run concurrently
    const [validation, dryRun] = await Promise.allSettled([
      validateCanvas(canvas.nodes as any[], canvas.edges as any[]),
      dryRunDeploy(canvas.nodes as any[], canvas.edges as any[]),
    ]);

    finalizeAuditEntry(audit, {
      operations: parsed.operations,
      rawResponse,
      parseSuccess: parsed.operations.length > 0 || !!parsed.explanation,
      durationMs: Date.now() - startTime,
      schemaValidation:
        validation.status === 'fulfilled'
          ? {
              valid: validation.value.valid,
              errorCount: validation.value.errors.length,
              errors: validation.value.errors,
            }
          : undefined,
      deployDryRun:
        dryRun.status === 'fulfilled'
          ? { success: dryRun.value.success, deployableCount: dryRun.value.deployableCount, error: dryRun.value.error }
          : undefined,
    });
  } catch {
    finalizeAuditEntry(audit, {
      operations: parsed.operations,
      rawResponse,
      parseSuccess: parsed.operations.length > 0 || !!parsed.explanation,
      durationMs: Date.now() - startTime,
    });
  }

  writeAuditEntry(audit);
}

// =============================================================================
// Response Parsing
// =============================================================================

function parseAiResponse(text: string, allowedBlockTypes?: Set<string>): AiResponse {
  // Try to extract JSON from the response (may be wrapped in markdown, thinking tags, or preamble text)
  let jsonStr = text.trim();

  // Strip markdown code fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // Strip <think>...</think> tags (local models with reasoning)
  jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // If text doesn't start with { or [, try to find JSON object within it
  if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
    const jsonStart = jsonStr.indexOf('{"');
    if (jsonStart >= 0) {
      jsonStr = jsonStr.slice(jsonStart);
    }
  }

  // Try parsing, then repair if needed
  let parsed: Record<string, unknown> | null = null;

  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Attempt JSON repair for common local model issues
    const repaired = repairJson(jsonStr);
    if (repaired) {
      try {
        parsed = JSON.parse(repaired);
        console.log('[AI] JSON repaired successfully');
      } catch {
        // Still broken
      }
    }
  }

  if (parsed) {
    const validOps = Array.isArray(parsed.operations) ? validateOperations(parsed.operations, allowedBlockTypes) : [];
    const rawOpsCount = Array.isArray(parsed.operations) ? (parsed.operations as unknown[]).length : 0;

    if (rawOpsCount > 0 && validOps.length < rawOpsCount) {
      console.warn(`[AI] ${rawOpsCount - validOps.length}/${rawOpsCount} operations filtered by validation`);
    }

    return {
      explanation: (parsed.explanation as string) || '',
      operations: validOps,
      suggestions: Array.isArray(parsed.suggestions) ? (parsed.suggestions as string[]) : undefined,
      clarification: parsed.clarification as AiResponse['clarification'],
    };
  }

  // If JSON parsing fails completely, treat as explanation-only
  console.error('[AI] Failed to parse AI response as JSON.\nRaw text:', text.slice(0, 300));
  return {
    explanation: text.slice(0, 200),
    operations: [],
  };
}

/**
 * Attempt to fix common JSON issues from local models:
 * - Missing { before "op": in arrays → },{"op": instead of },"op":
 * - Trailing commas before ] or }
 * - Unclosed arrays/objects
 * - Truncated responses (close any open brackets)
 */
function repairJson(text: string): string | null {
  let s = text;

  // Fix missing { before "op" keys in arrays: },"op": → },{"op":
  s = s.replace(/\},\s*"op"\s*:/g, '},{"op":');

  // Fix missing { before other common keys after array comma
  s = s.replace(/\],\s*"op"\s*:/g, '],{"op":');

  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, '$1');

  // Count brackets and close unclosed ones
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escaped = false;

  for (const ch of s) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') braces++;
    if (ch === '}') braces--;
    if (ch === '[') brackets++;
    if (ch === ']') brackets--;
  }

  // Close unclosed structures (truncated response)
  while (brackets > 0) {
    s += ']';
    brackets--;
  }
  while (braces > 0) {
    s += '}';
    braces--;
  }

  return s !== text ? s : null;
}

