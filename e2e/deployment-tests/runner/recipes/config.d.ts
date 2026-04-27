/**
 * Recipe: invalid config.
 *
 * Best-effort: re-apply all properties from the scenario spec to every
 * block. Useful when a transient UI race lost a property write. Returns
 * 'fixed' so the deploy phase retries plan; if the same error recurs the
 * runner will give up at maxAttempts.
 */
import type { Recipe } from './index';
export declare const configRecipe: Recipe;
