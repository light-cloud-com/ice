/**
 * Recipe registry — runs an applicable, allow-listed recipe against a
 * classified error. Returns `{ fixed: true }` if the runner should retry
 * the failed step; `{ fixed: false }` to bail out.
 */
import { apiNotEnabledRecipe } from './api-not-enabled';
import { configRecipe } from './config';
import { networkRecipe } from './network';
import { billingDisabledRecipe } from './billing-disabled';
export const ALL_RECIPES = [apiNotEnabledRecipe, configRecipe, networkRecipe, billingDisabledRecipe];
const attemptCounts = new WeakMap();
export async function runRecipes(ctx, classified) {
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
    let result;
    try {
        result = await recipe.fix(ctx, classified);
    }
    catch (err) {
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
