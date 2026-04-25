/**
 * Deploy Diagnosis Service (AI-Native #2)
 *
 * Produces a plain-English explanation + fix steps for a failed deploy.
 * Sends a focused diagnostic prompt to the configured AI provider.
 */

import { getAiProvider } from './ai.service';
import type { DiagnoseDeployRequest, DiagnoseDeployResponse } from '@ice/types';

const SYSTEM_PROMPT = `You are a senior cloud deployment engineer. A deployment just failed.
Your job: help the user understand what went wrong and how to fix it, in plain English.

Respond ONLY with a JSON object, no markdown or prose outside:
{
  "diagnosis": "Short plain-English explanation (2-4 sentences, no jargon).",
  "suggestedFixes": ["specific step 1", "specific step 2", ...],
  "operations": []
}

Rules:
1. "diagnosis" must be concrete — name the resource, the cause, the impact.
2. "suggestedFixes" is a bulleted checklist of specific actions. 2-5 items. No fluff.
3. "operations" is optional. Only include if the fix is a concrete canvas change (e.g. add a missing Secret block). Leave [] otherwise.
4. Never invent details not in the input. If you don't know, say "The error doesn't show enough to pinpoint the cause — try X."`;

function buildUserPrompt(req: DiagnoseDeployRequest): string {
  const parts: string[] = [];
  parts.push('## Error');
  parts.push(req.error.trim() || '(no top-level error message)');
  parts.push('');

  if (req.resourceResults && req.resourceResults.length > 0) {
    parts.push('## Failed Resources');
    for (const r of req.resourceResults) {
      const err = r.error ? ` — ${r.error}` : '';
      parts.push(`- "${r.name}" (${r.type}, action: ${r.action})${err}`);
    }
    parts.push('');
  }

  parts.push('## Context');
  parts.push(`Provider: ${req.provider || 'unknown'} | Region: ${req.region || 'unknown'}`);
  parts.push('');

  const ctx = req.canvasContext;
  if (ctx?.nodes?.length > 0) {
    parts.push('## Canvas Architecture');
    parts.push('Nodes:');
    for (const n of ctx.nodes) {
      const iceType = n.iceType || 'unknown';
      parts.push(`- ${n.id} [${iceType}] ${n.label || ''}`);
    }
    if (ctx.edges?.length > 0) {
      parts.push('Edges:');
      for (const e of ctx.edges) {
        parts.push(`- ${e.source} → ${e.target}${e.relationship ? ` (${e.relationship})` : ''}`);
      }
    }
  }

  return parts.join('\n');
}

interface RawResponse {
  diagnosis?: unknown;
  suggestedFixes?: unknown;
  operations?: unknown;
}

function parseResponse(raw: string): DiagnoseDeployResponse {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const body = jsonMatch ? jsonMatch[0] : raw;
  let parsed: RawResponse;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {
      diagnosis: raw.slice(0, 400).trim() || 'AI returned an unparseable response.',
      suggestedFixes: [],
    };
  }
  return {
    diagnosis: typeof parsed.diagnosis === 'string' ? parsed.diagnosis : 'No diagnosis provided.',
    suggestedFixes: Array.isArray(parsed.suggestedFixes)
      ? parsed.suggestedFixes.filter((x): x is string => typeof x === 'string')
      : [],
    operations: Array.isArray(parsed.operations) ? (parsed.operations as DiagnoseDeployResponse['operations']) : [],
  };
}

export async function diagnoseDeploy(req: DiagnoseDeployRequest): Promise<DiagnoseDeployResponse> {
  const provider = await getAiProvider();
  const userPrompt = buildUserPrompt(req);
  const response = await provider.chat({
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 2048,
  });
  return parseResponse(response.content || '');
}
