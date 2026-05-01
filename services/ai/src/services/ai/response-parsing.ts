/**
 * Response parsing — turn the AI provider's raw text into a typed
 * `AiResponse`.
 *
 * The model's output is permitted to be wrapped in markdown code
 * fences, prefixed with thinking tags (`<think>...</think>` from
 * local reasoning models), or embedded inside a preamble — all of
 * which `parseAiResponse` strips before parsing. If the resulting
 * JSON still doesn't parse, `repairJson` runs a small set of regex
 * fixes (missing `{` before `"op":`, trailing commas, unclosed
 * brackets/braces) and tries again. If it STILL doesn't parse, the
 * original text is returned as an explanation-only response (the
 * first 200 chars).
 *
 * The valid path then runs `validateOperations` against the canvas-
 * supplied registry to drop any AI-invented op types or iceTypes.
 */

import { validateOperations } from './operation-validation';
import type { AiResponse } from '@ice/types';

export function parseAiResponse(text: string, allowedBlockTypes?: Set<string>): AiResponse {
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
 *
 * Returns the repaired string when at least one fix was applied,
 * `null` when the input was already in canonical shape (so callers
 * can short-circuit a redundant second `JSON.parse`).
 */
export function repairJson(text: string): string | null {
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
