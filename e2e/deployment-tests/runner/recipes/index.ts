/**
 * Recipe registry — runs an applicable, allow-listed recipe against a
 * classified error. Returns `{ fixed: true }` if the runner should retry
 * the failed step; `{ fixed: false }` to bail out.
 */

import type { ClassifiedError, ErrorCategory } from '../../../utils/error-classifier';
import type { RunContext } from '../context';
import { apiNotEnabledRecipe } from './api-not-enabled';
import { configRecipe } from './config';
import { networkRecipe } from './network';
import { billingDisabledRecipe } from './billing-disabled';

export type RecipeStatus = 'fixed' | 'needs-human' | 'abandoned';

export interface RecipeResult {
  status: RecipeStatus;
  notes: string[];
}

export interface Recipe {
  name: string;
  category: ErrorCategory | 'billing_disabled';
  match: (err: ClassifiedError) => boolean;
  fix: (ctx: RunContext, err: ClassifiedError) => Promise<RecipeResult>;
  maxAttempts: number;
}

export const ALL_RECIPES: Recipe[] = [
  apiNotEnabledRecipe,
  configRecipe,
  networkRecipe,
  billingDisabledRecipe,
];

const attemptCounts = new WeakMap<RunContext, Map<string, number>>();

export async function runRecipes(
  ctx: RunContext,
  classified: ClassifiedError,
): Promise<{ fixed: boolean }> {
  const { logger } = ctx;
  const recipe = ALL_RECIPES.find((r) => r.match(classified));
  if (!recipe) {
    logger.note(`No recipe matches category=${classified.category}`, 'warn');
    return { fixed: false };
  }

  let counts = attemptCounts.get(ctx);
  if (!counts) {
    counts = new Map();
    attemptCounts.set(ctx, counts);
  }
  const prior = counts.get(recipe.name) ?? 0;
  if (prior >= recipe.maxAttempts) {
    logger.note(`Recipe ${recipe.name} hit maxAttempts=${recipe.maxAttempts}`, 'warn');
    return { fixed: false };
  }
  const attempt = prior + 1;
  counts.set(recipe.name, attempt);

  logger.emit({
    kind: 'recipe_attempt',
    recipe: recipe.name,
    category: classified.category,
    attempt,
  });

  let result: RecipeResult;
  try {
    result = await recipe.fix(ctx, classified);
  } catch (err) {
    result = {
      status: 'abandoned',
      notes: [`recipe ${recipe.name} threw: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  logger.emit({
    kind: 'recipe_result',
    recipe: recipe.name,
    attempt,
    status: result.status,
    notes: result.notes,
  });

  return { fixed: result.status === 'fixed' };
}
