/**
 * System prompt section builders — thin re-export layer.
 *
 * The actual prompt prose lives in `@ice/constants/ai` so it can be
 * edited from one place. See `packages/constants/src/ai.ts` and the
 * `AI_PROMPT_REGISTRY` for the full inventory.
 *
 * This module preserves the original import surface (each builder
 * imported by name from `./system-prompt-sections`) so callers that
 * haven't migrated to `@ice/constants` keep compiling. New consumers
 * should import from `@ice/constants` directly.
 */

export {
  buildHeaderPrompt,
  buildIntentRoutingPrompt,
  buildOperationsPrompt,
  buildPropertyPrefillPrompt,
  buildOptimizationGuidelinesPrompt,
  buildCanvasContextPrompt,
  buildContainerNetworkingPrompt,
} from '@ice/constants';
