/**
 * System prompt builder — composes the canvas state, schema context,
 * and (when applicable) the cloud-architect skill prompt and
 * deployment-context block into a single string sent to the AI
 * provider.
 *
 * The static prose of the prompt lives in `./system-prompt-sections.ts`
 * — each natural seam of the original template literal is now a
 * separate function returning a string fragment. The orchestrator
 * concatenates them in order; the dynamic parts (canvas summary,
 * dominant provider, schema context, connection prompt) flow in as
 * arguments. Output is byte-identical to the pre-rf-spr2 version,
 * verified by the snapshot test in `__tests__/system-prompt-snapshot.test.ts`.
 *
 * The pure helpers (`formatNodesSummary`, `formatEdgesSummary`,
 * `formatSelectedSummary`, `detectDominantProvider`,
 * `buildCloudArchitectPrompt`) stay here so they can be unit-tested
 * independently without round-tripping through the full prompt.
 */

import {
  buildHeaderPrompt,
  buildIntentRoutingPrompt,
  buildOperationsPrompt,
  buildPropertyPrefillPrompt,
  buildOptimizationGuidelinesPrompt,
  buildCanvasContextPrompt,
  buildContainerNetworkingPrompt,
  buildCloudArchitectPrompt as _buildCloudArchitectPrompt,
} from '@ice/constants';
import { generateAiConnectionPrompt } from '@ice/types';
import { buildDeploymentContext } from './deployment-context';
import { detectSkill, isQuestionIntent } from './skill-detection';
import { buildSchemaContext } from '../ai-schema-context.service';
import type { SerializedCanvas } from '@ice/types';

// Re-export buildCloudArchitectPrompt so existing test imports
// (`from '../system-prompt'`) keep working without changing the test
// surface. The actual prose lives in `@ice/constants/ai`.
export const buildCloudArchitectPrompt = _buildCloudArchitectPrompt;

// =============================================================================
// Pure canvas-summary helpers
// =============================================================================

/**
 * Render the canvas's nodes as a markdown bullet list. Each node
 * shows its id, iceType, label, and parent (if present).
 * Returns the empty-canvas placeholder when there are no nodes.
 */
export function formatNodesSummary(canvas: SerializedCanvas): string {
  if (canvas.nodes.length === 0) return '  (empty canvas)';
  return canvas.nodes
    .map((n) => `  - ${n.id}: ${n.iceType} "${n.label}"${n.parentId ? ` (in ${n.parentId})` : ''}`)
    .join('\n');
}

/**
 * Render the canvas's edges as a markdown bullet list. Each edge
 * shows source, target, and relationship label (if present).
 * Returns the empty placeholder when there are no edges.
 */
export function formatEdgesSummary(canvas: SerializedCanvas): string {
  if (canvas.edges.length === 0) return '  (no connections)';
  return canvas.edges
    .map((e) => `  - ${e.source} → ${e.target}${e.relationship ? ` (${e.relationship})` : ''}`)
    .join('\n');
}

/**
 * Render the selected-nodes summary. The ID list is comma-separated
 * when one or more nodes are selected; otherwise the placeholder is
 * "No nodes selected".
 */
export function formatSelectedSummary(canvas: SerializedCanvas): string {
  return canvas.selectedNodeIds.length > 0
    ? `Selected nodes: ${canvas.selectedNodeIds.join(', ')}`
    : 'No nodes selected';
}

/**
 * Detect the dominant provider from existing canvas nodes. Counts
 * non-empty `n.provider` values and picks the most frequent. Falls
 * back to `'aws'` when the canvas has no provider hints (matches the
 * default the prompt advertises in CRITICAL RULES #2).
 */
export function detectDominantProvider(canvas: SerializedCanvas): string {
  const providerCounts: Record<string, number> = {};
  for (const n of canvas.nodes) {
    const p = n.provider || '';
    if (p) providerCounts[p] = (providerCounts[p] || 0) + 1;
  }
  return Object.entries(providerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'aws';
}

// `buildCloudArchitectPrompt` moved to `@ice/constants/ai` — see the
// top-of-file import + re-export.

// =============================================================================
// System Prompt Builder
// =============================================================================

export async function buildSystemPrompt(
  canvas: SerializedCanvas,
  intent?: string,
  cardId?: string,
): Promise<string> {
  const nodesSummary = formatNodesSummary(canvas);
  const edgesSummary = formatEdgesSummary(canvas);
  const selectedSummary = formatSelectedSummary(canvas);
  const dominantProvider = detectDominantProvider(canvas);

  // Build schema context from real resource definitions
  const existingIceTypes = canvas.nodes.map((n) => n.iceType).filter((t): t is string => !!t);

  const schemaContext = await buildSchemaContext({
    existingIceTypes,
    dominantProvider,
  });

  // Compose the static prose. Each fragment is byte-identical to the
  // original template literal — see `./system-prompt-sections.ts`.
  let basePrompt =
    buildHeaderPrompt(dominantProvider) +
    buildIntentRoutingPrompt() +
    buildOperationsPrompt(canvas.availableBlockTypes) +
    buildPropertyPrefillPrompt() +
    buildOptimizationGuidelinesPrompt() +
    buildCanvasContextPrompt(nodesSummary, edgesSummary, selectedSummary, schemaContext) +
    buildContainerNetworkingPrompt(generateAiConnectionPrompt());

  // Detect and inject specialized skill prompt
  const skill = intent ? detectSkill(intent) : 'default';
  if (skill === 'cloud-architect') {
    const providerBlocks = canvas.availableBlockTypes;
    basePrompt += buildCloudArchitectPrompt(dominantProvider, providerBlocks);
    console.log('[AI] Cloud Architect skill activated for intent:', intent?.slice(0, 80));
  }

  // AI Read L1: inject deployment state when the intent is a question.
  // The instructions block is appended unconditionally so the model knows
  // how to behave when the context is present vs absent.
  if (intent && cardId && isQuestionIntent(intent)) {
    basePrompt += await buildDeploymentContext(cardId);
    basePrompt += `\n## How to answer questions about deployment state\n\nWhen the user asks about what's deployed, running, or the current state:\n1. Use the "Deployment Status" section above — it shows what was last deployed and when.\n2. Be honest about staleness: "Based on the last deployment ${'{time}'} ago..."\n3. If the section says "not been deployed yet", tell the user exactly that.\n4. If the last deployment failed, explain what went wrong from the Errors list.\n5. Suggest running a drift check if they want current cloud state.\n6. Do NOT generate canvas operations for pure questions — return an explanation with operations: [].\n`;
    console.log('[AI] Question intent — deployment context injected for card', cardId);
  }

  return basePrompt;
}
