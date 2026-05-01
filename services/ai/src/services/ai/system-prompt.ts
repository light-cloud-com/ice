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

import { generateAiConnectionPrompt } from '@ice/types';
import { buildDeploymentContext } from './deployment-context';
import { detectSkill, isQuestionIntent } from './skill-detection';
import { buildSchemaContext } from '../ai-schema-context.service';
import {
  buildHeaderPrompt,
  buildIntentRoutingPrompt,
  buildOperationsPrompt,
  buildPropertyPrefillPrompt,
  buildOptimizationGuidelinesPrompt,
  buildCanvasContextPrompt,
  buildContainerNetworkingPrompt,
} from './system-prompt-sections';
import type { SerializedCanvas } from '@ice/types';

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

// =============================================================================
// Cloud Architect Skill Prompt
// =============================================================================

export function buildCloudArchitectPrompt(dominantProvider: string, iceTypes: string[]): string {
  // Group available blocks by category — derived from iceType prefix (e.g., "Database.PostgreSQL" → "Database")
  const categories: Record<string, string[]> = {};
  for (const t of iceTypes) {
    const category = t.split('.')[0] || 'Other';
    (categories[category] ??= []).push(t);
  }

  const categoryList = Object.entries(categories)
    .map(([cat, blocks]) => `  ${cat}: ${blocks.join(', ')}`)
    .join('\n');

  return `
## ☁️ CLOUD ARCHITECT SKILL — ACTIVE

You are now acting as a **senior cloud architect consultant** in addition to being the ICE canvas engine.
The user is describing a platform, product, or service and wants a complete infrastructure design.

### Your Approach:
1. **Clarify first** (if the description is too vague): Ask 2–3 targeted questions via the "clarification" field. Focus on: expected scale, user type (B2B/B2C/internal), real-time requirements, and data sensitivity.
2. **If the intent is clear enough, ACT immediately**: Build the FULL architecture on the canvas using only available blocks and operations.
3. **Be opinionated**: Don't list options — make specific choices. Explain trade-offs in the explanation.
4. **Flag risks**: In your explanation, call out what commonly causes production incidents for this type of platform.

### CRITICAL CONSTRAINT — ONLY USE AVAILABLE BLOCKS
You MUST only use blocks from the registry. You cannot invent resources that don't exist as blocks.
Map every architectural concept to the closest available block:

Available blocks by category:
${categoryList}

Provider-agnostic: github-repository, env-config

If a concept has no matching block (e.g., "CDN" and no CDN block exists), mention it in the explanation as a future addition but do NOT create an operation for it.

### Architecture Generation Rules:
1. **Think in layers**: Build from network → compute → data → security → observability
2. **Use VPC + Subnets for production architectures**: Create Network.VPC with public and private subnets. Place gateways/frontends in public, backends/databases in private.
3. **Always wire connections**: Every resource must have at least one edge. Think about data flow: Frontend → Gateway → Backend → Database/Cache.
4. **Pre-fill realistic properties**: Set instance sizes, replicas, storage, versions, ports. Match the user's scale intent (dev/small vs production/enterprise).
5. **Add security by default for production**: Include auth, secrets, and gateway blocks. Set exposed:false on private resources.
6. **Add observability**: Include a logs block connected to key services.
7. **Include env-config**: Wire environment variables for database URLs, API keys, etc.

### Explanation Structure:
In your "explanation" field, provide a concise architecture summary covering:
- **Architecture pattern** chosen (microservices, monolith, event-driven, serverless) and why
- **Key decisions** and trade-offs
- **Scaling strategy** (what auto-scales, what needs manual attention)
- **Risks to watch** for this type of platform
- **Estimated complexity**: Simple / Moderate / Complex
- **What's NOT on canvas** (concepts that have no available block — recommend as future additions)

### Suggestions:
Only include suggestions when you BUILD something new on the canvas. Do NOT add suggestions when answering questions — just answer the question directly.
`;
}

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
